"""Continuous deterministic native-book controls, with no fraud score or financial mutation."""

import json
from collections import defaultdict
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .errors import DomainError
from .native_control_models import NativeControlRun
from .native_reporting_models import NativeAccountRole
from .native_reporting_service import build_statement
from .posting_models import NativeJournal
from .posting_service import _aggregate
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _digest(value: dict | list) -> str:
    return sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _journal_ref(item: NativeJournal) -> dict:
    return {
        "journal_id": item.id,
        "sequence": item.sequence,
        "digest": item.digest,
        "date": item.date.isoformat(),
        "draft_id": item.draft_id,
        "approved_draft_version": item.draft_version,
    }


def _expense_buckets(db: Session, company: str, snapshot: dict) -> dict:
    roles = {row["account_id"]: row["role"] for row in snapshot["role_assignments"]}
    ids = snapshot["profit_journal_ids"]
    buckets = {}
    with localcontext() as context:
        context.prec = 60
        for offset in range(0, len(ids), 500):
            for journal in db.scalars(
                select(NativeJournal).where(
                    NativeJournal.company_id == company, NativeJournal.id.in_(ids[offset : offset + 500])
                )
            ):
                for line in journal.snapshot["lines"]:
                    if roles.get(line["account_id"]) != "expense":
                        continue
                    row = buckets.setdefault(
                        line["account_id"],
                        {"code": line["code"], "name": line["name"], "value": Decimal(0), "journal_refs": {}},
                    )
                    row["value"] += Decimal(line["debit"]) - Decimal(line["credit"])
                    row["journal_refs"][journal.id] = _journal_ref(journal)
    return buckets


def expense_comparison(db: Session, company: str, user: m.User, period) -> dict:
    base = {
        "status": "unavailable",
        "reason": "دوره قبل تعیین نشده است.",
        "current_total": None,
        "previous_total": None,
        "difference": None,
        "rows": [],
        "previous_period": None,
        "risk_assessment": "not_calibrated",
        "basis": "native_book",
    }
    if not period.previous_period_id:
        return base
    previous = get_entity(db, m.Period, company, period.previous_period_id)
    base["previous_period"] = {
        "id": previous.id,
        "name": previous.name,
        "start": previous.start.isoformat(),
        "end": previous.end.isoformat(),
    }
    if (
        previous.end >= period.start
        or (previous.end - previous.start).days != (period.end - period.start).days
    ):
        return base | {"reason": "بازه‌های دو دوره هم‌طول و بدون هم‌پوشانی نیستند."}
    now = build_statement(db, company, user, period.id)
    before = build_statement(db, company, user, previous.id)
    if not now["journal_ids"] or not before["journal_ids"]:
        return base | {"reason": "اسناد ثبت‌شده یکی از دو دوره موجود نیست."}
    metrics = [
        next(row for row in item["metrics"] if row["metric_key"] == "expense") for item in (now, before)
    ]
    if any(item["value"] is None or item["status"] != "available" for item in metrics):
        return base | {"reason": "نقش حساب‌های دو دوره برای مقایسه هزینه کامل نیست."}
    current = _expense_buckets(db, company, now)
    old = _expense_buckets(db, company, before)
    rows = []
    with localcontext() as context:
        context.prec = 60
        for identifier in sorted(set(current) | set(old)):
            label = current.get(identifier) or old[identifier]
            a = current.get(identifier, {"value": Decimal(0), "journal_refs": {}})
            b = old.get(identifier, {"value": Decimal(0), "journal_refs": {}})
            rows.append(
                {
                    "account_id": identifier,
                    "code": label["code"],
                    "name": label["name"],
                    "current": _aggregate(a["value"]),
                    "previous": _aggregate(b["value"]),
                    "difference": _aggregate(a["value"] - b["value"]),
                    "journal_refs": list((b["journal_refs"] | a["journal_refs"]).values()),
                }
            )
        rows.sort(key=lambda row: (abs(Decimal(row["difference"])), row["account_id"]), reverse=True)
        difference = Decimal(metrics[0]["value"]) - Decimal(metrics[1]["value"])
    return base | {
        "status": "available",
        "reason": None,
        "current_total": metrics[0]["value"],
        "previous_total": metrics[1]["value"],
        "difference": _aggregate(difference),
        "rows": rows,
        "current_journal_ids": now["profit_journal_ids"],
        "previous_journal_ids": before["profit_journal_ids"],
        "role_assignments": now["role_assignments"],
        "previous_role_assignments": before["role_assignments"],
    }


def build(db: Session, company: str, user: m.User, period_id: str) -> dict:
    membership(db, company, user)
    period = get_entity(db, m.Period, company, period_id)
    journals = list(
        db.scalars(
            select(NativeJournal)
            .where(NativeJournal.company_id == company, NativeJournal.period_id == period.id)
            .order_by(NativeJournal.sequence)
        )
    )
    accounts = {row.id: row for row in db.scalars(select(Account).where(Account.company_id == company))}
    roles = {
        row.account_id: row
        for row in db.scalars(select(NativeAccountRole).where(NativeAccountRole.company_id == company))
    }
    missing = defaultdict(list)
    similar = defaultdict(list)
    reversed_ids = set(
        db.scalars(
            select(NativeJournal.reversal_of).where(
                NativeJournal.company_id == company, NativeJournal.reversal_of.is_not(None)
            )
        )
    )
    with localcontext() as context:
        context.prec = 60
        for journal in journals:
            for line in journal.snapshot["lines"]:
                assignment = roles.get(line["account_id"])
                if assignment is None or assignment.role is None:
                    missing[line["account_id"]].append((journal, line))
            if journal.reversal_of or journal.id in reversed_ids:
                continue
            profile = sorted(
                (line["account_id"], line.get("party_id", ""), line["debit"], line["credit"])
                for line in journal.snapshot["lines"]
            )
            similar[_digest([journal.date.isoformat(), profile])].append(journal)
        findings = []
        for identifier, entries in sorted(missing.items()):
            refs = {journal.id: _journal_ref(journal) for journal, _line in entries}
            name = accounts[identifier].name if identifier in accounts else entries[0][1]["name"]
            amount = sum(
                (Decimal(line["debit"]) + Decimal(line["credit"]) for _journal, line in entries), Decimal(0)
            )
            findings.append(
                {
                    "id": _digest(["role", identifier, sorted(refs)]),
                    "code": "native_account_role_missing",
                    "classification": "data_limitation",
                    "title": "نقش حساب مشخص نیست",
                    "detail": name,
                    "account_id": identifier,
                    "amount": _aggregate(amount),
                    "amount_label": "گردش درگیر",
                    "journal_refs": list(refs.values()),
                }
            )
        for profile, group in sorted(similar.items()):
            if len(group) < 2:
                continue
            amount = sum(
                (Decimal(line["debit"]) for journal in group for line in journal.snapshot["lines"]),
                Decimal(0),
            )
            findings.append(
                {
                    "id": _digest(["similar", profile, [row.id for row in group]]),
                    "code": "native_similar_journals",
                    "classification": "review",
                    "title": "اسناد با ردیف‌های مالی یکسان",
                    "detail": "برابری محتوا تکراری‌بودن رویداد را ثابت نمی‌کند.",
                    "amount": _aggregate(amount),
                    "amount_label": "جمع بدهکار اسناد مشابه",
                    "journal_refs": [_journal_ref(row) for row in group],
                }
            )
    try:
        comparison = expense_comparison(db, company, user, period)
    except DomainError as error:
        comparison = {
            "status": "unavailable",
            "reason": error.message,
            "current_total": None,
            "previous_total": None,
            "difference": None,
            "rows": [],
            "previous_period": None,
            "risk_assessment": "not_calibrated",
            "basis": "native_book",
        }
    role_snapshot = [
        {
            "account_id": identifier,
            "account_version": accounts[identifier].version if identifier in accounts else None,
            "role": roles[identifier].role if identifier in roles else None,
            "role_version": roles[identifier].version if identifier in roles else None,
        }
        for identifier in sorted(
            {line["account_id"] for journal in journals for line in journal.snapshot["lines"]}
        )
    ]
    return {
        "basis": "native_book",
        "period_id": period.id,
        "period": {
            "id": period.id,
            "name": period.name,
            "start": period.start.isoformat(),
            "end": period.end.isoformat(),
        },
        "scope": "posted_native_journals",
        "journal_refs": [_journal_ref(row) for row in journals],
        "role_assignments": role_snapshot,
        "findings": findings,
        "finding_count": len(findings),
        "expense_comparison": comparison,
        "includes_imported_ledger": False,
        "financial_effect": False,
        "risk_assessment": "not_calibrated",
        "policy_version": "native-controls-evidence-v1",
    }


def save(db: Session, company: str, user: m.User, period_id: str, trigger: str = "manual") -> dict:
    membership(db, company, user, "write")
    snapshot = build(db, company, user, period_id)
    digest = _digest(snapshot)
    previous = db.scalar(
        select(NativeControlRun).where(
            NativeControlRun.company_id == company, NativeControlRun.digest == digest
        )
    )
    if previous:
        return serialize_fact(previous)
    item = NativeControlRun(
        company_id=company,
        period_id=period_id,
        digest=digest,
        actor_id=user.id,
        trigger=trigger,
        snapshot=snapshot,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.native_controls_checked",
        item.id,
        {
            "digest": digest,
            "period_id": period_id,
            "trigger": trigger,
            "finding_count": snapshot["finding_count"],
        },
    )
    return serialize_fact(item)


def on_postings(db: Session, company: str, user: m.User, period_ids: list[str]) -> None:
    for period_id in sorted(set(period_ids)):
        save(db, company, user, period_id, trigger="after_posting")
