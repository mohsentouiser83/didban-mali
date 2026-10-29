"""Financial reference, missing-source and hostile-template acceptance checks."""

import base64
from copy import deepcopy
from dataclasses import replace
from io import BytesIO
import unittest
from openpyxl import load_workbook
from test_financial_domain import baseline, CURRENT, PREVIOUS, metrics
from didban.domain.management import management_report
from didban.domain.management.templates import (
    parse_template,
    template_bytes,
    validate_template,
    TemplateError,
)
from didban.domain.cashflow import period_cashflow


class ManagementTests(unittest.TestCase):
    def setUp(self):
        self.rows, self.declared = baseline()
        cash = period_cashflow(self.rows, CURRENT, self.declared, {}, {})
        self.content = {
            "manifest": {"as_of_date": str(CURRENT.cutoff)},
            "cashflow": {"payload": cash},
        }

    def report(self, rows=None, declared=None, options=None):
        return management_report(
            self.content,
            self.rows if rows is None else rows,
            CURRENT,
            PREVIOUS,
            self.declared if declared is None else declared,
            options,
        )

    def test_profit_agrees_with_independent_reference_and_bridge(self):
        report = self.report()
        totals = {r["key"]: r for r in report["statements"]["totals"]}
        self.assertEqual(totals["net_profit"]["value"], "448")
        expected = metrics(self.rows, self.declared)["net_profit"].comparison
        self.assertEqual(report["analysis"]["profit_delta"], expected.delta)
        from decimal import Decimal

        self.assertEqual(
            sum(Decimal(r["profit_effect"]) for r in report["analysis"]["drivers"]),
            Decimal(expected.delta),
        )
        self.assertTrue(any(r["source_refs"] for r in report["analysis"]["drivers"]))

    def test_missing_tax_preserves_revenue_but_never_invents_profit(self):
        declared = deepcopy(self.declared)
        declared["income_tax"] = {}
        report = self.report(declared=declared)
        self.assertIsNotNone(
            next(r for r in report["statements"]["lines"] if r["key"] == "revenue")[
                "value"
            ]
        )
        self.assertIsNone(
            next(r for r in report["statements"]["totals"] if r["key"] == "net_profit")[
                "value"
            ]
        )
        self.assertIsNone(report["analysis"]["profit_delta"])

    def test_no_ledger_is_unavailable_not_zero(self):
        report = self.report(rows=[r for r in self.rows if r.kind != "ledger"])
        self.assertTrue(all(r["value"] is None for r in report["statements"]["lines"]))
        self.assertTrue(
            all(d["booked_expense"]["value"] is None for d in report["daily"]["days"])
        )

    def test_missing_bank_does_not_erase_booked_expenses(self):
        self.content["cashflow"] = None
        report = self.report()
        self.assertTrue(all(d["closing"] is None for d in report["daily"]["days"]))
        self.assertTrue(
            any(
                d["booked_expense"]["value"] is not None
                for d in report["daily"]["days"]
            )
        )

    def test_missing_opening_blocks_balance_sheet_only(self):
        declared = deepcopy(self.declared)
        declared["ledger_opening_complete"] = False
        report = self.report(declared=declared)
        self.assertIsNone(report["statements"]["balance_control"]["value"])
        self.assertEqual(
            next(t for t in report["statements"]["totals"] if t["key"] == "net_profit")[
                "value"
            ],
            "448",
        )

    def test_explicit_template_requires_complete_and_consistent_mapping(self):
        template = {
            "name": "قالب مرجع",
            "lines": [
                {
                    "key": "sales",
                    "label": "فروش",
                    "section": "revenue",
                    "accounts": ["حساب ناموجود"],
                }
            ],
        }
        report = self.report(options={"template": template})
        self.assertTrue(report["statements"]["unmapped_accounts"])
        self.assertIsNone(report["statements"]["lines"][0]["value"])
        self.assertIn(
            "template_account_missing", report["statements"]["lines"][0]["reason_codes"]
        )
        self.assertIsNone(report["analysis"]["profit_delta"])

    def test_same_pinned_row_not_counted_twice(self):
        base = self.report()
        duplicate = self.report(rows=self.rows + self.rows)
        self.assertEqual(base["statements"], duplicate["statements"])
        self.assertEqual(base["daily"], duplicate["daily"])

    def test_zero_does_not_become_missing_and_source_details_are_exact(self):
        report = self.report()
        equity = next(r for r in report["statements"]["lines"] if r["key"] == "equity")
        self.assertIsNotNone(equity["value"])
        self.assertTrue(
            all(
                "source_row_id" in ref
                for line in report["statements"]["lines"]
                for d in line["details"]
                for ref in d["source_refs"]
            )
        )

    def test_invalid_source_cannot_produce_a_valid_balance(self):
        rows = [
            replace(r, state="rejected") if r.kind == "ledger" else r for r in self.rows
        ]
        report = self.report(rows=rows)
        self.assertIsNone(report["statements"]["balance_control"]["value"])

    def test_template_example_roundtrip_and_no_macros_or_formulas(self):
        data = template_bytes()
        parsed = parse_template("نمونه", base64.b64encode(data).decode())
        self.assertEqual(len(parsed["lines"]), 8)
        book = load_workbook(BytesIO(data))
        book.active["D2"] = "=1+1"
        out = BytesIO()
        book.save(out)
        with self.assertRaises(TemplateError):
            parse_template("فرمول", base64.b64encode(out.getvalue()).decode())
        with self.assertRaises(TemplateError):
            parse_template("خراب", "not base64")

    def test_preopening_rows_do_not_restate_opening_balances(self):
        bank = next(
            r
            for r in self.rows
            if r.kind == "ledger" and r.values.get("role") == "bank"
        )
        equity = next(
            r
            for r in self.rows
            if r.kind == "ledger" and r.values.get("role") == "capital"
        )
        older = [
            replace(
                row,
                normalized_id="pre-" + str(i),
                source_row_id="pre-source-" + str(i),
                values={
                    **row.values,
                    "date": "2026-07-01",
                    "entry_id": "PRE",
                    "entry_type": "regular",
                    "debit": debit,
                    "credit": credit,
                },
            )
            for i, (row, debit, credit) in enumerate(
                [(bank, "100", "0"), (equity, "0", "100")]
            )
        ]
        before = {t["key"]: t["value"] for t in self.report()["statements"]["totals"]}
        after = {
            t["key"]: t["value"]
            for t in self.report(rows=self.rows + older)["statements"]["totals"]
        }
        self.assertEqual(before, after)

    def test_forecast_limitations_stay_with_daily_preview(self):
        self.content["forecast"] = {
            "content": {
                "days": [
                    {
                        "date": "2026-10-01",
                        "reason_codes": [
                            "expected_date_unknown",
                            "future_payment_coverage_unknown",
                        ],
                        "status": "limited",
                        "expected_in": "0",
                        "expected_out": "0",
                        "closing": "2798",
                    }
                ]
            }
        }
        report = self.report()
        self.assertIn(
            "future_payment_coverage_unknown", report["daily"]["upcoming_reason_codes"]
        )
        self.assertIn("expected_date_unknown", report["daily"]["upcoming_reason_codes"])

    def test_cash_bridge_is_independent_of_tax_and_checks_balance_change(self):
        from decimal import Decimal

        declared = deepcopy(self.declared)
        declared["income_tax"] = {}
        report = self.report(declared=declared)
        cash = report["analysis"]["cash"]
        self.assertEqual(
            cash["change"]["value"],
            str(Decimal(cash["closing"]["value"]) - Decimal(cash["opening"]["value"])),
        )
        self.assertEqual(
            sum(Decimal(d["value"]) for d in cash["drivers"]),
            Decimal(cash["change"]["value"]),
        )
        self.assertIsNone(report["analysis"]["profit_delta"])
        self.assertTrue(
            all(
                d["booked_expense"]["value"] is not None
                for d in report["daily"]["days"]
            )
        )
        self.assertIsNone(cash["external_inflow"]["value"])

    def test_cash_bridge_rejects_missing_days_or_inconsistent_ending(self):
        days = self.content["cashflow"]["payload"]["days"]
        old = days[-1]["closing"]
        days[-1]["closing"] = "9999"
        cash = self.report()["analysis"]["cash"]
        self.assertIsNone(cash["change"]["value"])
        self.assertIn("cash_bridge_control_failed", cash["change"]["reason_codes"])
        days[-1]["closing"] = old
        days.pop(5)
        cash = self.report()["analysis"]["cash"]
        self.assertIsNone(cash["change"]["value"])
        self.assertIn("cash_movement_coverage_unknown", cash["change"]["reason_codes"])

    def test_fixed_and_contra_assets_and_equity_remain_signed(self):
        from datetime import date
        from didban.domain.financial import FinancialRow, PeriodSpec

        period = PeriodSpec("p", date(2026, 9, 1), date(2026, 9, 30))
        rows = [
            FinancialRow(
                str(i),
                str(i),
                "file",
                "interp",
                "دفتر",
                i + 2,
                "ledger",
                {
                    "date": "2026-09-01",
                    "entry_id": "OPEN",
                    "entry_type": "opening",
                    "account": account,
                    "role": role,
                    "role_provenance": "explicit_source_field",
                    "debit": debit,
                    "credit": credit,
                    "unit": "IRR",
                },
            )
            for i, (account, role, debit, credit) in enumerate(
                [
                    ("دارایی ثابت", "fixed_asset", "1000", "0"),
                    ("استهلاک انباشته", "contra_asset", "0", "200"),
                    ("سود انباشته", "other_equity", "0", "800"),
                ]
            )
        ]
        declared = {
            "coverage": {
                "ledger": {
                    "state": "complete",
                    "provenance": "user_declaration",
                    "starts_on": "2026-09-01",
                    "ends_on": "2026-09-30",
                }
            },
            "ledger_opening_complete": True,
            "income_tax": {"p": "zero_confirmed"},
            "cogs": {"p": "not_required"},
        }
        report = management_report(
            {"manifest": {"as_of_date": "2026-09-30"}}, rows, period, None, declared
        )
        totals = {t["key"]: t for t in report["statements"]["totals"]}
        self.assertEqual(totals["assets"]["value"], "800")
        self.assertEqual(totals["recorded_equity"]["value"], "800")
        self.assertEqual(report["statements"]["balance_control"]["value"], "0")

    def test_template_duplicate_and_overlapping_accounts_rejected(self):
        line = {"key": "a", "label": "فروش", "section": "revenue", "accounts": ["001"]}
        for lines in (
            [line, line],
            [line, {**line, "key": "b"}],
            [{**line, "accounts": ["001", "001"]}],
        ):
            with self.assertRaises(TemplateError):
                validate_template({"name": "مرجع", "lines": lines})


if __name__ == "__main__":
    unittest.main()
