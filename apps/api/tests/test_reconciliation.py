from didban.reconciliation import propose


def ledger(ident="L", **changes):
    return {"id": ident, "source_row_id": ident, "date": "2026-09-05", "account": "1101", "reference": "REF", "debit": "100", "credit": "0", "entry_type": "regular", **changes}


def bank(ident="B", **changes):
    return {"id": ident, "source_row_id": ident, "date": "2026-09-05", "account": "A", "reference": "REF", "amount": "100", "kind": "movement", **changes}


def test_unique_shared_reference_exact_amount_and_account_produces_proposal_only():
    result = propose([ledger()], [bank()], {"bank_to_ledger": {"A": "1101"}})
    assert result[0]["status"] == "exact_proposal"
    assert result[0]["evidence_refs"] == ["B", "L"]
    assert result[0]["ledger_ids"] == ["L"]


def test_amount_date_without_explicit_account_mapping_is_not_exact():
    result = propose([ledger()], [bank()])
    assert result[0]["status"] == "needs_review"
    assert result[0]["reason_codes"] == ["bank_ledger_mapping_missing"]
    assert result[0]["ledger_ids"] == []


def test_reference_required_even_with_same_amount_and_date():
    result = propose([ledger(reference="")], [bank(reference="")], {"bank_to_ledger": {"A": "1101"}})
    assert result[0]["status"] == "needs_review"
    assert result[0]["reason_codes"] == ["shared_reference_missing"]


def test_wrong_account_or_direction_and_date_require_review():
    mapping = {"bank_to_ledger": {"A": "1101"}}
    assert propose([ledger(account="1102")], [bank()], mapping)[0]["reason_codes"] == ["ledger_account_mismatch"]
    assert propose([ledger(debit="0", credit="100")], [bank()], mapping)[0]["reason_codes"] == ["amount_mismatch"]
    assert propose([ledger(date="2026-09-06")], [bank()], mapping)[0]["reason_codes"] == ["date_mismatch"]


def test_competing_bank_or_ledger_candidates_never_auto_accepted():
    mapping = {"bank_to_ledger": {"A": "1101"}}
    result = propose([ledger()], [bank("B1"), bank("B2")], mapping)
    assert all(proposal["status"] == "needs_review" for proposal in result)
    assert all("competing_bank_candidates" in proposal["reason_codes"] for proposal in result)
    result = propose([ledger("L1"), ledger("L2")], [bank()], mapping)
    assert result[0]["status"] == "needs_review"
    assert "multiple_ledger_candidates" in result[0]["reason_codes"]


def test_anchor_and_opening_journals_are_not_movement_proposals():
    mapping = {"bank_to_ledger": {"A": "1101"}}
    assert propose([ledger()], [bank(kind="opening")], mapping) == []
    assert propose([ledger(entry_type="opening")], [bank()], mapping)[0]["reason_codes"] == ["ledger_reference_missing"]


def test_one_rial_difference_at_29_digits_is_never_an_exact_proposal():
    result = propose([ledger(debit="99999999999999999999999999999")], [bank(amount="100000000000000000000000000000")], {"bank_to_ledger": {"A": "1101"}})
    assert result[0]["status"] == "needs_review"
    assert result[0]["reason_codes"] == ["amount_mismatch"]
