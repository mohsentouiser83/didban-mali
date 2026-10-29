"""Official table transcription and engine mapping; no statutory approval claim."""

from __future__ import annotations

from decimal import Decimal
import json
from pathlib import Path
import unittest

from didban.domain.payroll.calculation import tax_amount

ROOT = Path(__file__).resolve().parents[1]
TABLE = json.loads((ROOT / "contracts/payroll/iran-1405-tax.json").read_text())


class SalaryTax1405Test(unittest.TestCase):
    def rules(self):
        return {
            "rounding_unit": "1",
            "tax_exemption_monthly": TABLE["monthly_exemption"],
            "tax_bands": TABLE["monthly_bands_after_exemption"],
        }

    def test_official_annual_gross_limits_map_to_post_exemption_monthly_bands(self):
        exemption = Decimal(TABLE["annual_exemption"])
        self.assertEqual(exemption, Decimal(TABLE["monthly_exemption"]) * 12)
        expected = ["9600000000", "12000000000", "14400000000", "16800000000", None]
        self.assertEqual(TABLE["annual_gross_band_bounds"], expected)
        for gross, band in zip(
            expected, TABLE["monthly_bands_after_exemption"], strict=True
        ):
            self.assertEqual(
                None if gross is None else (Decimal(gross) - exemption) / 12,
                None if band["up_to"] is None else Decimal(band["up_to"]),
            )

    def test_each_band_boundary_and_annual_equivalent(self):
        for gross, expected in [
            ("0", "0"),
            ("400000000", "0"),
            ("500000000", "10000000"),
            ("800000000", "40000000"),
            ("1000000000", "70000000"),
            ("1200000000", "110000000"),
            ("1400000000", "160000000"),
            ("1500000000", "190000000"),
        ]:
            with self.subTest(gross=gross):
                self.assertEqual(
                    tax_amount(Decimal(gross), self.rules()), Decimal(expected)
                )
                self.assertEqual(
                    tax_amount(Decimal(gross) * 12, self.rules(), 12),
                    Decimal(expected) * 12,
                )

    def test_table_does_not_claim_full_payroll_acceptance(self):
        self.assertEqual(TABLE["status"], "source_verified_component")
        self.assertIs(TABLE["legal_verified"], False)
        self.assertEqual(TABLE["unit"], "IRR")
        self.assertIn("component_tax_treatment", TABLE["excluded"])
        self.assertIn("special_payments", TABLE["excluded"])
        self.assertEqual(TABLE["source"]["pdf_page"], 9)
        self.assertNotIn("tax_mode", TABLE)
        self.assertNotIn("insurance_daily_floor", TABLE)


if __name__ == "__main__":
    unittest.main()
