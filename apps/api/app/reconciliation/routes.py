from typing import Annotated
from uuid import UUID

from celery.exceptions import CeleryError
from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.analysis.models import AnalysisRun, AnalysisStatus
from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reconciliation.models import (
    MatchStatus,
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)
from app.reconciliation.schemas import (
    ReconciliationMatchesResponse,
    ReconciliationMatchResponse,
    ReconciliationRunRequest,
    ReconciliationRunResponse,
)
from app.reconciliation.tasks import execute_reconciliation_task

router = APIRouter(prefix="/companies/{company_id}", tags=["reconciliation"])
RUN_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}
FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}


def _run_response(run: ReconciliationRun) -> ReconciliationRunResponse:
    return ReconciliationRunResponse(
        id=run.id,
        company_id=run.company_id,
        analysis_run_id=run.analysis_run_id,
        status=run.status,
        config_version=run.config_version,
        config=run.config_json,
        counts=run.counts_json,
        created_by=run.created_by,
        started_at=run.started_at,
        completed_at=run.completed_at,
        failure_code=run.failure_code,
        failure_message=run.failure_message,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _match_response(item: ReconciliationMatch) -> ReconciliationMatchResponse:
    return ReconciliationMatchResponse(
        id=item.id,
        bank_transaction_id=item.bank_transaction_id,
        journal_entry_id=item.journal_entry_id,
        match_level=item.match_level,
        status=item.status,
        score=item.score,
        amount_difference_irr=item.amount_difference_irr,
        date_difference_days=item.date_difference_days,
        features=item.features_json,
        evidence=item.evidence_json,
        rule_code=item.rule_code,
        created_at=item.created_at,
    )


def _queue(run: ReconciliationRun) -> None:
    try:
        execute_reconciliation_task.delay(str(run.id), str(run.company_id), str(run.created_by))
    except CeleryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="صف تطبیق موقتاً در دسترس نیست؛ درخواست را دوباره ارسال کنید.",
        ) from exc


@router.post(
    "/analysis-runs/{analysis_run_id}/reconciliation-runs",
    response_model=ReconciliationRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_reconciliation_run(
    company_id: UUID,
    analysis_run_id: UUID,
    payload: ReconciliationRunRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ReconciliationRunResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="اجازه اجرای تطبیق را ندارید."
        )
    analysis = await session.scalar(
        select(AnalysisRun).where(
            AnalysisRun.id == analysis_run_id,
            AnalysisRun.company_id == company_id,
            AnalysisRun.status.in_(FINAL_ANALYSIS),
        )
    )
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="snapshot تحلیل آماده پیدا نشد."
        )
    config = {
        "rule_business_days": payload.rule_business_days,
        "review_calendar_days": payload.review_calendar_days,
        "fuzzy_threshold": str(payload.fuzzy_threshold),
        "ambiguity_margin": str(payload.ambiguity_margin),
    }
    existing = await session.scalar(
        select(ReconciliationRun).where(
            ReconciliationRun.company_id == company_id,
            ReconciliationRun.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if (
            existing.analysis_run_id != analysis_run_id
            or existing.config_version != payload.config_version
            or existing.config_json != config
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این کلید تکرارپذیری قبلاً برای snapshot یا تنظیم دیگری استفاده شده است.",
            )
        if existing.status == ReconciliationStatus.QUEUED:
            _queue(existing)
        return _run_response(existing)

    run = ReconciliationRun(
        id=uuid7(),
        company_id=company_id,
        analysis_run_id=analysis_run_id,
        status=ReconciliationStatus.QUEUED,
        config_version=payload.config_version,
        config_json=config,
        counts_json={},
        idempotency_key=idempotency_key,
        created_by=current_user.id,
    )
    session.add(run)
    record_audit_event(
        session,
        action="reconciliation.requested",
        entity_type="reconciliation_run",
        actor_id=current_user.id,
        entity_id=run.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={
            "analysis_run_id": str(analysis_run_id),
            "config_version": payload.config_version,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="یک اجرای تطبیق هم‌زمان با همین کلید ثبت شده است.",
        ) from exc
    _queue(run)
    return _run_response(run)


@router.get("/reconciliation-runs", response_model=list[ReconciliationRunResponse])
async def list_reconciliation_runs(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    analysis_run_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[ReconciliationRunResponse]:
    del access
    statement = select(ReconciliationRun).where(ReconciliationRun.company_id == company_id)
    if analysis_run_id is not None:
        statement = statement.where(ReconciliationRun.analysis_run_id == analysis_run_id)
    runs = list(
        await session.scalars(
            statement.order_by(ReconciliationRun.created_at.desc(), ReconciliationRun.id.desc())
            .limit(limit)
        )
    )
    return [_run_response(run) for run in runs]


@router.get("/reconciliation-runs/{run_id}", response_model=ReconciliationRunResponse)
async def get_reconciliation_run(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> ReconciliationRunResponse:
    del access
    run = await session.scalar(
        select(ReconciliationRun).where(
            ReconciliationRun.id == run_id,
            ReconciliationRun.company_id == company_id,
        )
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اجرای تطبیق پیدا نشد.")
    return _run_response(run)


@router.get(
    "/reconciliation-runs/{run_id}/matches",
    response_model=ReconciliationMatchesResponse,
)
async def list_reconciliation_matches(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    match_status: MatchStatus | None = None,
    cursor: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ReconciliationMatchesResponse:
    del access
    run = await session.scalar(
        select(ReconciliationRun.id).where(
            ReconciliationRun.id == run_id,
            ReconciliationRun.company_id == company_id,
        )
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اجرای تطبیق پیدا نشد.")
    statement = select(ReconciliationMatch).where(
        ReconciliationMatch.run_id == run_id,
        ReconciliationMatch.company_id == company_id,
    )
    if match_status is not None:
        statement = statement.where(ReconciliationMatch.status == match_status)
    if cursor is not None:
        statement = statement.where(ReconciliationMatch.id > cursor)
    rows = list(await session.scalars(statement.order_by(ReconciliationMatch.id).limit(limit + 1)))
    next_cursor = rows[limit - 1].id if len(rows) > limit else None
    return ReconciliationMatchesResponse(
        items=[_match_response(item) for item in rows[:limit]],
        next_cursor=next_cursor,
    )
