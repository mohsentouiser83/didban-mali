"""Deterministic evidence for native financial-period readiness warnings."""

import json
from collections import defaultdict
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .native_reporting_models import NativeAccountRole
from .posting_models import NativeJournal
from .posting_service import _aggregate
from .security import membership
from .services import get_entity


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
        "includes_imported_ledger": False,
        "financial_effect": False,
        "risk_assessment": "not_calibrated",
        "policy_version": "native-controls-evidence-v1",
    }
