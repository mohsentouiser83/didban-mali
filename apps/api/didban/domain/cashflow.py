"""Exact period cashflow, using validated bank anchors and explicit transfer proof."""

from __future__ import annotations
from collections import defaultdict
from datetime import timedelta
from decimal import localcontext
from .financial.bank import cash_metric
from .financial.common import amount, day, decimal_text, usable
from .financial.types import FinancialRow, PeriodSpec


def period_cashflow(
    rows: list[FinancialRow],
    period: PeriodSpec,
    declarations: dict,
    bank_ids: dict[str, str],
    classifications: dict[str, str],
) -> dict:
    with localcontext() as ctx:
        ctx.prec = 96
        return _period_cashflow(rows, period, declarations, bank_ids, classifications)


def _period_cashflow(rows, period, declarations, bank_ids, classifications):
    bank = [r for r in rows if r.kind == "bank"]
    bindings = declarations.get("bank_bindings", {})
    groups = defaultdict(list)
    names = {}
    for row in bank:
        group = row.file_id + ":" + row.sheet
        identity = bindings.get(group) or group
        names[identity] = bindings.get(group) or row.sheet
        groups[identity].append(row)
    accounts = []
    ends = {}
    anchors = {}
    for identity, records in groups.items():
        if identity not in bindings.values():
            value = None
            reasons = ["bank_binding_unknown"]
        else:
            scoped = {**declarations, "bank_accounts": [identity]}
            metric = cash_metric(records, period, scoped)
            value = metric.value
            reasons = list(metric.reason_codes)
            if value is not None:
                ends[identity] = amount(value)
                anchors[identity] = declarations["bank_anchors"][identity]
        accounts.append(
            {
                "bank_account_id": bank_ids.get(identity),
                "name": names[identity],
                "as_of_date": period.cutoff.isoformat(),
                "balance": value,
                "status": "available" if value is not None else "unavailable",
                "reason_codes": reasons,
                "evidence_refs": [],
            }
        )
    total = cash_metric(rows, period, declarations)
    daily = defaultdict(list)
    invalid = any(not usable(r) for r in bank)
    for row in bank:
        # A validated signed transaction needs no optional row-type column.
        # Explicit opening rows remain balance evidence, never recorded flow.
        if not usable(row) or row.values.get("row_type", "movement") != "movement":
            continue
        when = day(row.values["date"])
        identity = (
            bindings.get(row.file_id + ":" + row.sheet) or row.file_id + ":" + row.sheet
        )
        movement = amount(row.values["amount"])
        if period.starts_on <= when <= period.cutoff:
            daily[when].append((row, identity, movement))
    # Reverse prefix balances avoid recomputing all source rows for every day.
    if (period.cutoff - period.starts_on).days > 3660:
        return {
            "accounts": accounts,
            "days": [],
            "formula_version": "cashflow-period-v1.0",
            "reason_codes": ["period_range_limit"],
        }
    current = period.cutoff
    balances = dict(ends)
    computed = {}
    account_computed = {}
    while current >= period.starts_on - timedelta(days=1):
        known = bool(groups) and len(ends) == len(groups) and total.value is not None
        for identity in groups:
            anchor = anchors.get(identity)
            if not anchor or current < day(anchor["date"]):
                known = False
        computed[current] = sum(balances.values()) if known else None
        account_computed[current] = {
            identity: balance
            if identity in anchors and current >= day(anchors[identity]["date"])
            else None
            for identity, balance in balances.items()
        }
        for _, identity, movement in daily.get(current, []):
            if identity in balances:
                balances[identity] -= movement
        current -= timedelta(days=1)
    days = []
    current = period.starts_on
    while current <= period.cutoff:
        moves = daily[current]
        reasons = []
        opening = computed.get(current - timedelta(days=1))
        closing = computed[current]
        if opening is None and groups and total.value is not None:
            opening_values = []
            for identity in groups:
                anchor = anchors.get(identity, {})
                value = (
                    amount(anchor["balance"])
                    if anchor.get("date") == current.isoformat()
                    and anchor.get("cutoff") == "start_of_day"
                    else account_computed.get(current - timedelta(days=1), {}).get(
                        identity
                    )
                )
                opening_values.append(value)
            if all(v is not None for v in opening_values):
                opening = sum(opening_values)
        if closing is None:
            reasons.extend(total.reason_codes or ("bank_anchor_unknown",))
        if not bank:
            reasons.append("source_missing")
        if invalid:
            reasons.append("invalid_rows")
        inflow = sum(v for _, _, v in moves if v > 0)
        outflow = -sum(v for _, _, v in moves if v < 0)
        split_known = (
            bool(bank)
            and not invalid
            and all(
                classifications.get(r.normalized_id) in ("external", "internal")
                for r, _, _ in moves
            )
        )
        # Empty dates are only known empty within explicitly complete bank coverage.
        coverage_complete = all(
            c.get("state") == "complete" for c in total.coverage
        ) and bool(total.coverage)
        if not moves and not coverage_complete:
            split_known = False
        if not split_known:
            reasons.append("transfer_scope_unknown")
        if any(
            v is not None and abs(v) >= 10**32
            for v in (opening, closing, inflow, outflow, inflow - outflow)
        ):
            reasons.append("aggregate_out_of_range")
        external_in = sum(
            v
            for r, _, v in moves
            if v > 0 and classifications.get(r.normalized_id) == "external"
        )
        external_out = -sum(
            v
            for r, _, v in moves
            if v < 0 and classifications.get(r.normalized_id) == "external"
        )
        internal = sum(
            v for r, _, v in moves if classifications.get(r.normalized_id) == "internal"
        )

        def bounded(value):
            return (
                decimal_text(value)
                if value is not None and abs(value) < 10**32
                else None
            )

        gross_in = None if invalid or not bank else bounded(inflow)
        gross_out = None if invalid or not bank else bounded(outflow)
        record = {
            "date": current.isoformat(),
            "opening": bounded(opening),
            "closing": bounded(closing),
            "inflow_recorded": gross_in,
            "outflow_recorded": gross_out,
            "net_recorded": None
            if gross_in is None or gross_out is None
            else bounded(inflow - outflow),
            "inflow_external": bounded(external_in) if split_known else None,
            "outflow_external": bounded(external_out) if split_known else None,
            "internal_net": bounded(internal) if split_known else None,
            "status": "available"
            if not reasons
            else "limited"
            if gross_in is not None
            else "unavailable",
            "reason_codes": list(dict.fromkeys(reasons)),
            "evidence_refs": [],
            "movements": [
                {
                    "source_row_id": r.source_row_id,
                    "source_file_id": r.file_id,
                    "sheet_name": r.sheet,
                    "row_number": r.row_number,
                    "account_name": names[i],
                    "date": current.isoformat(),
                    "amount": decimal_text(v),
                    "reference": r.values.get("reference"),
                }
                for r, i, v in moves
            ],
        }
        days.append(record)
        current += timedelta(days=1)
    return {
        "accounts": accounts,
        "days": days,
        "formula_version": "cashflow-period-v1.0",
        "reason_codes": [],
    }
