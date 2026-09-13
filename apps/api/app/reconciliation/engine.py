from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from difflib import SequenceMatcher
from typing import cast
from uuid import UUID

from app.financial.normalization import normalize_text
from app.reconciliation.models import MatchLevel, MatchStatus


@dataclass(frozen=True)
class ReconciliationConfig:
    rule_business_days: int = 3
    review_calendar_days: int = 10
    fuzzy_threshold: Decimal = Decimal("70")
    ambiguity_margin: Decimal = Decimal("5")


@dataclass(frozen=True)
class BankRecord:
    id: UUID
    source_row_id: UUID
    booking_date: date
    amount_irr: Decimal
    description: str
    reference: str | None = None
    source_transaction_id: str | None = None


@dataclass(frozen=True)
class LedgerRecord:
    entry_id: UUID
    source_row_id: UUID
    line_id: UUID
    entry_date: date
    amount_irr: Decimal
    description: str
    reference: str | None = None
    invoice_ref: str | None = None
    source_entry_id: str | None = None


@dataclass(frozen=True)
class ProposedMatch:
    bank_transaction_id: UUID | None
    journal_entry_id: UUID | None
    match_level: MatchLevel
    status: MatchStatus
    score: Decimal
    amount_difference_irr: Decimal | None
    date_difference_days: int | None
    rule_code: str
    features: dict[str, object]
    evidence: dict[str, object]


def _normalized(value: str | None) -> str:
    return normalize_text(value or "")


def _calendar_days(left: date, right: date) -> int:
    return abs((left - right).days)


def _business_days(left: date, right: date) -> int:
    if left == right:
        return 0
    start, end = sorted((left, right))
    cursor = start + timedelta(days=1)
    result = 0
    while cursor <= end:
        if cursor.weekday() < 5:
            result += 1
        cursor += timedelta(days=1)
    return result


def _similarity(left: str, right: str) -> Decimal:
    normalized_left, normalized_right = _normalized(left), _normalized(right)
    if not normalized_left or not normalized_right:
        return Decimal(0)
    sequence = Decimal(str(SequenceMatcher(None, normalized_left, normalized_right).ratio()))
    left_tokens, right_tokens = set(normalized_left.split()), set(normalized_right.split())
    union = left_tokens | right_tokens
    jaccard = (
        Decimal(len(left_tokens & right_tokens)) / Decimal(len(union)) if union else Decimal(0)
    )
    return (max(sequence, jaccard) * 100).quantize(Decimal("0.01"))


def _features(bank: BankRecord, ledger: LedgerRecord) -> dict[str, object]:
    reference_equal = bool(
        _normalized(bank.reference)
        and _normalized(bank.reference)
        in {_normalized(ledger.reference), _normalized(ledger.invoice_ref)}
    )
    text_similarity = _similarity(bank.description, ledger.description)
    return {
        "amount_equal": bank.amount_irr == ledger.amount_irr,
        "amount_difference_irr": str(bank.amount_irr - ledger.amount_irr),
        "calendar_days": _calendar_days(bank.booking_date, ledger.entry_date),
        "business_days": _business_days(bank.booking_date, ledger.entry_date),
        "reference_equal": reference_equal,
        "description_similarity": str(text_similarity),
    }


def _score(features: dict[str, object]) -> Decimal:
    amount = Decimal(40) if features["amount_equal"] else Decimal(0)
    business_days = cast(int, features["business_days"])
    date_score = max(Decimal(0), Decimal(30) - Decimal(5 * business_days))
    reference = Decimal(20) if features["reference_equal"] else Decimal(0)
    description = Decimal(str(features["description_similarity"])) / Decimal(10)
    return min(Decimal(100), amount + date_score + reference + description).quantize(
        Decimal("0.01")
    )


def _evidence(bank: BankRecord, ledger: LedgerRecord) -> dict[str, object]:
    return {
        "bank": {
            "transaction_id": str(bank.id),
            "source_row_id": str(bank.source_row_id),
            "date": bank.booking_date.isoformat(),
            "amount_irr": str(bank.amount_irr),
            "reference": bank.reference,
            "description": bank.description,
        },
        "accounting": {
            "journal_entry_id": str(ledger.entry_id),
            "journal_line_id": str(ledger.line_id),
            "source_row_id": str(ledger.source_row_id),
            "date": ledger.entry_date.isoformat(),
            "amount_irr": str(ledger.amount_irr),
            "reference": ledger.reference,
            "invoice_ref": ledger.invoice_ref,
            "description": ledger.description,
        },
        "calculation": "bank.amount_irr compared with asset_line.debit_irr-credit_irr",
    }


def _pair(
    bank: BankRecord,
    ledger: LedgerRecord,
    *,
    level: MatchLevel,
    status: MatchStatus,
    rule_code: str,
    forced_score: Decimal | None = None,
) -> ProposedMatch:
    features = _features(bank, ledger)
    return ProposedMatch(
        bank_transaction_id=bank.id,
        journal_entry_id=ledger.entry_id,
        match_level=level,
        status=status,
        score=forced_score if forced_score is not None else _score(features),
        amount_difference_irr=bank.amount_irr - ledger.amount_irr,
        date_difference_days=(bank.booking_date - ledger.entry_date).days,
        rule_code=rule_code,
        features=features,
        evidence=_evidence(bank, ledger),
    )


def _bank_duplicate_keys(record: BankRecord) -> tuple[str | None, tuple[object, ...]]:
    strong = _normalized(record.source_transaction_id) or None
    weak = (
        record.booking_date,
        record.amount_irr,
        _normalized(record.description),
        _normalized(record.reference),
    )
    return strong, weak


def _ledger_duplicate_keys(record: LedgerRecord) -> tuple[str | None, tuple[object, ...]]:
    strong = _normalized(record.source_entry_id) or None
    weak = (
        record.entry_date,
        record.amount_irr,
        _normalized(record.description),
        _normalized(record.reference),
    )
    return strong, weak


def reconcile(
    banks: list[BankRecord],
    ledgers: list[LedgerRecord],
    config: ReconciliationConfig,
) -> list[ProposedMatch]:
    results: list[ProposedMatch] = []
    bank_keys = {record.id: _bank_duplicate_keys(record) for record in banks}
    bank_strong_counts = Counter(strong for strong, _ in bank_keys.values() if strong)
    bank_weak_counts = Counter(weak for _, weak in bank_keys.values())
    eligible_banks: list[BankRecord] = []
    for bank in sorted(banks, key=lambda item: (item.booking_date, str(item.id))):
        strong, weak = bank_keys[bank.id]
        duplicate_status: MatchStatus | None = None
        rule_code = ""
        if strong and bank_strong_counts[strong] > 1:
            duplicate_status, rule_code = MatchStatus.DUPLICATE_HIGH, "BANK_DUPLICATE_STRONG"
        elif bank_weak_counts[weak] > 1:
            duplicate_status, rule_code = MatchStatus.DUPLICATE_POSSIBLE, "BANK_DUPLICATE_WEAK"
        if duplicate_status:
            results.append(
                ProposedMatch(
                    bank.id,
                    None,
                    MatchLevel.DUPLICATE,
                    duplicate_status,
                    Decimal(100 if duplicate_status == MatchStatus.DUPLICATE_HIGH else 75),
                    None,
                    None,
                    rule_code,
                    {"strong_identifier_equal": duplicate_status == MatchStatus.DUPLICATE_HIGH},
                    {"bank_transaction_id": str(bank.id), "source_row_id": str(bank.source_row_id)},
                )
            )
            continue
        eligible_banks.append(bank)

    ledger_keys = {record.entry_id: _ledger_duplicate_keys(record) for record in ledgers}
    ledger_strong_counts = Counter(strong for strong, _ in ledger_keys.values() if strong)
    ledger_weak_counts = Counter(weak for _, weak in ledger_keys.values())
    eligible_ledgers: list[LedgerRecord] = []
    for ledger in sorted(ledgers, key=lambda item: (item.entry_date, str(item.entry_id))):
        strong, weak = ledger_keys[ledger.entry_id]
        duplicate_status = None
        rule_code = ""
        if strong and ledger_strong_counts[strong] > 1:
            duplicate_status, rule_code = MatchStatus.DUPLICATE_HIGH, "LEDGER_DUPLICATE_STRONG"
        elif ledger_weak_counts[weak] > 1:
            duplicate_status, rule_code = MatchStatus.DUPLICATE_POSSIBLE, "LEDGER_DUPLICATE_WEAK"
        if duplicate_status:
            results.append(
                ProposedMatch(
                    None,
                    ledger.entry_id,
                    MatchLevel.DUPLICATE,
                    duplicate_status,
                    Decimal(100 if duplicate_status == MatchStatus.DUPLICATE_HIGH else 75),
                    None,
                    None,
                    rule_code,
                    {"strong_identifier_equal": duplicate_status == MatchStatus.DUPLICATE_HIGH},
                    {
                        "journal_entry_id": str(ledger.entry_id),
                        "source_row_id": str(ledger.source_row_id),
                    },
                )
            )
            continue
        eligible_ledgers.append(ledger)

    exact_by_bank: dict[UUID, list[LedgerRecord]] = defaultdict(list)
    for bank in eligible_banks:
        for ledger in eligible_ledgers:
            features = _features(bank, ledger)
            if (
                features["amount_equal"]
                and features["calendar_days"] == 0
                and (
                    features["reference_equal"]
                    or Decimal(str(features["description_similarity"])) == 100
                )
            ):
                exact_by_bank[bank.id].append(ledger)
    exact_journal_frequency = Counter(
        ledger.entry_id for candidates in exact_by_bank.values() for ledger in candidates
    )
    accepted_banks: set[UUID] = set()
    accepted_journals: set[UUID] = set()
    for bank in eligible_banks:
        exact_candidates = exact_by_bank.get(bank.id, [])
        if (
            len(exact_candidates) == 1
            and exact_journal_frequency[exact_candidates[0].entry_id] == 1
        ):
            ledger = exact_candidates[0]
            results.append(
                _pair(
                    bank,
                    ledger,
                    level=MatchLevel.EXACT,
                    status=MatchStatus.AUTO_MATCHED,
                    rule_code="EXACT_AMOUNT_DATE_IDENTITY",
                    forced_score=Decimal(100),
                )
            )
            accepted_banks.add(bank.id)
            accepted_journals.add(ledger.entry_id)
        elif exact_candidates:
            for ledger in exact_candidates:
                results.append(
                    _pair(
                        bank,
                        ledger,
                        level=MatchLevel.EXACT,
                        status=MatchStatus.POTENTIAL_MATCH,
                        rule_code="AMBIGUOUS_EXACT_CANDIDATE",
                        forced_score=Decimal(99),
                    )
                )

    for bank in eligible_banks:
        if bank.id in accepted_banks or exact_by_bank.get(bank.id):
            continue
        proposals: list[ProposedMatch] = []
        for ledger in eligible_ledgers:
            if ledger.entry_id in accepted_journals:
                continue
            features = _features(bank, ledger)
            amount_equal = bool(features["amount_equal"])
            reference_equal = bool(features["reference_equal"])
            business_days = cast(int, features["business_days"])
            calendar_days = cast(int, features["calendar_days"])
            similarity = Decimal(str(features["description_similarity"]))
            if amount_equal and business_days <= config.rule_business_days:
                level = MatchLevel.RULE if reference_equal else MatchLevel.FUZZY
                rule = "RULE_AMOUNT_DATE_REFERENCE" if reference_equal else "FUZZY_AMOUNT_DATE_TEXT"
                proposal = _pair(
                    bank,
                    ledger,
                    level=level,
                    status=MatchStatus.POTENTIAL_MATCH,
                    rule_code=rule,
                )
                if reference_equal or proposal.score >= config.fuzzy_threshold:
                    proposals.append(proposal)
            elif (
                amount_equal
                and calendar_days <= config.review_calendar_days
                and (reference_equal or similarity >= Decimal(75))
            ):
                proposals.append(
                    _pair(
                        bank,
                        ledger,
                        level=MatchLevel.MISMATCH,
                        status=MatchStatus.DATE_MISMATCH,
                        rule_code="DATE_OUTSIDE_MATCH_WINDOW",
                    )
                )
            elif reference_equal and calendar_days <= config.review_calendar_days:
                proposals.append(
                    _pair(
                        bank,
                        ledger,
                        level=MatchLevel.MISMATCH,
                        status=MatchStatus.AMOUNT_MISMATCH,
                        rule_code="REFERENCE_AMOUNT_MISMATCH",
                    )
                )
        proposals.sort(key=lambda item: (-item.score, str(item.journal_entry_id)))
        results.extend(proposals[:5])
        if not proposals:
            results.append(
                ProposedMatch(
                    bank.id,
                    None,
                    MatchLevel.UNRESOLVED,
                    MatchStatus.UNRESOLVED,
                    Decimal(0),
                    None,
                    None,
                    "BANK_WITHOUT_ACCOUNTING_MATCH",
                    {},
                    {"bank_transaction_id": str(bank.id), "source_row_id": str(bank.source_row_id)},
                )
            )

    related_journals = {
        item.journal_entry_id for item in results if item.journal_entry_id is not None
    }
    for ledger in eligible_ledgers:
        if ledger.entry_id not in related_journals:
            results.append(
                ProposedMatch(
                    None,
                    ledger.entry_id,
                    MatchLevel.UNRESOLVED,
                    MatchStatus.UNRESOLVED,
                    Decimal(0),
                    None,
                    None,
                    "ACCOUNTING_WITHOUT_BANK_MATCH",
                    {},
                    {
                        "journal_entry_id": str(ledger.entry_id),
                        "source_row_id": str(ledger.source_row_id),
                    },
                )
            )
    return results
