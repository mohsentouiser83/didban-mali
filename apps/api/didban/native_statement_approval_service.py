"""D05 approval of an exact immutable native statement; independent of posting authority."""

from datetime import timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .native_reporting_models import NativeStatementApproval, NativeStatementRun
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def approval_public(item: NativeStatementApproval) -> dict:
    stamp = item.created_at
    stamp = stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp.astimezone(timezone.utc)
    return serialize_fact(item) | {"created_at": stamp.isoformat()}


def _provenance(member: m.Membership) -> dict:
    return {
        "source": "role:finance_manager"
        if member.role == "finance_manager"
        else "explicit:approve_financial_report",
        "membership_id": member.id,
        "membership_version": member.version,
        "role": member.role,
        "approve_financial_report": member.approve_financial_report,
    }


def approve_statement(db: Session, company: str, user: m.User, run_id: str, digest: str) -> dict:
    require(user.active, "permission_denied", "حساب کاربری غیرفعال است.", 403)
    member = membership(db, company, user, "approve")
    run = get_entity(db, NativeStatementRun, company, run_id)
    require(run.digest == digest, "statement_digest_changed", "نسخهٔ دقیق گزارش را دوباره بررسی کنید.", 409)
    previous = db.scalar(
        select(NativeStatementApproval).where(
            NativeStatementApproval.company_id == company,
            NativeStatementApproval.run_id == run.id,
            NativeStatementApproval.actor_id == user.id,
        )
    )
    if previous:
        return approval_public(previous)
    item = NativeStatementApproval(
        company_id=company,
        run_id=run.id,
        digest=run.digest,
        actor_id=user.id,
        actor_name=user.name,
        permission_provenance=_provenance(member),
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.statement_approved",
        run.id,
        {"approval_id": item.id, "digest": digest, "permission_provenance": item.permission_provenance},
    )
    return approval_public(item)


def statement_public(db: Session, company: str, user: m.User, run: NativeStatementRun) -> dict:
    member = membership(db, company, user)
    approvals = list(
        db.scalars(
            select(NativeStatementApproval)
            .where(NativeStatementApproval.company_id == company, NativeStatementApproval.run_id == run.id)
            .order_by(NativeStatementApproval.created_at, NativeStatementApproval.id)
        )
    )
    authority = user.active and (
        member.role == "finance_manager"
        or (member.role in ("owner", "advisor") and member.approve_financial_report)
    )
    return serialize_fact(run) | {
        "approvals": [approval_public(item) for item in approvals],
        "can_approve": bool(authority and not any(item.actor_id == user.id for item in approvals)),
    }


def statement_summary(db: Session, company: str, user: m.User, run: NativeStatementRun) -> dict:
    """History contains headers, not 25 copies of potentially large account grids."""
    value = statement_public(db, company, user, run)
    value["snapshot"] = {
        key: run.snapshot[key]
        for key in ("title", "company_name", "period_id", "period", "as_of", "basis")
        if key in run.snapshot
    }
    value["summary_only"] = True
    return value
