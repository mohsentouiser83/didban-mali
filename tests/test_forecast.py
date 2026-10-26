"""Pure forecast reference, historical cutoff, ambiguity and exact-decimal checks."""

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from datetime import date
from didban.domain.forecast import forecast,forecast_summary
from didban.domain.settlements import weighted_delay, remaining


class ForecastTests(unittest.TestCase):
    def baseline(self):
        invoices = [
            {
                "invoice_id": "S001",
                "party_id": "C001",
                "direction": "sales",
                "source_invoice_id": "S001",
                "due_on": "2026-09-20",
                "remaining_as_of": "600",
            },
            {
                "invoice_id": "P001",
                "party_id": "V001",
                "direction": "purchase",
                "source_invoice_id": "P001",
                "due_on": "2026-09-25",
                "remaining_as_of": "300",
            },
            {
                "invoice_id": "P000",
                "party_id": "V000",
                "direction": "purchase",
                "source_invoice_id": "P000",
                "due_on": "2026-08-20",
                "remaining_as_of": "200",
            },
        ]
        plans = [
            {
                "id": p,
                "obligation_id": p,
                "invoice_id": i,
                "title": p,
                "scheduled_on": d,
                "remaining_amount": v,
                "state": "confirmed",
            }
            for p, i, d, v in [
                ("plan1", "P001", "2026-10-10", "300"),
                ("plan2", "P000", "2026-10-12", "200"),
                ("salary", None, "2026-10-15", "100"),
                ("rent", None, "2026-10-20", "120"),
                ("tax", None, "2026-10-25", "50"),
                ("loan", None, "2027-01-15", "500"),
            ]
        ]
        history = [
            {
                "party_id": "C001",
                "due_on": "2026-07-05",
                "paid_on": "2026-07-07",
                "amount": "100",
            },
            {
                "party_id": "C001",
                "due_on": "2026-07-10",
                "paid_on": "2026-07-14",
                "amount": "100",
            },
            {
                "party_id": "C001",
                "due_on": "2026-07-15",
                "paid_on": "2026-07-18",
                "amount": "200",
            },
        ]
        return invoices, plans, history

    def test_baseline_30_day_2628_after_explicit_overdue_receipt_answer(self):
        inv, plans, history = self.baseline()
        days, questions, reasons = forecast(
            "2798",
            date(2026, 9, 30),
            inv,
            plans,
            history,
            {"receipt|S001": "2026-10-05"},
        )
        self.assertEqual(len(days), 30)
        self.assertEqual(questions, [])
        self.assertEqual(reasons, [])
        self.assertEqual(days[-1]["closing"], "2628")
        self.assertEqual(forecast_summary(days)["ending"],"2628")
        self.assertEqual(forecast_summary(days)["minimum_on"],"2026-10-25")
        self.assertEqual(days[4]["expected_in"], "600")
        self.assertEqual(sum(int(d["expected_out"]) for d in days), 770)

    def test_overdue_receipt_has_question_instead_of_assumed_tomorrow(self):
        inv, plans, history = self.baseline()
        days, questions, _ = forecast(
            "2798", date(2026, 9, 30), inv, plans, history, {}
        )
        self.assertEqual(questions[0]["key"], "receipt|S001")
        self.assertEqual(days[0]["expected_in"], "0")

    def test_unknown_date_is_excluded_and_limited(self):
        inv, plans, history = self.baseline()
        days, questions, reasons = forecast(
            "2798", date(2026, 9, 30), inv, plans, history, {"receipt|S001": None}
        )
        self.assertFalse(questions)
        self.assertIn("expected_date_unknown", reasons)
        self.assertEqual(days[-1]["status"], "limited")

    def test_calibration_uses_only_past_and_weighted_median(self):
        _, _, history = self.baseline()
        self.assertEqual(weighted_delay(history, date(2026, 9, 30), 180, 3), 3)
        future = {
            "party_id": "C001",
            "due_on": "2026-07-01",
            "paid_on": "2026-10-01",
            "amount": "999999",
        }
        self.assertEqual(
            weighted_delay(history + [future], date(2026, 9, 30), 180, 3), 3
        )
        self.assertIsNone(weighted_delay(history, date(2026, 9, 30), 1, 3))

    def test_no_anchor_keeps_balance_unknown(self):
        days, _, reasons = forecast(None, date(2026, 9, 30), [], [], [], {})
        self.assertIsNone(days[-1]["closing"])
        self.assertEqual(days[-1]["status"], "unavailable")
        self.assertIn("balance_anchor_missing", reasons)

    def test_duplicate_obligation_never_charged_twice(self):
        inv, plans, history = self.baseline()
        plans.append(plans[0].copy())
        _, _, reasons = forecast(
            "2798",
            date(2026, 9, 30),
            inv,
            plans,
            history,
            {"receipt|S001": "2026-10-05"},
        )
        self.assertIn("obligation_overlap", reasons)

    def test_large_amount_and_subunit_precision(self):
        days, _, _ = forecast(
            "9999999999999999999999999999999.999999", date(2026, 9, 30), [], [], [], {}
        )
        self.assertEqual(days[-1]["closing"], "9999999999999999999999999999999.999999")

    def test_future_settlement_and_reversal_are_not_subtracted(self):
        allocs = [
            {"amount": "40", "date": "2026-09-01"},
            {"amount": "10", "date": "2026-10-01"},
            {"amount": "20", "date": "2026-09-01", "reversed": True},
        ]
        self.assertEqual(remaining("100", allocs, date(2026, 9, 30)), "60")
        self.assertEqual(remaining("100", allocs, date(2026, 10, 1)), "50")


if __name__ == "__main__":
    unittest.main()
