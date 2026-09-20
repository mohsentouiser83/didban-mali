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
