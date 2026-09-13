import calendar
from datetime import date
from typing import Annotated
from uuid import UUID

from celery.exceptions import CeleryError
from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.analysis.models import AnalysisRun, AnalysisStatus, MetricObservation
from app.analysis.schemas import (
    AnalysisRunRequest,
    AnalysisRunResponse,
    MetricObservationResponse,
    MetricsResponse,
)
from app.analysis.tasks import calculate_financial_metrics_task
from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession

router = APIRouter(prefix="/companies/{company_id}", tags=["analysis"])
RUN_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}
FINAL_STATUSES = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}


def _run_response(run: AnalysisRun) -> AnalysisRunResponse:
    return AnalysisRunResponse(
        id=run.id,
        company_id=run.company_id,
        period_start=run.period_start,
        period_end=run.period_end,
        status=run.status,
        input_manifest=run.input_manifest_json,
        rule_set_version=run.rule_set_version,
        coverage=run.coverage_json,
        created_by=run.created_by,
        started_at=run.started_at,
        completed_at=run.completed_at,
        failure_code=run.failure_code,
        failure_message=run.failure_message,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _metric_response(metric: MetricObservation) -> MetricObservationResponse:
    return MetricObservationResponse(
        analysis_run_id=metric.analysis_run_id,
        metric_code=metric.metric_code,
        period_start=metric.period_start,
        period_end=metric.period_end,
        value_irr=metric.value_irr,
        value_ratio=metric.value_ratio,
        calculation=metric.calculation_json,
        calculated_at=metric.calculated_at,
    )


def _queue(run: AnalysisRun) -> None:
    try:
        calculate_financial_metrics_task.delay(
            str(run.id), str(run.company_id), str(run.created_by)
        )
    except CeleryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="صف محاسبات موقتاً در دسترس نیست؛ درخواست را دوباره ارسال کنید.",
        ) from exc


@router.post(
    "/analysis-runs", response_model=AnalysisRunResponse, status_code=status.HTTP_202_ACCEPTED
)
async def create_analysis_run(
    company_id: UUID,
    payload: AnalysisRunRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> AnalysisRunResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="اجازه اجرای تحلیل مالی را ندارید."
        )
    existing = await session.scalar(
        select(AnalysisRun).where(
            AnalysisRun.company_id == company_id,
            AnalysisRun.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if (
            existing.period_start != payload.period_start
            or existing.period_end != payload.period_end
            or existing.rule_set_version != payload.rule_set_version
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این کلید تکرارپذیری قبلاً برای دوره یا نسخه دیگری استفاده شده است.",
            )
        if existing.status == AnalysisStatus.QUEUED:
            _queue(existing)
        return _run_response(existing)

    run = AnalysisRun(
        id=uuid7(),
        company_id=company_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        status=AnalysisStatus.QUEUED,
        input_manifest_json={},
        rule_set_version=payload.rule_set_version,
        coverage_json={},
        idempotency_key=idempotency_key,
        created_by=current_user.id,
    )
    session.add(run)
    record_audit_event(
        session,
        action="analysis.requested",
        entity_type="analysis_run",
        actor_id=current_user.id,
        entity_id=run.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={
            "period_start": payload.period_start.isoformat(),
            "period_end": payload.period_end.isoformat(),
            "rule_set_version": payload.rule_set_version,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="یک اجرای تحلیل هم‌زمان با همین کلید ثبت شده است.",
        ) from exc
    _queue(run)
    return _run_response(run)


@router.get("/analysis-runs/{run_id}", response_model=AnalysisRunResponse)
async def get_analysis_run(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AnalysisRunResponse:
    del access
    run = await session.scalar(
        select(AnalysisRun).where(AnalysisRun.id == run_id, AnalysisRun.company_id == company_id)
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اجرای تحلیل پیدا نشد.")
    return _run_response(run)


@router.get("/analysis-runs/{run_id}/coverage", response_model=dict[str, object])
async def get_analysis_coverage(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> dict[str, object]:
    del access
    run = await session.scalar(
        select(AnalysisRun).where(AnalysisRun.id == run_id, AnalysisRun.company_id == company_id)
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اجرای تحلیل پیدا نشد.")
    return {"analysis_run_id": str(run.id), "status": run.status.value, **run.coverage_json}


def _month_period(value: str) -> tuple[date, date]:
    try:
        year_text, month_text = value.split("-", maxsplit=1)
        year, month = int(year_text), int(month_text)
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, 1), date(year, month, last_day)
    except (ValueError, IndexError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="دوره باید به شکل YYYY-MM و بر پایه تقویم میلادی باشد.",
        ) from exc


@router.get("/metrics", response_model=MetricsResponse)
async def list_metrics(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    period: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    analysis_run_id: UUID | None = None,
) -> MetricsResponse:
    del access
    statement = select(AnalysisRun).where(
        AnalysisRun.company_id == company_id,
        AnalysisRun.status.in_(FINAL_STATUSES),
    )
    if analysis_run_id is not None:
        statement = statement.where(AnalysisRun.id == analysis_run_id)
    elif period is not None:
        period_start, period_end = _month_period(period)
        statement = statement.where(
            AnalysisRun.period_start == period_start,
            AnalysisRun.period_end == period_end,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="شناسه اجرای تحلیل یا دوره الزامی است.",
        )
    run = await session.scalar(statement.order_by(AnalysisRun.completed_at.desc()).limit(1))
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شاخصی پیدا نشد.")
    metrics = list(
        await session.scalars(
            select(MetricObservation)
            .where(MetricObservation.analysis_run_id == run.id)
            .order_by(MetricObservation.metric_code)
        )
    )
    return MetricsResponse(
        analysis_run=_run_response(run), metrics=[_metric_response(item) for item in metrics]
    )
