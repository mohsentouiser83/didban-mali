"""Arithmetic profit bridge; observations are never presented as inferred causes."""

from ..financial.common import ZERO, LIMIT, amount, decimal_text
from .statements import FLOW_SECTIONS


def variance_analysis(current, previous, content, period):
    result = {
        "comparison_starts_on": None,
        "comparison_as_of_date": None,
        "profit_delta": None,
        "drivers": [],
        "reason_codes": [],
        "cash_movements": [],
    }
    if previous is None:
        result["reason_codes"] = ["comparison_missing"]
    else:
        result["comparison_starts_on"] = previous["starts_on"]
        result["comparison_as_of_date"] = previous["as_of_date"]
        now = next(t for t in current["totals"] if t["key"] == "net_profit")
        before = next(t for t in previous["totals"] if t["key"] == "net_profit")
        reasons = list(dict.fromkeys(now["reason_codes"] + before["reason_codes"]))
        result["reason_codes"] = reasons
        if now["value"] is not None and before["value"] is not None:

            def index(statement):
                return {
                    (line["key"], detail["account"]): (line, detail)
                    for line in statement["lines"]
                    if line["section"] in FLOW_SECTIONS
                    for detail in line["details"]
                }

            left, right = index(current), index(previous)
            for key in sorted(set(left) | set(right)):
                line, detail = left.get(key) or right[key]
                new = amount(left[key][1]["value"]) if key in left else ZERO
                old = amount(right[key][1]["value"]) if key in right else ZERO
                effect = (new - old) * (
                    1 if line["section"] in {"revenue", "other_income"} else -1
                )
                if abs(effect) >= LIMIT:
                    result.update(
                        profit_delta=None,
                        drivers=[],
                        reason_codes=["aggregate_out_of_range"],
                    )
                    break
                if effect:
                    result["drivers"].append(
                        {
                            "line_key": key[0],
                            "account": key[1],
                            "label": line["label"],
                            "current": decimal_text(new),
                            "previous": decimal_text(old),
                            "profit_effect": decimal_text(effect),
                            "source_refs": left[key][1]["source_refs"]
                            if key in left
                            else [],
                            "previous_source_refs": right[key][1]["source_refs"]
                            if key in right
                            else [],
                        }
                    )
            if result["reason_codes"]:
                return result
            delta = amount(now["value"]) - amount(before["value"])
            if abs(delta) >= LIMIT:
                result.update(
                    profit_delta=None,
                    drivers=[],
                    reason_codes=["aggregate_out_of_range"],
                )
                return result
            result["profit_delta"] = decimal_text(delta)
            if sum(
                (amount(d["profit_effect"]) for d in result["drivers"]), ZERO
            ) != amount(result["profit_delta"]):
                result.update(
                    profit_delta=None,
                    drivers=[],
                    reason_codes=["variance_control_failed"],
                )
            else:
                result["drivers"].sort(
                    key=lambda d: abs(amount(d["profit_effect"])), reverse=True
                )
    cash = (content.get("cashflow") or {}).get("payload", {})
    result["cash_movements"] = [
        m
        for d in cash.get("days", [])
        if str(period.starts_on) <= d["date"] <= str(period.cutoff)
        for m in d.get("movements", [])
    ]
    return result
