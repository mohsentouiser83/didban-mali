"""Bank cash and booked ledger activity stay distinct and never get added twice."""

from collections import defaultdict
from datetime import timedelta
from ..financial.common import ZERO, amount, day, usable, selected
from ..financial.ledger import ledger_metrics, NON_FLOW
from .statements import measure, reference


def daily_reports(content, rows, period, declared):
    bank_days = {
        d["date"]: d
        for d in (content.get("cashflow") or {}).get("payload", {}).get("days", [])
    }
    ledger = defaultdict(list)
    metrics = {m.metric_key: m for m in ledger_metrics(rows, period, declared)}
    base_reasons = list(metrics["revenue"].reason_codes)
    for row in selected(rows, "ledger"):
        try:
            if (
                usable(row)
                and row.values.get("entry_type") not in NON_FLOW
                and period.starts_on <= day(row.values.get("date")) <= period.cutoff
            ):
                ledger[row.values["date"]].append(row)
        except ValueError:
            pass
    days = []
    current = period.starts_on
    while current <= period.cutoff:
        date = str(current)
        movements = ledger[date]
        cash = bank_days.get(date)
        reasons = (
            ["bank_source_missing"] if cash is None else cash.get("reason_codes", [])
        )
        entries = [
            r
            for r in movements
            if r.values.get("role") in {"expense", "cogs", "income_tax_expense"}
        ]
        expense = sum(
            (amount(r.values["debit"]) - amount(r.values["credit"]) for r in entries),
            ZERO,
        )
        days.append(
            {
                "date": date,
                "opening": (cash or {}).get("opening"),
                "closing": (cash or {}).get("closing"),
                "inflow_recorded": (cash or {}).get("inflow_recorded"),
                "outflow_recorded": (cash or {}).get("outflow_recorded"),
                "inflow_external": (cash or {}).get("inflow_external"),
                "outflow_external": (cash or {}).get("outflow_external"),
                "net_recorded": (cash or {}).get("net_recorded"),
                "cash_reason_codes": reasons,
                "booked_expense": measure(expense, base_reasons),
                "expense_source_refs": [reference(r) for r in entries],
                "movements": (cash or {}).get("movements", []),
            }
        )
        current += timedelta(days=1)
    forecast = (content.get("forecast") or {}).get("content") or {}
    upcoming = (
        [d for d in forecast.get("days", []) if d["date"] > str(period.cutoff)][:7]
        if str(period.cutoff) == str(content["manifest"]["as_of_date"])
        else []
    )
    return {
        "days": days,
        "upcoming": upcoming,
        "upcoming_reason_codes": list(
            dict.fromkeys(
                code
                for forecast_day in upcoming
                for code in forecast_day.get("reason_codes", [])
            )
        )
        if upcoming
        else ["forecast_date_or_sources_missing"],
    }
