"""Versioned period tasks; changes are audited and closed periods are immutable."""

from datetime import timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .period_checklist_models import PeriodChecklistItem
from .period_lock_service import require_open_period
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def public(item: PeriodChecklistItem) -> dict:
    result = serialize_fact(item)
    if item.created_at:
        result["created_at"] = item.created_at.replace(tzinfo=timezone.utc).isoformat()
    if item.completed_at:
        result["completed_at"] = item.completed_at.replace(tzinfo=timezone.utc).isoformat()
    return jsonable_encoder(result)


def items(db: Session, company: str, period_id: str) -> list[dict]:
    return [
        public(item)
        for item in db.scalars(
            select(PeriodChecklistItem)
            .where(
                PeriodChecklistItem.company_id == company,
                PeriodChecklistItem.period_id == period_id,
                PeriodChecklistItem.active.is_(True),
            )
            .order_by(PeriodChecklistItem.created_at, PeriodChecklistItem.id)
        )
    ]


def save(
    db: Session,
    company: str,
    user: m.User,
    period_id: str,
    data: dict,
    item_id: str | None = None,
    version: int | None = None,
) -> dict:
    membership(db, company, user, "write")
    get_entity(db, m.Period, company, period_id)
    require_open_period(db, company, period_id)
    item = get_entity(db, PeriodChecklistItem, company, item_id) if item_id else None
    if item:
        require(item.period_id == period_id, "not_found", "مورد پیدا نشد.", 404)
        require(item.version == version, "version_conflict", "مورد تغییر کرده؛ تازه کنید.", 409)
    title = data["title"].strip()
    require(bool(title), "checklist_title_required", "عنوان را وارد کنید.")
    responsible = data.get("responsible_member_id")
    if responsible:
        member = get_entity(db, m.Membership, company, responsible)
        actor = db.get(m.User, member.user_id)
        require(
            member.active and actor is not None and actor.active,
            "checklist_responsible_inactive",
            "مسئول باید عضو فعال همین شرکت باشد.",
            409,
        )
    due = data.get("due_date")
    completed = data.get("completed", False)
    reason = (data.get("reason") or "").strip()
    require(bool(reason), "checklist_reason_required", "دلیل تغییر را وارد کنید.")
    if data.get("active", True) and (item is None or not item.active):
        active_count = (
            db.scalar(
                select(func.count())
                .select_from(PeriodChecklistItem)
                .where(
                    PeriodChecklistItem.company_id == company,
                    PeriodChecklistItem.period_id == period_id,
                    PeriodChecklistItem.active.is_(True),
                )
            )
            or 0
        )
        require(active_count < 200, "checklist_capacity", "حداکثر ۲۰۰ مورد فعال در هر دوره مجاز است.", 409)
    before = public(item) if item else None
    if item is None:
        item = PeriodChecklistItem(company_id=company, period_id=period_id, version=1)
        db.add(item)
    else:
        item.version += 1
    item.title, item.required = title, data["required"]
    item.responsible_member_id, item.due_date = responsible, due
    item.active = data.get("active", True)
    item.completed = completed
    if completed:
        item.completed_at, item.completed_by, item.completion_reason = m.now(), user.id, reason
    elif not completed:
        item.completed_at = item.completed_by = item.completion_reason = None
    db.flush()
    after = public(item)
    audit(
        db,
        company,
        user.id,
        "period.checklist_changed",
        item.id,
        {"period_id": period_id, "reason": reason, "before": before, "after": after},
    )
    return after
