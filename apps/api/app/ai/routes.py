from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.ai.guardrails import collect_allowed_numbers
from app.ai.models import AiCompanySettingRevision, AiInvocation, AiPurpose
from app.ai.schemas import (
    AiInvocationResponse,
    AiSettingsResponse,
    AiSettingsUpdate,
    SemanticCandidatesRequest,
)
from app.ai.service import (
    canonical_hash,
    current_ai_settings,
    disabled_invocation,
    disabled_reason,
    effective_settings_from_revision,
    invocation_response,
    settings_response,
)
from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.findings.models import EvidenceItem, Finding
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reconciliation.models import MatchStatus, ReconciliationMatch, ReconciliationRun

router = APIRouter(prefix="/companies/{company_id}/ai", tags=["ai-assistance"])
AI_USE_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}


def _require_use_role(role: CompanyRole) -> None:
    if role not in AI_USE_ROLES:
        raise HTTPException(status_code=403, detail="اجازه استفاده از دستیار هوشمند را ندارید.")


async def _existing_invocation(
    session: DbSession,
    *,
    company_id: UUID,
    key: str,
    request_hash: str,
) -> AiInvocation | None:
    existing = await session.scalar(
        select(AiInvocation).where(
            AiInvocation.company_id == company_id, AiInvocation.idempotency_key == key
        )
    )
    if existing is not None and existing.request_hash != request_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این کلید تکرارپذیری قبلاً برای درخواست هوشمند دیگری استفاده شده است.",
        )
    return existing


@router.get("/settings", response_model=AiSettingsResponse)
async def get_ai_settings(
    company_id: UUID, session: DbSession, access: CurrentCompanyAccess
) -> AiSettingsResponse:
    del access
    return settings_response(await current_ai_settings(session, company_id))


@router.put("/settings", response_model=AiSettingsResponse)
async def update_ai_settings(
    company_id: UUID,
    payload: AiSettingsUpdate,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> AiSettingsResponse:
    if access.role != CompanyRole.OWNER:
        raise HTTPException(
            status_code=403, detail="فقط مالک شرکت می‌تواند تنظیمات AI را تغییر دهد."
        )
    request_hash = canonical_hash(payload.model_dump(mode="json"))
    existing = await session.scalar(
        select(AiCompanySettingRevision).where(
            AiCompanySettingRevision.company_id == company_id,
            AiCompanySettingRevision.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(
                status_code=409, detail="کلید تکرارپذیری برای تنظیم دیگری مصرف شده است."
            )
    else:
        existing = AiCompanySettingRevision(
            id=uuid7(),
            company_id=company_id,
            created_by=current_user.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            created_at=datetime.now(UTC),
            **payload.model_dump(),
        )
        session.add(existing)
        record_audit_event(
            session,
            action="ai.settings_revised",
            entity_type="ai_company_setting_revision",
            actor_id=current_user.id,
            entity_id=existing.id,
            company_id=company_id,
            request_id=request.headers.get("X-Request-ID"),
            metadata=payload.model_dump(),
        )
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=409, detail="تنظیم هم‌زمان یا کلید تکراری ثبت شد."
            ) from exc
    return settings_response(effective_settings_from_revision(existing))


@router.post(
    "/findings/{finding_id}/explanations",
    response_model=AiInvocationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def explain_finding(
    company_id: UUID,
    finding_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> AiInvocationResponse:
    _require_use_role(access.role)
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if finding is None:
        raise HTTPException(status_code=404, detail="یافته پیدا نشد.")
    evidence = list(
        (
            await session.scalars(
                select(EvidenceItem)
                .where(EvidenceItem.finding_id == finding_id, EvidenceItem.company_id == company_id)
                .order_by(EvidenceItem.ordinal)
            )
        ).all()
    )
    manifest = {
        "finding_id": str(finding.id),
        "finding_code": finding.finding_code.value,
        "reason_code": finding.reason_code,
        "evidence_ids": [str(item.id) for item in evidence],
    }
    allowed = collect_allowed_numbers(
        finding.priority_score,
        finding.confidence_score,
        finding.affected_amount_irr,
        finding.affected_ratio,
        finding.reason_parameters_json,
        finding.calculation_json,
        *(item.calculation_json for item in evidence),
    )
    request_hash = canonical_hash({"purpose": AiPurpose.FINDING_EXPLANATION.value, **manifest})
    existing = await _existing_invocation(
        session, company_id=company_id, key=idempotency_key, request_hash=request_hash
    )
    if existing is not None:
        return invocation_response(existing)
    failure_code, failure_message = disabled_reason(
        await current_ai_settings(session, company_id), AiPurpose.FINDING_EXPLANATION
    )
    invocation = disabled_invocation(
        company_id=company_id,
        purpose=AiPurpose.FINDING_EXPLANATION,
        created_by=current_user.id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        input_manifest=manifest,
        allowed_numbers=allowed,
        evidence_ids=[item.id for item in evidence],
        failure_code=failure_code,
        failure_message=failure_message,
        source_finding_id=finding.id,
    )
    return await _persist_invocation(session, invocation, request, current_user.id)


@router.post(
    "/reconciliation-runs/{run_id}/semantic-candidates",
    response_model=AiInvocationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def rank_semantic_candidates(
    company_id: UUID,
    run_id: UUID,
    payload: SemanticCandidatesRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> AiInvocationResponse:
    _require_use_role(access.role)
    run = await session.scalar(
        select(ReconciliationRun).where(
            ReconciliationRun.id == run_id, ReconciliationRun.company_id == company_id
        )
    )
    if run is None:
        raise HTTPException(status_code=404, detail="اجرای تطبیق پیدا نشد.")
    candidates = list(
        (
            await session.scalars(
                select(ReconciliationMatch).where(
                    ReconciliationMatch.company_id == company_id,
                    ReconciliationMatch.run_id == run_id,
                    ReconciliationMatch.id.in_(payload.candidate_ids),
                )
            )
        ).all()
    )
    if len(candidates) != len(payload.candidate_ids) or any(
        item.status != MatchStatus.POTENTIAL_MATCH for item in candidates
    ):
        raise HTTPException(
            status_code=409,
            detail="فقط نامزدهای بالقوه‌ای که موتور قطعی از قبل محدود کرده قابل رتبه‌بندی هستند.",
        )
    manifest = {
        "reconciliation_run_id": str(run_id),
        "candidate_ids": sorted(str(item.id) for item in candidates),
    }
    allowed = collect_allowed_numbers(
        *(
            {
                "score": item.score,
                "amount_difference_irr": item.amount_difference_irr,
                "date_difference_days": item.date_difference_days,
                "features": item.features_json,
            }
            for item in candidates
        )
    )
    request_hash = canonical_hash({"purpose": AiPurpose.SEMANTIC_MATCHING.value, **manifest})
    existing = await _existing_invocation(
        session, company_id=company_id, key=idempotency_key, request_hash=request_hash
    )
    if existing is not None:
        return invocation_response(existing)
    failure_code, failure_message = disabled_reason(
        await current_ai_settings(session, company_id), AiPurpose.SEMANTIC_MATCHING
    )
    invocation = disabled_invocation(
        company_id=company_id,
        purpose=AiPurpose.SEMANTIC_MATCHING,
        created_by=current_user.id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        input_manifest=manifest,
        allowed_numbers=allowed,
        evidence_ids=[],
        failure_code=failure_code,
        failure_message=failure_message,
        source_reconciliation_run_id=run_id,
    )
    return await _persist_invocation(session, invocation, request, current_user.id)


async def _persist_invocation(
    session: DbSession, item: AiInvocation, request: Request, actor_id: UUID
) -> AiInvocationResponse:
    session.add(item)
    record_audit_event(
        session,
        action="ai.invocation_recorded",
        entity_type="ai_invocation",
        actor_id=actor_id,
        entity_id=item.id,
        company_id=item.company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"purpose": item.purpose.value, "status": item.status.value},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="درخواست هوشمند هم‌زمان یا تکراری ثبت شد."
        ) from exc
    return invocation_response(item)


@router.get("/invocations/{invocation_id}", response_model=AiInvocationResponse)
async def get_ai_invocation(
    company_id: UUID,
    invocation_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AiInvocationResponse:
    del access
    item = await session.scalar(
        select(AiInvocation).where(
            AiInvocation.id == invocation_id, AiInvocation.company_id == company_id
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="درخواست هوشمند پیدا نشد.")
    return invocation_response(item)


@router.get("/invocations/{invocation_id}", response_model=AiInvocationResponse)
async def get_invocation(
    company_id: UUID,
    invocation_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AiInvocationResponse:
    del access
    item = await session.scalar(
        select(AiInvocation).where(
            AiInvocation.id == invocation_id, AiInvocation.company_id == company_id
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="اجرای هوشمند پیدا نشد.")
    return invocation_response(item)
