"""Financial evidence query service for bounded server-side read tools.

Provides typed, allowlisted queries over permitted company evidence (native statements,
journals, invoices, allocations, forecasts, scenarios, and imported manifests).
Enforces tenant isolation, membership, bounded response limits, and deterministic calculations.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .finance import ZERO, amount, text_amount
from .native_forecast_models import NativeForecastRun
from .native_invoice_models import NativeInvoice, NativeInvoiceAllocation, NativeInvoiceAllocationReversal
from .native_reporting_models import NativeAccountRole, NativeStatementRun
from .posting_models import NativeJournal
from .security import membership
from .services import get_entity

FORMULA_VERSION = "financial-contract-0.1/evidence-v1"
MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 20


def query_statement_summary(
    db: Session,
    company_id: str,
    user: m.User,
    *,
    statement_id: str | None = None,
) -> dict:
    membership(db, company_id, user)
    stmt = (
        get_entity(db, NativeStatementRun, company_id, statement_id)
        if statement_id
        else db.scalar(
            select(NativeStatementRun)
            .where(NativeStatementRun.company_id == company_id)
            .order_by(desc(NativeStatementRun.created_at), desc(NativeStatementRun.id))
            .limit(1)
        )
    )
    if not stmt:
        return {
            "query": "statement_summary",
            "status": "unavailable",
            "reason_code": "native_statement_missing",
            "reason": "گزارش مالی دفتر اصلی ثبت نشده است.",
            "action": "گزارش مالی را از بخش گزارش‌ها ذخیره کنید.",
            "facts": {},
            "evidence_refs": [],
        }

    snapshot = stmt.snapshot or {}
    metrics = {item.get("metric_key"): item for item in snapshot.get("metrics", [])}
    evidence_ref = f"native-statement:{stmt.id}"

    facts = {}
    for key, item in metrics.items():
        facts[key] = {
            "metric_key": key,
            "value": item.get("value"),
            "status": item.get("status", "available"),
            "reason_codes": item.get("reason_codes", []),
            "unit": "IRR",
            "evidence_refs": [evidence_ref],
        }

    return {
        "query": "statement_summary",
        "status": "available",
        "company_id": company_id,
        "statement_id": stmt.id,
        "digest": stmt.digest,
        "as_of": snapshot.get("as_of"),
        "period_id": snapshot.get("period_id"),
        "facts": facts,
        "evidence_refs": [evidence_ref],
        "formula_version": FORMULA_VERSION,
    }


def query_period_comparison(
    db: Session,
    company_id: str,
    user: m.User,
    *,
    current_statement_id: str | None = None,
    prior_statement_id: str | None = None,
) -> dict:
    membership(db, company_id, user)
    current_run = (
        get_entity(db, NativeStatementRun, company_id, current_statement_id)
        if current_statement_id
        else db.scalar(
            select(NativeStatementRun)
            .where(NativeStatementRun.company_id == company_id)
            .order_by(desc(NativeStatementRun.created_at), desc(NativeStatementRun.id))
            .limit(1)
        )
    )
    if not current_run:
        return {
            "query": "period_comparison",
            "status": "unavailable",
            "reason_code": "native_statement_missing",
            "reason": "گزارش مالی دوره جاری موجود نیست.",
            "facts": {},
            "evidence_refs": [],
        }

    prior_run = (
        get_entity(db, NativeStatementRun, company_id, prior_statement_id)
        if prior_statement_id
        else db.scalar(
            select(NativeStatementRun)
            .where(
                NativeStatementRun.company_id == company_id,
                NativeStatementRun.id != current_run.id,
            )
            .order_by(desc(NativeStatementRun.created_at), desc(NativeStatementRun.id))
            .limit(1)
        )
    )

    curr_metrics = {m.get("metric_key"): m for m in (current_run.snapshot or {}).get("metrics", [])}
    prior_metrics = {m.get("metric_key"): m for m in (prior_run.snapshot or {}).get("metrics", [])} if prior_run else {}

    keys = ["revenue", "expense", "profit_before_tax", "bank_balance", "trade_receivable_balance", "trade_payable_balance"]
    deltas = {}
    evidence_refs = [f"native-statement:{current_run.id}"]
    if prior_run:
        evidence_refs.append(f"native-statement:{prior_run.id}")

    for key in keys:
        c_val_raw = curr_metrics.get(key, {}).get("value")
        p_val_raw = prior_metrics.get(key, {}).get("value") if prior_run else None

        if c_val_raw is not None and p_val_raw is not None:
            c_dec = amount(c_val_raw)
            p_dec = amount(p_val_raw)
            delta = c_dec - p_dec
            pct = round(float((delta / abs(p_dec)) * 100), 2) if p_dec != ZERO else None
            direction = "increase" if delta > ZERO else "decrease" if delta < ZERO else "unchanged"
            deltas[key] = {
                "current_value": text_amount(c_dec),
                "prior_value": text_amount(p_dec),
                "delta": text_amount(delta),
                "percent_change": pct,
                "direction": direction,
                "status": "available",
            }
        else:
            deltas[key] = {
                "current_value": c_val_raw,
                "prior_value": p_val_raw,
                "delta": None,
                "percent_change": None,
                "direction": "unknown",
                "status": "unavailable",
                "reason": "مقدار یکی از دو دوره در دسترس نیست." if not prior_run else "یکی از مقادیر ناموجود است.",
            }

    return {
        "query": "period_comparison",
        "status": "available",
        "company_id": company_id,
        "current_statement_id": current_run.id,
        "prior_statement_id": prior_run.id if prior_run else None,
        "deltas": deltas,
        "evidence_refs": evidence_refs,
        "formula_version": FORMULA_VERSION,
    }


def query_income_expense_breakdown(
    db: Session,
    company_id: str,
    user: m.User,
    *,
    period_id: str | None = None,
    as_of: date | None = None,
) -> dict:
    membership(db, company_id, user)
    target_period = (
        get_entity(db, m.Period, company_id, period_id)
        if period_id
        else db.scalar(
            select(m.Period)
            .where(m.Period.company_id == company_id)
            .order_by(desc(m.Period.start))
            .limit(1)
        )
    )
    if not target_period:
        return {
            "query": "income_expense_breakdown",
            "status": "unavailable",
            "reason_code": "period_missing",
            "reason": "دوره‌ای برای تحلیل یافت نشد.",
            "revenue_accounts": [],
            "expense_accounts": [],
            "evidence_refs": [],
        }

    cutoff = as_of or target_period.end
    journals = list(
        db.scalars(
            select(NativeJournal)
            .where(
                NativeJournal.company_id == company_id,
                NativeJournal.period_id == target_period.id,
                NativeJournal.date <= cutoff,
            )
            .order_by(NativeJournal.sequence)
        )
    )

    roles = {
        r.account_id: r.role
        for r in db.scalars(select(NativeAccountRole).where(NativeAccountRole.company_id == company_id))
    }
    accounts = {
        a.id: a for a in db.scalars(select(Account).where(Account.company_id == company_id))
    }

    revenue_by_account: dict[str, Decimal] = {}
    expense_by_account: dict[str, Decimal] = {}

    for journal in journals:
        lines = (journal.snapshot or {}).get("lines", [])
        for line in lines:
            acc_id = line.get("account_id")
            role = roles.get(acc_id)
            debit = amount(line.get("debit", "0"))
            credit = amount(line.get("credit", "0"))

            if role in ("revenue", "other_revenue", "gain", "other_income"):
                # Credit increases revenue, debit decreases
                net = credit - debit
                revenue_by_account[acc_id] = revenue_by_account.get(acc_id, ZERO) + net
            elif role in ("expense", "cogs", "operating_expense", "loss", "bank_fee", "finance_expense", "income_tax_expense"):
                # Debit increases expense, credit decreases
                net = debit - credit
                expense_by_account[acc_id] = expense_by_account.get(acc_id, ZERO) + net

    total_revenue = sum(revenue_by_account.values(), ZERO)
    total_expense = sum(expense_by_account.values(), ZERO)

    def format_breakdown(acc_dict: dict[str, Decimal], total: Decimal) -> list[dict]:
        items = []
        for acc_id, val in sorted(acc_dict.items(), key=lambda x: x[1], reverse=True):
            pct = round(float((val / total) * 100), 1) if total > ZERO else 0.0
            acc = accounts.get(acc_id)
            items.append({
                "account_id": acc_id,
                "account_title": acc.name if acc else acc_id,
                "account_code": acc.code if acc else "",
                "amount": text_amount(val),
                "share_percent": pct,
            })
        return items

    return {
        "query": "income_expense_breakdown",
        "status": "available",
        "company_id": company_id,
        "period_id": target_period.id,
        "as_of": cutoff.isoformat(),
        "total_revenue": text_amount(total_revenue),
        "total_expense": text_amount(total_expense),
        "revenue_accounts": format_breakdown(revenue_by_account, total_revenue),
        "expense_accounts": format_breakdown(expense_by_account, total_expense),
        "evidence_refs": [f"period:{target_period.id}"],
        "formula_version": FORMULA_VERSION,
    }


def query_receivables_concentration(
    db: Session,
    company_id: str,
    user: m.User,
    *,
    as_of: date | None = None,
    limit: int = DEFAULT_PAGE_SIZE,
) -> dict:
    membership(db, company_id, user)
    limit = min(limit, MAX_PAGE_SIZE)
    ref_date = as_of or date.today()

    invoices = list(
        db.scalars(
            select(NativeInvoice)
            .where(
                NativeInvoice.company_id == company_id,
                NativeInvoice.direction == "sale",
            )
        )
    )

    if not invoices:
        return {
            "query": "receivables_concentration",
            "status": "available",
            "total_receivables": "0",
            "overdue_receivables": "0",
            "customers": [],
            "evidence_refs": [],
        }

    # Fetch active allocations
    inv_ids = [inv.id for inv in invoices]
    allocations = list(
        db.scalars(
            select(NativeInvoiceAllocation)
            .where(
                NativeInvoiceAllocation.company_id == company_id,
                NativeInvoiceAllocation.invoice_id.in_(inv_ids),
                NativeInvoiceAllocation.date <= ref_date,
            )
        )
    )
    reversals = set(
        db.scalars(
            select(NativeInvoiceAllocationReversal.allocation_id)
            .where(
                NativeInvoiceAllocationReversal.company_id == company_id,
                NativeInvoiceAllocationReversal.date <= ref_date,
            )
        )
    )

    alloc_by_inv: dict[str, Decimal] = {}
    for alloc in allocations:
        if alloc.id not in reversals:
            alloc_by_inv[alloc.invoice_id] = alloc_by_inv.get(alloc.invoice_id, ZERO) + amount(alloc.amount)

    total_outstanding = ZERO
    total_overdue = ZERO
    by_customer: dict[str, dict] = {}
    evidence_refs = []

    for inv in invoices:
        src = inv.source or {}
        inv_total = amount(src.get("total_amount", "0"))
        allocated = alloc_by_inv.get(inv.id, ZERO)
        remaining = inv_total - allocated
        if remaining <= ZERO:
            continue

        total_outstanding += remaining
        due_raw = src.get("due_date")
        due_d = date.fromisoformat(due_raw) if due_raw else None
        is_overdue = due_d is not None and due_d < ref_date
        overdue_days = (ref_date - due_d).days if is_overdue else 0

        if is_overdue:
            total_overdue += remaining

        party_id = (
            src.get("counterparty_id")
            or src.get("party_id")
            or src.get("counterparty_name")
            or src.get("party_name")
            or "طرف ناشناس"
        )
        evidence_refs.append(f"invoice:{inv.id}")

        if party_id not in by_customer:
            by_customer[party_id] = {
                "counterparty_id": party_id,
                "counterparty_name": src.get("counterparty_name") or party_id,
                "outstanding_amount": ZERO,
                "overdue_amount": ZERO,
                "invoice_count": 0,
                "max_overdue_days": 0,
            }

        rec = by_customer[party_id]
        rec["outstanding_amount"] += remaining
        rec["invoice_count"] += 1
        if is_overdue:
            rec["overdue_amount"] += remaining
            rec["max_overdue_days"] = max(rec["max_overdue_days"], overdue_days)

    customer_list = []
    for c in sorted(by_customer.values(), key=lambda x: x["outstanding_amount"], reverse=True)[:limit]:
        pct = (
            round(float((c["outstanding_amount"] / total_outstanding) * 100), 1)
            if total_outstanding > ZERO
            else 0.0
        )
        customer_list.append({
            "counterparty_id": c["counterparty_id"],
            "counterparty_name": c["counterparty_name"],
            "outstanding_amount": text_amount(c["outstanding_amount"]),
            "overdue_amount": text_amount(c["overdue_amount"]),
            "share_percent": pct,
            "invoice_count": c["invoice_count"],
            "max_overdue_days": c["max_overdue_days"],
        })

    return {
        "query": "receivables_concentration",
        "status": "available",
        "company_id": company_id,
        "as_of": ref_date.isoformat(),
        "total_receivables": text_amount(total_outstanding),
        "total_overdue": text_amount(total_overdue),
        "customers": customer_list,
        "evidence_refs": evidence_refs[:MAX_PAGE_SIZE],
        "formula_version": FORMULA_VERSION,
    }


def query_cashflow_forecast_summary(
    db: Session,
    company_id: str,
    user: m.User,
) -> dict:
    membership(db, company_id, user)
    forecast_run = db.scalar(
        select(NativeForecastRun)
        .where(NativeForecastRun.company_id == company_id)
        .order_by(desc(NativeForecastRun.created_at), desc(NativeForecastRun.id))
        .limit(1)
    )
    if not forecast_run:
        return {
            "query": "cashflow_forecast_summary",
            "status": "unavailable",
            "reason_code": "forecast_run_missing",
            "reason": "پیش‌بینی نقدینگی دفتر اصلی اجرا نشده است.",
            "action": "پیش‌بینی نقدینگی را از بخش مربوط اجرا کنید.",
            "evidence_refs": [],
        }

    snapshot = forecast_run.snapshot or {}
    timeline = snapshot.get("timeline", [])
    deficit_dates = []
    min_balance = None

    for point in timeline:
        bal_str = point.get("balance")
        d_str = point.get("date")
        if bal_str is not None:
            bal_dec = amount(bal_str)
            if min_balance is None or bal_dec < min_balance:
                min_balance = bal_dec
            if bal_dec < ZERO:
                deficit_dates.append({
                    "date": d_str,
                    "deficit_amount": text_amount(abs(bal_dec)),
                })

    return {
        "query": "cashflow_forecast_summary",
        "status": "available",
        "company_id": company_id,
        "forecast_run_id": forecast_run.id,
        "digest": forecast_run.digest,
        "starting_balance": snapshot.get("starting_balance"),
        "min_projected_balance": text_amount(min_balance) if min_balance is not None else None,
        "has_deficit": len(deficit_dates) > 0,
        "first_deficit_date": deficit_dates[0]["date"] if deficit_dates else None,
        "deficit_days_count": len(deficit_dates),
        "evidence_refs": [f"native-forecast:{forecast_run.id}"],
        "formula_version": FORMULA_VERSION,
    }


def execute_evidence_query(
    db: Session,
    company_id: str,
    user: m.User,
    query_type: str,
    params: dict[str, Any] | None = None,
) -> dict:
    params = params or {}
    if query_type == "statement_summary":
        return query_statement_summary(db, company_id, user, statement_id=params.get("statement_id"))
    if query_type == "period_comparison":
        return query_period_comparison(
            db,
            company_id,
            user,
            current_statement_id=params.get("current_statement_id"),
            prior_statement_id=params.get("prior_statement_id"),
        )
    if query_type == "income_expense_breakdown":
        as_of_val = date.fromisoformat(params["as_of"]) if params.get("as_of") else None
        return query_income_expense_breakdown(
            db, company_id, user, period_id=params.get("period_id"), as_of=as_of_val
        )
    if query_type == "receivables_concentration":
        as_of_val = date.fromisoformat(params["as_of"]) if params.get("as_of") else None
        limit_val = int(params.get("limit", DEFAULT_PAGE_SIZE))
        return query_receivables_concentration(db, company_id, user, as_of=as_of_val, limit=limit_val)
    if query_type == "cashflow_forecast_summary":
        return query_cashflow_forecast_summary(db, company_id, user)

    return {
        "query": query_type,
        "status": "unsupported",
        "reason_code": "unsupported_query_type",
        "reason": f"پرس‌وجوی شواهد {query_type} پشتیبانی نمی‌شود.",
        "evidence_refs": [],
    }
