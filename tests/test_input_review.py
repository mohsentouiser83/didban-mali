"""Bounded account-role corrections cannot target missing evidence or source amounts."""

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from didban.domain.input_review import validate_correction


class InputReviewDomainTests(unittest.TestCase):
    def test_mapping_requires_known_columns_complete_fields_and_header_evidence(self):
        context = {
            "sheets": [
                {
                    "file_id": "file",
                    "sheet_name": "bank",
                    "source_kind": "bank",
                    "header_row": 1,
                    "columns": ["date", "amount", "currency"],
                    "mapping": {"date": 1, "amount": 2, "currency": 3},
                }
            ]
        }
        selection = {
            "action": "set_column_mapping",
            "file_id": "file",
            "sheet_name": "bank",
            "unit": "IRT",
            "date": "2099-01-01",
            "mapping": [
                {"field": "date", "column": 1, "evidence": "date"},
                {"field": "amount", "column": 2, "evidence": "amount"},
                {"field": "currency", "column": 3, "evidence": "currency"},
            ],
        }
        valid = validate_correction(selection, context)
        self.assertEqual(valid["mapping"], {"date": 1, "amount": 2, "currency": 3})
        self.assertNotIn("unit", valid)
        self.assertNotIn("date", valid)
        for mapping in (
            [{"field": "amount", "column": 2, "evidence": "amount"}],
            [{"field": "date", "column": 99, "evidence": "date"}],
            [{"field": "date", "column": 1, "evidence": "fabricated"}],
            [{"field": "unsupported", "column": 1, "evidence": "date"}],
            [{"field": "date", "column": True, "evidence": "date"}],
        ):
            self.assertIsNone(
                validate_correction(selection | {"mapping": mapping}, context)
            )

    def setUp(self):
        self.account = {
            "file_id": "known-file",
            "sheet_name": "دفتر",
            "account_code": "010",
            "account_name": "وام کارکنان",
            "role": "trade_ar",
        }
        self.context = {"accounts": [self.account]}
        self.proposal = {
            **self.account,
            "action": "set_account_role",
            "role": "other_ar",
            "evidence": "وام کارکنان",
            "reason": "بررسی نقش",
        }

    def test_known_evidence_changes_only_role(self):
        result = validate_correction(self.proposal | {"amount": "999"}, self.context)
        self.assertEqual(result["before_role"], "trade_ar")
        self.assertEqual(result["role"], "other_ar")
        self.assertNotIn("amount", result)

    def test_unknown_target_or_evidence_is_rejected(self):
        for patch in (
            {"file_id": "other-company-file"},
            {"account_code": "missing"},
            {"evidence": "invented evidence"},
            {"role": "unknown"},
            {"action": "edit_amount"},
        ):
            self.assertIsNone(validate_correction(self.proposal | patch, self.context))

    def test_ambiguity_is_not_a_correction(self):
        self.assertIsNone(
            validate_correction({"action": "ask_clarification"}, self.context)
        )
        self.assertIsNone(validate_correction(None, self.context))


if __name__ == "__main__":
    unittest.main()
