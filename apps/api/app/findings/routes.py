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
from app.findings.models import (
    EvidenceItem,
    Finding,
    FindingCategory,
    FindingCode,
    FindingGenerationRun,
    FindingRunStatus,
    FindingWorkflowStatus,
    PriorityBand,
)
from app.findings.schemas import (
    EvidenceItemResponse,
    EvidenceItemsResponse,
    FindingGenerationRequest,
    FindingGenerationRunResponse,
    FindingResponse,
    FindingsResponse,
)
from app.findings.tasks import generate_findings_task
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reconciliation.models import ReconciliationRun, ReconciliationStatus

router = APIRouter(prefix="/companies/{company_id}", tags=["findings"])
RUN_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}
FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}
FINAL_RECONCILIATION = {
    ReconciliationStatus.COMPLETED,
    ReconciliationStatus.COMPLETED_LIMITED,
}


def _run_response(run: FindingGenerationRun) -> FindingGenerationRunResponse:
    return FindingGenerationRunResponse(
        id=run.id,
        company_id=run.company_id,
        analysis_run_id=run.analysis_run_id,
        reconciliation_run_id=run.reconciliation_run_id,
        status=run.status,
        config_version=run.config_version,
        config=run.config_json,
        coverage=run.coverage_json,
        counts=run.counts_json,
        created_by=run.created_by,
        started_at=run.started_at,
        completed_at=run.completed_at,
        failure_code=run.failure_code,
        failure_message=run.failure_message,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _finding_response(item: Finding) -> FindingResponse:
    return FindingResponse(
        id=item.id,
        analysis_run_id=item.analysis_run_id,
        generation_run_id=item.generation_run_id,
        reconciliation_match_id=item.reconciliation_match_id,
        finding_code=item.finding_code,
        kind=item.kind,
        category=item.category,
        title_fa=item.title_fa,
        summary_fa=item.summary_fa,
        assertion_status=item.assertion_status,
        severity=item.severity,
        priority_band=item.priority_band,
        priority_score=item.priority_score,
        priority_explanation=item.priority_explanation_json,
        priority_model_version=item.priority_model_version,
        priority_config=item.priority_config_json,
        confidence_score=item.confidence_score,
        confidence_basis=item.confidence_basis_json,
        affected_amount_irr=item.affected_amount_irr,
        affected_ratio=item.affected_ratio,
        period_start=item.period_start,
        period_end=item.period_end,
        reason_code=item.reason_code,
        reason_parameters=item.reason_parameters_json,
        calculation=item.calculation_json,
        rule_version=item.rule_version,
        workflow_status=item.workflow_status,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _queue(run: FindingGenerationRun) -> None:
    try:
        generate_findings_task.delay(str(run.id), str(run.company_id), str(run.created_by))
    except CeleryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="صف تولید یافته موقتاً در دسترس نیست؛ درخواست را دوباره ارسال کنید.",
        ) from exc


@router.post(
    "/analysis-runs/{analysis_run_id}/finding-runs",
    response_model=FindingGenerationRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_finding_generation_run(
    company_id: UUID,
    analysis_run_id: UUID,
    payload: FindingGenerationRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FindingGenerationRunResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="اجازه تولید یافته را ندارید."
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
    if payload.reconciliation_run_id is not None:
        reconciliation = await session.scalar(
            select(ReconciliationRun.id).where(
                ReconciliationRun.id == payload.reconciliation_run_id,
                ReconciliationRun.company_id == company_id,
                ReconciliationRun.analysis_run_id == analysis_run_id,
                ReconciliationRun.status.in_(FINAL_RECONCILIATION),
            )
        )
        if reconciliation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="اجرای تطبیق آماده برای این snapshot پیدا نشد.",
            )
    config = {
        "trend_ratio": str(payload.trend_ratio),
        "minimum_amount_irr": str(payload.minimum_amount_irr),
        "priority": {
            "model_version": payload.priority.model_version,
            "impact_weight": str(payload.priority.impact_weight),
            "materiality_weight": str(payload.priority.materiality_weight),
            "confidence_weight": str(payload.priority.confidence_weight),
            "urgency_weight": str(payload.priority.urgency_weight),
            "critical_threshold": str(payload.priority.critical_threshold),
            "high_threshold": str(payload.priority.high_threshold),
            "medium_threshold": str(payload.priority.medium_threshold),
            "materiality_amount_irr": str(payload.priority.materiality_amount_irr),
            "revenue_ratio_full_score": str(payload.priority.revenue_ratio_full_score),
            "critical_minimum_confidence": str(payload.priority.critical_minimum_confidence),
        },
    }
    existing = await session.scalar(
        select(FindingGenerationRun).where(
            FindingGenerationRun.company_id == company_id,
            FindingGenerationRun.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if (
            existing.analysis_run_id != analysis_run_id
            or existing.reconciliation_run_id != payload.reconciliation_run_id
            or existing.config_version != payload.config_version
            or existing.config_json != config
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این کلید تکرارپذیری قبلاً برای snapshot یا تنظیم دیگری استفاده شده است.",
            )
        if existing.status == FindingRunStatus.QUEUED:
            _queue(existing)
        return _run_response(existing)

    run = FindingGenerationRun(
        id=uuid7(),
        company_id=company_id,
        analysis_run_id=analysis_run_id,
        reconciliation_run_id=payload.reconciliation_run_id,
        status=FindingRunStatus.QUEUED,
        config_version=payload.config_version,
        config_json=config,
        coverage_json={},
        counts_json={},
        idempotency_key=idempotency_key,
        created_by=current_user.id,
    )
    session.add(run)
    record_audit_event(
        session,
        action="findings.requested",
        entity_type="finding_generation_run",
        actor_id=current_user.id,
        entity_id=run.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={
            "analysis_run_id": str(analysis_run_id),
            "reconciliation_run_id": (
                str(payload.reconciliation_run_id) if payload.reconciliation_run_id else None
            ),
            "config_version": payload.config_version,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="یک اجرای تولید یافته هم‌زمان با همین کلید ثبت شده است.",
        ) from exc
    _queue(run)
    return _run_response(run)


@router.get("/finding-runs/{run_id}", response_model=FindingGenerationRunResponse)
async def get_finding_generation_run(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> FindingGenerationRunResponse:
    del access
    run = await session.scalar(
        select(FindingGenerationRun).where(
            FindingGenerationRun.id == run_id,
            FindingGenerationRun.company_id == company_id,
        )
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اجرای یافته پیدا نشد.")
    return _run_response(run)


@router.get("/findings", response_model=FindingsResponse)
async def list_findings(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    analysis_run_id: UUID | None = None,
    generation_run_id: UUID | None = None,
    finding_code: FindingCode | None = None,
    category: FindingCategory | None = None,
    workflow_status: FindingWorkflowStatus | None = None,
    priority_band: PriorityBand | None = None,
    cursor: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> FindingsResponse:
    del access
    statement = select(Finding).where(Finding.company_id == company_id)
    if analysis_run_id is not None:
        statement = statement.where(Finding.analysis_run_id == analysis_run_id)
    if generation_run_id is not None:
        statement = statement.where(Finding.generation_run_id == generation_run_id)
    if finding_code is not None:
        statement = statement.where(Finding.finding_code == finding_code)
    if category is not None:
        statement = statement.where(Finding.category == category)
    if workflow_status is not None:
        statement = statement.where(Finding.workflow_status == workflow_status)
    if priority_band is not None:
        statement = statement.where(Finding.priority_band == priority_band)
    if cursor is not None:
        statement = statement.where(Finding.id > cursor)
    rows = list(await session.scalars(statement.order_by(Finding.id).limit(limit + 1)))
    next_cursor = rows[limit - 1].id if len(rows) > limit else None
    return FindingsResponse(
        items=[_finding_response(item) for item in rows[:limit]], next_cursor=next_cursor
    )


@router.get("/findings/{finding_id}", response_model=FindingResponse)
async def get_finding(
    company_id: UUID,
    finding_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> FindingResponse:
    del access
    item = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="یافته پیدا نشد.")
    return _finding_response(item)


@router.get(
    "/findings/{finding_id}/evidence",
    response_model=EvidenceItemsResponse,
)
async def get_finding_evidence(
    company_id: UUID,
    finding_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> EvidenceItemsResponse:
    del access
    finding = await session.scalar(
        select(Finding.id).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if finding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="یافته پیدا نشد.")
    rows = list(
        await session.scalars(
            select(EvidenceItem)
            .where(EvidenceItem.finding_id == finding_id, EvidenceItem.company_id == company_id)
            .order_by(EvidenceItem.ordinal, EvidenceItem.id)
        )
    )
    return EvidenceItemsResponse(
        items=[
            EvidenceItemResponse(
                id=item.id,
                ordinal=item.ordinal,
                evidence_type=item.evidence_type,
                claim_code=item.claim_code,
                source_entity_type=item.source_entity_type,
                source_entity_id=item.source_entity_id,
                source_row_id=item.source_row_id,
                source_file_id=item.source_file_id,
                field_snapshot=item.field_snapshot_json,
                calculation=item.calculation_json,
                rule_code=item.rule_code,
                rule_version=item.rule_version,
                created_at=item.created_at,
            )
            for item in rows
        ]
    )
