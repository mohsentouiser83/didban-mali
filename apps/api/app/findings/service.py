import hashlib
import json
from collections import Counter
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.analysis.models import (
    AnalysisRun,
    AnalysisStatus,
    MetricCode,
    MetricObservation,
)
from app.audit.service import record_audit_event
from app.companies.models import CompanyRole
from app.financial.models import BankTransaction
from app.findings.engine import (
    FindingConfig,
    ReconciliationSignal,
    reconciliation_findings,
    trend_findings,
)
from app.findings.evidence import (
    EvidenceDraft,
    ManifestContext,
    MetricContext,
    SourceContext,
    coverage_evidence,
    metric_comparison_evidence,
    reconciliation_source_evidence,
    rule_and_calculation_evidence,
)
from app.findings.models import (
    EvidenceItem,
    Finding,
    FindingActivity,
    FindingEvidence,
    FindingGenerationRun,
    FindingRunStatus,
    FindingStatus,
    FindingSuppression,
    FindingWorkflowStatus,
    ResolutionType,
)
from app.findings.priority import PriorityConfig, calculate_priority
from app.identity.models import User
from app.imports.models import ImportBatch, SourceFile, SourceRow
from app.reconciliation.models import (
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)

FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}
FINAL_RECONCILIATION = {
    ReconciliationStatus.COMPLETED,
    ReconciliationStatus.COMPLETED_LIMITED,
}


async def get_finding_detail(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
) -> dict[str, Any]:
    """Get full details of a finding including evidence and activities with user names."""
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if not finding:
        raise ValueError("یافته یا مغایرت مورد نظر یافت نشد.")

    evidence_items = (
        await session.scalars(
            select(FindingEvidence)
            .where(FindingEvidence.finding_id == finding_id, FindingEvidence.company_id == company_id)
            .order_by(FindingEvidence.ordinal)
        )
    ).all()

    activities = (
        await session.execute(
            select(FindingActivity, User.full_name)
            .outerjoin(User, User.id == FindingActivity.user_id)
            .where(FindingActivity.finding_id == finding_id, FindingActivity.company_id == company_id)
            .order_by(FindingActivity.created_at.desc())
        )
    ).all()

    # Preload user names for assignee, resolver, verifier
    user_ids = {finding.assigned_to_user_id, finding.resolved_by_user_id, finding.verified_by_user_id} - {None}
    user_map: dict[UUID, str] = {}
    if user_ids:
        users = (
            await session.scalars(
                select(User).where(User.id.in_(list(user_ids)))
            )
        ).all()
        user_map = {u.id: (u.full_name or u.email) for u in users}

    return {
        "finding": finding,
        "assigned_to_name": user_map.get(finding.assigned_to_user_id) if finding.assigned_to_user_id else None,
        "resolved_by_name": user_map.get(finding.resolved_by_user_id) if finding.resolved_by_user_id else None,
        "verified_by_name": user_map.get(finding.verified_by_user_id) if finding.verified_by_user_id else None,
        "evidence": [
            {
                "id": ev.id,
                "ordinal": ev.ordinal,
                "evidence_type": ev.evidence_type.value if hasattr(ev.evidence_type, "value") else str(ev.evidence_type),
                "title_fa": getattr(ev, "title_fa", ev.claim_code if hasattr(ev, "claim_code") else "مستند"),
                "description_fa": getattr(ev, "description_fa", ev.rule_code if hasattr(ev, "rule_code") else ""),
                "payload": getattr(ev, "payload_json", getattr(ev, "field_snapshot_json", {})),
                "created_at": ev.created_at,
            }
            for ev in (
                evidence_items
                if evidence_items
                else (
                    await session.scalars(
                        select(EvidenceItem)
                        .where(EvidenceItem.finding_id == finding_id, EvidenceItem.company_id == company_id)
                        .order_by(EvidenceItem.ordinal)
                    )
                ).all()
            )
        ],
        "activities": [
            {
                "id": act.id,
                "user_id": act.user_id,
                "user_name": full_name or ("سامانه کنترل هوشمند" if not act.user_id else "کاربر مالی"),
                "action_type": act.action_type,
                "old_state": act.old_state,
                "new_state": act.new_state,
                "note": act.note,
                "metadata": act.metadata_json,
                "created_at": act.created_at,
            }
            for act, full_name in activities
        ],
    }


async def list_findings(
    session: AsyncSession,
    *,
    company_id: UUID,
    analysis_run_id: UUID | None = None,
    generation_run_id: UUID | None = None,
    status_filter: str | None = None,
    severity_filter: str | None = None,
    category_filter: str | None = None,
    rule_code_filter: str | None = None,
    assigned_to_user_id: UUID | None = None,
    is_suppressed: bool | None = False,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Search and filter findings with user name resolution."""
    stmt = select(Finding).where(Finding.company_id == company_id)

    if analysis_run_id:
        stmt = stmt.where(Finding.analysis_run_id == analysis_run_id)
    if generation_run_id:
        stmt = stmt.where(Finding.generation_run_id == generation_run_id)
    if status_filter:
        stmt = stmt.where(Finding.status == status_filter)
    if severity_filter:
        stmt = stmt.where(Finding.severity == severity_filter)
    if category_filter:
        stmt = stmt.where(Finding.category == category_filter)
    if rule_code_filter:
        stmt = stmt.where(
            or_(
                Finding.rule_code == rule_code_filter,
                Finding.finding_code == rule_code_filter,
            )
        )
    if assigned_to_user_id:
        stmt = stmt.where(Finding.assigned_to_user_id == assigned_to_user_id)
    if is_suppressed is not None:
        stmt = stmt.where(Finding.is_suppressed == is_suppressed)
    if search:
        search_pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Finding.title_fa.ilike(search_pattern),
                Finding.summary_fa.ilike(search_pattern),
                Finding.rule_code.ilike(search_pattern),
                Finding.finding_code.ilike(search_pattern),
            )
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await session.scalar(count_stmt)) or 0

    stmt = stmt.order_by(
        # Critical and High first, then newest
        (Finding.severity == "critical").desc(),
        (Finding.severity == "high").desc(),
        Finding.created_at.desc(),
    ).limit(limit).offset(offset)

    findings = (await session.scalars(stmt)).all()

    user_ids = {f.assigned_to_user_id for f in findings if f.assigned_to_user_id}
    user_map: dict[UUID, str] = {}
    if user_ids:
        users = (
            await session.scalars(select(User).where(User.id.in_(list(user_ids))))
        ).all()
        user_map = {u.id: (u.full_name or u.email) for u in users}

    items = [
        {
            "id": f.id,
            "analysis_run_id": f.analysis_run_id,
            "generation_run_id": f.generation_run_id,
            "reconciliation_match_id": f.reconciliation_match_id,
            "fingerprint": f.fingerprint,
            "finding_code": f.finding_code,
            "rule_code": f.rule_code or f.finding_code,
            "kind": f.kind.value if hasattr(f.kind, "value") else str(f.kind),
            "category": f.category,
            "title_fa": f.title_fa,
            "summary_fa": f.summary_fa,
            "assertion_status": f.assertion_status.value if hasattr(f.assertion_status, "value") else str(f.assertion_status),
            "severity": f.severity,
            "priority_band": f.priority_band.value if hasattr(f.priority_band, "value") else str(f.priority_band),
            "priority_score": f.priority_score,
            "priority_explanation": f.priority_explanation_json,
            "priority_model_version": f.priority_model_version,
            "priority_config": f.priority_config_json,
            "confidence_score": f.confidence_score,
            "confidence_basis": f.confidence_basis_json,
            "affected_amount_irr": f.affected_amount_irr,
            "financial_impact_irr": f.financial_impact_irr or f.affected_amount_irr,
            "affected_ratio": f.affected_ratio,
            "period_start": f.period_start,
            "period_end": f.period_end,
            "reason_code": f.reason_code,
            "reason_parameters": f.reason_parameters_json,
            "calculation": f.calculation_json,
            "rule_version": f.rule_version,
            "workflow_status": f.workflow_status.value if hasattr(f.workflow_status, "value") else str(f.workflow_status),
            "status": f.status,
            "assigned_to_user_id": f.assigned_to_user_id,
            "assigned_to_name": user_map.get(f.assigned_to_user_id) if f.assigned_to_user_id else None,
            "due_date": f.due_date,
            "resolution_type": f.resolution_type,
            "is_suppressed": f.is_suppressed,
            "created_at": f.created_at,
            "updated_at": f.updated_at,
        }
        for f in findings
    ]
    return items, total_count


async def assign_finding(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
    actor_id: UUID,
    assigned_to_user_id: UUID,
    due_date: date | None = None,
    note: str | None = None,
) -> Finding:
    """Assign finding to a user, setting status to triaged if currently new."""
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if not finding:
        raise ValueError("یافته مورد نظر یافت نشد.")

    assignee = await session.scalar(select(User).where(User.id == assigned_to_user_id))
    if not assignee:
        raise ValueError("کاربر تخصیص‌گیرنده یافت نشد.")

    now = datetime.now(UTC)
    old_state = finding.status
    if finding.status == FindingStatus.NEW:
        finding.status = FindingStatus.TRIAGED

    finding.assigned_to_user_id = assigned_to_user_id
    if due_date:
        finding.due_date = due_date
    finding.updated_at = now

    session.add(
        FindingActivity(
            id=uuid7(),
            company_id=company_id,
            finding_id=finding.id,
            user_id=actor_id,
            action_type="assigned",
            old_state=old_state,
            new_state=finding.status,
            note=f"تخصیص به «{assignee.full_name or assignee.email}»" + (f" | یادداشت: {note}" if note else ""),
            metadata_json={"assigned_to_user_id": str(assigned_to_user_id), "due_date": due_date.isoformat() if due_date else None},
            created_at=now,
        )
    )

    record_audit_event(
        session,
        action="findings.assigned",
        entity_type="finding",
        actor_id=actor_id,
        entity_id=finding.id,
        company_id=company_id,
        metadata={"assigned_to": str(assigned_to_user_id), "due_date": str(due_date)},
    )

    await session.commit()
    await session.refresh(finding)
    return finding


async def resolve_finding(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
    actor_id: UUID,
    resolution_type: str,
    resolution_note: str,
) -> Finding:
    """Resolve a finding documenting the outcome and resolution details."""
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if not finding:
        raise ValueError("یافته مورد نظر یافت نشد.")

    now = datetime.now(UTC)
    old_state = finding.status
    finding.status = FindingStatus.RESOLVED
    finding.resolution_type = resolution_type
    finding.resolution_note = resolution_note
    finding.resolved_by_user_id = actor_id
    finding.resolved_at = now
    finding.updated_at = now

    session.add(
        FindingActivity(
            id=uuid7(),
            company_id=company_id,
            finding_id=finding.id,
            user_id=actor_id,
            action_type="resolved",
            old_state=old_state,
            new_state=FindingStatus.RESOLVED,
            note=f"ثبت اقدام اصلاحی ({resolution_type}): {resolution_note}",
            metadata_json={"resolution_type": resolution_type, "note": resolution_note},
            created_at=now,
        )
    )

    record_audit_event(
        session,
        action="findings.resolved",
        entity_type="finding",
        actor_id=actor_id,
        entity_id=finding.id,
        company_id=company_id,
        metadata={"resolution_type": resolution_type},
    )

    await session.commit()
    await session.refresh(finding)
    return finding


async def verify_finding(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
    actor_id: UUID,
    verification_note: str | None = None,
) -> Finding:
    """
    Verify resolution of a finding (Maker-Checker).
    STRICT ENFORCEMENT: The user who resolved cannot verify the finding!
    """
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if not finding:
        raise ValueError("یافته مورد نظر یافت نشد.")

    if finding.status != FindingStatus.RESOLVED:
        raise ValueError("تنها یافته‌هایی که در وضعیت «حل‌شده» قرار دارند قابل تایید نهایی هستند.")

    # MAKER-CHECKER SEPARATION OF DUTIES
    if finding.resolved_by_user_id == actor_id:
        raise PermissionError("اصل تفکیک وظایف (Maker-Checker): کاربری که مغایرت را حل کرده است، نمی‌تواند تاییدکننده نهایی آن باشد.")

    now = datetime.now(UTC)
    old_state = finding.status
    finding.status = FindingStatus.VERIFIED
    finding.verified_by_user_id = actor_id
    finding.verified_at = now
    finding.verification_note = verification_note
    finding.updated_at = now

    session.add(
        FindingActivity(
            id=uuid7(),
            company_id=company_id,
            finding_id=finding.id,
            user_id=actor_id,
            action_type="verified",
            old_state=old_state,
            new_state=FindingStatus.VERIFIED,
            note="تایید قطعی مغایرت توسط مدیر مالی" + (f" | یادداشت تایید: {verification_note}" if verification_note else ""),
            metadata_json={"verification_note": verification_note},
            created_at=now,
        )
    )

    record_audit_event(
        session,
        action="findings.verified",
        entity_type="finding",
        actor_id=actor_id,
        entity_id=finding.id,
        company_id=company_id,
        metadata={"verified_by": str(actor_id)},
    )

    await session.commit()
    await session.refresh(finding)
    return finding


async def reopen_finding(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
    actor_id: UUID,
    reason: str,
) -> Finding:
    """Reopen a resolved or verified finding with explanation."""
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if not finding:
        raise ValueError("یافته مورد نظر یافت نشد.")

    now = datetime.now(UTC)
    old_state = finding.status
    finding.status = FindingStatus.REOPENED
    finding.resolved_by_user_id = None
    finding.resolved_at = None
    finding.verified_by_user_id = None
    finding.verified_at = None
    finding.updated_at = now

    session.add(
        FindingActivity(
            id=uuid7(),
            company_id=company_id,
            finding_id=finding.id,
            user_id=actor_id,
            action_type="reopened",
            old_state=old_state,
            new_state=FindingStatus.REOPENED,
            note=f"بازگشایی مجدد مغایرت به علت: {reason}",
            metadata_json={"reason": reason},
            created_at=now,
        )
    )

    record_audit_event(
        session,
        action="findings.reopened",
        entity_type="finding",
        actor_id=actor_id,
        entity_id=finding.id,
        company_id=company_id,
        metadata={"reason": reason},
    )

    await session.commit()
    await session.refresh(finding)
    return finding


async def dismiss_finding(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
    actor_id: UUID,
    reason: str,
) -> Finding:
    """Dismiss a finding with formal mandatory reason."""
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if not finding:
        raise ValueError("یافته مورد نظر یافت نشد.")

    now = datetime.now(UTC)
    old_state = finding.status
    finding.status = FindingStatus.DISMISSED
    finding.resolution_type = ResolutionType.FALSE_POSITIVE
    finding.resolution_note = reason
    finding.resolved_by_user_id = actor_id
    finding.resolved_at = now
    finding.updated_at = now

    session.add(
        FindingActivity(
            id=uuid7(),
            company_id=company_id,
            finding_id=finding.id,
            user_id=actor_id,
            action_type="dismissed",
            old_state=old_state,
            new_state=FindingStatus.DISMISSED,
            note=f"رد مغایرت / اعلام خطا: {reason}",
            metadata_json={"reason": reason},
            created_at=now,
        )
    )

    record_audit_event(
        session,
        action="findings.dismissed",
        entity_type="finding",
        actor_id=actor_id,
        entity_id=finding.id,
        company_id=company_id,
        metadata={"reason": reason},
    )

    await session.commit()
    await session.refresh(finding)
    return finding


async def add_finding_comment(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
    actor_id: UUID,
    comment: str,
) -> FindingActivity:
    """Add a comment/activity to a finding timeline."""
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if not finding:
        raise ValueError("یافته مورد نظر یافت نشد.")

    now = datetime.now(UTC)
    activity = FindingActivity(
        id=uuid7(),
        company_id=company_id,
        finding_id=finding.id,
        user_id=actor_id,
        action_type="comment_added",
        old_state=finding.status,
        new_state=finding.status,
        note=comment,
        metadata_json={},
        created_at=now,
    )
    session.add(activity)
    await session.commit()
    await session.refresh(activity)
    return activity


async def suppress_finding_entity(
    session: AsyncSession,
    *,
    company_id: UUID,
    actor_id: UUID,
    rule_code: str,
    entity_type: str,
    entity_id: UUID,
    reason: str,
    expires_at: datetime | None = None,
) -> FindingSuppression:
    """Suppress a specific entity from generating findings for a rule."""
    now = datetime.now(UTC)
    supp = FindingSuppression(
        id=uuid7(),
        company_id=company_id,
        rule_code=rule_code,
        entity_type=entity_type,
        entity_id=entity_id,
        reason=reason,
        suppressed_by_user_id=actor_id,
        expires_at=expires_at,
        created_at=now,
    )
    session.add(supp)

    # Mark existing active findings for this target as suppressed
    target_findings = (
        await session.scalars(
            select(Finding).where(
                Finding.company_id == company_id,
                Finding.rule_code == rule_code,
                Finding.source_entity_id == entity_id,
            )
        )
    ).all()
    for f in target_findings:
        f.is_suppressed = True
        session.add(
            FindingActivity(
                id=uuid7(),
                company_id=company_id,
                finding_id=f.id,
                user_id=actor_id,
                action_type="suppressed",
                old_state=f.status,
                new_state=f.status,
                note=f"ثبت معافیت / استثناء: {reason}",
                metadata_json={"expires_at": expires_at.isoformat() if expires_at else None},
                created_at=now,
            )
        )

    record_audit_event(
        session,
        action="findings.suppression_created",
        entity_type="finding_suppression",
        actor_id=actor_id,
        entity_id=supp.id,
        company_id=company_id,
        metadata={"rule_code": rule_code, "entity_type": entity_type, "entity_id": str(entity_id)},
    )

    await session.commit()
    await session.refresh(supp)
    return supp


async def get_my_action_queue(
    session: AsyncSession,
    *,
    company_id: UUID,
    user_id: UUID,
    role: CompanyRole,
) -> dict[str, Any]:
    """Retrieve personal action queue for current user (assigned findings and verification queue)."""
    # 1. Findings assigned to user needing action
    assigned_stmt = (
        select(Finding)
        .where(
            Finding.company_id == company_id,
            Finding.assigned_to_user_id == user_id,
            Finding.status.in_([FindingStatus.NEW, FindingStatus.TRIAGED, FindingStatus.IN_PROGRESS, FindingStatus.REOPENED]),
            Finding.is_suppressed == False,
        )
        .order_by(Finding.severity == "critical", Finding.severity == "high", Finding.due_date.asc().nulls_last())
    )
    assigned_findings = (await session.scalars(assigned_stmt)).all()

    # 2. Critical/High findings awaiting maker-checker verification (for managers/owners)
    verification_queue = []
    if role in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER}:
        verify_stmt = (
            select(Finding)
            .where(
                Finding.company_id == company_id,
                Finding.status == FindingStatus.RESOLVED,
                Finding.resolved_by_user_id != user_id,  # Maker-checker filter
                Finding.is_suppressed == False,
            )
            .order_by(Finding.severity == "critical", Finding.resolved_at.asc())
        )
        verification_queue = list((await session.scalars(verify_stmt)).all())

    return {
        "assigned_findings": assigned_findings,
        "verification_queue": verification_queue,
        "assigned_count": len(assigned_findings),
        "verification_count": len(verification_queue),
    }


async def get_control_overview(
    session: AsyncSession,
    *,
    company_id: UUID,
) -> dict[str, Any]:
    """Get high-level financial control overview, KPI cards, and reconciliation status."""
    # Finding severity counts
    severity_rows = (await session.execute(
        select(Finding.severity, func.count(Finding.id))
        .where(Finding.company_id == company_id, Finding.is_suppressed.is_(False), Finding.status != FindingStatus.DISMISSED)
        .group_by(Finding.severity)
    )).all()
    counts_by_severity: dict[str, int] = {str(row[0]): int(row[1]) for row in severity_rows}

    # Finding status counts
    status_rows = (await session.execute(
        select(Finding.status, func.count(Finding.id))
        .where(Finding.company_id == company_id, Finding.is_suppressed.is_(False))
        .group_by(Finding.status)
    )).all()
    counts_by_status: dict[str, int] = {str(row[0]): int(row[1]) for row in status_rows}

    # Latest reconciliation run
    latest_recon = await session.scalar(
        select(ReconciliationRun)
        .where(ReconciliationRun.company_id == company_id)
        .order_by(ReconciliationRun.created_at.desc())
        .limit(1)
    )

    total_impact = (
        await session.scalar(
            select(func.sum(Finding.financial_impact_irr)).where(
                Finding.company_id == company_id,
                Finding.is_suppressed == False,
                Finding.status.in_([FindingStatus.NEW, FindingStatus.TRIAGED, FindingStatus.IN_PROGRESS, FindingStatus.REOPENED]),
            )
        )
    ) or Decimal(0)

    # Recent activity
    recent_acts = (
        await session.execute(
            select(FindingActivity, User.full_name, Finding.title_fa)
            .join(Finding, Finding.id == FindingActivity.finding_id)
            .outerjoin(User, User.id == FindingActivity.user_id)
            .where(FindingActivity.company_id == company_id)
            .order_by(FindingActivity.created_at.desc())
            .limit(10)
        )
    ).all()

    return {
        "total_count": sum(counts_by_status.values()),
        "review_count": counts_by_status.get(FindingStatus.NEW, 0) + counts_by_status.get(FindingStatus.TRIAGED, 0),
        "follow_up_count": counts_by_status.get(FindingStatus.IN_PROGRESS, 0) + counts_by_status.get(FindingStatus.REOPENED, 0),
        "critical_count": counts_by_severity.get("critical", 0),
        "high_count": counts_by_severity.get("high", 0),
        "medium_count": counts_by_severity.get("medium", 0),
        "low_count": counts_by_severity.get("low", 0),
        "total_active_count": sum(counts_by_severity.values()),
        "total_impact_irr": total_impact,
        "resolved_count": counts_by_status.get(FindingStatus.RESOLVED, 0),
        "verified_count": counts_by_status.get(FindingStatus.VERIFIED, 0),
        "latest_reconciliation": {
            "run_id": latest_recon.id if latest_recon else None,
            "period_end": latest_recon.period_end if latest_recon else None,
            "matched_count": latest_recon.matched_count if latest_recon else 0,
            "unmatched_bank_count": latest_recon.unmatched_bank_count if latest_recon else 0,
            "unmatched_journal_count": latest_recon.unmatched_journal_count if latest_recon else 0,
            "matched_amount_irr": latest_recon.matched_amount_irr if latest_recon else Decimal(0),
        } if latest_recon else None,
        "recent_activities": [
            {
                "id": a.id,
                "finding_id": a.finding_id,
                "finding_title": f_title,
                "user_name": u_name or "سامانه کنترل هوشمند",
                "action_type": a.action_type,
                "note": a.note,
                "created_at": a.created_at,
            }
            for a, u_name, f_title in recent_acts
        ],
    }


async def _metrics(session: AsyncSession, analysis_run_id: UUID) -> dict[MetricCode, Decimal]:
    rows = (
        await session.execute(
            select(MetricObservation.metric_code, MetricObservation.value_irr).where(
                MetricObservation.analysis_run_id == analysis_run_id,
                MetricObservation.value_irr.is_not(None),
            )
        )
    ).all()
    return {code: Decimal(value) for code, value in rows if value is not None}


async def _metric_contexts(
    session: AsyncSession, run_ids: list[UUID]
) -> dict[tuple[UUID, str], MetricContext]:
    if not run_ids:
        return {}
    rows = list(
        await session.scalars(
            select(MetricObservation).where(
                MetricObservation.analysis_run_id.in_(run_ids),
                MetricObservation.value_irr.is_not(None),
            )
        )
    )
    return {
        (item.analysis_run_id, item.metric_code.value): MetricContext(
            id=item.id,
            analysis_run_id=item.analysis_run_id,
            metric_code=item.metric_code.value,
            value_irr=Decimal(item.value_irr) if item.value_irr is not None else Decimal(0),
            calculation=item.calculation_json,
        )
        for item in rows
    }


async def _previous_analysis(
    session: AsyncSession, current: AnalysisRun
) -> AnalysisRun | None:
    duration_days = (current.period_end - current.period_start).days
    candidates = list(
        await session.scalars(
            select(AnalysisRun)
            .where(
                AnalysisRun.company_id == current.company_id,
                AnalysisRun.id != current.id,
                AnalysisRun.status.in_(FINAL_ANALYSIS),
                AnalysisRun.period_end < current.period_start,
            )
            .order_by(AnalysisRun.period_end.desc(), AnalysisRun.id.desc())
            .limit(12)
        )
    )
    return next(
        (
            item
            for item in candidates
            if (item.period_end - item.period_start).days == duration_days
        ),
        None,
    )


async def _reconciliation_signals(
    session: AsyncSession, reconciliation_run_id: UUID
) -> list[ReconciliationSignal]:
    rows = list(
        await session.scalars(
            select(ReconciliationMatch)
            .where(ReconciliationMatch.run_id == reconciliation_run_id)
            .order_by(ReconciliationMatch.id)
        )
    )
    bank_ids = [item.bank_transaction_id for item in rows if item.bank_transaction_id is not None]
    bank_amounts: dict[UUID, Decimal] = {}
    if bank_ids:
        bank_amount_rows = (
            await session.execute(
                select(BankTransaction.id, BankTransaction.amount_irr).where(
                    BankTransaction.id.in_(bank_ids)
                )
            )
        ).all()
        bank_amounts = {bank_id: Decimal(amount) for bank_id, amount in bank_amount_rows}
    return [
        ReconciliationSignal(
            id=item.id,
            bank_transaction_id=item.bank_transaction_id,
            journal_entry_id=item.journal_entry_id,
            status=item.status,
            score=Decimal(item.score),
            amount_difference_irr=(
                Decimal(item.amount_difference_irr)
                if item.amount_difference_irr is not None
                else None
            ),
            date_difference_days=item.date_difference_days,
            rule_code=item.rule_code,
            reference_amount_irr=(
                Decimal(bank_amounts[item.bank_transaction_id])
                if item.bank_transaction_id in bank_amounts
                else None
            ),
        )
        for item in rows
    ]


def _rule_version(run: FindingGenerationRun) -> str:
    rule_config = {
        "trend_ratio": run.config_json["trend_ratio"],
        "minimum_amount_irr": run.config_json["minimum_amount_irr"],
    }
    encoded = json.dumps(rule_config, sort_keys=True, separators=(",", ":")).encode()
    return f"{run.config_version}:{hashlib.sha256(encoded).hexdigest()[:12]}"


def _priority_config(run: FindingGenerationRun) -> tuple[str, PriorityConfig]:
    raw = run.config_json.get("priority", {})
    config = PriorityConfig(
        impact_weight=Decimal(str(raw.get("impact_weight", "0.40"))),
        materiality_weight=Decimal(str(raw.get("materiality_weight", "0.25"))),
        confidence_weight=Decimal(str(raw.get("confidence_weight", "0.20"))),
        urgency_weight=Decimal(str(raw.get("urgency_weight", "0.15"))),
        critical_threshold=Decimal(str(raw.get("critical_threshold", "80"))),
        high_threshold=Decimal(str(raw.get("high_threshold", "60"))),
        medium_threshold=Decimal(str(raw.get("medium_threshold", "35"))),
        materiality_amount_irr=Decimal(str(raw.get("materiality_amount_irr", "100000000"))),
        revenue_ratio_full_score=Decimal(str(raw.get("revenue_ratio_full_score", "0.20"))),
        critical_minimum_confidence=Decimal(str(raw.get("critical_minimum_confidence", "70"))),
    )
    encoded = json.dumps(config.as_dict(), sort_keys=True, separators=(",", ":")).encode()
    model = str(raw.get("model_version", "priority-v1"))
    return f"{model}:{hashlib.sha256(encoded).hexdigest()[:12]}", config


async def _source_contexts(
    session: AsyncSession, source_row_ids: set[UUID]
) -> dict[UUID, SourceContext]:
    if not source_row_ids:
        return {}
    rows = (
        await session.execute(
            select(SourceRow, ImportBatch.file_id, SourceFile.original_name, SourceFile.sha256)
            .join(ImportBatch, ImportBatch.id == SourceRow.import_batch_id)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .where(SourceRow.id.in_(source_row_ids))
        )
    ).all()
    return {
        row.id: SourceContext(
            source_row_id=row.id,
            source_file_id=file_id,
            import_batch_id=row.import_batch_id,
            sheet=row.sheet,
            row_number=row.row_number,
            raw=row.raw_json,
            original_name=original_name,
            sha256=sha256,
        )
        for row, file_id, original_name, sha256 in rows
    }


async def _manifest_contexts(session: AsyncSession, analysis: AnalysisRun) -> list[ManifestContext]:
    batch_ids = [UUID(item) for item in analysis.input_manifest_json.get("import_batch_ids", [])]
    if not batch_ids:
        return []
    rows = (
        await session.execute(
            select(ImportBatch.id, SourceFile.id, SourceFile.original_name, SourceFile.sha256)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .where(
                ImportBatch.company_id == analysis.company_id,
                ImportBatch.id.in_(batch_ids),
            )
            .order_by(ImportBatch.id)
        )
    ).all()
    return [
        ManifestContext(
            import_batch_id=row[0],
            source_file_id=row[1],
            original_name=row[2],
            sha256=row[3],
        )
        for row in rows
    ]


def _source_row_ids(evidence: dict[str, object]) -> set[UUID]:
    values: list[object] = [evidence.get("source_row_id")]
    for key in ("bank", "accounting"):
        child = evidence.get(key)
        if isinstance(child, dict):
            values.append(child.get("source_row_id"))
    result: set[UUID] = set()
    for value in values:
        if value:
            try:
                result.add(UUID(str(value)))
            except ValueError:
                continue
    return result


async def _build_evidence_values(
    session: AsyncSession,
    *,
    findings: list[Finding],
    analysis: AnalysisRun,
    previous: AnalysisRun | None,
    now: datetime,
) -> list[dict[str, object]]:
    match_ids = {
        item.reconciliation_match_id
        for item in findings
        if item.reconciliation_match_id is not None
    }
    matches = (
        list(
            await session.scalars(
                select(ReconciliationMatch).where(
                    ReconciliationMatch.company_id == analysis.company_id,
                    ReconciliationMatch.id.in_(match_ids),
                )
            )
        )
        if match_ids
        else []
    )
    matches_by_id = {item.id: item for item in matches}
    row_ids: set[UUID] = set()
    for item in matches:
        row_ids.update(_source_row_ids(item.evidence_json))
    source_contexts = await _source_contexts(session, row_ids)
    run_ids = [analysis.id] + ([previous.id] if previous is not None else [])
    metrics = await _metric_contexts(session, run_ids)
    manifest = await _manifest_contexts(session, analysis)

    values: list[dict[str, object]] = []
    for finding in findings:
        drafts: list[EvidenceDraft] = rule_and_calculation_evidence(finding)
        if finding.reconciliation_match_id is not None:
            match = matches_by_id.get(finding.reconciliation_match_id)
            if match is not None:
                drafts.extend(
                    reconciliation_source_evidence(finding, match.evidence_json, source_contexts)
                )
        else:
            metric_code = str(finding.reason_parameters_json.get("metric_code", ""))
            drafts.extend(
                metric_comparison_evidence(
                    finding,
                    metrics.get((analysis.id, metric_code)),
                    metrics.get((previous.id, metric_code)) if previous is not None else None,
                )
            )
            drafts.extend(coverage_evidence(finding, manifest))
        for ordinal, draft in enumerate(drafts, start=1):
            values.append(
                {
                    "id": uuid7(),
                    "company_id": finding.company_id,
                    "finding_id": finding.id,
                    "ordinal": ordinal,
                    "evidence_type": draft.evidence_type,
                    "claim_code": draft.claim_code,
                    "source_entity_type": draft.source_entity_type,
                    "source_entity_id": draft.source_entity_id,
                    "source_row_id": draft.source_row_id,
                    "source_file_id": draft.source_file_id,
                    "field_snapshot_json": draft.field_snapshot or {},
                    "calculation_json": draft.calculation or {},
                    "rule_code": draft.rule_code,
                    "rule_version": finding.rule_version,
                    "created_at": now,
                }
            )
    return values


async def execute_finding_generation(
    session: AsyncSession, *, run_id: UUID, company_id: UUID, actor_id: UUID
) -> dict[str, object]:
    run = await session.scalar(
        select(FindingGenerationRun)
        .where(
            FindingGenerationRun.id == run_id,
            FindingGenerationRun.company_id == company_id,
        )
        .with_for_update()
    )
    if run is None:
        raise ValueError("Finding generation run is not accessible")
    run_status_str = str(getattr(run.status, "value", run.status)).lower()
    if run_status_str in {"completed", "completed_limited"}:
        return {"status": run_status_str, "finding_generation_run_id": str(run.id)}
    if run_status_str not in {"queued", "processing"}:
        raise ValueError(f"Finding generation run is not ready (status={run.status!r})")
    analysis = await session.scalar(
        select(AnalysisRun).where(
            AnalysisRun.id == run.analysis_run_id,
            AnalysisRun.company_id == company_id,
        )
    )
    if analysis is None or str(getattr(analysis.status, "value", analysis.status)).lower() not in {"completed", "completed_limited"}:
        raise ValueError("Analysis snapshot is not ready")
    reconciliation: ReconciliationRun | None = None
    if run.reconciliation_run_id is not None:
        reconciliation = await session.scalar(
            select(ReconciliationRun).where(
                ReconciliationRun.id == run.reconciliation_run_id,
                ReconciliationRun.company_id == company_id,
                ReconciliationRun.analysis_run_id == analysis.id,
            )
        )
        if reconciliation is None or str(getattr(reconciliation.status, "value", reconciliation.status)).lower() not in {"completed", "completed_limited"}:
            raise ValueError("Reconciliation snapshot is not ready")

    run.status = FindingRunStatus.PROCESSING
    run.started_at = run.started_at or datetime.now(UTC)
    config = FindingConfig(
        trend_ratio=Decimal(str(run.config_json["trend_ratio"])),
        minimum_amount_irr=Decimal(str(run.config_json["minimum_amount_irr"])),
    )
    candidates = []
    if reconciliation is not None:
        signals = await _reconciliation_signals(session, reconciliation.id)
        candidates.extend(reconciliation_findings(signals))
    current_metrics = await _metrics(session, analysis.id)
    previous = await _previous_analysis(session, analysis)
    if previous is not None:
        previous_metrics = await _metrics(session, previous.id)
        candidates.extend(trend_findings(current_metrics, previous_metrics, previous.id, config))

    rule_version = _rule_version(run)
    priority_model_version, priority_config = _priority_config(run)
    revenue_irr = current_metrics.get(MetricCode.REVENUE_IRR)
    now = datetime.now(UTC)
    prepared = [
        (
            candidate,
            candidate.fingerprint(analysis.id, rule_version),
            calculate_priority(
                finding_code=candidate.finding_code,
                confidence_score=candidate.confidence_score,
                affected_amount_irr=candidate.affected_amount_irr,
                revenue_irr=revenue_irr,
                config=priority_config,
            ),
        )
        for candidate in candidates
    ]
    values = [
        {
            "id": uuid7(),
            "company_id": company_id,
            "analysis_run_id": analysis.id,
            "generation_run_id": run.id,
            "reconciliation_match_id": candidate.reconciliation_match_id,
            "fingerprint": fingerprint,
            "finding_code": candidate.finding_code.value if hasattr(candidate.finding_code, "value") else str(candidate.finding_code),
            "rule_code": candidate.finding_code.value if hasattr(candidate.finding_code, "value") else str(candidate.finding_code),
            "kind": candidate.kind,
            "category": candidate.category.value if hasattr(candidate.category, "value") else str(candidate.category),
            "title_fa": candidate.title_fa,
            "summary_fa": candidate.summary_fa,
            "assertion_status": candidate.assertion_status,
            "severity": candidate.severity,
            "priority_band": priority.band,
            "priority_score": priority.score,
            "priority_explanation_json": priority.explanation,
            "priority_model_version": priority_model_version,
            "priority_config_json": priority_config.as_dict(),
            "confidence_score": candidate.confidence_score,
            "confidence_basis_json": candidate.confidence_basis,
            "affected_amount_irr": candidate.affected_amount_irr,
            "financial_impact_irr": candidate.affected_amount_irr,
            "affected_ratio": candidate.affected_ratio,
            "period_start": analysis.period_start,
            "period_end": analysis.period_end,
            "reason_code": candidate.reason_code,
            "reason_parameters_json": candidate.reason_parameters,
            "calculation_json": candidate.calculation,
            "rule_version": rule_version,
            "workflow_status": FindingWorkflowStatus.NEEDS_REVIEW,
            "status": "new",
            "created_at": now,
            "updated_at": now,
        }
        for candidate, fingerprint, priority in prepared
    ]
    if values:
        await session.execute(
            insert(Finding)
            .values(values)
            .on_conflict_do_nothing(index_elements=["company_id", "fingerprint"])
        )
    fingerprints = [fingerprint for _, fingerprint, _ in prepared]
    persisted_findings = (
        list(
            await session.scalars(
                select(Finding).where(
                    Finding.company_id == company_id,
                    Finding.analysis_run_id == analysis.id,
                    Finding.fingerprint.in_(fingerprints),
                )
            )
        )
        if fingerprints
        else []
    )
    evidence_values = await _build_evidence_values(
        session,
        findings=persisted_findings,
        analysis=analysis,
        previous=previous,
        now=now,
    )
    if evidence_values:
        await session.execute(
            insert(EvidenceItem)
            .values(evidence_values)
            .on_conflict_do_nothing(constraint="uq_evidence_finding_ordinal")
        )
    code_counts = Counter(
        (candidate.finding_code.value if hasattr(candidate.finding_code, "value") else str(candidate.finding_code))
        for candidate in candidates
    )
    counts: dict[str, object] = {
        "total": len(candidates),
        "by_code": dict(sorted(code_counts.items())),
        "catalog_size": 8,
        "evidence_items": len(evidence_values),
    }
    coverage: dict[str, object] = {
        "reconciliation_findings": {
            "available": reconciliation is not None,
            "reason": (
                None
                if reconciliation is not None
                else "اجرای تطبیق برای این snapshot ارائه نشده است"
            ),
        },
        "financial_trends": {
            "available": previous is not None,
            "comparison_analysis_run_id": str(previous.id) if previous else None,
            "reason": (None if previous else "دوره قبلی هم‌طول و تکمیل‌شده پیدا نشد"),
        },
    }
    run.counts_json = counts
    run.coverage_json = coverage
    run.status = (
        FindingRunStatus.COMPLETED
        if reconciliation is not None and previous is not None
        else FindingRunStatus.COMPLETED_LIMITED
    )
    run.completed_at = now
    run.failure_code = None
    run.failure_message = None
    record_audit_event(
        session,
        action="findings.generated",
        entity_type="finding_generation_run",
        actor_id=actor_id,
        entity_id=run.id,
        company_id=company_id,
        metadata={
            "analysis_run_id": str(analysis.id),
            "reconciliation_run_id": (
                str(reconciliation.id) if reconciliation is not None else None
            ),
            "rule_version": rule_version,
            **counts,
        },
    )
    await session.commit()
    return {
        "status": run.status.value,
        "finding_generation_run_id": str(run.id),
        "counts": counts,
        "coverage": coverage,
    }

