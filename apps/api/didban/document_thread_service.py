"""Collaboration never edits, approves or posts the associated accounting document."""

import json
from datetime import timezone
from hashlib import sha256

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Draft
from .control_service import validate_assignee
from .document_thread_models import NativeDocumentActivity as Activity
from .document_thread_models import NativeDocumentThread as Thread
from .errors import require
from .http import paginate
from .posting_models import NativeJournal
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def subject(db: Session, company: str, user: m.User, kind: str, identifier: str) -> dict:
    membership(db, company, user)
    require(kind in ("draft", "journal"), "document_subject_kind", "نوع سند معتبر نیست.")
    journal = get_entity(db, NativeJournal, company, identifier) if kind == "journal" else None
    draft = get_entity(db, Draft, company, journal.draft_id if journal else identifier)
    frozen = jsonable_encoder(
        {
            key: serialize_fact(draft)[key]
            for key in (
                "id",
                "version",
                "period_id",
                "date",
                "description",
                "lines",
                "original_unit",
                "state",
            )
        }
    )
    return {
        "kind": kind,
        "id": identifier,
        "draft_id": draft.id,
        "description": journal.snapshot["description"] if journal else draft.description,
        "version": journal.draft_version if journal else draft.version,
        "state": "posted" if journal else draft.state,
        "digest": journal.digest
        if journal
        else sha256(json.dumps(frozen, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
        "journal_id": journal.id if journal else None,
        "basis": "native_book",
    }


def public(db: Session, thread: Thread) -> dict:
    member = db.get(m.Membership, thread.assignee_membership_id) if thread.assignee_membership_id else None
    actor = db.get(m.User, member.user_id) if member else None
    return serialize_fact(thread) | {
        "assignee_name": actor.name if actor else None,
        "assignee_active": bool(
            member
            and member.active
            and member.role in ("owner", "finance_manager", "advisor")
            and actor
            and actor.active
        ),
    }


def read(db: Session, company: str, user: m.User, kind: str, identifier: str) -> dict:
    context = subject(db, company, user, kind, identifier)
    thread = db.scalar(
        select(Thread).where(Thread.company_id == company, Thread.draft_id == context["draft_id"])
    )
    member = membership(db, company, user)
    return {
        "subject": context,
        "thread": public(db, thread) if thread else None,
        "expected_version": thread.version if thread else 1,
        "can_write": member.role in ("owner", "finance_manager", "advisor"),
        "financial_effect": False,
    }


def _context(db: Session, company: str, user: m.User, data: dict) -> dict:
    context = subject(db, company, user, data["subject_kind"], data["subject_id"])
    require(
        context["digest"] == data["expected_subject_digest"],
        "document_context_changed",
        "نسخهٔ سند تغییر کرده؛ آن را بازخوانی کنید.",
        409,
    )
    return context


def _activity(
    db: Session,
    company: str,
    user: m.User,
    thread: Thread,
    kind: str,
    message: str,
    context: dict,
    data: dict,
) -> None:
    db.add(
        Activity(
            company_id=company,
            thread_id=thread.id,
            actor_id=user.id,
            kind=kind,
            message=message,
            context=context,
            data=data,
        )
    )
    audit(
        db,
        company,
        user.id,
        "accounting.document_" + kind,
        thread.id,
        {
            "thread_version": thread.version,
            "draft_id": thread.draft_id,
            "subject_digest": context["digest"],
            "financial_effect": False,
        },
    )


def add(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    require(
        data["kind"] in ("comment", "document_request") and bool(data["message"].strip()),
        "document_activity_invalid",
        "نوع و متن فعالیت لازم است.",
    )
    context = _context(db, company, user, data)
    thread = db.scalar(
        select(Thread).where(Thread.company_id == company, Thread.draft_id == context["draft_id"])
    )
    if thread:
        check_version(thread, data["expected_version"])
    else:
        require(data["expected_version"] == 1, "version_conflict", "گفت‌وگو تغییر کرده؛ بازخوانی کنید.", 409)
        thread = Thread(company_id=company, draft_id=context["draft_id"], actor_id=user.id)
        db.add(thread)
        db.flush()
    thread.version += 1
    _activity(db, company, user, thread, data["kind"], data["message"].strip(), context, {})
    db.flush()
    return read(db, company, user, data["subject_kind"], data["subject_id"])


def update(db: Session, company: str, user: m.User, identifier: str | None, data: dict) -> dict:
    membership(db, company, user, "write")
    context = _context(db, company, user, data)
    require(
        data["state"] in ("open", "in_progress", "resolved") and bool(data["reason"].strip()),
        "document_update_invalid",
        "وضعیت و دلیل تغییر لازم است.",
    )
    validate_assignee(db, company, data.get("assignee_membership_id"))
    thread = (
        get_entity(db, Thread, company, identifier)
        if identifier
        else db.scalar(
            select(Thread).where(Thread.company_id == company, Thread.draft_id == context["draft_id"])
        )
    )
    if thread:
        require(
            thread.draft_id == context["draft_id"],
            "document_thread_scope",
            "گفت‌وگو متعلق به این سند نیست.",
            409,
        )
        check_version(thread, data["expected_version"])
    else:
        require(data["expected_version"] == 1, "version_conflict", "گفت‌وگو تغییر کرده؛ بازخوانی کنید.", 409)
        thread = Thread(company_id=company, draft_id=context["draft_id"], actor_id=user.id)
        db.add(thread)
        db.flush()
    fields = ("assignee_membership_id", "due_date", "state", "next_action")
    before = jsonable_encoder({key: serialize_fact(thread)[key] for key in fields})
    for key in fields:
        setattr(thread, key, data[key])
    thread.version += 1
    after = jsonable_encoder({key: serialize_fact(thread)[key] for key in fields})
    _activity(
        db,
        company,
        user,
        thread,
        "updated",
        data["reason"].strip(),
        context,
        {"before": before, "after": after},
    )
    db.flush()
    return read(db, company, user, data["subject_kind"], data["subject_id"])


def activities(
    db: Session, company: str, user: m.User, identifier: str, limit: int = 25, cursor: str | None = None
) -> dict:
    membership(db, company, user)
    thread = get_entity(db, Thread, company, identifier)
    get_entity(db, Draft, company, thread.draft_id)

    def transform(item):
        actor = db.get(m.User, item.actor_id)
        return serialize_fact(item) | {
            "actor_name": actor.name if actor else "کاربر",
            "created_at": item.created_at.replace(tzinfo=timezone.utc).isoformat(),
        }

    return paginate(db, Activity, company, limit, cursor, [Activity.thread_id == identifier], transform)
