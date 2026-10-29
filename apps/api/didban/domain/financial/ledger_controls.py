"""Financial facts derived only from independently checked source posting patterns."""

from decimal import Decimal, localcontext
from .common import usable, day, amount, decimal_text

POLICY = "ledger-posting-controls-v1"


def posting_facts(rows, period):
    with localcontext() as context:
        context.prec = 96
        source = [
            row
            for row in rows
            if row.kind == "ledger" and row.state != "excluded_overlap"
        ]
        if not source or any(not usable(row) for row in source):
            return {}
        flow = [
            row
            for row in source
            if period.starts_on <= day(row.values["date"]) <= period.cutoff
        ]
        purchases = [
            row
            for row in flow
            if row.values.get("role") == "purchases"
            and row.values.get("entry_type") == "regular"
        ]
        inventory = [
            row
            for row in flow
            if row.values.get("role") == "inventory"
            and row.values.get("periodic_inventory_transfer") is True
            and row.values.get("entry_type") == "real_cogs_adjustment"
            and row.values.get("entry_evidence") == "balanced_nominal_account_reversal"
        ]
        facts = {"policy": POLICY}
        if (
            purchases
            and inventory
            and not any(row.values.get("role") == "cogs" for row in flow)
            and all(
                row.values.get("role_controls_passed") is True
                for row in purchases + inventory
            )
        ):
            cost = sum(
                (
                    amount(row.values["debit"]) - amount(row.values["credit"])
                    for row in purchases
                ),
                Decimal(0),
            )
            adjustment = sum(
                (
                    amount(row.values["debit"]) - amount(row.values["credit"])
                    for row in inventory
                ),
                Decimal(0),
            )
            if cost - adjustment >= 0:
                facts["periodic_cogs"] = decimal_text(cost - adjustment)
                facts["cogs_rows"] = [
                    row.normalized_id for row in purchases + inventory
                ]
        allocated = [
            row
            for row in flow
            if row.values.get("income_tax_charge")
            and row.values.get("entry_evidence") == "balanced_current_profit_allocation"
            and row.values.get("entry_type") == "real_adjustment"
        ]
        if allocated:
            facts["allocated_tax"] = decimal_text(
                sum(
                    (amount(row.values["income_tax_charge"]) for row in allocated),
                    Decimal(0),
                )
            )
            facts["tax_rows"] = [row.normalized_id for row in allocated]
        opening = [
            row
            for row in source
            if row.values.get("entry_type") == "opening"
            and row.values.get("entry_evidence") == "balanced_explicit_opening_label"
        ]
        closing = [
            row
            for row in source
            if row.values.get("entry_type") == "closing_transfer"
            and row.values.get("entry_evidence")
            == "complete_reversal_of_source_account_balances"
        ]
        if (
            opening
            and closing
            and {day(row.values["date"]) for row in opening} == {period.starts_on}
        ):
            facts["source_opening_verified"] = True
            facts["opening_rows"] = [row.normalized_id for row in opening]
        return facts
