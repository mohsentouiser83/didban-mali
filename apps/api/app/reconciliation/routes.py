from datetime import date
from typing import Annotated
from uuid import UUID

from celery.exceptions import CeleryError
from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.analysis.models import AnalysisRun, AnalysisStatus
from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.financial.models import BankTransaction, JournalEntry
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reconciliation.models import (
    MatchStatus,
    ReconciliationAllocation,
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)
from app.reconciliation.schemas import (
    ManualMatchRequest,
    ReconciliationAllocationResponse,
    ReconciliationMatchesResponse,
    ReconciliationMatchResponse,
    ReconciliationRunRequest,
    ReconciliationRunResponse,
    ReverseMatchRequest,
    UnmatchedBankTransactionItem,
    UnmatchedJournalLineItem,
    UnmatchedRecordsResponse,
)
from app.reconciliation.service import (
    get_unmatched_records,
    manual_reconciliation_match,
    reverse_reconciliation_match,
    run_canonical_reconciliation,
)
from app.reconciliation.tasks import execute_reconciliation_task

router = APIRouter(prefix="/companies/{company_id}", tags=["reconciliation"])

RUN_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}
VIEW_ROLES = {
    CompanyRole.OWNER,
    CompanyRole.FINANCE_MANAGER,
    CompanyRole.ADVISOR,
    CompanyRole.VIEWER,
}


def _run_response(run: ReconciliationRun) -> ReconciliationRunResponse:
    return ReconciliationRunResponse(
        id=run.id,
        company_id=run.company_id,
        analysis_run_id=run.analysis_run_id,
        bank_account_id=run.bank_account_id,
        period_start=run.period_start,
        period_end=run.period_end,
        status=run.status,
        config_version=run.config_version,
        config=run.config_json,
        counts=run.counts_json,
        matched_count=run.matched_count,
        unmatched_bank_count=run.unmatched_bank_count,
        unmatched_journal_count=run.unmatched_journal_count,
        matched_amount_irr=run.matched_amount_irr,
        unmatched_bank_amount_irr=run.unmatched_bank_amount_irr,
        unmatched_journal_amount_irr=run.unmatched_journal_amount_irr,
        created_by=run.created_by,
        started_at=run.started_at,
        completed_at=run.completed_at,
        failure_code=run.failure_code,
        failure_message=run.failure_message,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _match_response(
    item: ReconciliationMatch,
    allocations: list[ReconciliationAllocation] | None = None,
    bank_tx: BankTransaction | None = None,
    journal_entry: JournalEntry | None = None,
) -> ReconciliationMatchResponse:
    alloc_responses = [
        ReconciliationAllocationResponse(
            id=a.id,
            match_id=a.match_id,
            side=a.side,
            bank_transaction_id=a.bank_transaction_id,
            journal_line_id=a.journal_line_id,
            allocated_amount_irr=a.allocated_amount_irr,
        )
        for a in (allocations or [])
    ]
    return ReconciliationMatchResponse(
        id=item.id,
        bank_transaction_id=item.bank_transaction_id,
        journal_entry_id=item.journal_entry_id,
        match_type=item.match_type,
        match_level=item.match_level,
        status=item.status,
        score=item.score,
        amount_difference_irr=item.amount_difference_irr,
        date_difference_days=item.date_difference_days,
        features=item.features_json,
        evidence=item.evidence_json,
        match_reasons=item.match_reasons_json if isinstance(item.match_reasons_json, list) else [],
        rule_code=item.rule_code,
        reversed_by=item.reversed_by,
        reversed_at=item.reversed_at,
        reversal_reason=item.reversal_reason,
        allocations=alloc_responses,
        created_at=item.created_at,
        bank_description=bank_tx.description if bank_tx else None,
        bank_date=bank_tx.booking_date if bank_tx else None,
        bank_amount_irr=bank_tx.amount_irr if bank_tx else None,
        journal_description=journal_entry.description if journal_entry else None,
        journal_date=journal_entry.entry_date if journal_entry else None,
    )


@router.post(
    "/reconciliation/runs",
    response_model=ReconciliationRunResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_canonical_reconciliation_run(
    company_id: UUID,
    payload: ReconciliationRunRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> ReconciliationRunResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="اجازه اجرای تطبیق را ندارید."
        )

    run = await run_canonical_reconciliation(
        session,
        company_id=company_id,
        actor_id=current_user.id,
        bank_account_id=payload.bank_account_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        config_params=payload.model_dump(mode="json"),
    )
    return _run_response(run)


FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}


def _queue_reconciliation(run: ReconciliationRun) -> None:
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
            _queue_reconciliation(existing)
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
    _queue_reconciliation(run)
    return _run_response(run)


@router.get(
    "/reconciliation/runs",
    response_model=list[ReconciliationRunResponse],
)
@router.get(
    "/reconciliation-runs",
    response_model=list[ReconciliationRunResponse],
    operation_id="list_legacy_reconciliation_runs",
)
async def list_reconciliation_runs(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    limit: int = Query(default=20, ge=1, le=100),
) -> list[ReconciliationRunResponse]:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    runs = (
        await session.scalars(
            select(ReconciliationRun)
            .where(ReconciliationRun.company_id == company_id)
            .order_by(ReconciliationRun.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [_run_response(r) for r in runs]


@router.get(
    "/reconciliation/runs/{run_id}",
    response_model=ReconciliationRunResponse,
)
@router.get(
    "/reconciliation-runs/{run_id}",
    response_model=ReconciliationRunResponse,
    operation_id="get_legacy_reconciliation_run",
)
async def get_reconciliation_run(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> ReconciliationRunResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    run = await session.scalar(
        select(ReconciliationRun).where(
            ReconciliationRun.id == run_id,
            ReconciliationRun.company_id == company_id,
        )
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اجرای تطبیق یافت نشد.")
    return _run_response(run)


@router.get(
    "/reconciliation/matches",
    response_model=ReconciliationMatchesResponse,
)
@router.get(
    "/reconciliation-runs/{run_id}/matches",
    response_model=ReconciliationMatchesResponse,
    operation_id="list_legacy_reconciliation_matches",
)
async def list_reconciliation_matches(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    run_id: UUID | None = None,
    status_filter: MatchStatus | None = Query(default=None, alias="status"),
    match_status: MatchStatus | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> ReconciliationMatchesResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    stmt = select(ReconciliationMatch).where(ReconciliationMatch.company_id == company_id)
    if run_id:
        stmt = stmt.where(ReconciliationMatch.run_id == run_id)
    effective_status = status_filter or match_status
    if effective_status:
        stmt = stmt.where(ReconciliationMatch.status == effective_status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await session.scalar(count_stmt)) or 0

    stmt = stmt.order_by(ReconciliationMatch.created_at.desc()).limit(limit)
    matches = (await session.scalars(stmt)).all()

    # Preload details for bank and journal
    match_ids = [m.id for m in matches]
    allocs = (
        await session.scalars(
            select(ReconciliationAllocation).where(
                ReconciliationAllocation.company_id == company_id,
                ReconciliationAllocation.match_id.in_(match_ids),
            )
        )
    ).all() if match_ids else []

    alloc_by_match: dict[UUID, list[ReconciliationAllocation]] = {}
    for a in allocs:
        alloc_by_match.setdefault(a.match_id, []).append(a)

    bank_ids = [m.bank_transaction_id for m in matches if m.bank_transaction_id]
    banks = (
        await session.scalars(
            select(BankTransaction).where(
                BankTransaction.company_id == company_id,
                BankTransaction.id.in_(bank_ids),
            )
        )
    ).all() if bank_ids else []
    bank_map = {b.id: b for b in banks}

    journal_ids = [m.journal_entry_id for m in matches if m.journal_entry_id]
    journals = (
        await session.scalars(
            select(JournalEntry).where(
                JournalEntry.company_id == company_id,
                JournalEntry.id.in_(journal_ids),
            )
        )
    ).all() if journal_ids else []
    journal_map = {j.id: j for j in journals}

    items = [
        _match_response(
            m,
            alloc_by_match.get(m.id, []),
            bank_map.get(m.bank_transaction_id) if m.bank_transaction_id else None,
            journal_map.get(m.journal_entry_id) if m.journal_entry_id else None,
        )
        for m in matches
    ]

    return ReconciliationMatchesResponse(
        items=items,
        total_count=total_count,
    )


@router.post(
    "/reconciliation/matches/manual",
    response_model=ReconciliationMatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_manual_match(
    company_id: UUID,
    payload: ManualMatchRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> ReconciliationMatchResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="اجازه تطبیق دستی را ندارید.")

    try:
        match = await manual_reconciliation_match(
            session,
            company_id=company_id,
            actor_id=current_user.id,
            bank_transaction_ids=payload.bank_transaction_ids,
            journal_line_ids=payload.journal_line_ids,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return _match_response(match)


@router.post(
    "/reconciliation/matches/{match_id}/reverse",
    response_model=ReconciliationMatchResponse,
)
async def reverse_match(
    company_id: UUID,
    match_id: UUID,
    payload: ReverseMatchRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> ReconciliationMatchResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="اجازه لغو تطبیق را ندارید.")

    try:
        match = await reverse_reconciliation_match(
            session,
            company_id=company_id,
            actor_id=current_user.id,
            match_id=match_id,
            reason=payload.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return _match_response(match)


@router.get(
    "/reconciliation/unmatched",
    response_model=UnmatchedRecordsResponse,
)
async def get_unmatched(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    bank_account_id: UUID | None = Query(default=None),
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
) -> UnmatchedRecordsResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    data = await get_unmatched_records(
        session,
        company_id=company_id,
        bank_account_id=bank_account_id,
        period_start=period_start,
        period_end=period_end,
    )
    return UnmatchedRecordsResponse(
        bank_transactions=[UnmatchedBankTransactionItem(**b) for b in data["bank_transactions"]],
        journal_lines=[UnmatchedJournalLineItem(**j) for j in data["journal_lines"]],
        total_unmatched_bank_amount=data["total_unmatched_bank_amount"],
        total_unmatched_journal_amount=data["total_unmatched_journal_amount"],
        total_bank_count=data["total_bank_count"],
        total_journal_count=data["total_journal_count"],
    )
