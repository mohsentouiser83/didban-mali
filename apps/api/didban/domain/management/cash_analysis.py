"""An exact cash-change bridge independent of profit and invoice accounting."""

from collections import defaultdict
from ..financial.common import ZERO, amount
from .statements import measure


def cash_analysis(content, period):
    days = [
        d
        for d in (content.get("cashflow") or {}).get("payload", {}).get("days", [])
        if str(period.starts_on) <= d["date"] <= str(period.cutoff)
    ]
    complete = len(days) == (period.cutoff - period.starts_on).days + 1 and all(
        d.get("net_recorded") is not None for d in days
    )
    reasons = [] if complete else ["cash_movement_coverage_unknown"]
    opening = days[0].get("opening") if days else None
    closing = days[-1].get("closing") if days else None
    balances_known = opening is not None and closing is not None
    balance_reasons = reasons + ([] if balances_known else ["bank_anchor_unknown"])
    net = sum(
        (amount(d["net_recorded"]) for d in days if d.get("net_recorded") is not None),
        ZERO,
    )
    delta = amount(closing) - amount(opening) if balances_known else None
    movements = [m for d in days for m in d.get("movements", [])]
    if complete and (
        sum((amount(m["amount"]) for m in movements), ZERO) != net
        or balances_known
        and net != delta
    ):
        balance_reasons.append("cash_bridge_control_failed")
        reasons.append("cash_bridge_control_failed")
    split_known = complete and all(
        d.get("inflow_external") is not None and d.get("outflow_external") is not None
        for d in days
    )
    split_reasons = [] if split_known else ["transfer_scope_unknown"]
    groups = defaultdict(list)
    for movement in movements:
        groups[
            (
                movement["source_file_id"],
                movement["sheet_name"],
                movement["account_name"],
            )
        ].append(movement)
    drivers = []
    for key, refs in sorted(groups.items()):
        value = sum((amount(m["amount"]) for m in refs), ZERO)
        drivers.append(
            {
                "key": ":".join(str(k) for k in key),
                "label": key[2],
                "sheet_name": key[1],
                **measure(value, reasons),
                "source_refs": refs,
            }
        )
    return {
        "opening": measure(
            amount(opening) if opening is not None else None,
            [] if opening is not None else ["bank_anchor_unknown"],
        ),
        "closing": measure(
            amount(closing) if closing is not None else None,
            [] if closing is not None else ["bank_anchor_unknown"],
        ),
        "change": measure(delta, balance_reasons),
        "inflow": measure(
            sum(
                (
                    amount(d["inflow_recorded"])
                    for d in days
                    if d.get("inflow_recorded") is not None
                ),
                ZERO,
            ),
            reasons,
        ),
        "outflow": measure(
            sum(
                (
                    amount(d["outflow_recorded"])
                    for d in days
                    if d.get("outflow_recorded") is not None
                ),
                ZERO,
            ),
            reasons,
        ),
        "external_inflow": measure(
            sum(
                (
                    amount(d["inflow_external"])
                    for d in days
                    if d.get("inflow_external") is not None
                ),
                ZERO,
            ),
            split_reasons,
        ),
        "external_outflow": measure(
            sum(
                (
                    amount(d["outflow_external"])
                    for d in days
                    if d.get("outflow_external") is not None
                ),
                ZERO,
            ),
            split_reasons,
        ),
        "drivers": drivers,
    }
