import logging
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
from starlette.responses import StreamingResponse
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.models import CompanyAccess, CompanyRole
from app.core.config import settings
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.imports.models import (
    DataSource,
    FileScanStatus,
    ImportBatch,
    ImportStatus,
    SourceFile,
    SourceKind,
)
from app.imports.schemas import ImportBatchResponse, UploadPolicyResponse
from app.imports.storage import get_storage, iter_object
from app.imports.tasks import inspect_upload
from app.imports.validation import receive_and_validate

router = APIRouter(prefix="/companies/{company_id}/imports", tags=["imports"])
logger = logging.getLogger(__name__)
UPLOAD_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}


async def _access(session: DbSession, company_id: UUID, user_id: UUID) -> CompanyAccess:
    access = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == company_id,
            CompanyAccess.user_id == user_id,
        )
    )
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")
    return access


def _response(
    batch: ImportBatch,
    source_file: SourceFile,
    source: DataSource,
) -> ImportBatchResponse:
    return ImportBatchResponse(
        id=batch.id,
        company_id=batch.company_id,
        source_kind=source.kind,
        source_label=source.label,
        status=batch.status,
        stage=batch.stage,
        progress=batch.progress,
        original_name=source_file.original_name,
        size_bytes=source_file.size_bytes,
        mime_type=source_file.mime_type,
        sha256=source_file.sha256,
        scan_status=source_file.scan_status,
        scan_result=source_file.scan_result,
        duplicate_detected=source_file.duplicate_of_id is not None,
        failure_code=batch.failure_code,
        failure_message=batch.failure_message,
        retryable=batch.retryable,
        created_at=batch.created_at,
    )


async def _batch_row(
    session: DbSession,
    company_id: UUID,
    batch_id: UUID,
) -> tuple[ImportBatch, SourceFile, DataSource] | None:
    row = (
        await session.execute(
            select(ImportBatch, SourceFile, DataSource)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(ImportBatch.id == batch_id, ImportBatch.company_id == company_id)
        )
    ).one_or_none()
    if row is None:
        return None
    batch, source_file, source = row
    return batch, source_file, source


@router.get("/policy", response_model=UploadPolicyResponse)
async def upload_policy(
    company_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> UploadPolicyResponse:
    await _access(session, company_id, current_user.id)
    return UploadPolicyResponse(
        allowed_extensions=[".csv", ".xlsx"],
        maximum_size_bytes=settings.upload_max_bytes,
        malware_scan_required=True,
        macro_enabled_files_allowed=False,
    )


@router.get("", response_model=list[ImportBatchResponse])
async def list_imports(
    company_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> list[ImportBatchResponse]:
    await _access(session, company_id, current_user.id)
    rows = (
        await session.execute(
            select(ImportBatch, SourceFile, DataSource)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(ImportBatch.company_id == company_id)
            .order_by(ImportBatch.created_at.desc())
            .limit(50)
        )
    ).all()
    return [_response(batch, source_file, source) for batch, source_file, source in rows]


@router.post("/uploads", response_model=ImportBatchResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_file(
    company_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    _: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
    file: Annotated[UploadFile, File()],
    source_kind: Annotated[SourceKind, Form()],
    source_label: Annotated[str, Form(min_length=2, max_length=160)],
) -> ImportBatchResponse:
    access = await _access(session, company_id, current_user.id)
    if access.role not in UPLOAD_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="اجازه بارگذاری فایل برای این شرکت را ندارید.",
        )

    normalized_label = source_label.strip()
    if len(normalized_label) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="عنوان منبع باید دست‌کم دو نویسه داشته باشد.",
        )

    existing = await session.scalar(
        select(ImportBatch).where(
            ImportBatch.company_id == company_id,
            ImportBatch.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        row = await _batch_row(session, company_id, existing.id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="درخواست تکراری است.")
        return _response(*row)

    validated = await receive_and_validate(file)
    source_file = SourceFile(
        id=uuid7(),
        company_id=company_id,
        object_key="",
        original_name=validated.original_name,
        sha256=validated.sha256,
        size_bytes=validated.size_bytes,
        mime_type=validated.mime_type,
        extension=validated.extension,
        uploaded_by=current_user.id,
        metadata_json=validated.metadata,
    )
    source_file.object_key = f"quarantine/{company_id}/{source_file.id}"
    duplicate = await session.scalar(
        select(SourceFile.id)
        .where(SourceFile.company_id == company_id, SourceFile.sha256 == validated.sha256)
        .order_by(SourceFile.created_at)
        .limit(1)
    )
    source_file.duplicate_of_id = duplicate
    source = DataSource(
        id=uuid7(),
        company_id=company_id,
        kind=source_kind,
        label=normalized_label,
        created_by=current_user.id,
    )
    batch = ImportBatch(
        id=uuid7(),
        company_id=company_id,
        source_id=source.id,
        file_id=source_file.id,
        idempotency_key=idempotency_key,
    )
    storage = get_storage()
    try:
        await run_in_threadpool(
            storage.upload,
            source_file.object_key,
            validated.stream,
            validated.mime_type,
            validated.sha256,
        )
        session.add_all([source, source_file])
        await session.flush()
        session.add(batch)
        record_audit_event(
            session,
            action="import.uploaded",
            entity_type="import_batch",
            actor_id=current_user.id,
            entity_id=batch.id,
            company_id=company_id,
            request_id=request.headers.get("X-Request-ID"),
            metadata={
                "size_bytes": validated.size_bytes,
                "sha256": validated.sha256,
                "duplicate": duplicate is not None,
                "source_kind": source_kind.value,
            },
        )
        await session.commit()
    except IntegrityError as exc:
        logger.exception("Import upload metadata violated a database constraint")
        await session.rollback()
        await run_in_threadpool(storage.delete, source_file.object_key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="کلید تکراری یا رکورد ناسازگار است.",
        ) from exc
    except Exception:
        await session.rollback()
        await run_in_threadpool(storage.delete, source_file.object_key)
        raise
    finally:
        validated.stream.close()

    try:
        inspect_upload.delay(str(batch.id), str(company_id), str(current_user.id))
    except Exception:
        batch.status = ImportStatus.FAILED
        batch.stage = "queue_unavailable"
        batch.progress = 100
        batch.failure_code = "IMPORT_QUEUE_UNAVAILABLE"
        batch.failure_message = "صف پردازش فایل در دسترس نبود."
        batch.retryable = True
        source_file.scan_status = FileScanStatus.FAILED
        source_file.scan_result = "queue_unavailable"
        record_audit_event(
            session,
            action="import.queue_failed",
            entity_type="import_batch",
            actor_id=current_user.id,
            entity_id=batch.id,
            company_id=company_id,
        )
        await session.commit()
    return _response(batch, source_file, source)


@router.get("/{batch_id}", response_model=ImportBatchResponse)
async def get_import(
    company_id: UUID,
    batch_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> ImportBatchResponse:
    await _access(session, company_id, current_user.id)
    row = await _batch_row(session, company_id, batch_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    return _response(*row)


@router.get("/{batch_id}/download")
async def download_source_file(
    company_id: UUID,
    batch_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> StreamingResponse:
    await _access(session, company_id, current_user.id)
    row = await _batch_row(session, company_id, batch_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="واردسازی پیدا نشد.")
    _, source_file, _ = row
    if source_file.scan_status != FileScanStatus.CLEAN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="فایل تا پایان موفق بررسی امنیتی قابل دریافت نیست.",
        )
    body = await run_in_threadpool(get_storage().open, source_file.object_key)
    encoded_name = quote(source_file.original_name)
    return StreamingResponse(
        iter_object(body),
        media_type=source_file.mime_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )
