"""Period balances and flow scope over the independent synthetic financial reference."""

from copy import deepcopy
from dataclasses import replace
from datetime import date
import unittest
from test_financial_domain import baseline, CURRENT
from didban.domain.cashflow import period_cashflow
from didban.domain.financial.types import FinancialRow, PeriodSpec


class CashflowDomainTests(unittest.TestCase):
    def test_optional_row_type_counts_signed_flow_without_inventing_balance(self):
        period = PeriodSpec("sep", date(2026, 9, 1), date(2026, 9, 1))
        movement = FinancialRow(
            "movement",
            "source",
            "file",
            "interpretation",
            "bank",
            2,
            "bank",
            {"date": "2026-09-01", "amount": "100", "reference": "R1", "unit": "IRR"},
        )
        opening = replace(
            movement,
            normalized_id="opening",
            source_row_id="anchor",
            row_number=3,
            values={
                "row_type": "opening",
                "date": "2026-09-01",
                "amount": "900",
                "unit": "IRR",
            },
        )
        actual = period_cashflow([movement, opening], period, {}, {}, {})["days"][0]
        self.assertEqual(actual["inflow_recorded"], "100")
        self.assertEqual(actual["outflow_recorded"], "0")
        self.assertEqual(actual["net_recorded"], "100")
        self.assertIsNone(actual["opening"])
        self.assertIsNone(actual["closing"])
        self.assertIsNone(actual["inflow_external"])
        self.assertEqual([m["source_row_id"] for m in actual["movements"]], ["source"])

    def test_reference_daily_prefix_and_external_split_with_explicit_proof(self):
        rows, declared = baseline()
        classification = {
            r.normalized_id: "internal"
            if r.values.get("reference") == "TRANSFER1"
            else "external"
            for r in rows
            if r.kind == "bank" and r.values.get("row_type") == "movement"
        }
        actual = period_cashflow(rows, CURRENT, declared, {}, classification)
        self.assertEqual(len(actual["days"]), 30)
        self.assertEqual(actual["days"][0]["opening"], "1900")
        self.assertEqual(actual["days"][-1]["closing"], "2798")
        from decimal import Decimal

        self.assertEqual(
            sum(Decimal(d["inflow_external"]) for d in actual["days"]), 1400
        )
        self.assertEqual(
            sum(Decimal(d["outflow_external"]) for d in actual["days"]), 502
        )
        self.assertEqual(sum(Decimal(d["internal_net"]) for d in actual["days"]), 0)

    def test_unproved_transfers_keep_external_split_unknown_not_zero(self):
        rows, declared = baseline()
        actual = period_cashflow(rows, CURRENT, declared, {}, {})
        day = next(d for d in actual["days"] if d["date"] == "2026-09-08")
        self.assertIsNone(day["inflow_external"])
        self.assertIsNone(day["outflow_external"])
        self.assertEqual(day["inflow_recorded"], "200")
        self.assertEqual(day["outflow_recorded"], "202")
        self.assertEqual(day["net_recorded"], "-2")
        self.assertEqual(day["closing"], "2098")

    def test_missing_anchor_does_not_erase_valid_recorded_flow(self):
        rows, declared = baseline()
        declared = deepcopy(declared)
        declared["bank_anchors"].pop("bank_a")
        result = period_cashflow(rows, CURRENT, declared, {}, {})
        self.assertIsNone(result["days"][-1]["closing"])
        self.assertTrue(
            any(d["inflow_recorded"] not in (None, "0") for d in result["days"])
        )

    def test_prior_future_events_not_in_period_and_missing_bank_not_empty_zero(self):
        rows, declared = baseline()
        actual = period_cashflow(rows, CURRENT, declared, {}, {})
        self.assertFalse(
            any(
                m["reference"] == "AFTER1"
                for d in actual["days"]
                for m in d["movements"]
            )
        )
        missing = period_cashflow([], CURRENT, declared, {}, {})
        self.assertTrue(
            all(
                d["closing"] is None and d["inflow_recorded"] is None
                for d in missing["days"]
            )
        )

    def test_end_of_day_anchor_does_not_count_same_day_twice(self):
        rows, declared = baseline()
        declared = deepcopy(declared)
        for key, value in [("bank_a", "1998"), ("bank_b", "900")]:
            declared["bank_anchors"][key] = {
                "date": "2026-10-03",
                "cutoff": "end_of_day",
                "balance": value,
            }
        # Synthetic row update maintains a matching observed opening for this cutoff.
        source = [
            replace(
                r,
                values={
                    **r.values,
                    "date": "2026-10-03",
                    "balance": declared["bank_anchors"][
                        declared["bank_bindings"][r.file_id + ":" + r.sheet]
                    ]["balance"],
                },
            )
            if r.kind == "bank" and r.values.get("row_type") == "opening"
            else r
            for r in rows
        ]
        period = PeriodSpec("oct", date(2026, 10, 3), date(2026, 10, 3))
        declared["coverage"]["bank"]["ends_on"] = "2026-10-03"
        actual = period_cashflow(source, period, declared, {}, {})["days"][0]
        self.assertEqual(actual["closing"], "2898")
        self.assertIsNone(actual["opening"])


if __name__ == "__main__":
    unittest.main()
