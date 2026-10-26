from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher
from itertools import combinations, islice
from typing import Any, cast
from uuid import UUID

from app.financial.normalization import normalize_text
from app.reconciliation.models import MatchLevel, MatchStatus


@dataclass(frozen=True)
class ReconciliationConfig:
    rule_business_days: int = 3
    review_calendar_days: int = 10
    fuzzy_threshold: Decimal = Decimal("70")
    ambiguity_margin: Decimal = Decimal("5")
    non_working_weekdays: tuple[int, ...] = (4,)
    holiday_dates: frozenset[date] = frozenset()

    def __post_init__(self) -> None:
        if not 0 <= self.rule_business_days <= 14 or not 1 <= self.review_calendar_days <= 31:
            raise ValueError("بازه تطبیق معتبر نیست.")
        if len(set(self.non_working_weekdays)) > 6 or any(
            day not in range(7) for day in self.non_working_weekdays
        ):
            raise ValueError("روزهای تعطیل هفتگی معتبر نیستند.")

    @property
    def candidate_window_days(self) -> int:
        return max(
            self.review_calendar_days, 7 * (self.rule_business_days + len(self.holiday_dates) + 1)
        )


@dataclass(frozen=True)
class BankRecord:
    id: UUID
    source_row_id: UUID
    booking_date: date
    amount_irr: Decimal
    description: str
    bank_account_id: UUID | None = None
    reference: str | None = None
    source_transaction_id: str | None = None
    running_balance_irr: Decimal | None = None


@dataclass(frozen=True)
class LedgerRecord:
    entry_id: UUID
    line_id: UUID
    source_row_id: UUID
    entry_date: date
    amount_irr: (
        Decimal  # signed: positive for bank debit (inflow), negative for bank credit (outflow)
    )
    description: str
    account_id: UUID | None = None
    reference: str | None = None
    invoice_ref: str | None = None
    source_entry_id: str | None = None
    counterparty_name: str | None = None
    bank_account_id: UUID | None = None


@dataclass(frozen=True)
class ProposedAllocation:
    side: str  # "bank" or "journal"
    bank_transaction_id: UUID | None
    journal_line_id: UUID | None
    allocated_amount_irr: Decimal


@dataclass
class ProposedMatch:
    bank_transaction_id: UUID | None
    journal_entry_id: UUID | None
    match_level: MatchLevel
    status: MatchStatus
    score: Decimal
    amount_difference_irr: Decimal | None
    date_difference_days: int | None
    rule_code: str
    features: dict[str, Any] = field(default_factory=dict)
    evidence: dict[str, Any] = field(default_factory=dict)
    match_type: str = "one_to_one"
    match_reasons: list[str] = field(default_factory=list)
    allocations: list[ProposedAllocation] = field(default_factory=list)


def _normalized(value: str | None) -> str:
    return normalize_text(value or "")


def _compatible_accounts(bank: BankRecord, ledger: LedgerRecord) -> bool:
    # Unknown correspondence may be suggested, but is never proof of a match.
    return ledger.bank_account_id is None or ledger.bank_account_id == bank.bank_account_id


def _confirmed_account(bank: BankRecord, ledger: LedgerRecord) -> bool:
    return bank.bank_account_id is not None and bank.bank_account_id == ledger.bank_account_id


def _calendar_days(left: date, right: date) -> int:
    return abs((left - right).days)


def _business_days(
    left: date,
    right: date,
    config: ReconciliationConfig = ReconciliationConfig(),
) -> int:
    if left == right:
        return 0
    start, end = sorted((left, right))
    closed = set(config.non_working_weekdays)
    weeks, remainder = divmod((end - start).days, 7)
    weekdays = weeks * (7 - len(closed)) + sum(
        (start.weekday() + offset) % 7 not in closed for offset in range(1, remainder + 1)
    )
    return weekdays - sum(
        start < day <= end and day.weekday() not in closed for day in config.holiday_dates
    )


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


def _features(
    bank: BankRecord, ledger: LedgerRecord, config: ReconciliationConfig = ReconciliationConfig()
) -> dict[str, Any]:
    reference_equal = bool(
        _normalized(bank.reference)
        and _normalized(bank.reference)
        in {_normalized(ledger.reference), _normalized(ledger.invoice_ref)}
    )
    text_similarity = _similarity(bank.description, ledger.description)
    return {
        "account_correspondence_confirmed": _confirmed_account(bank, ledger),
        "amount_equal": bank.amount_irr == ledger.amount_irr,
        "amount_difference_irr": str(bank.amount_irr - ledger.amount_irr),
        "calendar_days": _calendar_days(bank.booking_date, ledger.entry_date),
        "business_days": _business_days(bank.booking_date, ledger.entry_date, config),
        "reference_equal": reference_equal,
        "description_similarity": str(text_similarity),
    }


def _score(features: dict[str, Any]) -> Decimal:
    amount = Decimal(60) if features["amount_equal"] else Decimal(0)
    business_days = cast(int, features["business_days"])
    date_score = max(Decimal(0), Decimal(25) - Decimal(3 * business_days))
    reference = Decimal(15) if features["reference_equal"] else Decimal(0)
    description = Decimal(str(features["description_similarity"])) / Decimal(10)
    return min(Decimal(100), amount + date_score + reference + description).quantize(
        Decimal("0.01")
    )


def _bank_evidence(bank: BankRecord) -> dict[str, Any]:
    return {
        "transaction_id": str(bank.id),
        "source_row_id": str(bank.source_row_id),
        "date": bank.booking_date.isoformat(),
        "amount_irr": str(bank.amount_irr),
        "reference": bank.reference,
        "description": bank.description,
    }


def _ledger_evidence(ledger: LedgerRecord) -> dict[str, Any]:
    return {
        "journal_entry_id": str(ledger.entry_id),
        "journal_line_id": str(ledger.line_id),
        "source_row_id": str(ledger.source_row_id),
        "date": ledger.entry_date.isoformat(),
        "amount_irr": str(ledger.amount_irr),
        "reference": ledger.reference,
        "invoice_ref": ledger.invoice_ref,
        "description": ledger.description,
        "account_id": str(ledger.account_id) if ledger.account_id else None,
        "bank_account_id": str(ledger.bank_account_id) if ledger.bank_account_id else None,
    }


def _evidence(bank: BankRecord, ledger: LedgerRecord) -> dict[str, Any]:
    return {
        "bank": _bank_evidence(bank),
        "accounting": _ledger_evidence(ledger),
        "calculation": "bank.amount_irr compared with journal_line.amount_irr",
    }


def _pair(
    bank: BankRecord,
    ledger: LedgerRecord,
    *,
    level: MatchLevel,
    status: MatchStatus,
    config: ReconciliationConfig = ReconciliationConfig(),
    rule_code: str,
    forced_score: Decimal | None = None,
    match_reasons: list[str] | None = None,
) -> ProposedMatch:
    features = _features(bank, ledger, config)
    amount_difference = None if features["amount_equal"] else bank.amount_irr - ledger.amount_irr
    date_difference = (
        None if features["calendar_days"] == 0 else cast(int, features["calendar_days"])
    )
    allocations = [
        ProposedAllocation("bank", bank.id, None, bank.amount_irr),
        ProposedAllocation("journal", None, ledger.line_id, ledger.amount_irr),
    ]
    return ProposedMatch(
        bank.id,
        ledger.entry_id,
        level,
        status,
        forced_score if forced_score is not None else _score(features),
        amount_difference,
        date_difference,
        rule_code,
        features,
        _evidence(bank, ledger),
        match_type="one_to_one",
        match_reasons=match_reasons or [],
        allocations=allocations,
    )


def _bank_duplicate_keys(record: BankRecord) -> tuple[str | None, tuple[object, ...]]:
    identifier = _normalized(record.source_transaction_id)
    strong = (
        str(
            (
                record.bank_account_id,
                identifier,
                record.booking_date,
                record.amount_irr,
                record.running_balance_irr,
            )
        )
        if identifier
        else None
    )
    weak = (
        record.bank_account_id,
        record.running_balance_irr,
        identifier,
        record.booking_date,
        record.amount_irr,
        _normalized(record.description),
        _normalized(record.reference),
    )
    return strong, weak


def _ledger_duplicate_keys(record: LedgerRecord) -> tuple[str | None, tuple[object, ...]]:
    weak = (
        record.account_id,
        record.entry_date,
        record.amount_irr,
        _normalized(record.description),
        _normalized(record.reference),
        _normalized(record.invoice_ref),
    )
    # A voucher number identifies a document, never an individual posting.
    identifier = _normalized(record.source_entry_id)
    strong = str((identifier, *weak)) if identifier else None
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
        duplicate_status = None
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
                    {
                        "bank": _bank_evidence(bank),
                        "bank_transaction_id": str(bank.id),
                        "source_row_id": str(bank.source_row_id),
                    },
                    allocations=[ProposedAllocation("bank", bank.id, None, bank.amount_irr)],
                )
            )
            continue
        eligible_banks.append(bank)

    ledger_keys = {record.line_id: _ledger_duplicate_keys(record) for record in ledgers}
    strong_documents: dict[str, set[UUID]] = defaultdict(set)
    weak_documents: dict[tuple[object, ...], set[UUID]] = defaultdict(set)
    for record in ledgers:
        strong, weak = ledger_keys[record.line_id]
        if strong:
            strong_documents[strong].add(record.entry_id)
        weak_documents[weak].add(record.entry_id)
    eligible_ledgers: list[LedgerRecord] = []
    for ledger in sorted(ledgers, key=lambda item: (item.entry_date, str(item.line_id))):
        strong, weak = ledger_keys[ledger.line_id]
        duplicate_status = None
        rule_code = ""
        if strong and len(strong_documents[strong]) > 1:
            duplicate_status, rule_code = MatchStatus.DUPLICATE_HIGH, "LEDGER_DUPLICATE_STRONG"
        elif len(weak_documents[weak]) > 1:
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
                        "accounting": _ledger_evidence(ledger),
                        "journal_entry_id": str(ledger.entry_id),
                        "source_row_id": str(ledger.source_row_id),
                    },
                    allocations=[
                        ProposedAllocation("journal", None, ledger.line_id, ledger.amount_irr)
                    ],
                )
            )
            continue
        eligible_ledgers.append(ledger)

    ledger_by_amount_date: dict[tuple[Decimal, date], list[LedgerRecord]] = defaultdict(list)
    ledger_by_day: dict[int, list[LedgerRecord]] = defaultdict(list)
    for ledger in eligible_ledgers:
        ledger_by_amount_date[ledger.amount_irr, ledger.entry_date].append(ledger)
        ledger_by_day[ledger.entry_date.toordinal()].append(ledger)
    ledger_days = sorted(ledger_by_day)

    def nearby(bank: BankRecord, days: int) -> list[LedgerRecord]:
        center = bank.booking_date.toordinal()
        return [
            ledger
            for day in ledger_days[
                bisect_left(ledger_days, center - days) : bisect_right(ledger_days, center + days)
            ]
            for ledger in ledger_by_day[day]
        ]

    exact_by_bank: dict[UUID, list[LedgerRecord]] = defaultdict(list)
    for bank in eligible_banks:
        for ledger in ledger_by_amount_date.get((bank.amount_irr, bank.booking_date), []):
            if not _compatible_accounts(bank, ledger):
                continue
            if bank.amount_irr != ledger.amount_irr or bank.booking_date != ledger.entry_date:
                continue
            features = _features(bank, ledger, config)
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
        ledger.line_id for candidates in exact_by_bank.values() for ledger in candidates
    )
    accepted_banks: set[UUID] = set()
    accepted_journals: set[UUID] = set()
    for bank in eligible_banks:
        exact_candidates = exact_by_bank.get(bank.id, [])
        if len(exact_candidates) == 1 and exact_journal_frequency[exact_candidates[0].line_id] == 1:
            ledger = exact_candidates[0]
            confirmed = _confirmed_account(bank, ledger)
            results.append(
                _pair(
                    bank,
                    ledger,
                    config=config,
                    level=MatchLevel.EXACT,
                    status=MatchStatus.AUTO_MATCHED if confirmed else MatchStatus.POTENTIAL_MATCH,
                    rule_code="EXACT_AMOUNT_DATE_IDENTITY"
                    if confirmed
                    else "ACCOUNT_MAPPING_REQUIRED",
                    forced_score=Decimal(100) if confirmed else Decimal(99),
                    match_reasons=[]
                    if confirmed
                    else ["ارتباط حساب بانک با حساب دفتر تأیید نشده است."],
                )
            )
            if confirmed:
                accepted_banks.add(bank.id)
                accepted_journals.add(ledger.line_id)
        elif exact_candidates:
            for ledger in exact_candidates:
                results.append(
                    _pair(
                        bank,
                        ledger,
                        config=config,
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
        for ledger in nearby(bank, config.candidate_window_days):
            if not _compatible_accounts(bank, ledger):
                continue
            if ledger.line_id in accepted_journals:
                continue
            # A shared voucher reference must never propose matching an inflow
            # against an outflow, even when their amounts differ.
            if (bank.amount_irr > 0) != (ledger.amount_irr > 0):
                continue
            distance = _calendar_days(bank.booking_date, ledger.entry_date)
            if (
                distance > config.review_calendar_days
                and _business_days(bank.booking_date, ledger.entry_date, config)
                > config.rule_business_days
            ):
                continue
            features = _features(bank, ledger, config)
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
                    config=config,
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
                        config=config,
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
                        config=config,
                        level=MatchLevel.MISMATCH,
                        status=MatchStatus.AMOUNT_MISMATCH,
                        rule_code="REFERENCE_AMOUNT_MISMATCH",
                    )
                )
        proposals.sort(key=lambda item: (-item.score, str(item.journal_entry_id)))
        results.extend(proposals[:5])
        if not proposals:
            # Check 1:N batch settlement and smart FIFO allocation
            nearby_ledgers = [
                ledger
                for ledger in nearby(bank, 5)
                if ledger.line_id not in accepted_journals
                and _compatible_accounts(bank, ledger)
                and _calendar_days(bank.booking_date, ledger.entry_date) <= 5
                and (
                    (bank.amount_irr > 0 and ledger.amount_irr > 0)
                    or (bank.amount_irr < 0 and ledger.amount_irr < 0)
                )
                and abs(ledger.amount_irr) < abs(bank.amount_irr)
            ]
            matched_combo: list[LedgerRecord] | None = None

            # Bound exploratory suggestions: a dense real statement must never
            # spend millions of subset checks on one ambiguous bank movement.
            nearby_ledgers.sort(
                key=lambda item: (
                    _calendar_days(bank.booking_date, item.entry_date),
                    str(item.line_id),
                )
            )
            remaining_checks = 5_000
            # 1. Exact subset sum matching up to 5 items
            for k in range(2, min(6, len(nearby_ledgers) + 1)):
                for combo in islice(combinations(nearby_ledgers, k), remaining_checks):
                    remaining_checks -= 1
                    if sum(combo_item.amount_irr for combo_item in combo) == bank.amount_irr:
                        matched_combo = list(combo)
                        break
                if matched_combo or remaining_checks == 0:
                    break

            # 2. Counterparty-guided FIFO matching
            if not matched_combo and bank.amount_irr > 0:
                norm_bank_desc = _normalized(bank.description)
                cp_ledgers = [
                    ledger
                    for ledger in nearby_ledgers
                    if ledger.amount_irr > 0
                    and ledger.counterparty_name
                    and _normalized(ledger.counterparty_name) in norm_bank_desc
                ]
                if cp_ledgers:
                    cp_ledgers.sort(key=lambda item: item.entry_date)
                    running_sum = Decimal(0)
                    fifo_subset: list[LedgerRecord] = []
                    for ledger in cp_ledgers:
                        if running_sum + ledger.amount_irr <= bank.amount_irr:
                            running_sum += ledger.amount_irr
                            fifo_subset.append(ledger)
                            if running_sum == bank.amount_irr:
                                matched_combo = fifo_subset
                                break

            if matched_combo:
                allocations = [ProposedAllocation("bank", bank.id, None, bank.amount_irr)]
                for ledger in matched_combo:
                    allocations.append(
                        ProposedAllocation("journal", None, ledger.line_id, ledger.amount_irr)
                    )
                    # Suggestions do not reserve ledger lines: later bank rows
                    # must still be checked for reference/date discrepancies.
                accepted_banks.add(bank.id)
                results.append(
                    ProposedMatch(
                        bank.id,
                        matched_combo[0].entry_id,
                        MatchLevel.RULE,
                        MatchStatus.POTENTIAL_MATCH,
                        Decimal("90.0"),
                        Decimal(0),
                        0,
                        "BATCH_SETTLEMENT_1_TO_N",
                        {"batch_count": len(matched_combo)},
                        {
                            "bank": _bank_evidence(bank),
                            "ledger_items": [_ledger_evidence(ledger) for ledger in matched_combo],
                        },
                        match_type="one_to_many",
                        match_reasons=[
                            f"تطبیق هوشمند یک‌به‌چند: مجموع {len(matched_combo)} سطر سند حسابداری با مبلغ تراکنش بانک ({bank.amount_irr:,} ریال) برابر است."
                        ],
                        allocations=allocations,
                    )
                )
                continue

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
                    {"group_search_incomplete": remaining_checks == 0},
                    {
                        "bank": _bank_evidence(bank),
                        "bank_transaction_id": str(bank.id),
                        "source_row_id": str(bank.source_row_id),
                    },
                    allocations=[ProposedAllocation("bank", bank.id, None, bank.amount_irr)],
                )
            )

    # Bank exports may split a payment that the ledger records as one posting.
    # Suggestions remain unreserved until an explicit balanced confirmation.
    bank_by_day: dict[int, list[BankRecord]] = defaultdict(list)
    for bank in eligible_banks:
        if bank.id not in accepted_banks:
            bank_by_day[bank.booking_date.toordinal()].append(bank)
    bank_days = sorted(bank_by_day)
    grouped_bank_ids: set[UUID] = set()
    for ledger in eligible_ledgers:
        if ledger.line_id in accepted_journals:
            continue
        center = ledger.entry_date.toordinal()
        candidates = [
            bank
            for day in bank_days[
                bisect_left(bank_days, center - 5) : bisect_right(bank_days, center + 5)
            ]
            for bank in bank_by_day[day]
            if _compatible_accounts(bank, ledger)
            and (bank.amount_irr > 0) == (ledger.amount_irr > 0)
            and 0 < abs(bank.amount_irr) < abs(ledger.amount_irr)
        ]
        # Never combine cash from separate bank accounts into one ledger posting.
        by_account: dict[UUID | None, list[BankRecord]] = defaultdict(list)
        for bank in candidates:
            by_account[bank.bank_account_id].append(bank)
        remaining = 5_000
        for account_banks in by_account.values():
            combo_match: tuple[BankRecord, ...] | None = None
            for size in range(2, min(6, len(account_banks) + 1)):
                for bank_combo in islice(combinations(account_banks, size), remaining):
                    remaining -= 1
                    if (
                        sum((item.amount_irr for item in bank_combo), Decimal(0))
                        == ledger.amount_irr
                    ):
                        combo_match = bank_combo
                        break
                if combo_match or remaining == 0:
                    break
            if combo_match:
                allocations = [
                    ProposedAllocation("bank", bank.id, None, bank.amount_irr)
                    for bank in combo_match
                ]
                allocations.append(
                    ProposedAllocation("journal", None, ledger.line_id, ledger.amount_irr)
                )
                results.append(
                    ProposedMatch(
                        combo_match[0].id,
                        ledger.entry_id,
                        MatchLevel.RULE,
                        MatchStatus.POTENTIAL_MATCH,
                        Decimal(90),
                        Decimal(0),
                        max(
                            _calendar_days(bank.booking_date, ledger.entry_date)
                            for bank in combo_match
                        ),
                        "BATCH_SETTLEMENT_N_TO_1",
                        {"batch_count": len(combo_match)},
                        {
                            "bank": _bank_evidence(combo_match[0]),
                            "bank_items": [_bank_evidence(bank) for bank in combo_match],
                            "accounting": _ledger_evidence(ledger),
                        },
                        match_type="many_to_one",
                        match_reasons=[
                            "مجموع چند گردش بانک با یک ردیف دفتر برابر است؛ تأیید لازم است."
                        ],
                        allocations=allocations,
                    )
                )
                grouped_bank_ids.update(bank.id for bank in combo_match)
            if remaining == 0:
                break
    results = [
        item
        for item in results
        if not (
            item.rule_code == "BANK_WITHOUT_ACCOUNTING_MATCH"
            and item.bank_transaction_id in grouped_bank_ids
        )
    ]

    related_journals = {
        allocation.journal_line_id
        for item in results
        for allocation in item.allocations
        if allocation.journal_line_id is not None
    }
    for ledger in eligible_ledgers:
        if ledger.line_id not in related_journals:
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
                        "accounting": _ledger_evidence(ledger),
                        "journal_entry_id": str(ledger.entry_id),
                        "source_row_id": str(ledger.source_row_id),
                    },
                    allocations=[
                        ProposedAllocation("journal", None, ledger.line_id, ledger.amount_irr)
                    ],
                )
            )
    return results
