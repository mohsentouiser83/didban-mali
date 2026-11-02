"""Report approval is separate from native posting and ownership certification."""

import json
from datetime import timezone
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .consolidation_approval_models import ConsolidationApproval
from .consolidation_models import DraftConsolidationRun
from .errors import require
from .security import membership
from .workflow import audit, serialize_fact

POLICY = "user-provisional-2026-11-02-v1"
SCOPE = "selected_intercompany_eliminations"


def public(db: Session, approval: ConsolidationApproval) -> dict:
    actor = db.get(m.User, approval.actor_id)
    return serialize_fact(approval) | {
        "actor_name": actor.name if actor else "کاربر",
        "created_at": approval.created_at.replace(tzinfo=timezone.utc).isoformat(),
    }


def summary(db: Session, company: str, user: m.User, draft: DraftConsolidationRun) -> dict:
    """Caller must first authorize every company in the frozen report."""
    member = membership(db, company, user)
    can_approve = member.role == "finance_manager" or (
        member.role in ("owner", "advisor") and member.approve_financial_report
    )
    approvals = list(
        db.scalars(
            select(ConsolidationApproval)
            .where(
                ConsolidationApproval.company_id == company,
                ConsolidationApproval.draft_id == draft.id,
                ConsolidationApproval.draft_digest == draft.digest,
            )
            .order_by(ConsolidationApproval.created_at, ConsolidationApproval.id)
        )
    )
    return {
        "can_approve": can_approve,
        "approval_policy": POLICY,
        "approval_scope": SCOPE,
        "approval_status": "approved_selected_eliminations" if approvals else "unapproved",
        "approvals": [public(db, item) for item in approvals],
        "financial_effect": False,
        "statutory_certification": False,
    }


def preview(db: Session, company: str, user: m.User, draft_id: str) -> dict:
    from .consolidation_service import read_draft

    draft = read_draft(db, company, user, draft_id)
    return {
        "draft_id": draft_id,
        "expected_digest": draft["digest"],
        "policy_version": POLICY,
        "can_approve": draft["can_approve"],
        "draft": draft,
        "financial_effect": False,
        "scope": SCOPE,
    }


def approve(
    db: Session, company: str, user: m.User, draft_id: str, expected_digest: str, policy_version: str
) -> dict:
    from .consolidation_service import read_draft

    # Recheck the original frozen companies even when the current group changed.
    item = read_draft(db, company, user, draft_id)
    member = membership(db, company, user, "approve")
    require(
        policy_version == POLICY,
        "consolidation_policy_changed",
        "سیاست بررسی تغییر کرده؛ نسخهٔ تازه را ببینید.",
        409,
    )
    require(
        expected_digest == item["digest"],
        "consolidation_review_changed",
        "نسخهٔ گزارش با بررسی شما یکسان نیست.",
        409,
    )
    computed = sha256(json.dumps(item["snapshot"], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    require(computed == expected_digest, "consolidation_integrity", "صحت نسخهٔ گزارش تأیید نشد.", 409)
    require(
        item["snapshot"].get("ownership_scope") == "user_declared_100_percent_only"
        and bool(item["snapshot"].get("pairs")),
        "consolidation_scope",
        "حذف منتخب با دامنهٔ مالکیت کامل لازم است.",
        409,
    )
    require(
        all(
            mapping.get("ownership_declaration", {}).get("percent") == "100"
            for mapping in item["snapshot"].get("mappings", [])
        ),
        "consolidation_scope",
        "اظهار مالکیت کامل برای نگاشت‌ها لازم است.",
        409,
    )
    previous = db.scalar(
        select(ConsolidationApproval).where(
            ConsolidationApproval.company_id == company,
            ConsolidationApproval.draft_id == draft_id,
            ConsolidationApproval.actor_id == user.id,
            ConsolidationApproval.draft_digest == expected_digest,
        )
    )
    if previous:
        return public(db, previous)
    provenance = (
        "role:finance_manager"
        if member.role == "finance_manager"
        else f"explicit:membership:{member.id}:v{member.version}"
    )
    approval = ConsolidationApproval(
        company_id=company,
        draft_id=draft_id,
        draft_digest=expected_digest,
        actor_id=user.id,
        permission_provenance=provenance,
        policy_version=POLICY,
        scope=SCOPE,
    )
    db.add(approval)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "consolidation.report_approved",
        draft_id,
        {
            "approval_id": approval.id,
            "digest": expected_digest,
            "policy_version": POLICY,
            "scope": SCOPE,
            "permission_provenance": provenance,
            "financial_effect": False,
        },
    )
    return public(db, approval)
