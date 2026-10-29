"""Classified book cash flows with explicit source evidence and an exact bridge."""

from collections import defaultdict
from ..financial.common import ZERO, amount, day, selected, usable
from ..financial.ledger import ledger_metrics, NON_FLOW
from .statements import measure, reference

CASH_ROLES = {"bank", "cash", "cash_equivalent"}
ACTIVITIES = {
    "operating": "فعالیت‌های عملیاتی",
    "investing": "فعالیت‌های سرمایه‌گذاری",
    "financing": "فعالیت‌های تأمین مالی",
}


def cash_flow_statement(rows, period, declared):
    metrics = {m.metric_key: m for m in ledger_metrics(rows, period, declared)}
    reasons = list(metrics["revenue"].reason_codes)
    balance_reasons = list(
        dict.fromkeys(
            reasons
            + [
                r
                for r in metrics["debt_total_ledger"].reason_codes
                if r
                in {"ledger_opening_unknown", "coverage_unknown", "coverage_incomplete"}
            ]
        )
    )
    source = []
    for row in selected(rows, "ledger"):
        try:
            if usable(row) and day(row.values.get("date")) <= period.cutoff:
                amount(row.values.get("debit"))
                amount(row.values.get("credit"))
                source.append(row)
        except ValueError:
            pass
    openings = [
        day(r.values["date"]) for r in source if r.values.get("entry_type") == "opening"
    ]
    if openings and min(openings) > period.starts_on:
        balance_reasons.append("ledger_opening_unknown")
    anchor = min(openings) if openings else period.starts_on
    eligible = [
        r
        for r in source
        if day(r.values["date"]) >= anchor
        and r.values.get("entry_type") not in NON_FLOW - {"opening"}
    ]
    cash = [r for r in eligible if r.values.get("role") in CASH_ROLES]

    def signed(row):
        return amount(row.values["debit"]) - amount(row.values["credit"])

    opening = sum(
        (
            signed(r)
            for r in cash
            if day(r.values["date"]) < period.starts_on
            or r.values.get("entry_type") == "opening"
            and day(r.values["date"]) <= period.starts_on
        ),
        ZERO,
    )
    closing = sum((signed(r) for r in cash), ZERO)
    groups = defaultdict(list)
    for r in eligible:
        if (
            period.starts_on <= day(r.values["date"]) <= period.cutoff
            and r.values.get("entry_type") not in NON_FLOW
        ):
            groups[
                (r.file_id, r.sheet, r.values.get("entry_id"), r.values["date"])
            ].append(r)
    sections = {key: [] for key in ACTIVITIES}
    unknown = []
    internal = 0
    noncash = 0
    for group in groups.values():
        legs = [r for r in group if r.values.get("role") in CASH_ROLES]
        counterpart = [
            r for r in group if r.values.get("role") not in CASH_ROLES and signed(r)
        ]
        if not legs:
            noncash += 1
            continue
        if not counterpart and sum((signed(r) for r in legs), ZERO) == ZERO:
            internal += 1
            continue
        labels = {
            r.values.get("cashflow_activity")
            for r in group
            if r.values.get("cashflow_activity_provenance") == "explicit_source_field"
            and r.values.get("cashflow_activity") in ACTIVITIES
        }
        common = next(iter(labels)) if len(labels) == 1 else None
        for leg in legs:
            label = (
                leg.values.get("cashflow_activity")
                if leg.values.get("cashflow_activity_provenance")
                == "explicit_source_field"
                else None
            )
            label = label or common
            if label in sections:
                sections[label].append(leg)
            else:
                unknown.append(leg)
    known = sum((signed(r) for values in sections.values() for r in values), ZERO)
    unknown_net = sum((signed(r) for r in unknown), ZERO)
    change = closing - opening
    control = change - known - unknown_net
    if control:
        balance_reasons.append("cash_statement_bridge_mismatch")
    classification_reasons = ["cashflow_activity_missing"] if unknown else []
    output = []
    for key, label in ACTIVITIES.items():
        value = sum((signed(r) for r in sections[key]), ZERO)
        output.append(
            {
                "key": key,
                "label": label,
                "net": measure(value, reasons + classification_reasons),
                "classified_net": measure(value, reasons),
                "source_refs": [reference(r) for r in sections[key]],
            }
        )
    codes = list(dict.fromkeys(balance_reasons + classification_reasons))
    return {
        "formula_version": "cash-statement-v1",
        "basis": "ledger",
        "status": "unavailable" if reasons else "limited" if codes else "available",
        "reason_codes": codes,
        "opening": measure(opening, balance_reasons),
        "closing": measure(closing, balance_reasons),
        "change": measure(change, balance_reasons),
        "control": measure(control, balance_reasons),
        "sections": output,
        "unclassified_net": measure(unknown_net, reasons),
        "unclassified_count": len(unknown),
        "unclassified_refs": [reference(r) for r in unknown],
        "internal_entries_excluded": internal,
        "noncash_entries_excluded": noncash,
    }
