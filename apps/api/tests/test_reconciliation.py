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


def test_shared_reference_aggregate_requires_exact_sum_direction_and_human_review():
    mapping = {"bank_to_ledger": {"A": "1101"}}
    rows = [ledger("L1", debit="60"), ledger("L2", debit="40")]
    candidate = propose(rows, [bank()], mapping)[0]
    assert candidate["status"] == "exact_proposal"
    assert candidate["match_kind"] == "reference_aggregate"
    assert candidate["ledger_total"] == "100"
    assert candidate["ledger_ids"] == ["L1", "L2"]
    assert candidate["evidence_refs"] == ["B", "L1", "L2"]
    assert candidate["requires_human_review"] is True
    assert propose([ledger()], [bank()], mapping)[0]["requires_human_review"] is True
    assert propose([*rows, ledger("L3", debit="1")], [bank()], mapping)[0]["ledger_ids"] == []
    mixed = [ledger("L1", debit="120"), ledger("L2", debit="0", credit="20")]
    assert propose(mixed, [bank()], mapping)[0]["ledger_ids"] == []


def test_aggregate_does_not_cross_references_accounts_or_silently_ignore_dates():
    mapping = {"bank_to_ledger": {"A": "1101"}}
    rows = [ledger("L1", debit="60"), ledger("L2", debit="40", date="2026-09-06")]
    candidate = propose(rows, [bank()], mapping)[0]
    assert candidate["status"] == "needs_review"
    assert candidate["reason_codes"] == ["date_mismatch"]
    for changes in ({"reference": "OTHER"}, {"account": "OTHER"}):
        rows[1] = ledger("L2", debit="40", **changes)
        assert propose(rows, [bank()], mapping)[0]["ledger_ids"] == []


def test_aggregate_preserves_large_amounts_and_competing_capacity():
    mapping = {"bank_to_ledger": {"A": "1101"}}
    rows = [ledger("L1", debit="99999999999999999999999999999"), ledger("L2", debit="1")]
    candidate = propose(rows, [bank(amount="100000000000000000000000000000")], mapping)[0]
    assert candidate["ledger_total"] == "100000000000000000000000000000"
    assert candidate["status"] == "exact_proposal"
    proposals = propose(rows, [bank("B1", amount=candidate["amount"]), bank("B2", amount=candidate["amount"])], mapping)
    assert all("competing_bank_candidates" in item["reason_codes"] for item in proposals)
