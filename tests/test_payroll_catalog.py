"""Partial primary-source catalog evidence; does not certify a statutory pack."""

import hashlib
import json
from decimal import Decimal
from pathlib import Path
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


class PayrollSourceCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads(
            (ROOT / "contracts/payroll/iran-1405-wage-insurance.json").read_text()
        )

    def test_sources_have_matching_original_hashes_and_primary_hosts(self):
        for source in self.catalog["sources"].values():
            with self.subTest(url=source["url"]):
                url = urlsplit(source["url"])
                self.assertEqual(url.scheme, "https")
                self.assertTrue(
                    any(
                        url.hostname == h or url.hostname.endswith("." + h)
                        for h in ("mcls.gov.ir", "tamin.ir", "rc.majlis.ir")
                    )
                )
                file = (ROOT / source["path"]).resolve()
                self.assertTrue(file.is_relative_to(ROOT / "docs/legal-sources"))
                data = file.read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), source["sha256"])
                self.assertTrue(source["tls_verified"])
                self.assertNotIn(b"error-section--waiting", data)
                if file.suffix == ".pdf":
                    self.assertTrue(data.startswith(b"%PDF"))

    def test_primary_news_preserves_exact_rial_minimum_and_scope(self):
        p = self.catalog["parameters"]["insurance_daily_floor"]
        self.assertEqual(self.catalog["currency"], "IRR")
        self.assertEqual(p["value"], "5541850")
        self.assertIn("excludes_fixed_wage", p["scope"])
        raw = (ROOT / self.catalog["sources"][p["source"]]["path"]).read_text()
        self.assertIn("5،541،850", raw)
        self.assertEqual(
            Decimal(self.catalog["parameters"]["other_wage_increase_rate"]["value"]),
            Decimal(".45"),
        )

    def test_employer_combination_is_conditional_and_not_universal(self):
        p = self.catalog["parameters"]
        self.assertEqual(
            Decimal(p["employer_base_insurance_rate"]["value"])
            + Decimal(p["employer_unemployment_rate"]["value"]),
            Decimal(p["employer_insurance_rate"]["value"]),
        )
        self.assertTrue(p["employer_insurance_rate"]["requires_explicit_eligibility"])
        self.assertIn("foreign_nationals", p["employer_insurance_rate"]["excluded"])
        self.assertIn(
            "unemployment_law", p["employer_insurance_rate"]["supporting_sources"]
        )

    def test_partial_catalog_cannot_claim_legal_or_complete_pack(self):
        self.assertFalse(self.catalog["legal_verified"])
        self.assertFalse(self.catalog["complete_rulepack"])
        self.assertFalse(self.catalog["current_consolidated_legal_acceptance"])
        self.assertIn("insurance_daily_cap", self.catalog["unavailable"])
        self.assertNotIn("insurance_daily_cap", self.catalog["parameters"])
        for parameter in self.catalog["parameters"].values():
            self.assertGreaterEqual(Decimal(parameter["value"]), 0)
            self.assertIn(parameter["source"], self.catalog["sources"])

    def test_housing_uses_current_1405_column_never_prior_1404(self):
        item = self.catalog["parameters"]["housing_allowance_monthly"]
        self.assertEqual(item["value"], "30000000")
        self.assertNotEqual(item["value"], "9000000")
        self.assertEqual(item["verification_level"], "official_provincial_table_only")
        self.assertFalse(item["cabinet_instrument_verified"])
        self.assertFalse(item["automatic_component"])

    def test_signed_circular_and_table_have_separate_hashed_provenance(self):
        sources = self.catalog["sources"]
        for key in ("wage_circular_6682", "provincial_wage_table"):
            source = sources[key]
            data = (ROOT / source["path"]).read_bytes()
            self.assertTrue(data.startswith(b"%PDF"))
            self.assertEqual(hashlib.sha256(data).hexdigest(), source["sha256"])
            self.assertEqual(
                source["discovered_from"], "https://hormozgan.mcls.gov.ir/"
            )
        self.assertEqual(
            self.catalog["parameters"]["household_allowance_monthly"]["source"],
            "wage_circular_6682",
        )
        self.assertEqual(
            self.catalog["parameters"]["household_allowance_monthly"]["value"],
            "22000000",
        )
        self.assertEqual(
            self.catalog["parameters"]["eidi_maximum_full_year"]["value"], "498766500"
        )

    def test_family_eligibility_and_student_exclusions_never_auto_grant(self):
        p = self.catalog["parameters"]
        child = p["child_allowance_monthly_per_eligible_child"]
        self.assertEqual(child["value"], "16625550")
        self.assertEqual(child["eligibility"]["minimum_paid_insurance_days"], 720)
        self.assertIn("under18", child["eligibility"]["child_any_of"])
        self.assertIn("exclusively_studying", child["eligibility"]["child_any_of"])
        self.assertIsNone(child["eligibility"]["child_count_limit"])
        for key in (
            "child_allowance_monthly_per_eligible_child",
            "marriage_allowance_monthly",
            "household_allowance_monthly",
        ):
            self.assertFalse(p[key]["automatic_component"])
        self.assertIn("unmarried_workers", p["marriage_allowance_monthly"]["excluded"])
        self.assertIn(
            "summer_student_temporary_familiarization_under_clause6",
            p["household_allowance_monthly"]["excluded"],
        )


if __name__ == "__main__":
    unittest.main()
