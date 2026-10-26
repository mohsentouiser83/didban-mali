from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.findings.engine import execute_finding_detection
from app.findings.models import (
    Finding,
    FindingDetectionRun,
)
from app.findings.reconciliation_scope import ReconciliationFilter
from app.findings.schemas import (
    DetectFindingsRequest,
    FindingActivityResponse,
    FindingDetailResponse,
    FindingDetectionRunResponse,
    FindingDirectionCounts,
    FindingEvidenceResponse,
    FindingResponse,
    FindingsResponse,
    ProposalDecisionRequest,
    ProposalDecisionResponse,
)
from app.findings.service import (
    get_control_overview,
    get_finding_detail,
    list_findings,
)
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reconciliation.decisions import ProposalConflict, ProposalNotFound, decide_proposal
from app.reconciliation.service import run_canonical_reconciliation

router = APIRouter(prefix="/companies/{company_id}", tags=["findings"])

RUN_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}
VIEW_ROLES = {
    CompanyRole.OWNER,
    CompanyRole.FINANCE_MANAGER,
    CompanyRole.ADVISOR,
    CompanyRole.VIEWER,
}


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

    if payload.reconciliation_run_id is None:
        try:
            reconciliation = await run_canonical_reconciliation(
                session, company_id=company_id, actor_id=current_user.id, commit=False,
                bank_account_id=payload.bank_account_id, period_start=payload.period_start,
                period_end=payload.period_end, config_params={
                    "accounting_complete": payload.accounting_complete, "bank_complete": payload.bank_complete,
                },
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        payload.reconciliation_run_id = reconciliation.id

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
    reconciliation_filter: ReconciliationFilter | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> FindingsResponse:
    if access.role not in VIEW_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")

    items, total_count, direction_counts = await list_findings(
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
        reconciliation_filter=reconciliation_filter,
        limit=limit,
        offset=offset,
    )
    return FindingsResponse(
        items=[FindingResponse(**item) for item in items],
        total_count=total_count,
        direction_counts=FindingDirectionCounts(**direction_counts),
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
        can_review_proposals=access.role in RUN_ROLES,
        id=f.id,
        fingerprint=f.fingerprint,
        analysis_run_id=f.analysis_run_id,
        generation_run_id=f.generation_run_id,
        finding_code=f.finding_code,
        kind=f.kind.value if hasattr(f.kind, "value") else str(f.kind),
        assertion_status=f.assertion_status.value
        if hasattr(f.assertion_status, "value")
        else str(f.assertion_status),
        priority_band=f.priority_band.value
        if hasattr(f.priority_band, "value")
        else str(f.priority_band),
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
        workflow_status=f.workflow_status.value
        if hasattr(f.workflow_status, "value")
        else str(f.workflow_status),
        rule_code=f.rule_code,
        category=f.category,
        severity=f.severity,
        status=f.status,
        title_fa=data["title_fa"],
        summary_fa=data["summary_fa"],
        reconciliation_state=data["reconciliation_state"],
        proposals=data["proposals"],
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


@router.post("/findings/{finding_id}/proposals/{proposal_id}/decision", response_model=ProposalDecisionResponse)
async def decide_finding_proposal(
    company_id: UUID, finding_id: UUID, proposal_id: UUID, payload: ProposalDecisionRequest,
    session: DbSession, current_user: CurrentUser, access: CurrentCompanyAccess, _csrf: CsrfProtected,
) -> ProposalDecisionResponse:
    if access.role not in RUN_ROLES:
        raise HTTPException(status_code=403, detail="اجازه تأیید یا رد پیشنهاد تطبیق را ندارید.")
    try:
        proposal = await decide_proposal(session, company_id=company_id, finding_id=finding_id,
                                         proposal_id=proposal_id, actor_id=current_user.id, decision=payload.decision)
        await session.commit()
    except ProposalNotFound as exc:
        await session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ProposalConflict as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ProposalDecisionResponse(proposal_id=proposal.id, status="confirmed" if payload.decision == "confirm" else "rejected")
