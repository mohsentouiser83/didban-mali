"""Native journal rules make only internal notices/discussion actions, never post."""

import json
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .accounting_setup_models import CompanyAccountingSetup
from .automation_models import AutomationRule
from .automation_schemas import RuleDefinition
from .errors import DomainError, require
from .native_automation_models import NativeAutomationPreview, NativeAutomationRun
from .operation_models import OperationDraft
from .posting_models import NativeJournal
from .posting_service import _aggregate
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _digest(value) -> str:
    return sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def validate_definition(db: Session, company: str, spec: dict) -> None:
    setup = db.get(CompanyAccountingSetup, company)
    require(
        setup is not None and setup.mode == "primary",
        "primary_accounting_required",
        "قاعده دفتر اصلی فقط در کاربرد حسابداری اصلی فعال است.",
        409,
    )
    get_entity(db, m.Period, company, spec["period_id"])
    for condition in spec["conditions"]:
        if condition["field"] == "account_id":
            account = get_entity(db, Account, company, condition["value"])
            require(account.active, "inactive_account", "حساب شرط غیرفعال است.", 409)


def _source(db: Session, company: str, journal: NativeJournal) -> dict:
    reversal = db.scalar(
        select(NativeJournal.id).where(
            NativeJournal.company_id == company, NativeJournal.reversal_of == journal.id
        )
    )
    status = "reversal" if journal.reversal_of else "reversed" if reversal else "posted"
    origin = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company, OperationDraft.draft_id == journal.draft_id
        )
    )
    if origin:
        from .operation_service import _require_operation_module

        _require_operation_module(db, company, origin.kind)
    rows = []
    with localcontext() as context:
        context.prec = 60
        for index, line in enumerate(journal.snapshot["lines"]):
            rows.append(
                {
                    "line_index": index,
                    "amount": _aggregate(Decimal(line["debit"]) + Decimal(line["credit"])),
                    "account_id": line["account_id"],
                    "party_id": line.get("party_id") or None,
                    "date": journal.date.isoformat(),
                    "status": status,
                    "reference": origin.source_reference if origin else None,
                }
            )
    return {
        "journal_id": journal.id,
        "journal_digest": journal.digest,
        "sequence": journal.sequence,
        "date": journal.date.isoformat(),
        "status": status,
        "rows": rows,
        "source_digest": _digest([journal.digest, status]),
    }


def preview(db: Session, company: str, spec: dict, journal_ids: list[str] | None = None) -> dict:
    from .automation_service import _matches

    spec = RuleDefinition.model_validate(spec).model_dump()
    require(spec["scope"] == "native_journal", "native_rule_scope", "دامنه قاعده دفتر اصلی معتبر نیست.")
    validate_definition(db, company, spec)
    query = select(NativeJournal).where(
        NativeJournal.company_id == company, NativeJournal.period_id == spec["period_id"]
    )
    if journal_ids is not None:
        query = query.where(NativeJournal.id.in_(journal_ids))
    sources = []
    matches = []
    missing = 0
    for journal in db.scalars(query.order_by(NativeJournal.sequence)):
        try:
            source = _source(db, company, journal)
        except DomainError as error:
            sources.append(
                {
                    "journal_id": journal.id,
                    "journal_digest": journal.digest,
                    "blocked_reason": error.code,
                    "source_digest": _digest([journal.digest, error.code]),
                }
            )
            missing += 1
            continue
        sources.append({key: value for key, value in source.items() if key != "rows"})
        selected = []
        absent = set()
        for row in source["rows"]:
            absent.update(
                condition["field"] for condition in spec["conditions"] if row.get(condition["field"]) is None
            )
            match, unknown = _matches(row, spec["conditions"])
            missing += int(unknown)
            if match:
                selected.append(row)
        sources[-1]["missing_fields"] = sorted(absent)
        if not selected:
            continue
        with localcontext() as context:
            context.prec = 60
            value = _aggregate(sum((Decimal(row["amount"]) for row in selected), Decimal(0)))
        matches.append(
            {
                "subject_id": journal.id,
                "reference": f"سند {journal.sequence}",
                "value": value,
                "value_scope": "matching_line_movements",
                "matching_line_indices": [row["line_index"] for row in selected],
                "evidence_refs": ["native-journal:" + journal.id],
                "source_digest": source["source_digest"],
                "status": source["status"],
            }
        )
    return {
        "basis": "native_book",
        "period_id": spec["period_id"],
        "definition": spec,
        "source_digest": _digest(sources),
        "sources": sources,
        "matches": matches,
        "match_count": len(matches),
        "unavailable_count": missing,
        "status": "unavailable"
        if not sources or (missing and not matches)
        else "limited"
        if missing
        else "available",
        "financial_effect": False,
    }


def save_preview(db: Session, company: str, user: m.User, definition: dict) -> dict:
    membership(db, company, user)
    result = preview(db, company, definition)
    receipt = NativeAutomationPreview(
        company_id=company,
        actor_id=user.id,
        period_id=result["period_id"],
        source_digest=result["source_digest"],
        definition=result["definition"],
        result=result,
    )
    db.add(receipt)
    db.flush()
    return result | {"preview_id": receipt.id}


def validate_activation(db: Session, company: str, user: m.User, spec: dict, preview_id: str) -> None:
    checked = get_entity(db, NativeAutomationPreview, company, preview_id)
    require(
        checked.actor_id == user.id
        and checked.definition == spec
        and checked.result["status"] != "unavailable",
        "rule_preview_mismatch",
        "پیش‌نمایش با این قاعده و کاربر یکسان نیست.",
        409,
    )
    current = preview(db, company, spec)
    require(
        current["source_digest"] == checked.source_digest,
        "rule_preview_stale",
        "دفتر اصلی پس از پیش‌نمایش تغییر کرده؛ دوباره بررسی کنید.",
        409,
    )


def _actor(db: Session, company: str, rule) -> m.User | None:
    actor = db.get(m.User, rule.actor_id)
    if not actor or not actor.active:
        return None
    member = db.scalar(
        select(m.Membership).where(
            m.Membership.company_id == company,
            m.Membership.user_id == actor.id,
            m.Membership.active.is_(True),
        )
    )
    return actor if member and member.role in ("owner", "finance_manager") else None


def execute(db: Session, company: str, rule, journal_ids: list[str] | None = None) -> dict:
    require(rule.enabled, "rule_disabled", "قاعده غیرفعال است.", 409)
    actor = _actor(db, company, rule)
    try:
        result = preview(db, company, rule.definition, journal_ids)
    except DomainError as error:
        audit(
            db,
            company,
            actor.id if actor else None,
            "automation.native_rule_blocked",
            rule.id,
            {"reason": error.code, "financial_effect": False},
        )
        return {"action_count": 0, "action_state": error.code, "financial_effect": False}
    count = 0
    receipts = []
    matches = {match["subject_id"]: match for match in result["matches"]}
    for source in result["sources"]:
        match = matches.get(source["journal_id"])
        prior = db.scalar(
            select(NativeAutomationRun).where(
                NativeAutomationRun.company_id == company,
                NativeAutomationRun.rule_id == rule.id,
                NativeAutomationRun.rule_version == rule.version,
                NativeAutomationRun.journal_id == source["journal_id"],
                NativeAutomationRun.source_digest == source["source_digest"],
            )
        )
        if prior:
            receipts.append(serialize_fact(prior))
            continue
        state = source.get("blocked_reason") or (
            "missing_condition_data"
            if source.get("missing_fields") and not match
            else "not_matched"
            if not match
            else "actor_access_revoked"
            if actor is None
            else "completed"
        )
        thread_id = None
        if actor and state == "completed":
            if rule.definition["action"] == "followup":
                from . import document_thread_service as threads

                current = threads.read(db, company, actor, "journal", match["subject_id"])
                context = {
                    "subject_kind": "journal",
                    "subject_id": match["subject_id"],
                    "expected_subject_digest": current["subject"]["digest"],
                    "expected_version": current["expected_version"],
                }
                if current["thread"] is None:
                    updated = threads.update(
                        db,
                        company,
                        actor,
                        None,
                        context
                        | {
                            "state": "open",
                            "assignee_membership_id": None,
                            "due_date": None,
                            "next_action": rule.name,
                            "reason": "پیگیری از قاعده تأییدشده: " + rule.name,
                        },
                    )
                else:
                    updated = threads.add(
                        db,
                        company,
                        actor,
                        context
                        | {"kind": "document_request", "message": "بررسی قاعده تأییدشده: " + rule.name},
                    )
                thread_id = updated["thread"]["id"]
            else:
                label = "درخواست تهیه پیش‌نویس" if rule.definition["action"] == "draft_request" else rule.name
                db.add(
                    m.Notification(
                        company_id=company,
                        title=f"{label}: {match['reference']}"[:150],
                        href="/accounting/journals",
                    )
                )
            count += 1
        row = NativeAutomationRun(
            company_id=company,
            rule_id=rule.id,
            rule_version=rule.version,
            journal_id=source["journal_id"],
            source_digest=source["source_digest"],
            definition=rule.definition,
            result={
                "match": match,
                "source": source,
                "action_state": state,
                "action_count": 1 if actor and state == "completed" else 0,
                "thread_id": thread_id,
                "financial_effect": False,
            },
        )
        db.add(row)
        db.flush()
        receipts.append(serialize_fact(row))
        audit(
            db,
            company,
            actor.id if actor else None,
            "automation.native_rule_executed",
            row.id,
            {
                "rule_id": rule.id,
                "journal_id": row.journal_id,
                "action_state": state,
                "financial_effect": False,
            },
        )
    return {
        "items": receipts,
        "action_count": count,
        "action_state": "completed" if actor else "actor_access_revoked",
        "financial_effect": False,
    }


def on_postings(db: Session, company: str, user: m.User, journal_ids: list[str]) -> None:
    affected = set(journal_ids)
    for journal in db.scalars(
        select(NativeJournal).where(NativeJournal.company_id == company, NativeJournal.id.in_(journal_ids))
    ):
        if journal.reversal_of:
            affected.add(journal.reversal_of)
    for rule in db.scalars(
        select(AutomationRule).where(AutomationRule.company_id == company, AutomationRule.enabled.is_(True))
    ):
        if rule.definition["scope"] == "native_journal":
            execute(db, company, rule, list(affected))
