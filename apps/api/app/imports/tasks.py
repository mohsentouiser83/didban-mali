import asyncio
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.audit.service import record_audit_event
from app.companies import models as company_models  # noqa: F401
from app.core.database import async_session_factory, engine
from app.core.tenant import set_request_company, set_request_user
from app.identity import models as identity_models  # noqa: F401
from app.imports.models import FileScanStatus, ImportBatch, ImportStatus, SourceFile
from app.imports.scanner import ScanUnavailableError, scan_stream
from app.imports.storage import get_storage
from app.worker import celery_app


@dataclass(frozen=True)
class UploadContext:
    object_key: str
    source_file_id: UUID


async def _start_inspection(batch_id: UUID, company_id: UUID, actor_id: UUID) -> UploadContext:
    async with async_session_factory() as session:
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
        batch = await session.scalar(
            select(ImportBatch).where(
                ImportBatch.id == batch_id,
                ImportBatch.company_id == company_id,
            )
        )
        if batch is None:
            raise ValueError("Import batch is not accessible")
        source_file = await session.get(SourceFile, batch.file_id)
        if source_file is None:
            raise ValueError("Source file is not accessible")
        batch.status = ImportStatus.INSPECTING
        batch.stage = "malware_scan"
        batch.progress = 45
        await session.commit()
        return UploadContext(object_key=source_file.object_key, source_file_id=source_file.id)


async def _finish_inspection(
    *,
    batch_id: UUID,
    company_id: UUID,
    actor_id: UUID,
    clean: bool,
    result: str,
    destination_key: str | None = None,
) -> None:
    async with async_session_factory() as session:
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
        batch = await session.scalar(
            select(ImportBatch).where(
                ImportBatch.id == batch_id,
                ImportBatch.company_id == company_id,
            )
        )
        if batch is None:
            raise ValueError("Import batch is not accessible")
        source_file = await session.get(SourceFile, batch.file_id)
        if source_file is None:
            raise ValueError("Source file is not accessible")

        source_file.scan_status = FileScanStatus.CLEAN if clean else FileScanStatus.INFECTED
        source_file.scan_result = result
        if clean:
            if destination_key is None:
                raise ValueError("Clean file requires a destination key")
            source_file.object_key = destination_key
            batch.status = ImportStatus.AWAITING_MAPPING
            batch.stage = "awaiting_mapping"
            batch.progress = 100
        else:
            batch.status = ImportStatus.FAILED
            batch.stage = "rejected"
            batch.progress = 100
            batch.failure_code = "MALWARE_DETECTED"
            batch.failure_message = "فایل در بررسی امنیتی آلوده تشخیص داده شد."
            batch.retryable = False
        record_audit_event(
            session,
            action="import.scan_clean" if clean else "import.scan_infected",
            entity_type="import_batch",
            actor_id=actor_id,
            entity_id=batch.id,
            company_id=company_id,
            metadata={"scan_result": result},
        )
        await session.commit()


async def _mark_scan_unavailable(batch_id: UUID, company_id: UUID, actor_id: UUID) -> None:
    async with async_session_factory() as session:
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
        batch = await session.scalar(
            select(ImportBatch).where(
                ImportBatch.id == batch_id,
                ImportBatch.company_id == company_id,
            )
        )
        if batch is None:
            return
        source_file = await session.get(SourceFile, batch.file_id)
        if source_file is not None:
            source_file.scan_status = FileScanStatus.FAILED
            source_file.scan_result = "scanner_unavailable"
        batch.status = ImportStatus.FAILED
        batch.stage = "security_scan_failed"
        batch.progress = 100
        batch.failure_code = "MALWARE_SCAN_UNAVAILABLE"
        batch.failure_message = "سرویس بررسی امنیتی فایل در دسترس نبود."
        batch.retryable = True
        await session.commit()


async def _run_inspection(
    batch_id: UUID,
    company_id: UUID,
    actor_id: UUID,
    *,
    mark_unavailable: bool,
) -> dict[str, str]:
    context = await _start_inspection(batch_id, company_id, actor_id)
    storage = get_storage()
    body = storage.open(context.object_key)
    try:
        clean, result = scan_stream(body)
    except ScanUnavailableError:
        if mark_unavailable:
            await _mark_scan_unavailable(batch_id, company_id, actor_id)
            return {"status": "failed", "reason": "scanner_unavailable"}
        raise
    finally:
        body.close()

    destination_key = None
    if clean:
        destination_key = f"clean/{company_id}/{context.source_file_id}"
        storage.copy(context.object_key, destination_key)
        storage.delete(context.object_key)
    try:
        await _finish_inspection(
            batch_id=batch_id,
            company_id=company_id,
            actor_id=actor_id,
            clean=clean,
            result=result,
            destination_key=destination_key,
        )
    except Exception:
        if clean and destination_key is not None:
            storage.copy(destination_key, context.object_key)
            storage.delete(destination_key)
        raise
    return {"status": "clean" if clean else "infected", "result": result}


async def _run_and_dispose(
    batch_id: UUID,
    company_id: UUID,
    actor_id: UUID,
    *,
    mark_unavailable: bool,
) -> dict[str, str]:
    try:
        return await _run_inspection(
            batch_id,
            company_id,
            actor_id,
            mark_unavailable=mark_unavailable,
        )
    finally:
        await engine.dispose()


@celery_app.task(bind=True, max_retries=3, name="imports.inspect_upload")  # type: ignore[untyped-decorator]
def inspect_upload(self: Any, batch_id: str, company_id: str, actor_id: str) -> dict[str, str]:
    batch_uuid = UUID(batch_id)
    company_uuid = UUID(company_id)
    actor_uuid = UUID(actor_id)
    retries = int(getattr(getattr(self, "request", None), "retries", 0))
    max_retries = int(getattr(self, "max_retries", 3))
    try:
        return asyncio.run(
            _run_and_dispose(
                batch_uuid,
                company_uuid,
                actor_uuid,
                mark_unavailable=retries >= max_retries,
            )
        )
    except ScanUnavailableError as exc:
        if retries < max_retries:
            raise self.retry(exc=exc, countdown=2 ** (retries + 1)) from exc
        return {"status": "failed", "reason": "scanner_unavailable"}
