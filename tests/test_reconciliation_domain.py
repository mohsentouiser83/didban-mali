"""Exact comparison controls and stable reference chains over synthetic pinned rows."""

from dataclasses import replace
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.domain.reconciliation import ComparisonRow, bank_ledger, moadian  # noqa: E402


def row(key, source_kind, **values):
    return ComparisonRow(
        key,
        key,
        "file-" + source_kind,
        "sheet",
        1,
        source_kind,
        {"unit": "IRR", **values},
    )


class ReconciliationDomainTests(unittest.TestCase):
    def bank_pair(self):
        return [
            row("b", "bank", date="2026-09-01", amount="100", reference="r"),
            row(
                "l",
                "ledger",
                date="2026-09-01",
                debit="100",
                credit="0",
                reference="r",
                role="bank",
                source_role="1101",
            ),
        ]

    def portal_pair(self):
        base = {
            "issued_on": "2026-09-01",
            "gross": "100",
            "vat": "0",
            "tax_id": "T1",
            "party_id": "C1",
        }
        return [
            row("i", "sales_invoices", **base),
            row("p", "moadian_sales", kind="original", **base),
        ]

    def test_bank_unique_reference_account_direction_date_amount(self):
        self.assertEqual(
            bank_ledger(self.bank_pair(), {"file-bank:sheet": "1101"})[
                0
            ].classification,
            "exact_unique",
        )

    def test_amount_and_date_without_reference_never_auto_accept(self):
        rows = [
            replace(r, values={k: v for k, v in r.values.items() if k != "reference"})
            for r in self.bank_pair()
        ]
        self.assertNotIn(
            "exact_unique",
            [p.classification for p in bank_ledger(rows, {"file-bank:sheet": "1101"})],
        )

    def test_binding_unknown_not_invented(self):
        self.assertEqual(
            bank_ledger(self.bank_pair(), {})[0].classification, "needs_review"
        )

    def test_repeated_equal_bank_records_remain_separate_ambiguous(self):
        rows = self.bank_pair()
        rows.append(replace(rows[0], normalized_id="b2"))
        actual = bank_ledger(rows, {"file-bank:sheet": "1101"})
        self.assertEqual([r.classification for r in actual], ["ambiguous", "ambiguous"])
        self.assertTrue(all(len(r.rows) == 2 for r in actual))

    def test_repeated_ledger_candidates_are_individually_reviewable(self):
        rows = self.bank_pair()
        rows.append(replace(rows[1], normalized_id="l2"))
        self.assertEqual(len(bank_ledger(rows, {"file-bank:sheet": "1101"})), 2)

    def test_difference_and_large_values_stay_exact(self):
        rows = self.bank_pair()
        rows[0] = replace(
            rows[0],
            values={
                **rows[0].values,
                "amount": "99999999999999999999999999999999.000001",
            },
        )
        self.assertEqual(
            bank_ledger(rows, {"file-bank:sheet": "1101"})[0].difference,
            "99999999999999999999999999999899.000001",
        )

    def test_many_ledger_lines_are_proposal_with_exact_capacity_sum(self):
        rows = self.bank_pair()
        rows[1] = replace(rows[1], values={**rows[1].values, "debit": "60"})
        rows.append(
            replace(
                rows[1], normalized_id="l2", values={**rows[1].values, "debit": "40"}
            )
        )
        actual = bank_ledger(rows, {"file-bank:sheet": "1101"})
        self.assertEqual(len(actual), 1)
        self.assertEqual(actual[0].classification, "suggested")
        self.assertEqual(actual[0].reasons, ("group_sum_equal",))
        self.assertEqual(len(actual[0].rows), 3)

    def test_party_tax_date_and_amount_required_for_moadian_exact(self):
        self.assertEqual(
            moadian(self.portal_pair(), "sales")[0].classification, "exact_unique"
        )

    def test_absent_party_is_review_and_missing_vat_not_zero(self):
        rows = self.portal_pair()
        rows[1] = replace(
            rows[1],
            values={
                k: v for k, v in rows[1].values.items() if k not in ("party_id", "vat")
            },
        )
        actual = moadian(rows, "sales")[0]
        self.assertEqual(actual.classification, "needs_review")
        self.assertIn("party_identity_missing", actual.reasons)
        self.assertIn("tax_missing", actual.reasons)

    def test_moadian_amount_delta_does_not_edit_invoice(self):
        rows = self.portal_pair()
        rows[1] = replace(rows[1], values={**rows[1].values, "gross": "110"})
        self.assertEqual(moadian(rows, "sales")[0].difference, "10")
        self.assertEqual(rows[0].values["gross"], "100")

    def test_sales_purchase_do_not_mix(self):
        self.assertFalse(moadian(self.portal_pair(), "purchase"))

    def test_chain_missing_and_cycle_remain_reviewable(self):
        a = row(
            "p",
            "moadian_sales",
            issued_on="2026-09-01",
            gross="100",
            vat="0",
            tax_id="T1",
            kind="cancellation",
            reference_tax_id="T2",
        )
        missing = moadian([a], "sales")[0]
        self.assertEqual(missing.classification, "needs_review")
        self.assertIn("missing_reference", missing.chain)
        b = replace(
            a,
            normalized_id="p2",
            values={**a.values, "tax_id": "T2", "reference_tax_id": "T1"},
        )
        self.assertTrue(all("cycle" in x.chain for x in moadian([a, b], "sales")))

    def test_reference_chain_can_use_pinned_prior_period_original(self):
        original = row(
            "o",
            "moadian_sales",
            issued_on="2026-08-01",
            gross="100",
            vat="0",
            tax_id="T0",
            kind="original",
        )
        correction = row(
            "c",
            "moadian_sales",
            issued_on="2026-09-01",
            gross="90",
            vat="0",
            tax_id="T1",
            kind="correction",
            reference_tax_id="T0",
        )
        actual = moadian([correction], "sales", [original, correction])[0]
        self.assertEqual(actual.chain, ("T0",))
        self.assertEqual(actual.classification, "needs_review")

    def test_two_identical_tax_ids_ambiguous_not_collapsed(self):
        rows = self.portal_pair()
        rows.append(replace(rows[1], normalized_id="p2"))
        self.assertEqual(moadian(rows, "sales")[0].classification, "ambiguous")


if __name__ == "__main__":
    unittest.main()
