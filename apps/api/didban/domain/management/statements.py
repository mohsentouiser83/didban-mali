"""Signed balances, complete account mappings and independently gated totals."""

from collections import defaultdict
from ..financial.common import ZERO, LIMIT, amount, day, decimal_text, selected, usable
from ..financial.ledger import ledger_metrics, NON_FLOW
from ..financial.ledger_controls import posting_facts

SECTIONS = {
    "revenue": ("درآمد عملیاتی", {"revenue"}, -1),
    "cogs": ("بهای تمام‌شده", {"cogs", "purchases"}, 1),
    "expense": ("هزینه‌های عملیاتی", {"expense"}, 1),
    "other_income": ("سایر درآمدها", {"other_income"}, -1),
    "income_tax": ("مالیات عملکرد", {"income_tax_expense"}, 1),
    "asset": (
        "دارایی‌ها",
        {
            "bank",
            "cash",
            "cash_equivalent",
            "trade_ar",
            "other_ar",
            "inventory",
            "vat_receivable",
            "fixed_asset",
            "other_asset",
            "contra_asset",
        },
        1,
    ),
    "liability": (
        "بدهی‌ها",
        {
            "trade_ap",
            "loan_payable",
            "tax_payable",
            "payroll_payable",
            "other_liability",
            "vat_payable",
        },
        -1,
    ),
    "equity": ("حقوق مالکانه ثبت‌شده", {"capital", "other_equity"}, -1),
}
FLOW_SECTIONS = {"revenue", "cogs", "expense", "other_income", "income_tax"}
ROLE_SECTION = {
    role: section for section, (_, roles, _) in SECTIONS.items() for role in roles
}


def measure(value, reasons=()):
    reasons = list(dict.fromkeys(reasons))
    if value is not None and abs(value) >= LIMIT:
        value = None
        reasons.append("aggregate_out_of_range")
    return {
        "value": None if reasons or value is None else decimal_text(value),
        "status": "unavailable" if reasons or value is None else "available",
        "reason_codes": reasons,
    }


def reference(row):
    return {
        "normalized_id": row.normalized_id,
        "source_row_id": row.source_row_id,
        "source_file_id": row.file_id,
        "file_name": row.source_name,
        "sheet_name": row.sheet,
        "row_number": row.row_number,
        "date": row.values.get("date"),
        "account": row.values.get("account"),
        "debit": row.values.get("debit"),
        "credit": row.values.get("credit"),
    }


def ledger_statements(rows, period, declared, template=None):
    posting = posting_facts(rows, period)
    metrics = {m.metric_key: m for m in ledger_metrics(rows, period, declared)}
    flow_reasons = list(metrics["revenue"].reason_codes)
    balance_reasons = list(metrics["debt_total_ledger"].reason_codes)
    # COGS/tax limitations affect profit components, not unrelated asset balances.
    cogs_reasons = [
        r for r in metrics["profit_before_tax"].reason_codes if r == "cogs_unknown"
    ]
    tax_reasons = [
        r
        for r in metrics["net_profit"].reason_codes
        if r in {"income_tax_unknown", "income_tax_conflict"}
    ]
    known_accounts = {
        r.values.get("account")
        for r in selected(rows, "ledger")
        if usable(r)
        and r.values.get("role") in ROLE_SECTION
        and r.values.get("account")
    }
    eligible = []
    for row in selected(rows, "ledger"):
        try:
            if usable(row) and day(row.values.get("date")) <= period.cutoff:
                # Validation of entry type, balance and role is inherited from ledger_metrics.
                amount(row.values.get("debit"))
                amount(row.values.get("credit"))
                eligible.append(row)
        except ValueError:
            pass
    opening_dates = [
        day(r.values["date"])
        for r in eligible
        if r.values.get("entry_type") == "opening"
    ]
    opening_day = min(opening_dates) if opening_dates else period.starts_on
    accounts = sorted({r.values.get("account", "") for r in eligible})
    definitions = (template or {}).get("lines") or [
        {"key": key, "label": title, "section": key, "accounts": []}
        for key, (title, _, _) in SECTIONS.items()
    ]
    mapped = {account for line in definitions for account in line["accounts"]}
    unmapped = sorted(set(accounts) - mapped) if template else []
    if unmapped:
        flow_reasons.append("template_accounts_unmapped")
        balance_reasons.append("template_accounts_unmapped")
    lines = []
    for definition in definitions:
        section = definition["section"]
        _, roles, sign = SECTIONS[section]
        targets = set(definition["accounts"])
        matching = (
            [r for r in eligible if r.values.get("account") in targets]
            if template
            else [r for r in eligible if r.values.get("role") in roles]
        )
        reasons = list(flow_reasons if section in FLOW_SECTIONS else balance_reasons)
        if template:
            if targets - known_accounts:
                reasons.append("template_account_missing")
            if any(ROLE_SECTION.get(r.values.get("role")) != section for r in matching):
                reasons.append("template_role_conflict")
        if section in FLOW_SECTIONS:
            matching = [
                r
                for r in matching
                if day(r.values["date"]) >= period.starts_on
                and r.values.get("entry_type") not in NON_FLOW
            ]
        else:
            matching = [
                r
                for r in matching
                if r.values.get("entry_type") not in {"closing", "closing_transfer"}
                and day(r.values["date"]) >= opening_day
            ]
        if section == "cogs":
            reasons += cogs_reasons
        if section == "income_tax":
            reasons += tax_reasons
        balances = defaultdict(lambda: ZERO)
        references = defaultdict(list)
        for r in matching:
            balances[r.values["account"]] += sign * (
                amount(r.values["debit"]) - amount(r.values["credit"])
            )
            references[r.values["account"]].append(reference(r))
        additions = []
        if section == "cogs" and posting.get("periodic_cogs") is not None:
            if template:
                reasons.append("periodic_cogs_template_scope")
            else:
                additions = [
                    r
                    for r in eligible
                    if r.normalized_id in posting["cogs_rows"]
                    and r.values.get("periodic_inventory_transfer")
                ]
                for r in additions:
                    balances[r.values["account"]] -= amount(r.values["debit"]) - amount(
                        r.values["credit"]
                    )
                    references[r.values["account"]].append(reference(r))
        if (
            section == "income_tax"
            and posting.get("allocated_tax") is not None
            and not matching
        ):
            if template:
                reasons.append("allocated_tax_template_scope")
            else:
                additions = [
                    r for r in eligible if r.normalized_id in posting["tax_rows"]
                ]
                for r in additions:
                    balances[r.values["account"]] += amount(
                        r.values["income_tax_charge"]
                    )
                    references[r.values["account"]].append(reference(r))
        lines.append(
            {
                **definition,
                **measure(sum(balances.values(), ZERO), reasons),
                "details": [
                    {
                        "account": account,
                        **measure(value, reasons),
                        "source_refs": references[account],
                    }
                    for account, value in sorted(balances.items())
                ],
            }
        )

    # Balance-sheet earnings cover all retained flows since the opening anchor;
    # the P&L above only covers the selected reporting interval.
    earnings = ZERO
    for r in eligible:
        section = ROLE_SECTION.get(r.values.get("role"))
        if (
            section in FLOW_SECTIONS
            and r.values.get("entry_type") not in NON_FLOW - {"profit_loss_transfer"}
            and day(r.values["date"]) >= opening_day
        ):
            earnings += amount(r.values["credit"]) - amount(r.values["debit"])
    return assemble_statement(
        lines,
        period,
        accounts,
        unmapped,
        earnings,
        balance_reasons + cogs_reasons + tax_reasons,
    )


def assemble_statement(lines, period, accounts, unmapped, earnings, earnings_reasons):
    def total(key, label, coefficients):
        selected_lines = [line for line in lines if line["section"] in coefficients]
        reasons = [code for line in selected_lines for code in line["reason_codes"]]
        if not set(coefficients) <= {line["section"] for line in lines}:
            reasons.append("template_section_missing")
        value = sum(
            (
                amount(line["value"]) * coefficients[line["section"]]
                for line in selected_lines
                if line["value"] is not None
            ),
            ZERO,
        )
        return {"key": key, "label": label, **measure(value, reasons)}

    totals = [
        total("gross_profit", "سود ناخالص", {"revenue": 1, "cogs": -1}),
        total(
            "operating_profit", "سود عملیاتی", {"revenue": 1, "cogs": -1, "expense": -1}
        ),
        total(
            "profit_before_tax",
            "سود پیش از مالیات",
            {"revenue": 1, "cogs": -1, "expense": -1, "other_income": 1},
        ),
        total(
            "net_profit",
            "سود خالص",
            {
                "revenue": 1,
                "cogs": -1,
                "expense": -1,
                "other_income": 1,
                "income_tax": -1,
            },
        ),
        total("assets", "جمع دارایی‌ها", {"asset": 1}),
        total("liabilities", "جمع بدهی‌ها", {"liability": 1}),
        total("recorded_equity", "حقوق مالکانه ثبت‌شده", {"equity": 1}),
    ]
    totals.append(
        {
            "key": "unclosed_earnings",
            "label": "نتیجه انباشته اسناد باز",
            **measure(earnings, earnings_reasons),
        }
    )
    by_key = {t["key"]: t for t in totals}
    check_keys = ("assets", "liabilities", "recorded_equity", "unclosed_earnings")
    check_reasons = [code for key in check_keys for code in by_key[key]["reason_codes"]]
    difference = sum(
        (
            amount(by_key[key]["value"]) * (1 if key == "assets" else -1)
            for key in check_keys
            if by_key[key]["value"] is not None
        ),
        ZERO,
    )
    control = measure(difference, check_reasons)
    if control["value"] is not None and difference != ZERO:
        control = measure(None, ["balance_sheet_unbalanced"])
    return {
        "starts_on": str(period.starts_on),
        "as_of_date": str(period.cutoff),
        "lines": lines,
        "totals": totals,
        "balance_control": control,
        "unmapped_accounts": unmapped,
        "available_accounts": accounts,
    }


def financial_statements(rows, period, declared, template=None, basis="ledger"):
    if basis == "trial_balance":
        from .trial_balance import trial_balance_statements

        return trial_balance_statements(rows, period, declared, template)
    return ledger_statements(rows, period, declared, template)
