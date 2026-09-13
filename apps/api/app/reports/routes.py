import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from celery.exceptions import CeleryError
from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.dashboard.service import resolve_analysis_run
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.imports.storage import get_storage, iter_object
from app.reports.models import ReportSnapshot, ReportStatus
from app.reports.schemas import ReportCreateRequest, ReportResponse
from app.reports.snapshot import build_report_payload
from app.reports.tasks import generate_report_pdf_task

router = APIRouter(prefix="/companies/{company_id}/reports", tags=["reports"])
CREATE_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}


def _response(report: ReportSnapshot) -> ReportResponse:
    return ReportResponse(
        id=report.id,
        company_id=report.company_id,
        analysis_run_id=report.analysis_run_id,
        period_start=report.period_start,
        period_end=report.period_end,
        title_fa=report.title_fa,
        advisor_note=report.advisor_note,
        payload=report.payload_json,
        status=report.status,
        progress=report.progress,
        stage=report.stage,
        download_ready=report.status == ReportStatus.COMPLETED,
        pdf_sha256=report.pdf_sha256,
        pdf_size_bytes=report.pdf_size_bytes,
        created_by=report.created_by,
        started_at=report.started_at,
        completed_at=report.completed_at,
        failure_code=report.failure_code,
        failure_message=report.failure_message,
        created_at=report.created_at,
    )


def _request_hash(payload: ReportCreateRequest) -> str:
    canonical = json.dumps(payload.model_dump(mode="json"), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _queue(report: ReportSnapshot) -> None:
    try:
        generate_report_pdf_task.delay(
            str(report.id), str(report.company_id), str(report.created_by)
        )
    except CeleryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="صف تولید گزارش موقتاً در دسترس نیست؛ درخواست را دوباره ارسال کنید.",
        ) from exc


@router.post("", response_model=ReportResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_report(
    company_id: UUID,
    payload: ReportCreateRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ReportResponse:
    if access.role not in CREATE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="اجازه تولید گزارش مالی را ندارید.",
        )
    request_hash = _request_hash(payload)
    existing = await session.scalar(
        select(ReportSnapshot).where(
            ReportSnapshot.company_id == company_id,
            ReportSnapshot.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این کلید تکرارپذیری قبلاً برای گزارش دیگری استفاده شده است.",
            )
        if existing.status == ReportStatus.QUEUED:
            _queue(existing)
        return _response(existing)
    analysis = await resolve_analysis_run(
        session,
        company_id=company_id,
        analysis_run_id=payload.analysis_run_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
    )
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="تحلیل تکمیل‌شده‌ای برای گزارش پیدا نشد.",
        )
    now = datetime.now(UTC)
    snapshot = await build_report_payload(
        session,
        company_id=company_id,
        analysis=analysis,
        title_fa=payload.title_fa,
        advisor_note=payload.advisor_note,
        created_by=current_user.id,
        generated_at=now,
    )
    report = ReportSnapshot(
        id=uuid7(),
        company_id=company_id,
        analysis_run_id=analysis.id,
        period_start=analysis.period_start,
        period_end=analysis.period_end,
        title_fa=payload.title_fa,
        advisor_note=payload.advisor_note,
        payload_json=snapshot,
        status=ReportStatus.QUEUED,
        progress=0,
        stage="queued",
        created_by=current_user.id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        created_at=now,
    )
    session.add(report)
    record_audit_event(
        session,
        action="report.requested",
        entity_type="report_snapshot",
        actor_id=current_user.id,
        entity_id=report.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={
            "analysis_run_id": str(analysis.id),
            "period_start": analysis.period_start.isoformat(),
            "period_end": analysis.period_end.isoformat(),
            "has_advisor_note": payload.advisor_note is not None,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="یک گزارش هم‌زمان با همین کلید ثبت شده است.",
        ) from exc
    _queue(report)
    return _response(report)


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    company_id: UUID,
    report_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> ReportResponse:
    del access
    report = await session.scalar(
        select(ReportSnapshot).where(
            ReportSnapshot.id == report_id,
            ReportSnapshot.company_id == company_id,
        )
    )
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="گزارش پیدا نشد.")
    return _response(report)


@router.get("/{report_id}/download")
async def download_report(
    company_id: UUID,
    report_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
) -> StreamingResponse:
    del access
    report = await session.scalar(
        select(ReportSnapshot).where(
            ReportSnapshot.id == report_id,
            ReportSnapshot.company_id == company_id,
        )
    )
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="گزارش پیدا نشد.")
    if report.status != ReportStatus.COMPLETED or report.object_key is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="نسخه PDF گزارش هنوز آماده دریافت نیست.",
        )
    record_audit_event(
        session,
        action="report.downloaded",
        entity_type="report_snapshot",
        actor_id=current_user.id,
        entity_id=report.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"analysis_run_id": str(report.analysis_run_id)},
    )
    await session.commit()
    body = await run_in_threadpool(get_storage().open, report.object_key)
    encoded_name = quote(f"گزارش-مالی-{report.period_start}-{report.period_end}.pdf")
    return StreamingResponse(
        iter_object(body),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
            "X-Content-SHA256": report.pdf_sha256 or "",
        },
    )
