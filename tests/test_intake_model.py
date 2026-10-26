"""Independent controls for provider proposals; no external model calls."""

from copy import deepcopy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.domain.interpretation import analyze  # noqa: E402
from didban.domain.model_interpretation import accept_proposal  # noqa: E402
from didban.domain.source_tables import Sheet, Row  # noqa: E402

BANK = Sheet(
    "بانک",
    [
        Row(
            1,
            [
                "تاریخ عملیات",
                "خالص گردش",
                "مانده پس از تراکنش",
                "واحد",
                "حساب بانک",
                "کد رهگیری",
            ],
        ),
        Row(2, ["2026-01-01", "100", "100", "IRR", "bank-1", "tx-1"]),
        Row(3, ["2026-01-02", "50", "150", "IRR", "bank-1", "tx-2"]),
    ],
)


def proposal(
    table=BANK,
    fields=("date", "amount", "balance", "currency", "bank_account", "reference"),
    kind="bank",
    roles=(),
):
    return {
        "ambiguous": False,
        "sheet_name": table.name,
        "header_row": 1,
        "source_kind": kind,
        "mapping": [
            {"field": f, "column": i, "evidence": table.rows[0].values[i - 1]}
            for i, f in enumerate(fields, 1)
        ],
        "account_roles": list(roles),
    }


class IntakeModelControlTests(unittest.TestCase):
    def test_reviewed_headers_and_full_bank_sequence_accept_with_provenance(self):
        self.assertEqual(analyze([BANK], {}).question.code, "interpretation_mapping")
        settings, result = accept_proposal([BANK], {}, proposal(), "request-one")
        self.assertIsNone(result.question)
        self.assertEqual(result.sheets[0].provenance, "validated_automatic")
        self.assertEqual(result.sheets[0].rows[1].values["amount"], "50")
        self.assertEqual(
            settings["sheets"]["بانک"]["model_proposal"]["request_id"], "request-one"
        )

    def test_swapped_columns_fake_evidence_and_duplicate_mappings_are_rejected(self):
        for mutate in (
            lambda p: p["mapping"][1].update(column=3, evidence=BANK.rows[0].values[2]),
            lambda p: p["mapping"][1].update(evidence="fabricated"),
            lambda p: p["mapping"].append(deepcopy(p["mapping"][0])),
            lambda p: p.update(ambiguous=True),
        ):
            p = proposal()
            mutate(p)
            self.assertIsNone(accept_proposal([BANK], {}, p, "request"))

    def test_unknown_currency_bad_balance_and_formula_do_not_get_accepted(self):
        for field, value in [(3, "USD"), (2, "999"), (3, None)]:
            table = deepcopy(BANK)
            table.rows[2].values[field] = value
            self.assertIsNone(accept_proposal([table], {}, proposal(), "request"))
        table = deepcopy(BANK)
        table.rows[1] = Row(2, BANK.rows[1].values, frozenset({2}))
        self.assertIsNone(accept_proposal([table], {}, proposal(), "request"))

    def test_one_row_balance_is_insufficient_and_human_mapping_is_preserved(self):
        self.assertIsNone(
            accept_proposal(
                [Sheet(BANK.name, BANK.rows[:2])], {}, proposal(), "request"
            )
        )
        settings = {
            "sheets": {BANK.name: {"source_kind": "ledger", "actor_id": "human"}}
        }
        self.assertIsNone(accept_proposal([BANK], settings, proposal(), "request"))
        self.assertEqual(settings["sheets"][BANK.name]["source_kind"], "ledger")

    def test_balanced_journal_and_exact_account_name_validate_roles_without_confidence(
        self,
    ):
        table = Sheet(
            "دفتر",
            [
                Row(
                    1,
                    [
                        "شماره سند",
                        "تاریخ",
                        "کد حساب",
                        "نام حساب",
                        "بدهکار",
                        "بستانکار",
                        "واحد",
                        "نوع سند",
                    ],
                ),
                Row(
                    2,
                    [
                        "1",
                        "2026-01-01",
                        "001",
                        "موجودی بانک",
                        "100",
                        "0",
                        "IRR",
                        "regular",
                    ],
                ),
                Row(
                    3,
                    ["1", "2026-01-01", "002", "سرمایه", "0", "100", "IRR", "regular"],
                ),
            ],
        )
        fields = (
            "entry_id",
            "date",
            "account",
            "account_name",
            "debit",
            "credit",
            "currency",
            "entry_type",
        )
        p = proposal(
            table,
            fields,
            "ledger",
            [
                {"account_code": "001", "role": "bank", "evidence": "موجودی بانک"},
                {"account_code": "002", "role": "capital", "evidence": "سرمایه"},
            ],
        )
        accepted = accept_proposal([table], {}, p, "request-one")
        self.assertIsNotNone(accepted)
        row = accepted[1].sheets[0].rows[0]
        self.assertEqual(row.values["role_provenance"], "validated_policy")
        self.assertTrue(row.values["role_controls_passed"])
        self.assertEqual(row.values["role_evidence"]["source_row"], 2)
        another = accept_proposal([table], {}, p, "request-two")
        self.assertEqual(row.fingerprint, another[1].sheets[0].rows[0].fingerprint)
        broken = deepcopy(table)
        broken.rows[2].values[5] = "101"
        self.assertIsNone(accept_proposal([broken], {}, p, "request"))
        wrong = deepcopy(p)
        wrong["account_roles"][0]["role"] = "revenue"
        self.assertIsNone(accept_proposal([table], {}, wrong, "request"))
        human = {"sheets": {table.name: {"account_roles": {"001": "cash"}}}}
        self.assertIsNone(accept_proposal([table], human, p, "request"))


if __name__ == "__main__":
    unittest.main()
