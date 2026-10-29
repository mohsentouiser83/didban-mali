"""Independent controls, source evidence and genuine ambiguity; synthetic identities."""

from collections import defaultdict
from copy import deepcopy
from datetime import date
from decimal import Decimal
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.domain.source_tables import Sheet, Row  # noqa: E402
from didban.domain.source_understanding import SourceContext, understand  # noqa: E402
from didban.domain.interpretation import analyze  # noqa: E402
from didban.domain.financial import FinancialRow, PeriodSpec  # noqa: E402
from didban.domain.financial.ledger import ledger_metrics  # noqa: E402
from didban.application.financial_questions import declarations, requirements  # noqa: E402
from didban.application.source_understanding import apply_memory, remember  # noqa: E402
from didban.domain.management.statements import ledger_statements  # noqa: E402
from test_moadian_export import portal_sheet  # noqa: E402

HEADER = [
    "شماره سند",
    "تاریخ سند",
    "کد کل",
    "کد معین",
    "کد تفصیلی",
    "نام کل",
    "نام معین",
    "نام تفصیلی",
    "بدهکار",
    "بستانکار",
]


def source_bundle(factor=1):
    records = []
    accounts = {
        "B": ("بانکها", "بانکهای ریالی", "بانک نمونه"),
        "I": ("موجودی مواد و کالا", "", ""),
        "C": ("سرمایه", "", ""),
        "V": ("اعتبار ارزش افزوده خرید", "اعتبار ارزش افزوده", ""),
        "T": ("مالیات ارزش افزوده فروش", "مالیات ارزش افزوده", ""),
        "P": ("خرید", "خرید", ""),
        "S": ("فروش", "فروش", ""),
        "R": ("سود وزیان جاری", "", ""),
        "E": ("سود و زیان انباشته", "", ""),
        "X": ("مالیات عملکرد پرداختنی", "", ""),
        "O": ("تراز افتتاحیه", "", ""),
    }

    def article(entry, when, code, debit, credit, party=""):
        labels = accounts.get(
            code, ("بدهکاران" if code.startswith("AR") else "بستانکاران", party, "")
        )
        aux = party or ("0001" if labels[1] else "")
        detail = "0002" if labels[2] else ""
        records.append(
            [
                entry,
                when,
                code,
                aux,
                detail,
                *labels,
                str(Decimal(debit) / factor),
                str(Decimal(credit) / factor),
            ]
        )

    for code, dr, cr in [
        ("I", 400, 0),
        ("B", 1000, 0),
        ("C", 0, 1400),
        ("O", 1400, 0),
        ("O", 0, 1400),
    ]:
        article("1", "1403.01.01", code, dr, cr)
    references = []
    specs = [
        ("2", "1403.01.02", "purchases", "فروشنده الف", 100, 10),
        ("3", "1403.01.03", "sales", "مشتری الف", 200, 20),
        ("4", "1403.01.04", "purchases", "فروشنده ب", 200, 20),
        ("5", "1403.01.05", "sales", "مشتری ب", 300, 30),
    ]
    for entry, when, direction, party, net, vat in specs:
        if direction == "sales":
            article(entry, when, "AR" + entry, net + vat, 0, party)
            article(entry, when, "S", 0, net)
            article(entry, when, "T", 0, vat)
        else:
            article(entry, when, "P", net, 0)
            article(entry, when, "V", vat, 0)
            article(entry, when, "AP" + entry, 0, net + vat, party)
        table = portal_sheet(
            direction,
            **{
                "3": "TAX" + entry,
                "4": str(net + vat),
                "5": str(vat),
                "6": when.replace(".", "/") + " 12:00:00",
                "9": str(net),
            },
        )
        table.rows[0].values.append(
            "نام خریدار/ عرضه کننده واسط"
            if direction == "sales"
            else "نام فروشنده/ عرضه کننده واسط"
        )
        table.rows[1].values.append(party)
        references.append(SourceContext("ref" + entry, "sha" + entry, [table]))
    for code, dr, cr in [
        ("S", 500, 0),
        ("P", 0, 300),
        ("I", 350, 0),
        ("I", 0, 400),
        ("R", 0, 150),
    ]:
        article("6", "1403.12.29", code, dr, cr)
    for code, dr, cr in [("R", 150, 0), ("X", 0, 30), ("E", 0, 120)]:
        article("7", "1403.12.29", code, dr, cr)
    balances = defaultdict(Decimal)
    sample = {}
    for row in records:
        key = tuple(row[2:8])
        balances[key] += Decimal(row[8]) - Decimal(row[9])
        sample[key] = row
    for key, value in list(balances.items()):
        if value:
            old = sample[key]
            records.append(
                ["8", "1403.12.29", *old[2:8], str(max(-value, 0)), str(max(value, 0))]
            )
    debit = sum(Decimal(row[8]) for row in records)
    credit = sum(Decimal(row[9]) for row in records)
    table = Sheet(
        "دفتر",
        [Row(1, HEADER), Row(2, ["", "", "", "", "", "منقول از قبل", "", "", "0", "0"])]
        + [Row(i + 3, row) for i, row in enumerate(records)]
        + [
            Row(
                len(records) + 3,
                ["", "", "", "", "", "", "", "", str(debit), str(credit)],
            )
        ],
    )
    return table, references


def normalize(table, references, settings=None):
    context = SourceContext("ledger", "ledger-sha", [table])
    candidate, findings = understand(
        "ledger", [table], settings or {}, [*references, context]
    )
    return candidate, analyze([table], candidate), findings


def financial_rows(sheet, file_id="ledger"):
    return [
        FinancialRow(
            str(row.number),
            str(row.number),
            file_id,
            "interpretation",
            sheet.name,
            row.number,
            sheet.kind,
            row.values,
            row.state,
            tuple(row.errors),
        )
        for row in sheet.rows
    ]


class UnderstandingTests(unittest.TestCase):
    def test_hierarchy_totals_unit_dates_roles_and_entries_are_source_based(self):
        table, refs = source_bundle()
        settings, result, _ = normalize(table, refs)
        self.assertIsNone(result.question)
        sheet = result.sheets[0]
        self.assertEqual(sheet.unit, "IRR")
        self.assertEqual(sheet.skipped_count, 2)
        self.assertFalse([row.errors for row in sheet.rows if row.errors])
        self.assertGreaterEqual(
            len(settings["sheets"]["دفتر"]["understanding_evidence"]["unit_witnesses"]),
            4,
        )
        self.assertTrue(
            any(row.values["entry_type"] == "opening" for row in sheet.rows)
        )
        self.assertTrue(
            any(row.values["entry_type"] == "closing_transfer" for row in sheet.rows)
        )
        self.assertTrue(
            any(row.values.get("income_tax_charge") == "30" for row in sheet.rows)
        )
        self.assertEqual(table.rows[2].values[1], "1403.01.01")
        self.assertEqual(sheet.rows[0].values["date"], "2024-03-20")
        self.assertTrue(
            all(row.values.get("role_controls_passed") for row in sheet.rows)
        )

    def test_exact_periodic_cost_tax_and_closed_equity_match_independent_expectations(
        self,
    ):
        table, refs = source_bundle()
        _, result, _ = normalize(table, refs)
        rows = financial_rows(result.sheets[0])
        period = PeriodSpec("year", date(2024, 3, 20), date(2025, 3, 20))
        questions = requirements(rows, period, None)
        self.assertEqual([item[0] for item in questions], ["coverage|ledger|year"])
        declared = declarations(
            rows,
            period,
            None,
            {"coverage|ledger|year": "declared_complete"},
            {"coverage|ledger|year": "test-human"},
        )
        metrics = {
            metric.metric_key: metric
            for metric in ledger_metrics(rows, period, declared)
        }
        self.assertEqual(metrics["revenue"].value, "500")
        self.assertEqual(metrics["profit_before_tax"].value, "150")
        self.assertEqual(metrics["net_profit"].value, "120")
        self.assertEqual(metrics["expense"].value, "380")
        statement = ledger_statements(rows, period, declared)
        totals = {row["key"]: row for row in statement["totals"]}
        self.assertEqual(totals["net_profit"]["value"], "120")

    def test_one_witness_cannot_establish_unit_and_scale_toman_is_exact(self):
        table, refs = source_bundle(factor=10)
        _, result, _ = normalize(table, refs)
        self.assertIsNone(result.question)
        self.assertEqual(result.sheets[0].unit, "IRT")
        self.assertEqual(result.sheets[0].rows[0].values["debit"], "400")
        _, result, _ = normalize(table, refs[:1])
        self.assertEqual(result.question.code, "interpretation_unit")

    def test_unreconciled_footer_and_changed_posting_are_not_silently_dropped(self):
        table, refs = source_bundle()
        table.rows[-1].values[-1] = "999"
        _, result, _ = normalize(table, refs)
        self.assertEqual(result.sheets[0].skipped_count, 1)
        self.assertTrue(any(row.errors for row in result.sheets[0].rows))
        table, refs = source_bundle()
        table.rows[3].values[8] = "1001"
        _, result, _ = normalize(table, refs)
        self.assertTrue(
            any(
                "unbalanced_or_incomplete_entry" in row.errors
                for row in result.sheets[0].rows
            )
        )

    def test_codes_and_normal_credit_balance_do_not_decide_shareholder_account(self):
        table, refs = source_bundle()
        for row in table.rows:
            if len(row.values) >= 6 and row.values[2] == "C":
                row.values[5] = "جاری شرکاء"
        _, result, _ = normalize(table, refs)
        self.assertEqual(result.question.code, "interpretation_account_role")
        self.assertIn("جاری شرکاء", result.question.message)

    def test_human_mapping_unit_and_account_choices_are_preserved(self):
        table, refs = source_bundle()
        selected = {
            "sheets": {
                "دفتر": {
                    "actor_id": "human",
                    "header_row": 1,
                    "mapping": {"date": 2},
                    "unit": "IRT",
                }
            }
        }
        candidate, _, _ = normalize(table, refs, selected)
        self.assertEqual(candidate, selected)
        table, refs = source_bundle()
        selected = {
            "sheets": {
                "دفتر": {
                    "unit": "IRT",
                    "human_decisions": {"unit": {"actor_id": "human"}},
                }
            }
        }
        original = deepcopy(selected)
        candidate, _, _ = normalize(table, refs, selected)
        self.assertEqual(candidate["sheets"]["دفتر"]["unit"], "IRT")
        self.assertEqual(selected, original)

    def test_removed_evidence_cannot_leave_inferred_unit_or_linked_human_role(self):
        table, refs = source_bundle()
        settings, _, _ = normalize(table, refs)
        settings["sheets"][table.name]["linked_account_roles"] = {
            "old": {"role": "capital", "answer_id": "old-answer"}
        }
        candidate, result, _ = normalize(table, [], settings)
        self.assertEqual(result.question.code, "interpretation_unit")
        self.assertNotIn("unit", candidate["sheets"][table.name])
        self.assertNotIn("linked_account_roles", candidate["sheets"][table.name])

    def test_purchases_without_inventory_control_cannot_be_reported_as_cost_free_profit(
        self,
    ):
        table, refs = source_bundle()
        _, result, _ = normalize(table, refs)
        rows = financial_rows(result.sheets[0])
        rows = [
            row for row in rows if not row.values.get("periodic_inventory_transfer")
        ]
        period = PeriodSpec("year", date(2024, 3, 20), date(2025, 3, 20))
        declared = declarations(
            rows,
            period,
            None,
            {
                "coverage|ledger|year": "declared_complete",
                "cogs|year": "not_required",
                "income_tax|year": "recognized",
            },
        )
        metric = next(
            item
            for item in ledger_metrics(rows, period, declared)
            if item.metric_key == "net_profit"
        )
        self.assertIsNone(metric.value)
        self.assertIn("cogs_unknown", metric.reason_codes)

    def test_conflicting_source_roles_for_one_path_reject_whole_journal(self):
        table, refs = source_bundle()
        table.rows[4].values[5] = "موجودی کالا"
        _, result, _ = normalize(table, refs)
        self.assertIsNone(result.question)
        self.assertTrue(
            any("account_role_conflict" in row.errors for row in result.sheets[0].rows)
        )
        self.assertFalse(
            all(row.values.get("role_controls_passed") for row in result.sheets[0].rows)
        )

    def test_memory_reuses_mapping_not_units_or_coverage_and_stays_company_local_input(
        self,
    ):
        table, refs = source_bundle()
        settings, result, _ = normalize(table, refs)
        remembered = remember([table], settings, result)
        reused = apply_memory([table], {}, [{"id": "old-run", "settings": remembered}])
        self.assertEqual(reused["sheets"]["دفتر"]["mapping"], result.sheets[0].mapping)
        self.assertNotIn("unit", reused["sheets"]["دفتر"])
        self.assertNotIn("account_roles", reused["sheets"]["دفتر"])
        self.assertEqual(apply_memory([table], {}, [])["sheets"]["دفتر"], {})

    def test_excluded_duplicate_does_not_poison_metrics_and_unknown_coverage_stays_unknown(
        self,
    ):
        table, refs = source_bundle()
        _, result, _ = normalize(table, refs)
        rows = financial_rows(result.sheets[0])
        duplicates = [
            FinancialRow(
                "excluded" + row.normalized_id,
                row.source_row_id,
                "other",
                row.interpretation_id,
                row.sheet,
                row.row_number,
                row.kind,
                row.values,
                "excluded_overlap",
            )
            for row in rows
        ]
        period = PeriodSpec("year", date(2024, 3, 20), date(2025, 3, 20))
        declared = declarations(
            rows, period, None, {"coverage|ledger|year": "declared_complete"}
        )
        self.assertEqual(
            next(
                metric
                for metric in ledger_metrics(rows + duplicates, period, declared)
                if metric.metric_key == "net_profit"
            ).value,
            "120",
        )
        declared = declarations(rows, period, None, {})
        self.assertIsNone(
            next(
                metric
                for metric in ledger_metrics(rows, period, declared)
                if metric.metric_key == "net_profit"
            ).value
        )
        self.assertEqual(declared["coverage"]["ledger"][0]["state"], "unknown")


if __name__ == "__main__":
    unittest.main()
