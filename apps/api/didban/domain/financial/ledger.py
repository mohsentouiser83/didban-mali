from collections import defaultdict
from .ledger_controls import posting_facts

from .common import (
    ZERO,
    UnsafeFinancialData,
    amount,
    coverage,
    coverage_reason,
    day,
    decimal_text,
    result,
    selected,
    usable,
)
from .types import FinancialRow, MetricResult, PeriodSpec

FLOW_KEYS = ("revenue", "expense", "profit_before_tax", "net_profit")
BALANCE_ROLES = {
    "ar_ledger": {"trade_ar", "other_ar"},
    "ap_trade_ledger": {"trade_ap"},
    "debt_total_ledger": {
        "trade_ap",
        "loan_payable",
        "tax_payable",
        "payroll_payable",
        "other_liability",
        "vat_payable",
    },
}
KNOWN_ROLES = set(
    "bank cash cash_equivalent trade_ar other_ar trade_ap loan_payable tax_payable payroll_payable other_liability inventory fixed_asset other_asset contra_asset other_equity capital revenue other_income expense purchases cogs income_tax_expense vat_receivable vat_payable".split()
)
NON_FLOW = {"opening", "closing", "closing_transfer", "profit_loss_transfer"}


def ledger_metrics(
    rows: list[FinancialRow], period: PeriodSpec, declarations: dict
) -> list[MetricResult]:
    source = selected(rows, "ledger")
    scopes = coverage("ledger", period.starts_on, period.cutoff, declarations)
    reasons: list[str] = []
    if not source:
        reasons.append("source_missing")
    issue = coverage_reason("ledger", period.starts_on, period.cutoff, declarations)
    if issue:
        reasons.append(issue)
    eligible = []
    journals: dict[tuple, list] = defaultdict(list)
    for row in source:
        try:
            when = day(row.values.get("date"))
            if when > period.cutoff:
                continue
            if not usable(row):
                raise UnsafeFinancialData("invalid_rows")
            debit, credit = (
                amount(row.values.get("debit")),
                amount(row.values.get("credit")),
            )
            if debit < ZERO or credit < ZERO or (debit and credit):
                raise UnsafeFinancialData("invalid_rows")
            provenance = row.values.get("role_provenance")
            accepted_role = provenance in {"explicit_source_field", "user_declaration"}
            if provenance == "validated_policy":
                accepted_role = (
                    bool(row.values.get("role_evidence"))
                    and row.values.get("role_controls_passed") is True
                )
            if row.values.get("role") not in KNOWN_ROLES or not accepted_role:
                raise UnsafeFinancialData("account_role_unknown")
            if not row.values.get("entry_id") or not row.values.get("account"):
                raise UnsafeFinancialData("invalid_rows")
            if row.values.get("entry_type") not in NON_FLOW | {
                "regular",
                "adjustment",
                "real_adjustment",
                "real_cogs_adjustment",
            }:
                raise UnsafeFinancialData("invalid_rows")
            eligible.append(row)
            journals[(row.file_id, row.sheet, row.values["entry_id"], when)].append(row)
        except UnsafeFinancialData as exc:
            reasons.append(str(exc))
    for entries in journals.values():
        if sum(
            (amount(r.values["debit"]) - amount(r.values["credit"]) for r in entries),
            ZERO,
        ):
            reasons.append("journal_unbalanced")
    flow = [
        r
        for r in eligible
        if period.starts_on <= day(r.values["date"])
        and r.values["entry_type"] not in NON_FLOW
    ]

    def debit_net(roles: set[str]):
        return sum(
            (
                amount(r.values["debit"]) - amount(r.values["credit"])
                for r in flow
                if r.values["role"] in roles
            ),
            ZERO,
        )

    revenue = -debit_net({"revenue"})
    other_income = -debit_net({"other_income"})
    operating = debit_net({"expense", "cogs"})
    tax = debit_net({"income_tax_expense"})
    facts = posting_facts(source, period)
    if facts.get("periodic_cogs") is not None:
        operating += amount(facts["periodic_cogs"])
    if facts.get("allocated_tax") is not None:
        allocated = amount(facts["allocated_tax"])
        if not tax:
            tax = allocated
    cogs_state = declarations.get("cogs", {}).get(period.id)
    has_cogs_rows = (
        any(r.values["role"] == "cogs" for r in flow)
        or facts.get("periodic_cogs") is not None
    )
    cogs_ok = (cogs_state == "recognized" and has_cogs_rows) or (
        cogs_state == "not_required"
        and not has_cogs_rows
        and not any(r.values["role"] == "purchases" for r in flow)
    )
    tax_state = declarations.get("income_tax", {}).get(period.id)
    tax_ok = tax_state in {"recognized", "zero_confirmed"}
    if (
        tax_state == "recognized"
        and not any(r.values["role"] == "income_tax_expense" for r in flow)
        and facts.get("allocated_tax") is None
    ):
        tax_ok = False
    if tax_state == "zero_confirmed" and tax:
        tax_ok = False
    results = []
    for key, value in (
        ("revenue", revenue),
        ("expense", operating + tax),
        ("profit_before_tax", revenue + other_income - operating),
        ("net_profit", revenue + other_income - operating - tax),
    ):
        errors = list(reasons)
        if (
            key in {"expense", "net_profit"}
            and tax
            and facts.get("allocated_tax") is not None
            and tax != amount(facts["allocated_tax"])
        ):
            errors.append("income_tax_conflict")
        if key != "revenue" and not cogs_ok:
            errors.append("cogs_unknown")
        if key in {"expense", "net_profit"} and not tax_ok:
            errors.append("income_tax_unknown")
        results.append(
            result(
                key,
                "ledger",
                None if errors else value,
                flow,
                errors,
                scopes,
                {"posting_controls": facts},
            )
        )
    for key, roles in BALANCE_ROLES.items():
        errors = list(reasons)
        if declarations.get("ledger_opening_complete") is not True:
            errors.append("ledger_opening_unknown")
        openings = [r for r in eligible if r.values["entry_type"] == "opening"]
        if not openings:
            errors.append("ledger_opening_unknown")
        else:
            opening_day = min(day(r.values["date"]) for r in openings)
            issue = coverage_reason("ledger", opening_day, period.cutoff, declarations)
            if issue:
                errors.append(issue)
            if any(day(r.values["date"]) != opening_day for r in openings):
                errors.append("ledger_opening_unknown")
        relevant = [
            r
            for r in eligible
            if r.values["role"] in roles
            and r.values["entry_type"] not in NON_FLOW - {"opening"}
        ]
        balances = defaultdict(lambda: ZERO)
        by_role = defaultdict(lambda: ZERO)
        for row in relevant:
            values = row.values
            if values["role"] in {
                "trade_ar",
                "trade_ap",
                "other_ar",
            } and not values.get("party_id"):
                errors.append("account_role_unknown")
            delta = amount(values["debit"]) - amount(values["credit"])
            if key != "ar_ledger":
                delta = -delta
            balances[(values["account"], values.get("party_id"), values["role"])] += (
                delta
            )
        for (_, _, role), balance in balances.items():
            by_role[role] += max(ZERO, balance)
        value = sum((max(ZERO, v) for v in balances.values()), ZERO)
        details = {
            "by_role": {k: decimal_text(v) for k, v in by_role.items()},
            "opposite_balances": [
                decimal_text(-v) for v in balances.values() if v < ZERO
            ],
            "commercial_value": decimal_text(
                by_role.get("trade_ar" if key == "ar_ledger" else "trade_ap", ZERO)
            ),
        }
        results.append(
            result(
                key,
                "ledger",
                None if errors else value,
                relevant,
                errors,
                scopes,
                details,
            )
        )
    return results
