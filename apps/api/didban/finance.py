"""Deterministic, manifest-scoped financial calculations.

Input rows are canonical facts selected by the application service. A source row is
never replaced by an amount/date heuristic here. Completeness is an explicit,
audited coverage declaration and remains separate from row-level validity.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, localcontext
from typing import Any

ZERO = Decimal("0")
FORMULA_VERSION = "financial-contract-0.1/fresh-1"
REVENUE_ROLES = {"revenue", "other_revenue", "other_income", "non_operating_income", "gain"}
EXPENSE_ROLES = {
    "expense", "cogs", "operating_expense", "payroll_expense", "bank_fee",
    "finance_expense", "other_expense", "loss", "income_tax_expense",
}
TAX_ROLES = {"income_tax_expense"}
TRADE_AR_ROLES = {"trade_ar", "trade_receivable"}
TRADE_AP_ROLES = {"trade_ap", "trade_payable"}
DEBT_ROLES = {
    "trade_ap": "trade", "trade_payable": "trade", "loan_payable": "loan",
    "loan": "loan", "payroll_payable": "payroll", "tax_payable": "tax",
    "other_payable": "other", "other_liability": "other",
}
NON_FLOW_ENTRIES = {"opening", "closing", "closing_transfer", "profit_transfer", "balance_transfer"}
ANCHOR_KINDS = {"opening", "anchor", "balance_anchor", "snapshot"}
SALES_DIRECTIONS = {"sale", "sales", "receipt", "receivable"}
PURCHASE_DIRECTIONS = {"purchase", "purchases", "payment", "payable"}

REASONS = {
    "ledger_source_missing": ("دفتر حسابداری موجود نیست.", "بارگذاری دفتر"),
    "ledger_coverage_incomplete": ("پوشش دفتر کامل نیست.", "تکمیل دفتر"),
    "ledger_unbalanced": ("سند نامتوازن در دفتر وجود دارد.", "اصلاح فایل دفتر"),
    "ledger_role_unknown": ("نقش بعضی حساب‌ها مشخص نیست.", "تعیین نقش حساب‌ها"),
    "income_tax_unknown": ("اطلاعات مالیات عملکرد کامل نیست.", "تکمیل مالیات عملکرد"),
    "bank_source_missing": ("گردش بانک موجود نیست.", "بارگذاری گردش بانک"),
    "bank_anchor_missing": ("مانده مبنای بعضی حساب‌ها موجود نیست.", "تکمیل مانده مبنا"),
    "bank_cutoff_unknown": ("برش زمانی مانده مبنا مشخص نیست.", "تعیین برش مانده"),
    "bank_coverage_incomplete": ("پوشش حساب‌های بانکی کامل نیست.", "تکمیل حساب‌های بانک"),
    "invoice_source_missing": ("فاکتورهای این مبنا موجود نیست.", "بارگذاری فاکتورها"),
    "invoice_coverage_incomplete": ("پوشش فاکتورها کامل نیست.", "تکمیل فاکتورها"),
    "payment_dates_missing": ("تاریخچه پرداخت برای مانده دوره کامل نیست.", "تکمیل تاریخچه پرداخت"),
    "invoice_identity_ambiguous": ("شناسه فاکتور در منابع یکتا نیست.", "تعیین نسخه فاکتور"),
    "settlement_identity_ambiguous": ("شناسه دریافت یا پرداخت تکراری است.", "تعیین نسخه پرداخت"),
    "snapshot_cutoff_after_report": ("تاریخ مانده پرداخت پس از دوره است.", "تکمیل تاریخچه پرداخت"),
    "snapshot_events_unknown": ("رویدادهای داخل مانده پرداخت مشخص نیست.", "تعیین پوشش مانده پرداخت"),
    "comparable_scope_missing": ("دامنه تجاری و طرف‌های متناظر تأیید نشده‌اند.", "تکمیل دامنه مقایسه"),
    "due_date_missing": ("سررسید فاکتور مشخص نیست.", "تکمیل سررسید"),
    "forecast_policy_unapproved": ("سیاست کفایت سابقه وصول نهایی نشده است.", "تکمیل سیاست پیش‌بینی"),
    "forecast_receipt_date_missing": ("زمان وصول بعضی فاکتورها مشخص نیست.", "تعیین زمان وصول"),
    "forecast_payment_coverage_incomplete": ("پوشش پرداخت‌های آتی کامل نیست.", "تکمیل برنامه پرداخت"),
    "overdue_payment_date_unknown": ("زمان پرداخت تعهد سررسیدگذشته مشخص نیست.", "تعیین زمان پرداخت"),
    "duplicate_obligation_schedule": ("یک تعهد در چند برنامه پرداخت تکرار شده است.", "بررسی برنامه پرداخت"),
}


def amount(value: Any) -> Decimal:
    """Canonical amounts must already be exact finite decimal strings."""
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError("Non-finite canonical amount")
    return result


def text_amount(value: Decimal | None) -> str | None:
    if value is None:
        return None
    if value == ZERO:
        return "0"
    return format(value, "f").rstrip("0").rstrip(".") if "." in format(value, "f") else format(value, "f")


def day(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def evidence(rows: list[dict]) -> list[str]:
    return sorted({str(row["source_row_id"]) for row in rows if row.get("source_row_id")})


def comparison(current: str | None, previous: str | None) -> dict:
    if current is None or previous is None:
        return {"previous": previous, "delta": None, "percent": None, "reason": "comparison_missing"}
    with localcontext() as context:
        context.prec = 50
        current_value, previous_value = amount(current), amount(previous)
        delta = current_value - previous_value
        reason = "zero_denominator" if previous_value == 0 else "sign_change" if current_value * previous_value < 0 else "negative_denominator" if previous_value < 0 else None
        percent = None if reason else text_amount(delta / previous_value * 100)
        return {"previous": previous, "delta": text_amount(delta), "percent": percent, "reason": reason}


def metric(key: str, label: str, value: Decimal | None, period: dict, *, basis: str = "ledger", scope: str = "company", status: str | None = None, reasons: list[str] | None = None, refs: list[str] | None = None, coverage: dict | None = None) -> dict:
    reasons = reasons or []
    first = REASONS.get(reasons[0], (reasons[0], "تکمیل داده")) if reasons else (None, None)
    return {
        "metric_key": key, "label": label, "basis": basis, "scope": scope,
        "value": text_amount(value), "unit": "IRR", "status": status or ("unavailable" if value is None else "available"),
        "reason_codes": reasons, "reason": first[0], "action": first[1],
        "as_of_date": day(period["end"]).isoformat(), "period_id": period.get("id"),
        "formula_version": FORMULA_VERSION, "evidence_refs": refs or [],
        "coverage": coverage or {}, "comparison": comparison(text_amount(value), None),
    }


def _ledger(ledger: list[dict], period: dict, coverage: dict) -> tuple[list[dict], dict]:
    start, end = day(period["start"]), day(period["end"])
    through_end = [row for row in ledger if day(row["date"]) <= end]
    current = [row for row in through_end if start <= day(row["date"]) and row.get("entry_type", "regular") not in NON_FLOW_ENTRIES]
    known = REVENUE_ROLES | EXPENSE_ROLES | set(DEBT_ROLES) | TRADE_AR_ROLES | {"capital", "equity", "inventory", "asset", "cash", "bank", "other_ar", "other_receivable", "vat_receivable", "vat_payable", "prepayment", "advance_receipt", "retained_earnings"}
    unknown = [row for row in through_end if row.get("role", "") not in known and not str(row.get("role", "")).startswith("bank_")]
    entries: dict[tuple[str, date], Decimal] = defaultdict(lambda: ZERO)
    for row in through_end:
        if entry_id := row.get("entry_id"):
            entries[(str(entry_id), day(row["date"]))] += amount(row.get("debit", "0")) - amount(row.get("credit", "0"))
    unbalanced = [key for key, balance in entries.items() if balance != 0]
    reasons = []
    if not ledger:
        reasons = ["ledger_source_missing"]
    elif unknown:
        reasons = ["ledger_role_unknown"]
    elif unbalanced and coverage.get("validate_journal_balance", True):
        reasons = ["ledger_unbalanced"]
    valid = not reasons
    complete = coverage.get("ledger_complete") is True
    scope_status = "available" if complete else "limited"
    scope_reasons = [] if complete else ["ledger_coverage_incomplete"]
    revenue = sum((amount(row.get("credit", "0")) - amount(row.get("debit", "0")) for row in current if row.get("role") in REVENUE_ROLES), ZERO)
    expense = sum((amount(row.get("debit", "0")) - amount(row.get("credit", "0")) for row in current if row.get("role") in EXPENSE_ROLES), ZERO)
    tax = sum((amount(row.get("debit", "0")) - amount(row.get("credit", "0")) for row in current if row.get("role") in TAX_ROLES), ZERO)
    values = [
        metric("revenue", "درآمد دفتر", revenue if valid else None, period, status=scope_status if valid else "unavailable", reasons=reasons or scope_reasons, refs=evidence(current)),
        metric("expense", "هزینه دفتر", expense if valid else None, period, status=scope_status if valid else "unavailable", reasons=reasons or scope_reasons, refs=evidence(current)),
        metric("pre_tax_profit", "سود پیش از مالیات طبق اسناد موجود", revenue - (expense - tax) if valid else None, period, status=scope_status if valid else "unavailable", reasons=reasons or scope_reasons, refs=evidence(current)),
    ]
    tax_complete = coverage.get("tax_complete") is True
    values.append(metric("net_profit", "سود خالص", revenue - expense if valid and tax_complete else None, period, status=scope_status if valid and tax_complete else "unavailable", reasons=reasons or (["income_tax_unknown"] if not tax_complete else scope_reasons), refs=evidence(current)))
    balances: dict[tuple[str, str, str], Decimal] = defaultdict(lambda: ZERO)
    for row in through_end:
        balances[(row.get("role", ""), str(row.get("account", "")), str(row.get("party_id", "")))] += amount(row.get("debit", "0")) - amount(row.get("credit", "0"))
    ar = sum((max(value, ZERO) for (role, _, _), value in balances.items() if role in TRADE_AR_ROLES), ZERO)
    ar_credit = sum((-min(value, ZERO) for (role, _, _), value in balances.items() if role in TRADE_AR_ROLES), ZERO)
    debt_components = {"trade": ZERO, "loan": ZERO, "payroll": ZERO, "tax": ZERO, "other": ZERO}
    opposite_debts = {key: ZERO for key in debt_components}
    ledger_parties = []
    for (role, account, party_id), value in balances.items():
        if role in DEBT_ROLES:
            component = DEBT_ROLES[role]
            debt_components[component] += max(-value, ZERO)
            opposite_debts[component] += max(value, ZERO)
        if role in TRADE_AR_ROLES or role in DEBT_ROLES:
            ledger_parties.append({"role": role, "account": account, "party_id": party_id, "balance": text_amount(value)})
    for key, label, value, scope in [
        ("ar_ledger", "مطالبات تجاری دفتر", ar, "commercial_receivables"),
        ("ap_trade_ledger", "بدهی تجاری دفتر", debt_components["trade"], "commercial_payables"),
        ("debt_total_ledger", "کل بدهی دفتر", sum(debt_components.values(), ZERO), "all_liabilities"),
    ]:
        values.append(metric(key, label, value if valid else None, period, scope=scope, status=scope_status if valid else "unavailable", reasons=reasons or scope_reasons, refs=evidence(through_end)))
    return values, {
        "debt_components": {key: text_amount(value) if valid else None for key, value in debt_components.items()},
        "opposite_debt_balances": {key: text_amount(value) if valid else None for key, value in opposite_debts.items()},
        "receivable_credit_balances": text_amount(ar_credit) if valid else None,
        "ledger_parties": ledger_parties,
        "ledger_controls": {"balanced": not unbalanced, "unbalanced_entries": [entry for entry, _ in unbalanced], "unknown_role_rows": evidence(unknown), "coverage_complete": complete},
    }


def _internal_ids(movements: list[dict], coverage: dict) -> set[str]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in movements:
        if (row.get("kind") in {"internal", "internal_transfer", "transfer"} or row.get("reference") in coverage.get("confirmed_internal_references", [])) and row.get("reference"):
            groups[str(row["reference"])].append(row)
    accepted = set()
    for group in groups.values():
        if len(group) == 2 and len({row["account"] for row in group}) == 2 and sum((amount(row["amount"]) for row in group), ZERO) == 0 and all(amount(row["amount"]) != 0 for row in group):
            accepted.update(str(row.get("id", row.get("source_row_id"))) for row in group)
    return accepted


def _account_balance(rows: list[dict], as_of: date, coverage: dict, account: str) -> tuple[Decimal | None, str | None, list[str]]:
    anchors = [row for row in rows if row.get("kind") in ANCHOR_KINDS and row.get("balance") is not None and day(row["date"]) <= as_of]
    if not anchors:
        return None, "bank_anchor_missing", []
    # Multiple same-day anchors without an intra-day boundary are ambiguous.
    newest_date = max(day(row["date"]) for row in anchors)
    newest = [row for row in anchors if day(row["date"]) == newest_date]
    if len(newest) != 1:
        return None, "bank_cutoff_unknown", evidence(newest)
    anchor = newest[0]
    cutoff = anchor.get("anchor_cutoff") or coverage.get("opening_cutoff_by_account", {}).get(account)
    if cutoff not in {"start_of_day", "end_of_day"}:
        return None, "bank_cutoff_unknown", evidence([anchor])
    after = [row for row in rows if row.get("kind") not in ANCHOR_KINDS and (day(row["date"]) > newest_date or (cutoff == "start_of_day" and day(row["date"]) == newest_date)) and day(row["date"]) <= as_of]
    return amount(anchor["balance"]) + sum((amount(row["amount"]) for row in after), ZERO), None, evidence([anchor, *after])


def _bank(bank: list[dict], period: dict, coverage: dict) -> tuple[list[dict], dict]:
    start, end = day(period["start"]), day(period["end"])
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in bank:
        grouped[str(row["account"])].append(row)
    expected = set(str(account) for account in coverage.get("bank_accounts", []))
    accounts = sorted(set(grouped) | expected)
    bank_balances = []
    for account in accounts:
        value, reason, refs = _account_balance(grouped[account], end, coverage, account)
        bank_balances.append({"account": account, "balance": text_amount(value), "status": "available" if value is not None else "unavailable", "reason_codes": [reason] if reason else [], "reason": REASONS.get(reason or "", (None, None))[0], "evidence_refs": refs})
    missing_anchor = any(row["balance"] is None for row in bank_balances)
    complete = coverage.get("bank_complete") is True and bool(accounts) and not missing_anchor
    subset = sum((amount(row["balance"]) for row in bank_balances if row["balance"] is not None), ZERO)
    reason = "bank_source_missing" if not bank else "bank_anchor_missing" if missing_anchor else "bank_coverage_incomplete" if not complete else None
    values = [metric("cash", "مانده بانک‌ها", subset if complete else None, period, basis="bank", reasons=[reason] if reason else [], refs=evidence(bank))]
    if bank_balances and not complete and any(row["balance"] is not None for row in bank_balances):
        values.append(metric("cash_subset", "مانده حساب‌های دارای مبنا", subset, period, basis="bank", scope="anchored_accounts", status="limited", reasons=[reason] if reason else [], refs=evidence(bank)))
    movements = [row for row in bank if row.get("kind") not in ANCHOR_KINDS and start <= day(row["date"]) <= end]
    internal_ids = _internal_ids(movements, coverage)
    sums = {"external_in": ZERO, "external_out": ZERO, "internal_in": ZERO, "internal_out": ZERO, "net": ZERO}
    for row in movements:
        value = amount(row["amount"])
        internal = str(row.get("id", row.get("source_row_id"))) in internal_ids
        key = ("internal_" if internal else "external_") + ("in" if value >= 0 else "out")
        sums[key] += abs(value)
        sums["net"] += value
    # The unconfirmed remainder is not proof of external cash flow. Product
    # summaries use total bank inflow/outflow, with internal transfers explicit.
    sums["total_in"] = sums["external_in"] + sums["internal_in"]
    sums["total_out"] = sums["external_out"] + sums["internal_out"]
    daily = []
    point = start
    while point <= end:
        rows = [row for row in movements if day(row["date"]) == point]
        balances = [_account_balance(grouped[account], point, coverage, account)[0] for account in accounts]
        day_balance = sum((value for value in balances if value is not None), ZERO) if complete and all(value is not None for value in balances) else None
        inflow = sum((max(amount(row["amount"]), ZERO) for row in rows), ZERO)
        outflow = sum((-min(amount(row["amount"]), ZERO) for row in rows), ZERO)
        daily.append({"date": point.isoformat(), "inflow": text_amount(inflow), "outflow": text_amount(outflow), "net": text_amount(inflow - outflow), "balance": text_amount(day_balance)})
        point += timedelta(days=1)
    return values, {"bank_balances": bank_balances, "cash_movements": {key: text_amount(value) if bank else None for key, value in sums.items()}, "cash_movement_status": "available" if coverage.get("bank_complete") and bank else "limited" if bank else "unavailable", "daily_cash": daily, "bank_transactions": [{**row, "date": day(row["date"]).isoformat(), "internal_validated": str(row.get("id", row.get("source_row_id"))) in internal_ids} for row in movements]}


def invoice_remaining(invoice: dict, settlements: list[dict], as_of: date, *, history_complete: bool, allocations: list[dict] | None = None) -> tuple[Decimal | None, Decimal | None, list[str]]:
    """Use one dated snapshot, then only events outside its included boundary."""
    expected_direction = "receipt" if invoice.get("direction") in SALES_DIRECTIONS else "payment"
    events = [row for row in settlements if str(row.get("invoice_reference", row.get("invoice_id"))) == str(invoice["reference"]) and row.get("direction") == expected_direction and day(row["date"]) <= as_of]
    ids = [str(row.get("reference", row.get("id", ""))) for row in events]
    if len(ids) != len(set(ids)):
        return None, None, ["settlement_identity_ambiguous"]
    snapshot = invoice.get("payment_snapshot")
    paid = ZERO
    if snapshot:
        boundary = day(snapshot["as_of"])
        if boundary > as_of:
            if not history_complete:
                return None, None, ["snapshot_cutoff_after_report"]
        else:
            if "included_events" not in snapshot:
                return None, None, ["snapshot_events_unknown"]
            included = set(str(value) for value in snapshot["included_events"])
            paid = amount(snapshot["paid"])
            # A complete snapshot covers every event through its cut-off; included
            # IDs additionally detect a replay carried outside a malformed date.
            events = [row for row in events if day(row["date"]) > boundary and str(row.get("reference", row.get("id", ""))) not in included]
            history_complete = True
    if not history_complete:
        return None, None, ["payment_dates_missing"]
    paid += sum((amount(row["amount"]) for row in events), ZERO)
    for allocation in allocations or []:
        if allocation.get("reversed_at"):
            continue
        if str(allocation.get("invoice_id")) != str(invoice.get("id")):
            continue
        if not allocation.get("date"):
            # An allocation needs the effective bank date, not its creation time.
            return None, None, ["payment_dates_missing"]
        if day(allocation["date"]) <= as_of:
            paid += amount(allocation["amount"])
    return amount(invoice["amount"]) - paid, paid, []


def _invoices(invoices: list[dict], settlements: list[dict], period: dict, coverage: dict, allocations: list[dict]) -> tuple[list[dict], dict]:
    end = day(period["end"])
    rows = []
    for invoice in invoices:
        if day(invoice["date"]) > end:
            continue
        direction = "sales" if invoice.get("direction") in SALES_DIRECTIONS else "purchases"
        duplicates = [row for row in invoices if row.get("direction") in (SALES_DIRECTIONS if direction == "sales" else PURCHASE_DIRECTIONS) and str(row["reference"]) == str(invoice["reference"])]
        remaining, paid, reasons = invoice_remaining(invoice, settlements, end, history_complete=coverage.get("settlements_complete") is True, allocations=allocations)
        if len(duplicates) > 1:
            remaining, paid, reasons = None, None, ["invoice_identity_ambiguous"]
        due = day(invoice["due_date"]) if invoice.get("due_date") else None
        overdue = (remaining > 0 and due < end) if remaining is not None and due else None
        if due is None:
            reasons = [*reasons, "due_date_missing"]
        rows.append({
            "id": invoice.get("id"), "reference": invoice["reference"], "party_id": invoice.get("party_id"),
            "direction": direction, "date": day(invoice["date"]).isoformat(), "due_date": due.isoformat() if due else None,
            "amount": str(invoice["amount"]), "paid": text_amount(paid), "remaining": text_amount(remaining),
            "overdue": overdue, "status": "unavailable" if remaining is None else "available" if coverage.get("invoice_complete") else "limited",
            "reason_codes": reasons, "evidence_refs": evidence([invoice]), "tax_id": invoice.get("tax_id"), "tax": invoice.get("tax"),
        })
    values = []
    for direction, key, label in [("sales", "ar_invoice", "مانده فاکتورهای فروش"), ("purchases", "ap_invoice", "مانده فاکتورهای خرید")]:
        selected = [row for row in rows if row["direction"] == direction]
        source_present = any(row.get("direction") in (SALES_DIRECTIONS if direction == "sales" else PURCHASE_DIRECTIONS) for row in invoices)
        # A zero-row source must be declared explicitly; missing family is not zero.
        source_present = source_present or coverage.get(f"{direction}_source_present") is True
        reasons = []
        if not source_present:
            reasons = ["invoice_source_missing"]
        elif any(row["remaining"] is None for row in selected):
            reasons = sorted({reason for row in selected if row["remaining"] is None for reason in row["reason_codes"] if reason != "due_date_missing"})
        elif coverage.get("settlements_complete") is not True and not selected:
            reasons = ["payment_dates_missing"]
        value = None if reasons else sum((max(amount(row["remaining"]), ZERO) for row in selected), ZERO)
        complete = coverage.get("invoice_complete") is True
        values.append(metric(key, label, value, period, basis="invoice", scope="commercial_receivables" if direction == "sales" else "commercial_payables", status="unavailable" if value is None else "available" if complete else "limited", reasons=reasons or ([] if complete else ["invoice_coverage_incomplete"]), refs=sorted({ref for row in selected for ref in row["evidence_refs"]})))
    return values, {"invoices": rows, "invoice_credits": {direction: text_amount(sum((-min(amount(row["remaining"]), ZERO) for row in rows if row["direction"] == direction and row["remaining"] is not None), ZERO)) for direction in ("sales", "purchases")}}


def _moadian(invoices: list[dict], snapshots: list[dict], period: dict) -> dict:
    start, end = day(period["start"]), day(period["end"])
    result = {"sales": [], "purchases": []}
    for direction, aliases in (("sales", SALES_DIRECTIONS), ("purchases", PURCHASE_DIRECTIONS)):
        internal = [row for row in invoices if row.get("direction") in aliases and start <= day(row["date"]) <= end]
        portal = [row for row in snapshots if row.get("direction") in aliases and start <= day(row["date"]) <= end]
        known_ids = {str(row["tax_id"]) for row in snapshots if row.get("direction") in aliases and row.get("tax_id")}
        ids = {str(row.get("tax_id")) for row in [*internal, *portal] if row.get("tax_id")}
        for tax_id in sorted(ids):
            left = [row for row in internal if str(row.get("tax_id")) == tax_id]
            right = [row for row in portal if str(row.get("tax_id")) == tax_id]
            reasons = []
            status = "matched"
            if len(left) > 1 or len(right) > 1:
                status, reasons = "needs_review", ["identity_ambiguous"]
            states_needing_review = {
                "portal_status_review": "portal_status_review_required",
                "portal_subject_review": "portal_subject_review_required",
            }
            for state, reason in states_needing_review.items():
                if any(row.get("state") == state for row in right):
                    status = "needs_review"
                    reasons.append(reason)
            chain_rows = [
                row for row in right
                if row.get("state", "original") not in ("original", "normal", "active")
                and row.get("state") not in states_needing_review
            ]
            if chain_rows:
                status = "needs_review"
                reasons.append("reference_chain_review_required")
                if any(not row.get("parent_reference") or str(row["parent_reference"]) not in known_ids for row in chain_rows):
                    reasons.append("reference_missing")
            if any(row.get("tax") is None or row.get("tax") == "" for row in [*left, *right]):
                status = "needs_review"
                reasons.append("tax_missing")
            if not left and status == "matched":
                status = "portal_only"
            elif not right and status == "matched":
                status = "internal_only"
            difference = None
            if len(left) == 1 and len(right) == 1:
                difference = amount(right[0]["amount"]) - amount(left[0]["amount"])
                if status == "matched" and difference != 0:
                    status = "amount_mismatch"
                if status == "matched" and amount(right[0]["tax"]) != amount(left[0]["tax"]):
                    status = "tax_mismatch"
                if status == "matched" and day(right[0]["date"]) != day(left[0]["date"]):
                    status = "date_mismatch"
                if status == "matched" and not right[0].get("party_id"):
                    status = "needs_review"
                    reasons.append("party_identity_missing")
                elif status == "matched" and left[0].get("party_id") != right[0]["party_id"]:
                    status = "party_mismatch"
            result[direction].append({"tax_id": tax_id, "reference": (left or right)[0].get("reference"), "status": status, "internal_amount": str(left[0]["amount"]) if len(left) == 1 else None, "portal_amount": str(right[0]["amount"]) if len(right) == 1 else None, "difference": text_amount(difference), "tax": str(right[0]["tax"]) if len(right) == 1 and right[0].get("tax") not in (None, "") else None, "financial_effect": None if status == "needs_review" else "comparison_only", "reason_codes": reasons, "evidence_refs": evidence([*left, *right])})
        for row in [*internal, *portal]:
            if not row.get("tax_id"):
                result[direction].append({"tax_id": None, "reference": row.get("reference"), "status": "needs_review", "internal_amount": None, "portal_amount": None, "difference": None, "tax": row.get("tax"), "financial_effect": None, "reason_codes": ["tax_identity_missing"], "evidence_refs": evidence([row])})
    return result


def future_obligations(plans: list[dict], invoices: list[dict], as_of: date) -> tuple[list[dict], list[str]]:
    """A confirmed plan is the single scheduled representation of its obligation."""
    selected: dict[str, dict] = {}
    reasons = []
    by_reference = {str(invoice["reference"]): invoice for invoice in invoices}
    for plan in plans:
        if plan.get("state", "confirmed") != "confirmed":
            continue
        obligation = str(plan.get("obligation_id") or plan.get("id"))
        if obligation in selected:
            reasons.append("duplicate_obligation_schedule")
            continue
        due = day(plan["due_date"])
        remaining = amount(plan["amount"])
        invoice = by_reference.get(str(plan.get("invoice_reference"))) if plan.get("invoice_reference") else None
        if invoice:
            if invoice.get("remaining") is None:
                reasons.append("payment_dates_missing")
                continue
            remaining = min(remaining, max(amount(invoice["remaining"]), ZERO))
        if remaining <= 0:
            continue
        if due <= as_of:
            reasons.append("overdue_payment_date_unknown")
            continue
        selected[obligation] = {"date": due.isoformat(), "direction": "payment", "obligation_id": obligation, "amount": text_amount(remaining), "invoice_reference": plan.get("invoice_reference")}
    return list(selected.values()), sorted(set(reasons))


def _forecast(metrics: list[dict], details: dict, period: dict, coverage: dict, plans: list[dict]) -> dict:
    start = day(period["end"])
    policy = coverage.get("forecast_policy", {})
    if policy.get("production_approved") is not True:
        return {"status": "unavailable", "reason_codes": ["forecast_policy_unapproved"], "reason": REASONS["forecast_policy_unapproved"][0], "days": [], "events": [], "assumptions": [], "policy_version": policy.get("version")}
    cash = next(row for row in metrics if row["metric_key"] == "cash")
    reasons = []
    if cash["value"] is None:
        reasons.extend(cash["reason_codes"])
    if coverage.get("future_payments_complete") is not True:
        reasons.append("forecast_payment_coverage_incomplete")
    receivables = next(row for row in metrics if row["metric_key"] == "ar_invoice")
    if receivables["status"] != "available":
        reasons.extend(receivables["reason_codes"] or ["forecast_receipt_coverage_incomplete"])
    obligations, plan_reasons = future_obligations(plans, details["invoices"], start)
    reasons.extend(plan_reasons)
    events = [event for event in obligations if day(event["date"]) <= start + timedelta(days=30)]
    receipt_dates = coverage.get("receipt_dates", {})
    for invoice in details["invoices"]:
        if invoice["direction"] != "sales":
            continue
        if invoice["remaining"] is None:
            reasons.append("payment_dates_missing")
            continue
        if amount(invoice["remaining"]) <= 0:
            continue
        receipt_date = receipt_dates.get(str(invoice["reference"]))
        if not receipt_date or day(receipt_date) <= start:
            reasons.append("forecast_receipt_date_missing")
            continue
        if day(receipt_date) <= start + timedelta(days=30):
            events.append({"date": day(receipt_date).isoformat(), "direction": "receipt", "obligation_id": invoice["reference"], "amount": invoice["remaining"]})
    if reasons:
        first = reasons[0]
        return {"status": "unavailable", "reason_codes": sorted(set(reasons)), "reason": REASONS.get(first, ("پوشش پیش‌بینی کامل نیست.", None))[0], "days": [], "events": events, "assumptions": [], "policy_version": policy.get("version")}
    balance = amount(cash["value"])
    days = []
    events.sort(key=lambda event: (event["date"], event["obligation_id"]))
    for offset in range(1, 31):
        target = start + timedelta(days=offset)
        daily_events = [event for event in events if day(event["date"]) == target]
        receipts = sum((amount(event["amount"]) for event in daily_events if event["direction"] == "receipt"), ZERO)
        payments = sum((amount(event["amount"]) for event in daily_events if event["direction"] == "payment"), ZERO)
        balance += receipts - payments
        days.append({"date": target.isoformat(), "receipts": text_amount(receipts), "payments": text_amount(payments), "balance": text_amount(balance)})
    return {"status": "estimated", "reason_codes": [], "reason": None, "opening": cash["value"], "closing": text_amount(balance), "days": days, "events": events, "assumptions": ["زمان وصول بر اساس پاسخ ثبت‌شده", "پرداخت‌ها بر اساس برنامه تأییدشده"], "policy_version": policy.get("version")}


def calculate(records: dict[str, list[dict]], period: dict, coverage: dict, allocations: list[dict] | None = None, plans: list[dict] | None = None) -> dict:
    """Calculate only the selected canonical records; no implicit company-wide query."""
    with localcontext() as context:
        context.prec = 50
        ledger = records.get("ledger", [])
        bank = records.get("bank", [])
        invoices = records.get("invoices", [])
        settlements = records.get("settlements", [])
        metrics, details = _ledger(ledger, period, coverage)
        bank_metrics, bank_details = _bank(bank, period, coverage)
        invoice_metrics, invoice_details = _invoices(invoices, settlements, period, coverage, allocations or [])
        metrics.extend(bank_metrics)
        metrics.extend(invoice_metrics)
        details.update(bank_details)
        details.update(invoice_details)
        for direction, ledger_key, invoice_key, scope_key, label in [
            ("ar", "ar_ledger", "ar_invoice", "comparable_ar", "اختلاف مطالبات تجاری"),
            ("ap", "ap_trade_ledger", "ap_invoice", "comparable_ap", "اختلاف بدهی تجاری"),
        ]:
            left = next(row for row in metrics if row["metric_key"] == ledger_key)
            right = next(row for row in metrics if row["metric_key"] == invoice_key)
            comparable = coverage.get(scope_key) is True and left["status"] == "available" and right["status"] == "available"
            reasons = [] if comparable else list(dict.fromkeys([*left["reason_codes"], *right["reason_codes"], "comparable_scope_missing"]))
            value = amount(left["value"]) - amount(right["value"]) if comparable else None
            metrics.append(metric(direction + "_difference", label, value, period, basis="comparable_difference", scope="commercial_receivables" if direction == "ar" else "commercial_payables", reasons=reasons, refs=sorted(set(left["evidence_refs"] + right["evidence_refs"]))))
        details["moadian"] = _moadian(invoices, records.get("moadian", []), period)
        details["forecast"] = _forecast(metrics, details, period, coverage, plans or records.get("plans", []))
        details["coverage"] = coverage
        details["as_of_date"] = day(period["end"]).isoformat()
        details["period"] = {**period, "start": day(period["start"]).isoformat(), "end": day(period["end"]).isoformat()}
        return {"metrics": metrics, "details": details}
