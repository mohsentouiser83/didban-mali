import asyncio
import hashlib
from datetime import UTC, datetime
from io import BytesIO
from typing import Any
from uuid import UUID

from botocore.exceptions import BotoCoreError
from sqlalchemy import select

from app.audit.service import record_audit_event
from app.core.database import async_session_factory, engine
from app.core.tenant import set_request_company, set_request_user
from app.imports.storage import get_storage
from app.reports.models import ReportSnapshot, ReportStatus
from app.reports.render import render_report_pdf
from app.worker import celery_app


async def _mark_failed(report_id: UUID, company_id: UUID, actor_id: UUID, message: str) -> None:
    async with async_session_factory() as session:
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
        report = await session.scalar(
            select(ReportSnapshot).where(
                ReportSnapshot.id == report_id,
                ReportSnapshot.company_id == company_id,
                ReportSnapshot.status.in_({ReportStatus.QUEUED, ReportStatus.PROCESSING}),
            )
        )
        if report is not None:
            report.status = ReportStatus.FAILED
            report.progress = 100
            report.stage = "failed"
            report.completed_at = datetime.now(UTC)
            report.failure_code = "REPORT_GENERATION_FAILED"
            report.failure_message = message[:500]
            await session.commit()


async def _execute(
    report_id: UUID,
    company_id: UUID,
    actor_id: UUID,
    *,
    allow_processing: bool,
    mark_transient_failed: bool,
) -> dict[str, object]:
    object_key: str | None = None
    try:
        async with async_session_factory() as session:
            await set_request_user(session, actor_id)
            await set_request_company(session, company_id)
            report = await session.scalar(
                select(ReportSnapshot)
                .where(
                    ReportSnapshot.id == report_id,
                    ReportSnapshot.company_id == company_id,
                )
                .with_for_update()
            )
            if report is None:
                raise ValueError("Report snapshot not found")
            if report.status == ReportStatus.COMPLETED:
                return {"report_id": str(report.id), "status": report.status.value}
            if report.status == ReportStatus.FAILED:
                return {"report_id": str(report.id), "status": report.status.value}
            if report.status == ReportStatus.PROCESSING and not allow_processing:
                return {"report_id": str(report.id), "status": report.status.value}
            report.status = ReportStatus.PROCESSING
            report.progress = 10
            report.stage = "rendering_pdf"
            report.started_at = report.started_at or datetime.now(UTC)
            await session.commit()
            payload = dict(report.payload_json)

        pdf_bytes = render_report_pdf(payload)
        digest = hashlib.sha256(pdf_bytes).hexdigest()
        object_key = f"reports/{company_id}/{report_id}.pdf"
        get_storage().upload(
            object_key,
            BytesIO(pdf_bytes),
            "application/pdf",
            digest,
        )

        async with async_session_factory() as session:
            await set_request_user(session, actor_id)
            await set_request_company(session, company_id)
            report = await session.scalar(
                select(ReportSnapshot)
                .where(
                    ReportSnapshot.id == report_id,
                    ReportSnapshot.company_id == company_id,
                    ReportSnapshot.status == ReportStatus.PROCESSING,
                )
                .with_for_update()
            )
            if report is None:
                raise ValueError("Report is no longer available for completion")
            report.status = ReportStatus.COMPLETED
            report.progress = 100
            report.stage = "completed"
            report.object_key = object_key
            report.pdf_sha256 = digest
            report.pdf_size_bytes = len(pdf_bytes)
            report.completed_at = datetime.now(UTC)
            report.failure_code = None
            report.failure_message = None
            record_audit_event(
                session,
                action="report.generated",
                entity_type="report_snapshot",
                actor_id=actor_id,
                entity_id=report.id,
                company_id=company_id,
                metadata={
                    "analysis_run_id": str(report.analysis_run_id),
                    "pdf_sha256": digest,
                    "pdf_size_bytes": len(pdf_bytes),
                },
            )
            await session.commit()
            return {"report_id": str(report.id), "status": report.status.value}
    except BotoCoreError as exc:
        if object_key is not None:
            try:
                get_storage().delete(object_key)
            except Exception:
                pass
        if mark_transient_failed:
            await _mark_failed(report_id, company_id, actor_id, str(exc))
        raise
    except Exception as exc:
        if object_key is not None:
            try:
                get_storage().delete(object_key)
            except Exception:
                pass
        await _mark_failed(report_id, company_id, actor_id, str(exc))
        raise
    finally:
        await engine.dispose()


@celery_app.task(
    bind=True,
    name="reports.generate_pdf",
    autoretry_for=(BotoCoreError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)  # type: ignore[untyped-decorator]
def generate_report_pdf_task(
    self: Any, report_id: str, company_id: str, actor_id: str
) -> dict[str, object]:
    retries = int(getattr(getattr(self, "request", None), "retries", 0))
    max_retries = int(getattr(self, "max_retries", 3))
    return asyncio.run(
        _execute(
            UUID(report_id),
            UUID(company_id),
            UUID(actor_id),
            allow_processing=retries > 0,
            mark_transient_failed=retries >= max_retries,
        )
    )
