"""Portal-export rules with synthetic identities; real customer files stay private."""

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.domain.interpretation import analyze  # noqa: E402
from didban.domain.source_tables import Sheet, Row  # noqa: E402
from didban.domain.normalization import InvalidValue, financial_date  # noqa: E402
from didban.domain.moadian_export import issue_date  # noqa: E402


def portal_sheet(direction="sales", **values):
    headers = [
        "نوع صورت‌حساب",
        "موضوع صورت‌حساب",
        "نقش مودی (نقش فروشنده)" if direction == "sales" else "نقش مودی (نقش خریدار)",
        "شماره مالیاتی صورت‌حساب",
        "مجموع صورت‌حساب",
        "مالیات بر ارزش افزوده",
        "تاریخ صدور صورت‌حساب",
        "وضعیت صورت‌حساب",
        "شناسه هویتی خریدار/ عرضه کننده واسط"
        if direction == "sales"
        else "شناسه هویتی فروشنده/ عرضه کننده واسط",
        "مجموع بهای کالا و خدمات صورت‌حساب بدون مالیات‌ها و عوارض (ریال)",
        "شماره مالیاتی صورت‌حساب مرجع",
    ]
    row = [
        "اول",
        "اصلی",
        "عادی",
        "TAX0001",
        "110",
        "10",
        "1403/12/28 23:59:59",
        "تایید سیستمی",
        "001234",
        "100",
        None,
    ]
    for key, value in values.items():
        row[int(key)] = value
    return Sheet("invoice", [Row(1, headers), Row(2, row)])


class PortalExportTests(unittest.TestCase):
    def parse(self, table=None, settings=None):
        result = analyze([table or portal_sheet()], settings or {})
        self.assertIsNone(result.question)
        return result.sheets[0]

    def test_direction_uses_taxpayer_role_and_preserves_tax_identity_without_book_number(
        self,
    ):
        for direction, expected in [
            ("sales", "moadian_sales"),
            ("purchases", "moadian_purchases"),
        ]:
            sheet = self.parse(portal_sheet(direction))
            self.assertEqual(sheet.kind, expected)
            row = sheet.rows[0]
            self.assertEqual(row.errors, [])
            self.assertEqual(row.values["tax_id"], "TAX0001")
            self.assertIsNone(row.values["invoice_id"])
            self.assertEqual(row.values["party_id"], "001234")
            self.assertEqual(row.values["issued_on"], "2025-03-18")
            self.assertEqual(row.values["issued_at_source"], "1403/12/28 23:59:59")
            self.assertEqual(row.values["gross"], "110")
            self.assertEqual(row.values["net"], "100")
            self.assertEqual(row.values["kind"], "original")
            self.assertEqual(sheet.provenance, "validated_automatic")
            self.assertEqual(
                sheet.controls[-1]["evidence"]["policy"], "moadian-portal-export-v1"
            )

    def test_reordered_columns_and_foreign_sheet_name_keep_same_meaning(self):
        table = portal_sheet()
        result = self.parse(
            Sheet(
                "پیوست", [Row(r.number, list(reversed(r.values))) for r in table.rows]
            )
        )
        self.assertEqual(result.rows[0].values["party_id"], "001234")
        self.assertEqual(result.kind, "moadian_sales")

    def test_subject_is_separate_from_invoice_type_and_references_survive(self):
        for subject, expected in [
            ("اصلاحی", "corrective"),
            ("ابطالی", "cancellation"),
            ("برگشت از فروش", "return"),
        ]:
            table = portal_sheet(**{"1": subject, "10": "PREVIOUS0001"})
            row = self.parse(table).rows[0]
            self.assertEqual(row.values["kind"], expected)
            self.assertEqual(row.values["reference_tax_id"], "PREVIOUS0001")
            self.assertEqual(row.errors, [])

    def test_duplicate_tax_ids_invalid_totals_and_formulas_are_not_accepted(self):
        table = portal_sheet()
        duplicated = self.parse(
            Sheet("invoice", table.rows + [Row(3, table.rows[1].values)])
        )
        self.assertTrue(
            all("duplicate_logical_key" in row.errors for row in duplicated.rows)
        )
        invalid = self.parse(portal_sheet(**{"4": "111"}))
        self.assertIn("moadian_total_mismatch", invalid.rows[0].errors)
        self.assertEqual(invalid.controls[-1]["outcome"], "failed")
        formula = Sheet(
            "invoice", [table.rows[0], Row(2, table.rows[1].values, frozenset({10}))]
        )
        self.assertIn("formula_not_evaluated", self.parse(formula).rows[0].errors)

    def test_unknown_vat_is_not_zero_and_unknown_party_is_not_invented(self):
        row = self.parse(portal_sheet(**{"5": None, "8": None})).rows[0]
        self.assertIsNone(row.values["vat"])
        self.assertIsNone(row.values["party_id"])
        self.assertEqual(row.errors, [])
        self.assertEqual(
            self.parse(portal_sheet(**{"5": None})).controls[-1]["outcome"], "unknown"
        )

    def test_units_are_explicit_and_toman_converts_exactly(self):
        table = portal_sheet()
        table.rows[0].values[9] = table.rows[0].values[9].replace("ریال", "تومان")
        row = self.parse(table).rows[0]
        self.assertEqual(row.values["original_unit"], "IRT")
        self.assertEqual(row.values["gross"], "1100")
        self.assertEqual(row.values["net"], "1000")
        table.rows[0].values[9] = table.rows[0].values[9].replace("(تومان)", "")
        self.assertIsNotNone(analyze([table], {}).question)
        conflict = {"sheets": {"invoice": {"unit": "IRT"}}}
        self.assertEqual(
            analyze([portal_sheet()], conflict).question.code, "interpretation_mapping"
        )

    def test_direction_conflicts_and_ambiguous_headers_stay_questions(self):
        for headers in [
            portal_sheet().rows[0].values + ["نقش مودی (نقش خریدار)"],
            portal_sheet().rows[0].values + ["شماره مالیاتی صورت‌حساب"],
        ]:
            table = Sheet("invoice", [Row(1, headers), portal_sheet().rows[1]])
            self.assertIsNotNone(analyze([table], {}).question)
        conflict = {"sheets": {"invoice": {"source_kind": "moadian_purchases"}}}
        self.assertEqual(
            analyze([portal_sheet()], conflict).question.code, "interpretation_mapping"
        )

    def test_human_mapping_is_preserved_and_not_replaced_by_signature(self):
        table = portal_sheet()
        selected = {
            "sheets": {
                "invoice": {
                    "header_row": 1,
                    "source_kind": "moadian_sales",
                    "unit": "IRR",
                    "mapping": {
                        "tax_id": 4,
                        "issued_on": 7,
                        "gross": 5,
                        "kind": 2,
                        "vat": 6,
                    },
                    "actor_id": "human",
                }
            }
        }
        original = deepcopy(selected)
        self.assertEqual(
            self.parse(table, selected).mapping,
            selected["sheets"]["invoice"]["mapping"],
        )
        self.assertEqual(selected, original)
        self.assertEqual(self.parse(table, selected).provenance, "human")

    def test_only_valid_source_local_timestamp_is_accepted(self):
        self.assertEqual(issue_date("۱۴۰۳/۱۲/۳۰ ۲۳:۵۹:۵۹", "jalali"), "2025-03-20")
        self.assertEqual(issue_date("2026-10-26T09:12:13", "gregorian"), "2026-10-26")
        self.assertEqual(issue_date(datetime(2026, 10, 26, 23, 59), None), "2026-10-26")
        for value in [
            "1404/12/30 12:00:00",
            "1403/12/28 24:00:00",
            "1403/12/28 09:60:00",
            "1403/12/28 09:00:60",
            "1403/12/28 09:00:00Z",
            "1403/12/28 09:00:00 junk",
            datetime(2026, 10, 26, tzinfo=timezone.utc),
        ]:
            with self.assertRaises(InvalidValue):
                issue_date(value, None)
        # No global relaxation for other financial date fields.
        with self.assertRaises(InvalidValue):
            financial_date("1403/12/28 09:00:00")

    def test_explicit_currency_and_book_number_are_never_discarded(self):
        table = portal_sheet()
        table.rows[0].values.extend(["currency", "شماره فاکتور"])
        table.rows[1].values.extend(["USD", "INTERNAL0001"])
        result = self.parse(table)
        self.assertEqual(result.rows[0].values["invoice_id"], "INTERNAL0001")
        self.assertIn("unsupported_unit", result.rows[0].errors)
        self.assertIsNone(result.rows[0].values["unit"])
        table.rows[1].values[-2] = "IRT"
        self.assertIn("moadian_unit_conflict", self.parse(table).rows[0].errors)


if __name__ == "__main__":
    unittest.main()
