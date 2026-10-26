"""Synthetic reference calculations and hostile pinned-row regressions."""

from dataclasses import replace
from datetime import date
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

from didban.adapters.source_reader import SourceReader  # noqa: E402
from didban.domain.interpretation import analyze  # noqa: E402
from didban.domain.financial import FinancialRow, PeriodSpec, calculate  # noqa: E402


CURRENT = PeriodSpec("2026-09", date(2026, 9, 1), date(2026, 9, 30))
PREVIOUS = PeriodSpec("2026-08", date(2026, 8, 1), date(2026, 8, 31))


def baseline():
    rows = []
    base = ROOT / "docs/validation/rebuild-v1/inputs/baseline"
    for name in ("ledger.xlsx", "bank.xlsx", "invoices.xlsx", "settlements.csv"):
        path = base / name
        parsed = analyze(SourceReader().read(path, path.suffix[1:], {}), {})
        for sheet in parsed.sheets:
            for row in sheet.rows:
                identity = f"{name}:{sheet.name}:{row.number}"
                rows.append(
                    FinancialRow(
                        identity,
                        identity,
                        name,
                        f"interpretation:{name}",
                        sheet.name,
                        row.number,
                        sheet.kind,
                        row.values,
                        row.state,
                        tuple(row.errors),
                    )
                )
    coverage = {
        kind: {
            "state": "complete",
            "provenance": "synthetic_fixture_author",
            "starts_on": "2026-08-01",
            "ends_on": "2026-10-03",
        }
        for kind in (
            "ledger",
            "bank",
            "sales_invoices",
            "purchase_invoices",
            "settlements",
        )
    }
    # Gross is the original invoice amount. The synthetic author explicitly
    # confirms even the pre-period settlement history from the first invoice.
    coverage["settlements"]["starts_on"] = "2026-07-20"
    declarations = {
        "coverage": coverage,
        "ledger_opening_complete": True,
        "income_tax": {"2026-08": "zero_confirmed", "2026-09": "recognized"},
        "cogs": {"2026-08": "not_required", "2026-09": "recognized"},
        "bank_accounts": ["bank_a", "bank_b"],
        "bank_bindings": {"bank.xlsx:بانک الف": "bank_a", "bank.xlsx:بانک ب": "bank_b"},
        "bank_anchors": {
            "bank_a": {
                "date": "2026-08-01",
                "cutoff": "start_of_day",
                "balance": "1000",
            },
            "bank_b": {
                "date": "2026-08-01",
                "cutoff": "start_of_day",
                "balance": "500",
            },
        },
        "invoice_openings_included": True,
        "settlements_complete": True,
        "comparable_parties": True,
    }
    return rows, declarations


def metrics(rows, declarations, previous=PREVIOUS, period=CURRENT):
    return {m.metric_key: m for m in calculate(rows, period, previous, declarations)}


class FinancialEngineTests(unittest.TestCase):
    def test_dated_current_paid_total_does_not_invent_historical_payment_dates(self):
        from didban.domain.settlements import invoice_aging

        invoice = next(
            r
            for r in self.rows
            if r.kind == "sales_invoices" and r.values["invoice_id"] == "S001"
        )
        invoice = replace(
            invoice, values={**invoice.values, "gross": "100", "due_on": None}
        )
        self.declarations["invoice_snapshots"] = {
            "sales_invoices:S001": {
                "as_of": "2026-10-03",
                "paid": "30",
                "included_event_ids": [],
            }
        }
        current = metrics(
            [invoice],
            self.declarations,
            None,
            PeriodSpec("current", date(2026, 9, 1), date(2026, 10, 3)),
        )
        self.assertEqual(current["ar_invoice"].value, "70")
        self.assertEqual(
            invoice_aging("70", None, date(2026, 10, 3)), (None, ["due_date_missing"])
        )
        historical = metrics([invoice], self.declarations, None)
        self.assertIsNone(historical["ar_invoice"].value)
        self.assertIn("payment_dates_missing", historical["ar_invoice"].reason_codes)

    def setUp(self):
        self.rows, self.declarations = baseline()

    def test_reference_nine_current_and_previous_metrics(self):
        expected = json.loads(
            (ROOT / "docs/validation/rebuild-v1/expected/baseline.json").read_text()
        )
        actual = metrics(self.rows, self.declarations)
        for key, values in expected["metrics"].items():
            self.assertEqual(
                actual[key].value, values["current"], (key, actual[key].reason_codes)
            )
            self.assertEqual(actual[key].comparison.value, values["previous"], key)
            self.assertEqual(actual[key].comparison.delta, values["delta"], key)
            self.assertEqual(actual[key].comparison.percent, values["percent"], key)
            self.assertTrue(actual[key].evidence[0].source_row_ids, key)
        self.assertEqual(actual["profit_before_tax"].value, "498")
        self.assertEqual(actual["ar_difference"].value, "0")
        self.assertEqual(actual["ap_difference"].value, "0")
        self.assertEqual(
            actual["cash"].details["accounts"], {"bank_a": "1898", "bank_b": "900"}
        )

    def test_missing_sources_do_not_invent_zero_or_block_valid_ledger(self):
        actual = metrics(
            [r for r in self.rows if r.kind == "ledger"], self.declarations
        )
        self.assertEqual(actual["net_profit"].value, "448")
        self.assertIsNone(actual["cash"].value)
        self.assertIsNone(actual["ar_invoice"].value)

    def test_tax_and_cogs_unknown_do_not_become_net_profit(self):
        self.declarations["income_tax"] = {}
        actual = metrics(self.rows, self.declarations)
        self.assertEqual(actual["profit_before_tax"].value, "498")
        self.assertIsNone(actual["net_profit"].value)
        self.assertIn("income_tax_unknown", actual["net_profit"].reason_codes)
        self.declarations["cogs"] = {}
        self.assertIsNone(
            metrics(self.rows, self.declarations)["profit_before_tax"].value
        )

    def test_coverage_declaration_is_not_independent_journal_control(self):
        rows = [
            r
            for r in self.rows
            if r.values.get("row_id") != "00012" or r.kind != "ledger"
        ]
        actual = metrics(rows, self.declarations)
        self.assertIsNone(actual["revenue"].value)
        self.assertIn("journal_unbalanced", actual["revenue"].reason_codes)

    def test_valid_state_does_not_bypass_numeric_currency_or_role_checks(self):
        for field, invalid in (
            ("credit", "NaN"),
            ("credit", "1.0000001"),
            ("unit", "USD"),
            ("role", "unknown"),
        ):
            rows = [
                replace(r, values={**r.values, field: invalid})
                if r.kind == "ledger" and r.values.get("row_id") == "00012"
                else r
                for r in self.rows
            ]
            self.assertIsNone(metrics(rows, self.declarations)["revenue"].value, field)

    def test_future_settlement_not_applied_to_historical_invoice(self):
        actual = metrics(self.rows, self.declarations)
        self.assertEqual(
            actual["ar_invoice"].details["invoice_balances"]["S001"], "600"
        )
        later = PeriodSpec("2026-10", date(2026, 10, 1), date(2026, 10, 3))
        self.assertEqual(
            metrics(self.rows, self.declarations, None, later)["ar_invoice"].value,
            "500",
        )

    def test_same_pinned_row_is_idempotent_but_distinct_equal_transactions_remain(self):
        actual = metrics(self.rows + self.rows, self.declarations)
        self.assertEqual(actual["cash"].value, "2798")
        event = next(
            r
            for r in self.rows
            if r.kind == "settlements" and r.values["event_id"] == "E02"
        )
        independent = replace(
            event,
            normalized_id="new",
            source_row_id="new",
            values={**event.values, "event_id": "E-new"},
        )
        self.assertEqual(
            metrics(self.rows + [independent], self.declarations)["ar_invoice"].value,
            "200",
        )

    def test_anchor_end_of_day_excludes_same_day_movement(self):
        def bank(identity, when, value):
            return FinancialRow(
                identity,
                identity,
                "bank",
                "i",
                "a",
                int(identity),
                "bank",
                {"date": when, "amount": value, "row_type": "movement", "unit": "IRR"},
            )

        rows = [bank("1", "2026-09-01", "20"), bank("2", "2026-09-02", "10")]
        self.declarations["bank_accounts"] = ["a"]
        self.declarations["bank_bindings"] = {"bank:a": "a"}
        self.declarations["bank_anchors"] = {
            "a": {"date": "2026-09-01", "balance": "100", "cutoff": "end_of_day"}
        }
        self.assertEqual(metrics(rows, self.declarations)["cash"].value, "110")
        self.declarations["bank_anchors"]["a"]["cutoff"] = "start_of_day"
        self.assertEqual(metrics(rows, self.declarations)["cash"].value, "130")

    def test_loan_and_payroll_not_added_to_commercial_difference(self):
        actual = metrics(self.rows, self.declarations)
        self.assertEqual(actual["debt_total_ledger"].value, "1150")
        self.assertEqual(actual["ap_difference"].value, "0")
        self.declarations["comparable_parties"] = False
        self.assertIsNone(metrics(self.rows, self.declarations)["ap_difference"].value)

    def test_bank_balance_control_and_unknown_binding(self):
        self.declarations["bank_anchors"]["bank_a"]["balance"] = "1001"
        actual = metrics(self.rows, self.declarations)
        self.assertIn("bank_balance_mismatch", actual["cash"].reason_codes)
        self.declarations["bank_bindings"] = {}
        self.assertIn(
            "bank_binding_unknown",
            metrics(self.rows, self.declarations)["cash"].reason_codes,
        )

    def test_multiple_bank_accounts_in_one_sheet_cannot_be_merged_by_a_binding(self):
        rows = list(self.rows)
        indices = [
            i for i, r in enumerate(rows) if r.kind == "bank" and r.sheet == "بانک الف"
        ]
        self.assertGreater(len(indices), 1)
        for j, i in enumerate(indices):
            rows[i] = replace(
                rows[i],
                values=rows[i].values | {"bank_account": "A" if j == 0 else "B"},
            )
        result = metrics(rows, self.declarations)
        self.assertIsNone(result["cash"].value)
        self.assertIn("bank_source_accounts_ambiguous", result["cash"].reason_codes)
        self.assertEqual(result["net_profit"].value, "448")

    def test_bank_questions_distinguish_files_with_the_same_csv_sheet_name(self):
        from didban.application.financial_questions import requirements

        bank = next(r for r in self.rows if r.kind == "bank")
        rows = [
            replace(
                bank,
                file_id="first",
                sheet="CSV",
                source_name="bank-01.csv",
                values=bank.values | {"bank_account": "A001"},
            ),
            replace(
                bank,
                file_id="second",
                sheet="CSV",
                source_name="bank-02.csv",
                values=bank.values | {"bank_account": "B002"},
            ),
        ]
        texts = [
            q[1]
            for q in requirements(rows, CURRENT, None)
            if q[0].startswith("binding|")
        ]
        self.assertEqual(len(texts), 2)
        self.assertTrue(any("bank-01.csv" in text and "A001" in text for text in texts))
        self.assertTrue(any("bank-02.csv" in text and "B002" in text for text in texts))

    def test_missing_previous_and_zero_denominator(self):
        actual = metrics(self.rows, self.declarations, None)
        self.assertIsNone(actual["revenue"].comparison)
        # No flow in a covered period is a genuine zero when controls pass.
        empty = PeriodSpec("empty", date(2026, 8, 1), date(2026, 8, 2))
        actual = metrics(self.rows, self.declarations, empty)
        self.assertEqual(actual["revenue"].comparison.delta, "1200")
        self.assertIsNone(actual["revenue"].comparison.percent)
        self.assertIn("zero_denominator", actual["revenue"].comparison.reason_codes)

    def test_aggregate_out_of_range_is_unavailable(self):
        rows = []
        for index in range(2):
            for role, debit, credit in (
                ("bank", "99999999999999999999999999999999", "0"),
                ("revenue", "0", "99999999999999999999999999999999"),
            ):
                identity = f"{index}:{role}"
                rows.append(
                    FinancialRow(
                        identity,
                        identity,
                        "f",
                        "i",
                        "s",
                        index,
                        "ledger",
                        {
                            "date": "2026-09-02",
                            "entry_id": str(index),
                            "entry_type": "regular",
                            "account": role,
                            "role": role,
                            "role_provenance": "explicit_source_field",
                            "debit": debit,
                            "credit": credit,
                            "unit": "IRR",
                        },
                    )
                )
        actual = metrics(rows, self.declarations)
        self.assertIsNone(actual["revenue"].value)
        self.assertIn("aggregate_out_of_range", actual["revenue"].reason_codes)

    def test_snapshot_included_events_are_not_paid_twice(self):
        self.declarations["invoice_snapshots"] = {
            "sales_invoices:S001": {
                "as_of": "2026-09-30",
                "paid": "400",
                "included_event_ids": ["E02"],
            }
        }
        actual = metrics(self.rows, self.declarations)
        self.assertEqual(actual["ar_invoice"].value, "600")
        # An invoice not issued in August does not affect that period.
        self.assertEqual(actual["ar_invoice"].comparison.value, "300")
        self.declarations["invoice_snapshots"]["sales_invoices:S000"] = {
            "as_of": "2026-09-30",
            "paid": "300",
            "included_event_ids": ["E01"],
        }
        # The September snapshot of an existing invoice cannot reconstruct August.
        self.assertIsNone(
            metrics(self.rows, self.declarations)["ar_invoice"].comparison.value
        )
        self.declarations["invoice_snapshots"]["sales_invoices:S001"][
            "included_event_ids"
        ] = []
        self.assertIsNone(metrics(self.rows, self.declarations)["ar_invoice"].value)

    def test_unknown_dates_overpayments_and_model_confidence_fail_closed(self):
        event = next(
            r
            for r in self.rows
            if r.kind == "settlements" and r.values["event_id"] == "E02"
        )
        for change in ({"date": None}, {"amount": "1001"}):
            rows = [
                replace(r, values={**r.values, **change}) if r is event else r
                for r in self.rows
            ]
            self.assertIsNone(metrics(rows, self.declarations)["ar_invoice"].value)
        rows = [
            replace(r, values={**r.values, "role_provenance": "model_confidence"})
            if r.kind == "ledger" and r.values.get("row_id") == "00012"
            else r
            for r in self.rows
        ]
        self.assertIn(
            "account_role_unknown",
            metrics(rows, self.declarations)["net_profit"].reason_codes,
        )

    def test_flow_excludes_opening_and_closing_but_includes_real_adjustments(self):
        rows = []
        journal = (
            ("opening", "revenue", "0", "100"),
            ("closing_transfer", "revenue", "100", "0"),
            ("regular", "revenue", "0", "200"),
            ("real_cogs_adjustment", "cogs", "60", "0"),
        )
        for index, (kind, role, debit, credit) in enumerate(journal):
            for line_role, line_debit, line_credit in (
                (role, debit, credit),
                ("capital", credit, debit),
            ):
                identity = f"{index}:{line_role}"
                rows.append(
                    FinancialRow(
                        identity,
                        identity,
                        "f",
                        "i",
                        "s",
                        index,
                        "ledger",
                        {
                            "date": "2026-09-01",
                            "entry_id": str(index),
                            "entry_type": kind,
                            "account": line_role,
                            "role": line_role,
                            "role_provenance": "explicit_source_field",
                            "debit": line_debit,
                            "credit": line_credit,
                            "unit": "IRR",
                        },
                    )
                )
        self.declarations["income_tax"][CURRENT.id] = "zero_confirmed"
        actual = metrics(rows, self.declarations)
        self.assertEqual(actual["revenue"].value, "200")
        self.assertEqual(actual["expense"].value, "60")
        self.assertEqual(actual["profit_before_tax"].value, "140")

    def test_history_coverage_must_extend_to_opening_and_anchor(self):
        for scope in self.declarations["coverage"].values():
            scope["starts_on"] = "2026-09-01"
        actual = metrics(self.rows, self.declarations)
        self.assertEqual(actual["revenue"].value, "1200")
        self.assertIsNone(actual["ar_ledger"].value)
        self.assertIsNone(actual["cash"].value)

    def test_recognition_assertion_requires_an_actual_classified_entry(self):
        self.declarations["income_tax"][PREVIOUS.id] = "recognized"
        self.declarations["cogs"][PREVIOUS.id] = "recognized"
        actual = metrics(self.rows, self.declarations)
        self.assertIsNone(actual["net_profit"].comparison.value)
        previous = metrics(self.rows, self.declarations, None, PREVIOUS)
        self.assertIn("income_tax_unknown", previous["net_profit"].reason_codes)
        self.assertIn("cogs_unknown", previous["profit_before_tax"].reason_codes)

    def test_original_invoice_gross_needs_preperiod_settlement_coverage(self):
        self.declarations["coverage"]["settlements"]["starts_on"] = "2026-08-01"
        # S000/P000 issued in July: an omitted July partial payment cannot be
        # assumed to be zero merely because September/August are declared full.
        actual = metrics(self.rows, self.declarations)
        self.assertIsNone(actual["ar_invoice"].value)
        self.assertIsNone(actual["ap_invoice"].value)
        self.assertIn("settlement_coverage_unknown", actual["ar_invoice"].reason_codes)
        self.assertEqual(actual["revenue"].value, "1200")

    def test_dated_invoice_snapshots_anchor_history_without_earlier_coverage(self):
        self.declarations["coverage"]["settlements"]["starts_on"] = "2026-09-30"
        self.declarations["invoice_snapshots"] = {
            "sales_invoices:S000": {
                "as_of": "2026-09-30",
                "paid": "300",
                "included_event_ids": ["E01"],
            },
            "sales_invoices:S001": {
                "as_of": "2026-09-30",
                "paid": "400",
                "included_event_ids": ["E02"],
            },
            "sales_invoices:S002": {
                "as_of": "2026-09-30",
                "paid": "200",
                "included_event_ids": ["E03"],
            },
        }
        actual = metrics(self.rows, self.declarations)
        self.assertEqual(actual["ar_invoice"].value, "600")
        self.assertIsNone(actual["ap_invoice"].value)

    def test_conflicting_row_identity_has_valid_basis_and_no_publication_exception(
        self,
    ):
        row = self.rows[0]
        conflict = replace(row, values={**row.values, "debit": "999"})
        actual = metrics(self.rows + [conflict], self.declarations)
        self.assertEqual(len(actual), 12)
        for value in actual.values():
            self.assertIsNone(value.value)
            self.assertIn(
                value.basis, {"bank", "ledger", "invoice", "comparable_difference"}
            )
            self.assertIn("conflicting_row_identity", value.reason_codes)


if __name__ == "__main__":
    unittest.main()
