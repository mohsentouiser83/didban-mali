"""Independent references for trial balances and explicitly classified book cash flows."""

from pathlib import Path
from tempfile import TemporaryDirectory
from dataclasses import replace
from datetime import date
from io import BytesIO
import unittest
from openpyxl import Workbook
from didban.adapters.source_reader import SourceReader
from didban.domain.interpretation import analyze
from didban.domain.financial import FinancialRow, PeriodSpec
from didban.domain.management import management_report
from didban.domain.management.templates import template_from_report

PERIOD = PeriodSpec("p", date(2026, 9, 1), date(2026, 9, 30))
FIELDS = "account role opening_debit opening_credit period_debit period_credit closing_debit closing_credit period_start as_of_date row_level flow_basis currency".split()


def trial_workbook(metadata=True):
    book = Workbook()
    ws = book.active
    ws.title = "تراز"
    ws.append(FIELDS if metadata else FIELDS[:8] + ["currency"])
    for values in [
        ["bank", "bank", 1000, 0, 500, 200, 1300, 0],
        ["capital", "capital", 0, 1000, 0, 0, 0, 1000],
        ["sales", "revenue", 0, 0, 0, 500, 0, 500],
        ["cost", "expense", 0, 0, 200, 0, 200, 0],
        ["tax", "income_tax_expense", 0, 0, 50, 0, 50, 0],
        ["tax_due", "tax_payable", 0, 0, 0, 50, 0, 50],
    ]:
        ws.append(
            values
            + (
                ["2026-09-01", "2026-09-30", "detail", "before_closing", "IRR"]
                if metadata
                else ["IRR"]
            )
        )
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def parsed_trial(settings=None, metadata=True):
    with TemporaryDirectory() as directory:
        path = Path(directory) / "trial.xlsx"
        path.write_bytes(trial_workbook(metadata))
        return analyze(SourceReader().read(path, "xlsx", {}), settings or {})


def trial_rows():
    parsed = parsed_trial()
    assert parsed.question is None, parsed.question
    return [
        FinancialRow(
            str(r.number),
            str(r.number),
            "trial",
            "iv",
            "تراز",
            r.number,
            "trial_balance",
            r.values,
            r.state,
            tuple(r.errors),
        )
        for r in parsed.sheets[0].rows
    ]


def declarations():
    return {
        "coverage": {
            kind: {
                "state": "complete",
                "provenance": "fixture_author",
                "starts_on": "2026-09-01",
                "ends_on": "2026-09-30",
            }
            for kind in ("ledger", "trial_balance")
        },
        "income_tax": {"p": "recognized"},
        "cogs": {"p": "not_required"},
        "ledger_opening_complete": True,
    }


def report(rows, declared=None, period=PERIOD, options=None):
    return management_report(
        {"manifest": {"as_of_date": str(period.cutoff)}},
        rows,
        period,
        None,
        declared or declarations(),
        options,
    )


def cash_rows():
    rows = []

    def entry(key, when, legs, activity=None, kind="regular"):
        for account, role, debit, credit in legs:
            values = {
                "entry_id": key,
                "entry_type": kind,
                "date": when,
                "account": account,
                "role": role,
                "role_provenance": "explicit_source_field",
                "debit": str(debit),
                "credit": str(credit),
                "unit": "IRR",
            }
            if activity:
                values.update(
                    cashflow_activity=activity,
                    cashflow_activity_provenance="explicit_source_field",
                )
            n = str(len(rows) + 1)
            rows.append(
                FinancialRow(
                    n, n, "ledger", "iv", "دفتر", len(rows) + 2, "ledger", values
                )
            )

    entry(
        "open",
        "2026-09-01",
        [("bank", "bank", 1000, 0), ("capital", "capital", 0, 1000)],
        kind="opening",
    )
    entry(
        "sale",
        "2026-09-02",
        [("bank", "bank", 500, 0), ("sales", "revenue", 0, 500)],
        "operating",
    )
    entry(
        "cost",
        "2026-09-03",
        [("cost", "expense", 200, 0), ("bank", "bank", 0, 200)],
        "operating",
    )
    entry(
        "asset",
        "2026-09-04",
        [("asset", "fixed_asset", 300, 0), ("bank", "bank", 0, 300)],
        "investing",
    )
    entry(
        "loan",
        "2026-09-05",
        [("bank", "bank", 400, 0), ("loan", "loan_payable", 0, 400)],
        "financing",
    )
    entry(
        "transfer", "2026-09-06", [("bank", "bank", 0, 100), ("cash", "cash", 100, 0)]
    )
    entry(
        "depreciation",
        "2026-09-07",
        [("cost", "expense", 50, 0), ("depreciation", "contra_asset", 0, 50)],
    )
    return rows


class StatementSourceTests(unittest.TestCase):
    def test_trial_independent_profit_and_balance(self):
        result = report(trial_rows())
        self.assertEqual(result["statement_basis"], "trial_balance")
        totals = {r["key"]: r["value"] for r in result["statements"]["totals"]}
        self.assertEqual(totals["net_profit"], "250")
        self.assertEqual(totals["assets"], "1300")
        self.assertEqual(totals["liabilities"], "50")
        self.assertEqual(result["statements"]["balance_control"]["value"], "0")
        refs = next(r for r in result["statements"]["lines"] if r["key"] == "revenue")[
            "details"
        ][0]["source_refs"]
        self.assertEqual(refs[0]["basis"], "period_movement")
        self.assertEqual(refs[0]["credit"], "500")
        self.assertEqual(result["cashflow_statement"]["status"], "unavailable")
        self.assertTrue(all(r.kind == "trial_balance" for r in trial_rows()))

    def test_two_trial_snapshots_compare_their_own_movements(self):
        from decimal import Decimal

        rows = trial_rows()
        previous_rows = []
        for row in rows:
            values = {
                **row.values,
                "period_start": "2026-08-01",
                "as_of_date": "2026-08-31",
            }
            values["period_debit"] = str(
                Decimal(values["period_debit"]) * Decimal("0.8")
            )
            values["period_credit"] = str(
                Decimal(values["period_credit"]) * Decimal("0.8")
            )
            net = (
                Decimal(values["opening_debit"])
                - Decimal(values["opening_credit"])
                + Decimal(values["period_debit"])
                - Decimal(values["period_credit"])
            )
            values["closing_debit"] = str(max(net, Decimal(0)))
            values["closing_credit"] = str(max(-net, Decimal(0)))
            previous_rows.append(
                replace(
                    row,
                    normalized_id="previous:" + row.normalized_id,
                    source_row_id="previous:" + row.source_row_id,
                    file_id="previous-trial",
                    values=values,
                )
            )
        declared = declarations()
        declared["coverage"]["trial_balance"]["starts_on"] = "2026-08-01"
        declared["income_tax"]["previous"] = "recognized"
        declared["cogs"]["previous"] = "not_required"
        result = management_report(
            {"manifest": {"as_of_date": "2026-09-30"}},
            rows + previous_rows,
            PERIOD,
            PeriodSpec("previous", date(2026, 8, 1), date(2026, 8, 31)),
            declared,
        )
        self.assertEqual(result["analysis"]["profit_delta"], "50")
        self.assertEqual(
            sum(
                Decimal(driver["profit_effect"])
                for driver in result["analysis"]["drivers"]
            ),
            Decimal("50"),
        )

    def test_trial_tax_limit_preserves_revenue_and_balance(self):
        declared = declarations()
        declared["income_tax"] = {}
        result = report(trial_rows(), declared)
        self.assertEqual(
            next(
                line
                for line in result["statements"]["lines"]
                if line["key"] == "revenue"
            )["value"],
            "500",
        )
        self.assertIsNone(
            next(
                total
                for total in result["statements"]["totals"]
                if total["key"] == "net_profit"
            )["value"]
        )
        self.assertEqual(result["statements"]["balance_control"]["value"], "0")

    def test_trial_date_metadata_requires_focused_question(self):
        self.assertEqual(
            parsed_trial(metadata=False).question.code, "interpretation_mapping"
        )
        settings = {
            "sheets": {
                "تراز": {"period_start": "2026-09-01", "as_of_date": "2026-09-30"}
            }
        }
        self.assertEqual(
            parsed_trial(settings, False).question.field, "trial_balance_level"
        )
        settings["sheets"]["تراز"]["trial_balance_level"] = "detail"
        self.assertEqual(
            parsed_trial(settings, False).question.field, "trial_balance_flows"
        )
        settings["sheets"]["تراز"]["trial_balance_flows"] = "before_closing"
        result = parsed_trial(settings, False)
        self.assertIsNone(result.question)
        self.assertTrue(all(not r.errors for r in result.sheets[0].rows))

    def test_closed_trial_only_blocks_period_profit(self):
        rows = [
            replace(r, values={**r.values, "flow_basis": "includes_closing"})
            for r in trial_rows()
        ]
        result = report(rows)
        self.assertIsNone(
            next(t for t in result["statements"]["totals"] if t["key"] == "net_profit")[
                "value"
            ]
        )
        self.assertEqual(result["statements"]["balance_control"]["value"], "0")

    def test_arbitrary_cutoff_cannot_invent_trial(self):
        result = report(
            trial_rows(), period=replace(PERIOD, as_of_date=date(2026, 9, 15))
        )
        self.assertTrue(
            all(line["value"] is None for line in result["statements"]["lines"])
        )

    def test_shorter_movement_interval_preserves_closing_balance(self):
        result = report(
            trial_rows(), period=replace(PERIOD, starts_on=date(2026, 9, 10))
        )
        self.assertIsNone(
            next(t for t in result["statements"]["totals"] if t["key"] == "net_profit")[
                "value"
            ]
        )
        self.assertEqual(result["statements"]["balance_control"]["value"], "0")

    def test_summary_excluded_and_unknown_level_unavailable(self):
        rows = trial_rows()
        summary = replace(
            rows[0],
            normalized_id="summary",
            values={**rows[0].values, "account": "all", "row_level": "summary"},
        )
        self.assertEqual(
            report(rows)["statements"], report(rows + [summary])["statements"]
        )
        rows[0] = replace(rows[0], values={**rows[0].values, "row_level": "unknown"})
        self.assertTrue(
            all(line["value"] is None for line in report(rows)["statements"]["lines"])
        )

    def test_duplicate_account_or_rollforward_cannot_publish_valid_figures(self):
        rows = trial_rows()
        duplicate = replace(rows[0], normalized_id="duplicate")
        self.assertIn(
            "duplicate_trial_balance_account",
            report(rows + [duplicate])["statements"]["lines"][0]["reason_codes"],
        )
        rows[0] = replace(rows[0], values={**rows[0].values, "closing_debit": "1301"})
        self.assertIn(
            "trial_balance_rollforward_mismatch",
            report(rows)["statements"]["lines"][0]["reason_codes"],
        )

    def test_trial_template_accounts_preserved(self):
        rows = trial_rows()
        result = report(rows)
        template = template_from_report(
            result,
            [{"source_kind": r.kind, "canonical_values": r.values} for r in rows],
        )
        self.assertIn(
            "sales",
            next(line for line in template["lines"] if line["section"] == "revenue")[
                "accounts"
            ],
        )

    def test_cash_reference_and_exclusions(self):
        result = report(cash_rows())["cashflow_statement"]
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["opening"]["value"], "1000")
        self.assertEqual(result["closing"]["value"], "1400")
        self.assertEqual(result["control"]["value"], "0")
        self.assertEqual(
            [s["net"]["value"] for s in result["sections"]], ["300", "-300", "400"]
        )
        self.assertEqual(result["internal_entries_excluded"], 1)
        self.assertEqual(result["noncash_entries_excluded"], 1)

    def test_unknown_activity_keeps_known_subtotals_and_bridge(self):
        rows = [
            replace(
                r,
                values={
                    k: v
                    for k, v in r.values.items()
                    if not k.startswith("cashflow_activity")
                },
            )
            if r.values["entry_id"] == "sale"
            else r
            for r in cash_rows()
        ]
        result = report(rows)["cashflow_statement"]
        self.assertEqual(result["status"], "limited")
        self.assertTrue(all(s["net"]["value"] is None for s in result["sections"]))
        self.assertEqual(result["sections"][0]["classified_net"]["value"], "-200")
        self.assertEqual(result["unclassified_net"]["value"], "500")
        self.assertEqual(result["control"]["value"], "0")

    def test_activity_without_explicit_provenance_not_trusted(self):
        rows = [
            replace(
                r,
                values={
                    k: v
                    for k, v in r.values.items()
                    if k != "cashflow_activity_provenance"
                },
            )
            for r in cash_rows()
        ]
        self.assertEqual(report(rows)["cashflow_statement"]["unclassified_count"], 4)

    def test_unclassified_net_zero_still_limits_totals(self):
        rows = [
            replace(
                row,
                values={
                    key: value
                    for key, value in row.values.items()
                    if not key.startswith("cashflow_activity")
                },
            )
            if row.values["entry_id"] in {"sale", "cost", "asset"}
            else row
            for row in cash_rows()
        ]
        result = report(rows)["cashflow_statement"]
        self.assertEqual(result["unclassified_net"]["value"], "0")
        self.assertEqual(result["unclassified_count"], 3)
        self.assertTrue(
            all(section["net"]["value"] is None for section in result["sections"])
        )
        self.assertEqual(result["control"]["value"], "0")

    def test_mixed_journal_without_cash_leg_classification_stays_unknown(self):
        rows = cash_rows()
        mixed = []
        for row in rows:
            if row.values["entry_id"] == "sale":
                values = {
                    **row.values,
                    "cashflow_activity": "operating"
                    if row.values["role"] == "bank"
                    else "financing",
                }
                if row.values["role"] == "bank":
                    values.pop("cashflow_activity_provenance")
                mixed.append(replace(row, values=values))
            else:
                mixed.append(row)
        result = report(mixed)["cashflow_statement"]
        # Only the one explicit counterpart label remains, so it identifies this journal.
        self.assertEqual(result["sections"][2]["net"]["value"], "900")
        cash = next(
            row
            for row in mixed
            if row.values["entry_id"] == "sale" and row.values["role"] == "bank"
        )
        extra = replace(
            cash,
            normalized_id="zero-evidence",
            source_row_id="zero-evidence",
            values={
                **cash.values,
                "account": "cost",
                "role": "expense",
                "debit": "0",
                "credit": "0",
                "cashflow_activity": "operating",
                "cashflow_activity_provenance": "explicit_source_field",
            },
        )
        result = report(mixed + [extra])["cashflow_statement"]
        self.assertEqual(result["unclassified_count"], 1)

    def test_trial_unsupported_unit_never_becomes_rial(self):
        rows = trial_rows()
        rows[0] = replace(rows[0], values={**rows[0].values, "unit": "USD"})
        result = report(rows)
        self.assertTrue(
            all(line["value"] is None for line in result["statements"]["lines"])
        )

    def test_cash_duplicate_pinned_rows_do_not_double_count(self):
        rows = cash_rows()
        self.assertEqual(
            report(rows)["cashflow_statement"],
            report(rows + rows)["cashflow_statement"],
        )

    def test_missing_opening_preserves_activity_but_hides_balance(self):
        declared = declarations()
        declared["ledger_opening_complete"] = False
        result = report(cash_rows(), declared)["cashflow_statement"]
        self.assertIsNone(result["opening"]["value"])
        self.assertEqual(result["sections"][0]["net"]["value"], "300")


if __name__ == "__main__":
    unittest.main()
