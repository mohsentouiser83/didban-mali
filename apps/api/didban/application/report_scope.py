"""Project a requested report interval without changing its source manifest."""

from dataclasses import asdict
from ..domain.financial import calculate


def pin_report_metrics(content: dict, rows, period, previous, declared) -> None:
    """Keep original metric IDs/evidence as reference, not as shorter-period values."""
    manifest = content["manifest"]
    if str(period.starts_on) == str(manifest["starts_on"]) and str(
        period.cutoff
    ) == str(manifest["as_of_date"]):
        return
    projected = calculate(rows, period, previous, declared)
    content["manifest_metrics"] = content["metrics"]
    content["metrics"] = [asdict(metric) for metric in projected]
    content["report_scope"] = {
        "starts_on": str(period.starts_on),
        "as_of_date": str(period.cutoff),
        "reference_as_of_date": str(manifest["as_of_date"]),
        "metric_basis": "pinned_dataset_rows",
    }


def pin_trial_balance_metrics(content, management):
    """Trial-balance P&L is separately labelled; it never overwrites core manifests."""
    if management.get("statement_basis") != "trial_balance":
        return
    statement = management["statements"]
    totals = {row["key"]: row for row in statement["totals"]}
    revenues = [line for line in statement["lines"] if line["section"] == "revenue"]
    expenses = [
        line
        for line in statement["lines"]
        if line["section"] in {"cogs", "expense", "income_tax"}
    ]
    from ..domain.management.statements import measure
    from ..domain.financial.common import amount, ZERO
    from decimal import localcontext

    with localcontext() as context:
        context.prec = 96

        def total(lines, required):
            return measure(
                sum(
                    (
                        amount(line["value"])
                        for line in lines
                        if line["value"] is not None
                    ),
                    ZERO,
                ),
                [code for line in lines for code in line["reason_codes"]]
                + (
                    []
                    if required <= {line["section"] for line in lines}
                    else ["template_section_missing"]
                ),
            )

        flow = {
            "revenue": total(revenues, {"revenue"}),
            "expense": total(expenses, {"expense", "cogs", "income_tax"}),
            "net_profit": totals["net_profit"],
            "profit_before_tax": totals["profit_before_tax"],
        }
    content.setdefault("manifest_metrics", content["metrics"])
    content["metrics"] = [
        metric for metric in content["metrics"] if metric["metric_key"] not in flow
    ] + [
        {
            "metric_key": key,
            "basis": "trial_balance",
            "value": value["value"],
            "status": value["status"],
            "reason_codes": value["reason_codes"],
            "evidence": [
                {
                    "rule_key": "management.trial_balance." + key + ".v2",
                    "source_row_ids": sorted(
                        {
                            ref["source_row_id"]
                            for line in statement["lines"]
                            for detail in line["details"]
                            for ref in detail["source_refs"]
                        }
                    ),
                    "fact_values": [] if value["value"] is None else [value["value"]],
                    "facts": {
                        "starts_on": management["starts_on"],
                        "as_of_date": management["as_of_date"],
                        "reason_codes": value["reason_codes"],
                    },
                }
            ],
        }
        for key, value in flow.items()
    ]
    content["report_scope"] = {
        "starts_on": management["starts_on"],
        "as_of_date": management["as_of_date"],
        "reference_as_of_date": content["manifest"]["as_of_date"],
        "metric_basis": "trial_balance",
    }
