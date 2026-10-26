"""Revise uncommitted interpretation while retaining original mapping and cells."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.imports.models import ImportBatch, ImportStatus


class RevisionConflict(ValueError):
    pass


async def revise_structure(session: AsyncSession, batch: ImportBatch, actor_id: UUID) -> ImportBatch:
    previous = batch.coverage_json.get("revised_batch_id")
    if previous:
        revised = await session.scalar(select(ImportBatch).where(
            ImportBatch.id == UUID(previous), ImportBatch.company_id == batch.company_id,
        ))
        if revised:
            return revised
    if batch.status not in {ImportStatus.AWAITING_MAPPING, ImportStatus.FAILED}:
        raise RevisionConflict("ساختار فایل ثبت‌شده یا در حال پردازش قابل تغییر نیست.")
    if batch.status == ImportStatus.FAILED and batch.stage not in {"validation_failed", "full_validation"}:
        raise RevisionConflict("این فایل برای اصلاح ساختار آماده نیست.")
    revised = ImportBatch(
        id=uuid7(), company_id=batch.company_id, source_id=batch.source_id, file_id=batch.file_id,
        status=ImportStatus.AWAITING_MAPPING, stage="awaiting_mapping", progress=30,
        idempotency_key=f"revise:{batch.id}",
    )
    session.add(revised)
    batch.status = ImportStatus.CANCELLED
    batch.stage = "structure_revised"
    batch.coverage_json = {**batch.coverage_json, "revised_batch_id": str(revised.id)}
    record_audit_event(
        session, action="import.structure_revised", entity_type="import_batch",
        entity_id=batch.id, company_id=batch.company_id, actor_id=actor_id,
        metadata={"revised_batch_id": str(revised.id)},
    )
    await session.flush()
    return revised
