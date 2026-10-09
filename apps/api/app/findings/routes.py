from typing import Annotated, Any
from uuid import UUID

from celery.exceptions import CeleryError
from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.analysis.models import AnalysisRun, AnalysisStatus
from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.findings.engine import execute_finding_detection
from app.findings.models import (
    EvidenceItem,
    Finding,
    FindingDetectionRun,
    FindingGenerationRun,
    FindingRunStatus,
    InAppAlert,
)
from app.findings.schemas import (
    AddCommentRequest,
    AssignFindingsRequest,
    DetectFindingsRequest,
    DismissFindingsRequest,
    EvidenceItemResponse,
    EvidenceItemsResponse,
    FindingActivityResponse,
    FindingDetailResponse,
    FindingDetectionRunResponse,
    FindingEvidenceResponse,
    FindingGenerationRequest,
    FindingGenerationRunResponse,
    FindingListItemResponse,
    FindingResponse,
    FindingsResponse,
    InAppAlertItemResponse,
    InAppAlertsListResponse,
    ReopenFindingsRequest,
    ResolveFindingsRequest,
    SuppressFindingsRequest,
    VerifyFindingsRequest,
)
from app.findings.service import (
    add_finding_comment,
    assign_finding,
    dismiss_finding,
    get_control_overview,
    get_finding_detail,
    get_my_action_queue,
    list_findings,
    reopen_finding,
    resolve_finding,
    suppress_finding_entity,
    verify_finding,
)
from app.findings.tasks import generate_findings_task
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reconciliation.models import ReconciliationRun, ReconciliationStatus

router = APIRouter(prefix="/companies/{company_id}", tags=["findings"])

RUN_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}
RESOLVE_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}
VERIFY_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER}
VIEW_ROLES = {
    CompanyRole.OWNER,
    CompanyRole.FINANCE_MANAGER,
    CompanyRole.ADVISOR,
    CompanyRole.VIEWER,
}
FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}
FINAL_RECONCILIATION = {
    ReconciliationStatus.COMPLETED,
    ReconciliationStatus.COMPLETED_LIMITED,
}


# =====================================================================
# Phase 3 Control, Detection, and Lifecycle Routes
# =====================================================================


@router.post(
    "/findings/detect",
    response_model=FindingDetectionRunResponse,
    status_code=status.HTTP_201_CREATED,
)
async def trigger_finding_detection(
    company_id: UUID,
    payload: DetectFindingsRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> FindingDetectionRunResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="اجازه اجرای پایش کنترلی را ندارید."
        )

    run = await execute_finding_detection(
        session,
        company_id=company_id,
        actor_id=current_user.id,
        trigger_type=payload.trigger_type,
        period_start=payload.period_start,
        period_end=payload.period_end,
        calculation_run_id=payload.calculation_run_id,
        reconciliation_run_id=payload.reconciliation_run_id,
    )

    return _detection_run_response(run)


def _detection_run_response(run: FindingDetectionRun) -> FindingDetectionRunResponse:
    return FindingDetectionRunResponse(
        id=run.id,
        company_id=run.company_id,
        trigger_type=run.trigger_type,
        status=run.status,
        period_start=run.period_start,
        period_end=run.period_end,
        findings_detected=run.findings_detected,
        findings_created=run.findings_created,
        findings_updated=run.findings_updated,
        findings_suppressed=run.findings_suppressed,
        summary=run.summary_json,
        started_at=run.started_at,
        completed_at=run.completed_at,
        created_at=run.created_at,
    )


def _run_response(run: FindingGenerationRun) -> FindingGenerationRunResponse:
    raw_status = run.status
    if isinstance(raw_status, FindingRunStatus):
        status_val = raw_status
    else:
        status_str = str(getattr(raw_status, "value", raw_status)).lower()
        status_val = FindingRunStatus(status_str)
    return FindingGenerationRunResponse(
        id=run.id,
        company_id=run.company_id,
        analysis_run_id=run.analysis_run_id,
        reconciliation_run_id=run.reconciliation_run_id,
        status=status_val,
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


@router.get(
    "/finding-runs",
    response_model=list[FindingGenerationRunResponse],
)
async def list_finding_runs(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    analysis_run_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[FindingGenerationRunResponse]:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")
    statement = select(FindingGenerationRun).where(
        FindingGenerationRun.company_id == company_id
    )
    if analysis_run_id is not None:
        statement = statement.where(FindingGenerationRun.analysis_run_id == analysis_run_id)
    runs = list(
        await session.scalars(
            statement.order_by(
                FindingGenerationRun.created_at.desc(), FindingGenerationRun.id.desc()
            ).limit(limit)
        )
    )
    return [_run_response(run) for run in runs]


@router.get(
    "/finding-runs/{run_id}",
    response_model=FindingGenerationRunResponse,
)
async def get_finding_run(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> FindingGenerationRunResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")
    run = await session.scalar(
        select(FindingGenerationRun).where(
            FindingGenerationRun.id == run_id,
            FindingGenerationRun.company_id == company_id,
        )
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اجرای یافته پیدا نشد.")
    return _run_response(run)


@router.get(
    "/findings/detection-runs",
    response_model=list[FindingDetectionRunResponse],
)
async def list_finding_detection_runs(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    limit: int = Query(default=20, ge=1, le=50),
) -> list[FindingDetectionRunResponse]:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")
    statement = select(FindingDetectionRun).where(
        FindingDetectionRun.company_id == company_id
    )
    runs = list(
        await session.scalars(
            statement.order_by(
                FindingDetectionRun.created_at.desc(), FindingDetectionRun.id.desc()
            ).limit(limit)
        )
    )
    return [_detection_run_response(run) for run in runs]


@router.get(
    "/findings",
    response_model=FindingsResponse,
)
async def get_findings_list(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    analysis_run_id: UUID | None = Query(default=None),
    generation_run_id: UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    severity_filter: str | None = Query(default=None, alias="severity"),
    category_filter: str | None = Query(default=None, alias="category"),
    rule_code_filter: str | None = Query(default=None, alias="rule_code"),
    assigned_to_user_id: UUID | None = Query(default=None),
    is_suppressed: bool | None = Query(default=False),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> FindingsResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    items, total_count = await list_findings(
        session,
        company_id=company_id,
        analysis_run_id=analysis_run_id,
        generation_run_id=generation_run_id,
        status_filter=status_filter,
        severity_filter=severity_filter,
        category_filter=category_filter,
        rule_code_filter=rule_code_filter,
        assigned_to_user_id=assigned_to_user_id,
        is_suppressed=is_suppressed,
        search=search,
        limit=limit,
        offset=offset,
    )
    return FindingsResponse(
        items=[FindingResponse(**item) for item in items],
        total_count=total_count,
    )


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
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")
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


@router.get(
    "/findings/{finding_id}",
    response_model=FindingDetailResponse,
)
async def get_finding(
    company_id: UUID,
    finding_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> FindingDetailResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    try:
        data = await get_finding_detail(session, company_id=company_id, finding_id=finding_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    f: Finding = data["finding"]
    return FindingDetailResponse(
        id=f.id,
        fingerprint=f.fingerprint,
        analysis_run_id=f.analysis_run_id,
        generation_run_id=f.generation_run_id,
        finding_code=f.finding_code,
        kind=f.kind.value if hasattr(f.kind, "value") else str(f.kind),
        assertion_status=f.assertion_status.value if hasattr(f.assertion_status, "value") else str(f.assertion_status),
        priority_band=f.priority_band.value if hasattr(f.priority_band, "value") else str(f.priority_band),
        priority_score=f.priority_score,
        priority_explanation=f.priority_explanation_json,
        priority_model_version=f.priority_model_version,
        priority_config=f.priority_config_json,
        confidence_score=f.confidence_score,
        confidence_basis=f.confidence_basis_json,
        affected_amount_irr=f.affected_amount_irr,
        affected_ratio=f.affected_ratio,
        reason_code=f.reason_code,
        reason_parameters=f.reason_parameters_json,
        calculation=f.calculation_json,
        rule_version=f.rule_version,
        workflow_status=f.workflow_status.value if hasattr(f.workflow_status, "value") else str(f.workflow_status),
        rule_code=f.rule_code,
        category=f.category,
        severity=f.severity,
        status=f.status,
        title_fa=f.title_fa,
        summary_fa=f.summary_fa,
        financial_impact_irr=f.financial_impact_irr,
        due_date=f.due_date,
        assigned_to_user_id=f.assigned_to_user_id,
        assigned_to_name=data["assigned_to_name"],
        source_entity_type=f.source_entity_type,
        source_entity_id=f.source_entity_id,
        reconciliation_match_id=f.reconciliation_match_id,
        calculation_run_id=f.calculation_run_id,
        resolution_type=f.resolution_type,
        resolution_note=f.resolution_note,
        resolved_by_user_id=f.resolved_by_user_id,
        resolved_by_name=data["resolved_by_name"],
        resolved_at=f.resolved_at,
        verified_by_user_id=f.verified_by_user_id,
        verified_by_name=data["verified_by_name"],
        verified_at=f.verified_at,
        verification_note=f.verification_note,
        is_suppressed=f.is_suppressed,
        period_start=f.period_start,
        period_end=f.period_end,
        evidence=[FindingEvidenceResponse(**ev) for ev in data["evidence"]],
        activities=[FindingActivityResponse(**act) for act in data["activities"]],
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


@router.patch(
    "/findings/{finding_id}/assign",
    response_model=FindingDetailResponse,
)
async def assign_finding_route(
    company_id: UUID,
    finding_id: UUID,
    payload: AssignFindingsRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> FindingDetailResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="اجازه تخصیص مغایرت را ندارید.")

    try:
        await assign_finding(
            session,
            company_id=company_id,
            finding_id=finding_id,
            actor_id=current_user.id,
            assigned_to_user_id=payload.assigned_to_user_id,
            due_date=payload.due_date,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return await get_finding(company_id, finding_id, session, access)


@router.post(
    "/findings/{finding_id}/resolve",
    response_model=FindingDetailResponse,
)
async def resolve_finding_route(
    company_id: UUID,
    finding_id: UUID,
    payload: ResolveFindingsRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> FindingDetailResponse:
    if access.role not in RESOLVE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="اجازه ثبت رفع مغایرت را ندارید.")

    try:
        await resolve_finding(
            session,
            company_id=company_id,
            finding_id=finding_id,
            actor_id=current_user.id,
            resolution_type=payload.resolution_type,
            resolution_note=payload.resolution_note,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return await get_finding(company_id, finding_id, session, access)


@router.post(
    "/findings/{finding_id}/verify",
    response_model=FindingDetailResponse,
)
async def verify_finding_route(
    company_id: UUID,
    finding_id: UUID,
    payload: VerifyFindingsRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> FindingDetailResponse:
    if access.role not in VERIFY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="تایید نهایی تنها توسط مدیر مالی یا مالک شرکت امکان‌پذیر است.",
        )

    try:
        await verify_finding(
            session,
            company_id=company_id,
            finding_id=finding_id,
            actor_id=current_user.id,
            verification_note=payload.verification_note,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return await get_finding(company_id, finding_id, session, access)


@router.post(
    "/findings/{finding_id}/reopen",
    response_model=FindingDetailResponse,
)
async def reopen_finding_route(
    company_id: UUID,
    finding_id: UUID,
    payload: ReopenFindingsRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> FindingDetailResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="اجازه بازگشایی مغایرت را ندارید.")

    try:
        await reopen_finding(
            session,
            company_id=company_id,
            finding_id=finding_id,
            actor_id=current_user.id,
            reason=payload.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return await get_finding(company_id, finding_id, session, access)


@router.post(
    "/findings/{finding_id}/dismiss",
    response_model=FindingDetailResponse,
)
async def dismiss_finding_route(
    company_id: UUID,
    finding_id: UUID,
    payload: DismissFindingsRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> FindingDetailResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="اجازه رد مغایرت را ندارید.")

    try:
        await dismiss_finding(
            session,
            company_id=company_id,
            finding_id=finding_id,
            actor_id=current_user.id,
            reason=payload.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return await get_finding(company_id, finding_id, session, access)


@router.post(
    "/findings/{finding_id}/comments",
    response_model=FindingActivityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment_route(
    company_id: UUID,
    finding_id: UUID,
    payload: AddCommentRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> FindingActivityResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    try:
        act = await add_finding_comment(
            session,
            company_id=company_id,
            finding_id=finding_id,
            actor_id=current_user.id,
            comment=payload.comment,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return FindingActivityResponse(
        id=act.id,
        user_id=act.user_id,
        user_name=current_user.full_name or current_user.email,
        action_type=act.action_type,
        old_state=act.old_state,
        new_state=act.new_state,
        note=act.note,
        metadata=act.metadata_json,
        created_at=act.created_at,
    )


@router.post(
    "/findings/suppress",
    status_code=status.HTTP_201_CREATED,
)
async def suppress_entity_route(
    company_id: UUID,
    payload: SuppressFindingsRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> dict[str, str]:
    if access.role not in RUN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="اجازه ثبت معافیت را ندارید.")

    await suppress_finding_entity(
        session,
        company_id=company_id,
        actor_id=current_user.id,
        rule_code=payload.rule_code,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        reason=payload.reason,
        expires_at=payload.expires_at,
    )
    return {"message": "معافیت با موفقیت ثبت شد."}


@router.get(
    "/actions/my-queue",
)
async def get_my_queue_route(
    company_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
) -> dict[str, Any]:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    data = await get_my_action_queue(
        session,
        company_id=company_id,
        user_id=current_user.id,
        role=access.role,
    )
    return {
        "assigned_findings": [
            FindingListItemResponse(
                id=f.id,
                fingerprint=f.fingerprint,
                rule_code=f.rule_code,
                category=f.category,
                severity=f.severity,
                status=f.status,
                title_fa=f.title_fa,
                summary_fa=f.summary_fa,
                financial_impact_irr=f.financial_impact_irr,
                due_date=f.due_date,
                assigned_to_user_id=f.assigned_to_user_id,
                assigned_to_name=current_user.full_name,
                resolution_type=f.resolution_type,
                is_suppressed=f.is_suppressed,
                created_at=f.created_at,
                updated_at=f.updated_at,
            )
            for f in data["assigned_findings"]
        ],
        "verification_queue": [
            FindingListItemResponse(
                id=f.id,
                fingerprint=f.fingerprint,
                rule_code=f.rule_code,
                category=f.category,
                severity=f.severity,
                status=f.status,
                title_fa=f.title_fa,
                summary_fa=f.summary_fa,
                financial_impact_irr=f.financial_impact_irr,
                due_date=f.due_date,
                assigned_to_user_id=f.assigned_to_user_id,
                assigned_to_name=None,
                resolution_type=f.resolution_type,
                is_suppressed=f.is_suppressed,
                created_at=f.created_at,
                updated_at=f.updated_at,
            )
            for f in data["verification_queue"]
        ],
        "assigned_count": data["assigned_count"],
        "verification_count": data["verification_count"],
    }


@router.get(
    "/control/overview",
)
async def get_overview_route(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> dict[str, Any]:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    return await get_control_overview(session, company_id=company_id)


@router.get("/in-app-alerts", response_model=InAppAlertsListResponse)
async def list_in_app_alerts(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    limit: int = Query(default=30, ge=1, le=100),
) -> InAppAlertsListResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    alerts = (
        await session.scalars(
            select(InAppAlert)
            .where(InAppAlert.company_id == company_id)
            .order_by(InAppAlert.created_at.desc())
            .limit(limit)
        )
    ).all()

    unread_count = (
        await session.scalar(
            select(func.count())
            .select_from(InAppAlert)
            .where(InAppAlert.company_id == company_id, InAppAlert.is_read.is_(False))
        )
    ) or 0

    return InAppAlertsListResponse(
        items=[
            InAppAlertItemResponse(
                id=a.id,
                company_id=a.company_id,
                user_id=a.user_id,
                finding_id=a.finding_id,
                channel="in_app",
                title_fa=a.title_fa,
                body_fa=a.summary_fa,
                is_read=a.is_read,
                created_at=a.created_at,
            )
            for a in alerts
        ],
        unread_count=unread_count,
    )


@router.post("/in-app-alerts/{alert_id}/read")
async def mark_in_app_alert_read(
    company_id: UUID,
    alert_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> dict[str, str]:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    alert = await session.scalar(
        select(InAppAlert).where(InAppAlert.company_id == company_id, InAppAlert.id == alert_id)
    )
    if alert:
        alert.is_read = True
        await session.commit()
    return {"message": "هشدار خوانده شد."}


@router.post("/in-app-alerts/read-all")
async def mark_all_in_app_alerts_read(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> dict[str, str]:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    await session.execute(
        update(InAppAlert)
        .where(InAppAlert.company_id == company_id, InAppAlert.is_read.is_(False))
        .values(is_read=True)
    )
    await session.commit()
    return {"message": "همه هشدارها خوانده شدند."}
