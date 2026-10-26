from dataclasses import replace
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.reconciliation.engine import (
    BankRecord,
    LedgerRecord,
    ReconciliationConfig,
    reconcile,
)
from app.reconciliation.models import MatchStatus


def uid(value: int) -> UUID:
    return UUID(int=value)


def bank(
    value: int,
    *,
    day: int = 12,
    amount: str = "2500000",
    description: str = "فروش شهریور",
    reference: str | None = None,
    transaction_id: str | None = None,
) -> BankRecord:
    return BankRecord(
        id=uid(value),
        bank_account_id=uid(90),
        source_row_id=uid(1000 + value),
        booking_date=date(2026, 9, day),
        amount_irr=Decimal(amount),
        description=description,
        reference=reference,
        source_transaction_id=transaction_id,
    )


def ledger(
    value: int,
    *,
    day: int = 12,
    amount: str = "2500000",
    description: str = "فروش شهریور",
    reference: str | None = None,
    entry_id: str | None = None,
) -> LedgerRecord:
    return LedgerRecord(
        entry_id=uid(100 + value),
        bank_account_id=uid(90),
        source_row_id=uid(2000 + value),
        line_id=uid(3000 + value),
        entry_date=date(2026, 9, day),
        amount_irr=Decimal(amount),
        description=description,
        reference=reference,
        source_entry_id=entry_id,
    )


def test_unique_exact_matches_are_automatic_with_perfect_precision() -> None:
    banks = [
        bank(1, amount="100", description="وصول الف"),
        bank(2, amount="200", description="وصول ب"),
        bank(3, amount="300", description="وصول پ"),
    ]
    ledgers = [
        ledger(1, amount="100", description="وصول الف"),
        ledger(2, amount="200", description="وصول ب"),
        ledger(3, amount="300", description="وصول پ"),
    ]

    results = reconcile(banks, ledgers, ReconciliationConfig())
    automatic = [item for item in results if item.status == MatchStatus.AUTO_MATCHED]

    assert len(automatic) == 3
    assert {(item.bank_transaction_id, item.journal_entry_id) for item in automatic} == {
        (uid(1), uid(101)),
        (uid(2), uid(102)),
        (uid(3), uid(103)),
    }
    assert all(item.score == Decimal(100) for item in automatic)


def test_ambiguous_exact_candidates_are_never_automatically_accepted() -> None:
    results = reconcile(
        [bank(1)],
        [ledger(1, reference="A"), ledger(2, reference="B")],
        ReconciliationConfig(),
    )

    assert not [item for item in results if item.status == MatchStatus.AUTO_MATCHED]
    assert len([item for item in results if item.status == MatchStatus.POTENTIAL_MATCH]) == 2


def test_signed_asset_line_selects_the_correct_side_of_a_multi_line_entry() -> None:
    positive = ledger(1, amount="100", description="وصول")
    negative = LedgerRecord(
        entry_id=positive.entry_id,
        source_row_id=uid(2099),
        line_id=uid(3099),
        entry_date=positive.entry_date,
        amount_irr=Decimal("-100"),
        description="وصول",
    )

    results = reconcile(
        [bank(1, amount="100", description="وصول")],
        [negative, positive],
        ReconciliationConfig(),
    )

    automatic = [item for item in results if item.status == MatchStatus.AUTO_MATCHED]
    assert len(automatic) == 1
    assert automatic[0].evidence["accounting"]["journal_line_id"] == str(positive.line_id)  # type: ignore[index]


def test_duplicates_mismatches_and_unresolved_are_explicit() -> None:
    results = reconcile(
        [
            bank(1, transaction_id="TX-1"),
            bank(2, transaction_id="TX-1"),
            bank(3, day=20, amount="100", description="پرداخت خاص", reference="REF-9"),
            bank(4, day=15, amount="999", description="بدون متناظر"),
        ],
        [
            ledger(1, day=20, amount="120", description="پرداخت خاص", reference="REF-9"),
        ],
        ReconciliationConfig(),
    )
    statuses = [item.status for item in results]

    assert statuses.count(MatchStatus.DUPLICATE_HIGH) == 2
    assert MatchStatus.AMOUNT_MISMATCH in statuses
    assert MatchStatus.UNRESOLVED in statuses
    mismatch = next(item for item in results if item.status == MatchStatus.AMOUNT_MISMATCH)
    assert mismatch.amount_difference_irr == Decimal("-20")
    assert mismatch.evidence["bank"]

    unresolved_bank = next(
        item for item in results if item.rule_code == "BANK_WITHOUT_ACCOUNTING_MATCH"
    )
    assert unresolved_bank.evidence["bank"]["amount_irr"] == "999"
    assert unresolved_bank.evidence["bank"]["description"] == "بدون متناظر"

    duplicate_bank = next(item for item in results if item.status == MatchStatus.DUPLICATE_HIGH)
    assert duplicate_bank.evidence["bank"]["amount_irr"] == "2500000"


def test_amount_mismatch_ignores_opposite_side_of_the_same_voucher() -> None:
    incoming = ledger(1, amount="20000000", reference="PAY-009")
    outgoing = replace(
        incoming, line_id=uid(3099), source_row_id=uid(2099), amount_irr=Decimal("-20000000")
    )
    results = reconcile(
        [bank(1, amount="19500000", reference="PAY-009")],
        [incoming, outgoing],
        ReconciliationConfig(),
    )
    candidates = [item for item in results if item.bank_transaction_id and item.journal_entry_id]
    assert len(candidates) == 1
    assert candidates[0].status == MatchStatus.AMOUNT_MISMATCH
    assert candidates[0].amount_difference_irr == Decimal("-500000")
    assert candidates[0].allocations[1].journal_line_id == incoming.line_id


def test_real_bank_fees_with_distinct_documents_and_balances_are_not_duplicates():
    a = replace(
        bank(1, amount="-1200", description="کارمزد", transaction_id="77"),
        bank_account_id=uid(90),
        running_balance_irr=Decimal(10000),
    )
    b = replace(
        bank(2, amount="-1200", description="کارمزد", transaction_id="78"),
        bank_account_id=uid(90),
        running_balance_irr=Decimal(8800),
    )
    c = replace(
        bank(3, amount="350000", transaction_id="77"),
        bank_account_id=uid(90),
        running_balance_irr=Decimal(360000),
    )
    result = reconcile([a, b, c], [], ReconciliationConfig())
    assert all(
        p.status not in {MatchStatus.DUPLICATE_HIGH, MatchStatus.DUPLICATE_POSSIBLE} for p in result
    )


def test_dense_subset_suggestions_have_a_bounded_search(monkeypatch):
    from itertools import combinations as original

    visited = 0

    def bounded(items, k):
        nonlocal visited
        for combo in original(items, k):
            visited += 1
            assert visited <= 5000
            yield combo

    monkeypatch.setattr("app.reconciliation.engine.combinations", bounded)
    result = reconcile(
        [bank(1, amount="999999")],
        [ledger(n, amount="1000", description=f"item {n}") for n in range(100)],
        ReconciliationConfig(),
    )
    assert visited == 5000
    assert any(p.status == MatchStatus.UNRESOLVED for p in result)


def test_multiple_bank_lines_in_one_voucher_match_independently():
    first = replace(ledger(1, amount="100", description="A"), bank_account_id=uid(90))
    second = replace(
        ledger(2, amount="200", description="B"),
        entry_id=first.entry_id,
        source_entry_id="42",
        bank_account_id=uid(90),
    )
    first = replace(first, source_entry_id="42")
    banks = [
        replace(bank(1, amount="100", description="A"), bank_account_id=uid(90)),
        replace(bank(2, amount="200", description="B"), bank_account_id=uid(90)),
    ]
    result = reconcile(banks, [first, second], ReconciliationConfig())
    assert len([p for p in result if p.status == MatchStatus.AUTO_MATCHED]) == 2
    assert not any(p.match_level.value == "duplicate" for p in result)


def test_unrelated_line_in_matched_voucher_remains_visible():
    first = replace(ledger(1, amount="100", description="A"), bank_account_id=uid(90))
    other = replace(ledger(2, amount="300", description="C"), entry_id=first.entry_id)
    result = reconcile(
        [replace(bank(1, amount="100", description="A"), bank_account_id=uid(90))],
        [first, other],
        ReconciliationConfig(),
    )
    assert any(
        p.rule_code == "ACCOUNTING_WITHOUT_BANK_MATCH"
        and p.allocations[0].journal_line_id == other.line_id
        for p in result
    )


def test_same_voucher_number_with_different_postings_is_not_duplicate():
    records = [ledger(1, amount="100", entry_id="42"), ledger(2, amount="200", entry_id="42")]
    result = reconcile([], records, ReconciliationConfig())
    assert len(result) == 2
    assert all(p.status == MatchStatus.UNRESOLVED for p in result)


def test_different_accounts_are_not_weak_duplicates():
    records = [replace(ledger(1), account_id=uid(80)), replace(ledger(2), account_id=uid(81))]
    result = reconcile([], records, ReconciliationConfig())
    assert all(p.status == MatchStatus.UNRESOLVED for p in result)


def test_unknown_bank_correspondence_is_never_automatically_matched():
    result = reconcile(
        [bank(1)], [replace(ledger(1), bank_account_id=None)], ReconciliationConfig()
    )
    assert len(result) == 1
    assert result[0].rule_code == "ACCOUNT_MAPPING_REQUIRED"
    assert result[0].status == MatchStatus.POTENTIAL_MATCH


def test_confirmed_other_bank_is_excluded_from_every_candidate_path():
    record = replace(ledger(1), bank_account_id=uid(91))
    result = reconcile(
        [replace(bank(1), bank_account_id=uid(90))], [record], ReconciliationConfig()
    )
    assert {p.rule_code for p in result} == {
        "BANK_WITHOUT_ACCOUNTING_MATCH",
        "ACCOUNTING_WITHOUT_BANK_MATCH",
    }


def test_batch_cannot_include_postings_of_another_bank():
    b = replace(bank(1, amount="300", description="group"), bank_account_id=uid(90))
    records = [
        replace(ledger(1, amount="100", description="A"), bank_account_id=uid(90)),
        replace(ledger(2, amount="200", description="B"), bank_account_id=uid(91)),
    ]
    result = reconcile([b], records, ReconciliationConfig())
    assert not any(p.match_type == "one_to_many" for p in result)


def test_identical_postings_within_a_voucher_remain_ambiguous_not_duplicates():
    first = ledger(1)
    second = replace(first, line_id=uid(3999), source_row_id=uid(2999))
    result = reconcile([bank(1)], [first, second], ReconciliationConfig())
    assert len(result) == 2
    assert all(p.status == MatchStatus.POTENTIAL_MATCH for p in result)
    assert {p.allocations[1].journal_line_id for p in result} == {first.line_id, second.line_id}


def test_multiple_bank_movements_to_one_ledger_remain_suggestions_with_full_allocations():
    results = reconcile(
        [bank(1, amount="40"), bank(2, amount="60")],
        [ledger(1, amount="100")],
        ReconciliationConfig(),
    )
    grouped = [item for item in results if item.match_type == "many_to_one"]
    assert len(grouped) == 1
    assert grouped[0].status == MatchStatus.POTENTIAL_MATCH
    assert len(grouped[0].allocations) == 3
    assert len(grouped[0].evidence["bank_items"]) == 2
    assert not any(item.status == MatchStatus.AUTO_MATCHED for item in results)


def test_grouped_bank_movements_never_cross_bank_accounts():
    results = reconcile(
        [bank(1, amount="40"), replace(bank(2, amount="60"), bank_account_id=uid(91))],
        [ledger(1, amount="100")],
        ReconciliationConfig(),
    )
    assert not any(item.match_type == "many_to_one" for item in results)


def test_iranian_working_days_and_explicit_holidays_are_used():
    from app.reconciliation.engine import _business_days

    assert _business_days(date(2026, 9, 10), date(2026, 9, 12), ReconciliationConfig()) == 1
    config = ReconciliationConfig(holiday_dates=frozenset({date(2026, 9, 12)}))
    assert _business_days(date(2026, 9, 10), date(2026, 9, 12), config) == 0
