from collections import defaultdict

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


def cash_metric(
    rows: list[FinancialRow], period: PeriodSpec, declarations: dict
) -> MetricResult:
    source = selected(rows, "bank")
    errors = []
    if not source:
        errors.append("source_missing")
    grouped = defaultdict(list)
    source_accounts = defaultdict(set)
    for row in source:
        if row.values.get("bank_account"):
            source_accounts[(row.file_id, row.sheet)].add(
                str(row.values["bank_account"])
            )
    for row in source:
        if len(source_accounts[(row.file_id, row.sheet)]) > 1:
            errors.append("bank_source_accounts_ambiguous")
            continue
        identity = declarations.get("bank_bindings", {}).get(
            f"{row.file_id}:{row.sheet}"
        )
        if not isinstance(identity, str) or not identity.strip():
            errors.append("bank_binding_unknown")
            continue
        grouped[identity].append(row)
    declared_accounts = declarations.get("bank_accounts")
    if not isinstance(declared_accounts, list) or set(declared_accounts) != set(
        grouped
    ):
        errors.append("bank_binding_unknown")
    balances = {}
    used = []
    for identity, records in grouped.items():
        anchor = declarations.get("bank_anchors", {}).get(identity, {})
        try:
            anchor_day = day(anchor.get("date"))
            balance = amount(anchor.get("balance"))
            cutoff = anchor.get("cutoff")
            if cutoff not in {"start_of_day", "end_of_day"}:
                raise UnsafeFinancialData("bank_cutoff_unknown")
            if anchor_day > period.cutoff:
                raise UnsafeFinancialData("bank_anchor_unknown")
            issue = coverage_reason("bank", anchor_day, period.cutoff, declarations)
            if issue:
                errors.append(issue)
            openings = []
            moves = []
            for row in records:
                when = day(row.values.get("date"))
                if when > period.cutoff:
                    continue
                if not usable(row):
                    raise UnsafeFinancialData("invalid_rows")
                if row.values.get("row_type") == "opening":
                    openings.append(row)
                    continue
                if row.values.get("row_type") != "movement":
                    raise UnsafeFinancialData("invalid_rows")
                movement = amount(row.values.get("amount"))
                if when > anchor_day or (
                    when == anchor_day and cutoff == "start_of_day"
                ):
                    moves.append((row, movement))
            matching = [
                r
                for r in openings
                if day(r.values["date"]) == anchor_day
                and amount(r.values.get("balance")) == balance
            ]
            # An explicit anchor is a user assertion; the independently observed
            # running balance is checked wherever the source supplies one.
            if openings and not matching:
                raise UnsafeFinancialData("bank_balance_mismatch")
            for row, movement in sorted(
                moves,
                key=lambda item: (day(item[0].values["date"]), item[0].row_number),
            ):
                balance += movement
                if (
                    row.values.get("balance") is not None
                    and amount(row.values["balance"]) != balance
                ):
                    raise UnsafeFinancialData("bank_balance_mismatch")
                used.append(row)
            used.extend(matching)
            balances[identity] = balance
        except UnsafeFinancialData as exc:
            code = str(exc)
            errors.append(
                "bank_anchor_unknown"
                if code in {"invalid_date", "invalid_amount"}
                else code
            )
    total = sum(balances.values(), ZERO)
    return result(
        "cash",
        "bank",
        None if errors else total,
        used,
        errors,
        coverage("bank", period.starts_on, period.cutoff, declarations),
        {
            "accounts": {key: decimal_text(value) for key, value in balances.items()},
            "anchor_provenance": declarations.get("bank_anchors", {}),
        },
    )
