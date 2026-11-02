"""Native-only statements from pinned journals, explicit roles and opening evidence."""

import json
from datetime import date
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .errors import require
from .native_opening_service import _journal_balances, _opening_evidence, _origin_period_metadata
from .native_opening_service import declare_opening as declare_opening
from .native_opening_service import declare_zero_opening as declare_zero_opening
from .native_opening_service import revoke_zero_opening as revoke_zero_opening
from .native_opening_service import zero_openings as zero_openings
from .native_reporting_models import NativeAccountRole, NativeStatementRun
from .native_roles_service import CREDIT_ROLES, NOMINAL_ROLES, ROLE_CATALOG, ROLE_KEYS
from .native_roles_service import list_roles as list_roles
from .native_roles_service import save_role as save_role
from .posting_models import NativeJournal
from .posting_service import _aggregate
from .security import membership
from .services import get_entity
from .workflow import audit


def build_statement(
    db: Session, company: str, user: m.User, period_id: str, as_of: date | None = None
) -> dict:
    membership(db, company, user)
    period = get_entity(db, m.Period, company, period_id)
    cutoff = as_of or period.end
    require(period.start <= cutoff <= period.end, "date_outside_period", "تاریخ گزارش خارج از دوره است.")
    journals = list(
        db.scalars(
            select(NativeJournal)
            .where(
                NativeJournal.company_id == company,
                NativeJournal.period_id == period.id,
                NativeJournal.date <= cutoff,
            )
            .order_by(NativeJournal.sequence)
        )
    )
    assigned = {
        row.account_id: row
        for row in db.scalars(select(NativeAccountRole).where(NativeAccountRole.company_id == company))
    }
    accounts = {row.id: row for row in db.scalars(select(Account).where(Account.company_id == company))}
    used = {line["account_id"] for journal in journals for line in journal.snapshot["lines"]}
    roles = [
        {
            "account_id": identifier,
            "role": assigned[identifier].role if identifier in assigned else None,
            "assignment_version": assigned[identifier].version if identifier in assigned else 1,
            "account_version": accounts[identifier].version if identifier in accounts else None,
        }
        for identifier in sorted(used)
    ]
    role_for = {row["account_id"]: row["role"] for row in roles}
    labels = {
        line["account_id"]: {"code": line["code"], "name": line["name"]}
        for journal in journals
        for line in journal.snapshot["lines"]
    }
    with localcontext() as context:
        context.prec = 60
        balances = _journal_balances(journals)
        opening = _opening_evidence(db, company, period, journals, assigned)
        metadata_for = {journal.id: _origin_period_metadata(db, company, journal) for journal in journals}
        movement_journals = [
            journal
            for journal in journals
            if (metadata_for[journal.id] or {}).get("kind") not in ("opening", "declared_opening")
        ]
        movements = _journal_balances(movement_journals)
        profit_journals = [journal for journal in journals if not metadata_for[journal.id]]
        nominal_balances = _journal_balances(profit_journals)
        unknown_nominal = sorted(
            {
                line["account_id"]
                for journal in profit_journals
                for line in journal.snapshot["lines"]
                if role_for.get(line["account_id"]) is None
            }
        )
        period_role_conflicts = set()
        reversed_ids = {journal.reversal_of for journal in journals if journal.reversal_of}
        for journal in journals:
            metadata = metadata_for[journal.id]
            if not metadata:
                continue
            if journal.id in reversed_ids or journal.reversal_of:
                continue
            if metadata["kind"] in ("opening", "declared_opening"):
                period_role_conflicts.update(
                    line["account_id"]
                    for line in journal.snapshot["lines"]
                    if role_for.get(line["account_id"]) not in ROLE_KEYS - NOMINAL_ROLES
                )
            elif metadata["kind"] == "closing":
                selection = metadata.get("selection", {})
                allowed = set(selection.get("account_ids", [])) | {selection.get("result_account_id")}
                period_role_conflicts.update(
                    line["account_id"]
                    for line in journal.snapshot["lines"]
                    if line["account_id"] not in allowed
                )
                period_role_conflicts.update(
                    account_id
                    for account_id in selection.get("account_ids", [])
                    if role_for.get(account_id) not in NOMINAL_ROLES
                )
                result_id = selection.get("result_account_id")
                if result_id and role_for.get(result_id) not in ROLE_KEYS - NOMINAL_ROLES:
                    period_role_conflicts.add(result_id)
        unknown_balance = sorted(
            {
                account_id
                for (account_id, _party), value in balances.items()
                if value and role_for.get(account_id) is None
            }
        )
        known_revenue = sum(
            (
                -value
                for (account_id, _party), value in nominal_balances.items()
                if role_for.get(account_id) == "revenue"
            ),
            Decimal(0),
        )
        known_expense = sum(
            (
                value
                for (account_id, _party), value in nominal_balances.items()
                if role_for.get(account_id) == "expense"
            ),
            Decimal(0),
        )
        metrics = []
        profit_reasons = (["unclassified_profit_accounts"] if unknown_nominal else []) + (
            ["period_accounting_role_conflict"] if period_role_conflicts else []
        )
        for key, label, value in (
            ("revenue", "درآمد طبق اسناد", known_revenue),
            ("expense", "هزینه طبق اسناد", known_expense),
            ("profit_before_tax", "سود پیش از مالیات طبق اسناد", known_revenue - known_expense),
        ):
            metrics.append(
                {
                    "metric_key": key,
                    "label": label,
                    "value": None if profit_reasons else _aggregate(value),
                    "known_subset_value": _aggregate(value),
                    "status": "unavailable" if profit_reasons else "available",
                    "reason_codes": profit_reasons,
                    "unit": "IRR",
                }
            )
        for role in ROLE_CATALOG:
            key = role["key"]
            if key in NOMINAL_ROLES:
                continue
            value = sum(
                (
                    amount
                    for (account_id, _party), amount in balances.items()
                    if role_for.get(account_id) == key
                ),
                Decimal(0),
            )
            movement = sum(
                (
                    amount
                    for (account_id, _party), amount in movements.items()
                    if role_for.get(account_id) == key
                ),
                Decimal(0),
            )
            if key in CREDIT_ROLES:
                value = -value
                movement = -movement
            reasons = list(opening["reason_codes"])
            if unknown_balance:
                reasons.append("unclassified_balance_accounts")
            metrics.append(
                {
                    "metric_key": key + "_balance",
                    "label": ("خالص ماندهٔ " if key in ("trade_receivable", "trade_payable") else "ماندهٔ ")
                    + role["label"],
                    "value": None if reasons else _aggregate(value),
                    "known_subset_value": _aggregate(value) if opening["status"] == "available" else None,
                    "known_period_movement": _aggregate(movement),
                    "status": "unavailable" if reasons else "available",
                    "reason_codes": reasons,
                    "unit": "IRR",
                }
            )
        rows = []
        opposite_balances = []
        period_totals = {}
        for journal in movement_journals:
            for line in journal.snapshot["lines"]:
                key = (line["account_id"], line.get("party_id", ""))
                row = period_totals.setdefault(key, {"debit": Decimal(0), "credit": Decimal(0)})
                row["debit"] += Decimal(line["debit"])
                row["credit"] += Decimal(line["credit"])
        for key in sorted(balances, key=lambda value: (labels[value[0]]["code"], value[1])):
            account_id, party_id = key
            totals = period_totals.get(key, {"debit": Decimal(0), "credit": Decimal(0)})
            role = role_for.get(account_id)
            if (role == "trade_receivable" and balances[key] < 0) or (
                role == "trade_payable" and balances[key] > 0
            ):
                opposite_balances.append(
                    {
                        "account_id": account_id,
                        "party_id": party_id,
                        "role": role,
                        "period_movement": _aggregate(movements.get(key, Decimal(0))),
                        "cumulative_balance": _aggregate(balances[key])
                        if opening["status"] == "available"
                        else None,
                    }
                )
            rows.append(
                {
                    "account_id": account_id,
                    "party_id": party_id,
                    **labels[account_id],
                    "role": role_for.get(account_id),
                    "debit": _aggregate(totals["debit"]),
                    "credit": _aggregate(totals["credit"]),
                    "period_movement": _aggregate(movements.get(key, Decimal(0))),
                    "cumulative_balance": _aggregate(balances[key])
                    if opening["status"] == "available"
                    else None,
                }
            )
    return {
        "title": "گزارش مالی دفتر اصلی دیدبان",
        "company_name": db.get(m.Company, company).name,
        "period_id": period.id,
        "period": {
            "id": period.id,
            "name": period.name,
            "start": period.start.isoformat(),
            "end": period.end.isoformat(),
        },
        "as_of": cutoff.isoformat(),
        "basis": "native_book",
        "unit": "IRR",
        "journal_ids": [journal.id for journal in journals],
        "profit_journal_ids": [journal.id for journal in profit_journals],
        "movement_journal_ids": [journal.id for journal in movement_journals],
        "role_assignments": roles,
        "metrics": metrics,
        "items": rows,
        "opposite_balances": opposite_balances,
        "opening_evidence": opening,
        "unknown_profit_account_ids": unknown_nominal,
        "unknown_balance_account_ids": unknown_balance,
        "period_accounting_role_conflict_ids": sorted(period_role_conflicts),
        "includes_imported_ledger": False,
        "opening_balance_inferred": False,
        "tax_calculated": False,
        "report_approved": False,
        "policy_version": "native-statements-explicit-roles-1",
        "policy_provenance": "user_provisional",
        "decision_id": "D22",
    }


def save_statement(
    db: Session, company: str, user: m.User, period_id: str, as_of: date | None = None
) -> dict:
    from .native_statement_approval_service import statement_public

    membership(db, company, user, "write")
    snapshot = build_statement(db, company, user, period_id, as_of)
    digest = sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    item = NativeStatementRun(company_id=company, actor_id=user.id, digest=digest, snapshot=snapshot)
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.statement_saved",
        item.id,
        {"digest": digest, "journal_ids": snapshot["journal_ids"]},
    )
    return statement_public(db, company, user, item)


def latest_summary(db: Session, company: str, period_id: str | None = None) -> dict:
    """Small fixed-source dashboard projection; no imported fall-through or live recalculation."""
    from .native_assistant_service import native_context

    query = select(NativeStatementRun).where(NativeStatementRun.company_id == company)
    if period_id:
        get_entity(db, m.Period, company, period_id)
        query = query.where(NativeStatementRun.snapshot["period_id"].as_string() == period_id)
    run = db.scalar(
        query.order_by(NativeStatementRun.created_at.desc(), NativeStatementRun.id.desc()).limit(1)
    )
    require(run is not None, "native_statement_missing", "گزارش مالی ثابت دفتر اصلی ذخیره نشده است.", 404)
    return {
        "id": run.id,
        "source": "native_statement",
        "digest": run.digest,
        "period": run.snapshot["period"],
        "as_of": run.snapshot["as_of"],
        "metrics": native_context(run)["metrics"],
        "created_at": run.created_at,
    }
