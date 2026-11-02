"""Server checked close/reopen authority and factual end-of-period checklist."""

import json
from hashlib import sha256
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Draft
from .accounting_service import capabilities
from .accounting_setup_models import CompanyAccountingSetup
from .errors import require
from .period_lock_models import PeriodLock, PeriodLockEvent
from .services import get_entity
from .workflow import audit

BLOCKING_CODES = frozenset(
    {
        "ledger_unbalanced",
        "journal_not_balanced",
        "invalid_journal_line",
        "journal_unbalanced",
        "unbalanced_journal",
        "moadian_amount_mismatch",
        "moadian_tax_mismatch",
        "moadian_date_mismatch",
        "moadian_party_mismatch",
    }
)
TERMINAL_STATES = ("completed", "completed_limited", "cancelled", "failed")


def lock_for(db: Session, company: str, period_id: str) -> PeriodLock | None:
    return db.scalar(
        select(PeriodLock).where(PeriodLock.company_id == company, PeriodLock.period_id == period_id)
    )


def require_open_period(db: Session, company: str, period_id: str | None) -> None:
    if period_id is None:
        return
    lock = lock_for(db, company, period_id)
    require(
        not (lock and lock.closed), "period_closed", "دوره بسته است؛ ابتدا با مجوز و دلیل بازگشایی کنید.", 409
    )


def checklist(db: Session, company: str, period_id: str, user: m.User) -> dict[str, Any]:
    period = get_entity(db, m.Period, company, period_id)
    caps = capabilities(db, company, user)
    lock = lock_for(db, company, period_id)
    drafts = (
        db.scalar(
            select(func.count())
            .select_from(Draft)
            .where(Draft.company_id == company, Draft.period_id == period_id, Draft.state == "draft")
        )
        or 0
    )
    active = (
        db.scalar(
            select(func.count())
            .select_from(m.ProcessingSession)
            .where(
                m.ProcessingSession.company_id == company,
                m.ProcessingSession.period_id == period_id,
                m.ProcessingSession.state.not_in(TERMINAL_STATES),
            )
        )
        or 0
    )
    setup = db.get(CompanyAccountingSetup, company)
    if setup and setup.mode == "primary":
        from .native_period_readiness import readiness

        source = readiness(db, company, period, user)
        errors, warnings = source["errors"], source["warnings"]
    else:
        report = db.scalar(
            select(m.ResultManifest)
            .where(m.ResultManifest.company_id == company, m.ResultManifest.period_id == period_id)
            .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
            .limit(1)
        )
        findings = (
            list(
                db.scalars(
                    select(m.Finding).where(
                        m.Finding.company_id == company, m.Finding.manifest_id == report.id
                    )
                )
            )
            if report
            else []
        )
        # A status-only dismissal cannot make an invalid financial source balanced.
        errors = [
            {"id": f.id, "title": f.title, "code": f.code} for f in findings if f.code in BLOCKING_CODES
        ]
        warnings = [
            {"id": f.id, "title": f.title, "code": f.code} for f in findings if f.code not in BLOCKING_CODES
        ]
        if not report:
            warnings = [
                {
                    "id": "no_report",
                    "title": "گزارشی برای این دوره موجود نیست.",
                    "code": "period_report_missing",
                }
            ]
        source = {
            "manifest_id": report.id if report else None,
            "native_statement_id": None,
            "reporting_basis": "imported_manifest",
            "closing_journal_present": False,
        }
    from .period_checklist_service import items

    custom_items = items(db, company, period_id)
    for item in custom_items:
        if not item["completed"]:
            (errors if item["required"] else warnings).append(
                {
                    "id": "task:" + item["id"],
                    "code": "period_required_task_pending"
                    if item["required"]
                    else "period_optional_task_pending",
                    "title": item["title"],
                }
            )
    result = {
        **source,
        "custom_items": custom_items,
        "period_id": period_id,
        "closed": bool(lock and lock.closed),
        "version": lock.version if lock else 1,
        "can_close": caps["can_post"],
        "can_reopen": caps["can_reopen"],
        "draft_count": drafts,
        "active_session_count": active,
        "errors": errors,
        "warnings": warnings,
        "ready_to_close": not (drafts or active or errors),
        "financial_closing_entries": False,
    }
    result["checklist_digest"] = sha256(
        json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return result


def transition(
    db: Session,
    company: str,
    user: m.User,
    period_id: str,
    close: bool,
    reason: str,
    acknowledge: bool,
    version: int,
    checklist_digest: str | None = None,
) -> dict:
    require(
        isinstance(reason, str) and bool(reason.strip()) and len(reason.strip()) <= 1000,
        "period_reason_required",
        "دلیل را وارد کنید.",
    )
    current = checklist(db, company, period_id, user)
    require(
        current["can_close"] if close else current["can_reopen"],
        "permission_denied",
        "اختیار این عملیات را ندارید.",
        403,
    )
    require(current["version"] == version, "version_conflict", "وضعیت دوره تغییر کرده؛ تازه کنید.", 409)
    require(current["closed"] != close, "period_state_conflict", "وضعیت دوره پیش‌تر تغییر کرده است.", 409)
    if close:
        if (
            current["reporting_basis"] == "native_book"
            or current["custom_items"]
            or checklist_digest is not None
        ):
            require(
                checklist_digest == current["checklist_digest"],
                "period_checklist_changed",
                "چک‌لیست دوره تغییر کرده؛ دوباره بررسی کنید.",
                409,
            )
        require(
            current["ready_to_close"],
            "period_close_blocked",
            "پیش‌نویس‌ها، پردازش فعال یا خطای قطعی باید تعیین تکلیف شوند.",
            409,
        )
        require(
            not current["warnings"] or acknowledge,
            "period_warnings_unacknowledged",
            "موارد قابل بررسی را پیش از بستن تأیید کنید.",
            409,
        )
    item = lock_for(db, company, period_id)
    if item:
        item.version += 1
    else:
        item = PeriodLock(company_id=company, period_id=period_id, version=2)
        db.add(item)
    item.closed = close
    event = PeriodLockEvent(
        company_id=company,
        period_id=period_id,
        actor_id=user.id,
        action="closed" if close else "reopened",
        reason=reason.strip(),
        checklist=current | {"warnings_acknowledged": acknowledge},
    )
    db.add(event)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "period.closed" if close else "period.reopened",
        period_id,
        {
            "reason": reason.strip(),
            "before_closed": current["closed"],
            "version": item.version,
            "event_id": event.id,
            "financial_entries_created": False,
        },
    )
    return checklist(db, company, period_id, user)


def history(db: Session, company: str, period_id: str, limit: int = 25, cursor: str | None = None) -> dict:
    from .http import paginate

    get_entity(db, m.Period, company, period_id)
    return paginate(db, PeriodLockEvent, company, limit, cursor, [PeriodLockEvent.period_id == period_id])
