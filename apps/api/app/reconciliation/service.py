from collections import Counter
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import delete, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.analysis.models import AnalysisRun, AnalysisStatus
from app.audit.service import record_audit_event
from app.financial.models import (
    Account,
    AccountClass,
    AccountClassification,
    BankTransaction,
    Counterparty,
    JournalEntry,
    JournalLine,
)
from app.imports.models import SourceRow
from app.reconciliation.engine import (
    BankRecord,
    LedgerRecord,
    ReconciliationConfig,
    reconcile,
)
from app.reconciliation.models import (
    MatchLevel,
    MatchStatus,
    ReconciliationAllocation,
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)


async def get_active_matched_ids(session: AsyncSession, company_id: UUID) -> tuple[set[UUID], set[UUID]]:
    """Get all bank transaction IDs and journal line IDs that are actively allocated to a non-reversed match."""
    allocs = (
        await session.execute(
            select(
                ReconciliationAllocation.bank_transaction_id,
                ReconciliationAllocation.journal_line_id,
            )
            .join(
                ReconciliationMatch,
                ReconciliationMatch.id == ReconciliationAllocation.match_id,
            )
            .where(
                ReconciliationAllocation.company_id == company_id,
                ReconciliationMatch.status.in_([MatchStatus.AUTO_MATCHED, MatchStatus.CONFIRMED]),
            )
        )
    ).all()
    matched_banks = {row[0] for row in allocs if row[0] is not None}
    matched_journals = {row[1] for row in allocs if row[1] is not None}
    return matched_banks, matched_journals


async def run_canonical_reconciliation(
    session: AsyncSession,
    *,
    company_id: UUID,
    actor_id: UUID,
    run_id: UUID | None = None,
    bank_account_id: UUID | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    config_params: dict[str, Any] | None = None,
) -> ReconciliationRun:
    """Execute reconciliation directly on Phase 1 canonical bank transactions and journal lines."""
    config_params = config_params or {}
    config = ReconciliationConfig(
        rule_business_days=int(config_params.get("rule_business_days", 3)),
        review_calendar_days=int(config_params.get("review_calendar_days", 10)),
        fuzzy_threshold=Decimal(str(config_params.get("fuzzy_threshold", "70"))),
        ambiguity_margin=Decimal(str(config_params.get("ambiguity_margin", "5"))),
    )

    matched_banks, matched_journals = await get_active_matched_ids(session, company_id)

    # 1. Fetch eligible Bank Transactions
    bank_stmt = select(BankTransaction).where(
        BankTransaction.company_id == company_id,
    )
    if bank_account_id:
        bank_stmt = bank_stmt.where(BankTransaction.bank_account_id == bank_account_id)
    if period_start:
        bank_stmt = bank_stmt.where(BankTransaction.booking_date >= period_start)
    if period_end:
        bank_stmt = bank_stmt.where(BankTransaction.booking_date <= period_end)
    if matched_banks:
        bank_stmt = bank_stmt.where(BankTransaction.id.not_in(matched_banks))

    bank_stmt = bank_stmt.order_by(BankTransaction.booking_date, BankTransaction.id)
    bank_records_db = (await session.scalars(bank_stmt)).all()

    banks = [
        BankRecord(
            id=row.id,
            source_row_id=row.source_row_id,
            booking_date=row.booking_date,
            amount_irr=Decimal(row.amount_irr),
            description=row.description,
            bank_account_id=row.bank_account_id,
            reference=row.reference,
            source_transaction_id=row.source_transaction_id,
        )
        for row in bank_records_db
    ]

    # 2. Fetch eligible Cash & Bank Journal Lines
    # We join with JournalEntry and Account/Classification to get cash & bank accounts
    journal_stmt = (
        select(
            JournalLine.id,
            JournalLine.source_row_id,
            JournalLine.debit_irr,
            JournalLine.credit_irr,
            JournalLine.invoice_ref,
            JournalLine.account_id,
            JournalEntry.id.label("entry_id"),
            JournalEntry.entry_date,
            JournalEntry.description,
            JournalEntry.reference,
            JournalEntry.source_entry_id,
            Counterparty.name.label("counterparty_name"),
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .outerjoin(Counterparty, Counterparty.id == JournalLine.counterparty_id)
        .where(
            JournalLine.company_id == company_id,
            # Match cash/bank ledger lines, not all asset accounts (receivables,
            # inventory, etc.). Keep this scope consistent with analysis snapshots.
            or_(
                Account.source_code.startswith("101"),
                Account.source_code.startswith("102"),
                Account.source_code.startswith("10"),
                Account.source_code.startswith("11"),
            ),
        )
    )
    if period_start:
        journal_stmt = journal_stmt.where(JournalEntry.entry_date >= period_start - timedelta(days=15))
    if period_end:
        journal_stmt = journal_stmt.where(JournalEntry.entry_date <= period_end + timedelta(days=15))
    if matched_journals:
        journal_stmt = journal_stmt.where(JournalLine.id.not_in(matched_journals))

    journal_stmt = journal_stmt.order_by(JournalEntry.entry_date, JournalLine.id)
    journal_rows = (await session.execute(journal_stmt)).all()

    ledgers = [
        LedgerRecord(
            entry_id=row.entry_id,
            line_id=row.id,
            source_row_id=row.source_row_id,
            entry_date=row.entry_date,
            # Net amount: debit (inflow) is positive, credit (outflow) is negative
            amount_irr=Decimal(row.debit_irr) - Decimal(row.credit_irr),
            description=row.description,
            account_id=row.account_id,
            reference=row.reference,
            invoice_ref=row.invoice_ref,
            source_entry_id=row.source_entry_id,
            counterparty_name=row.counterparty_name,
        )
        for row in journal_rows
    ]

    # 3. Execute deterministic matching engine
    proposals = reconcile(banks, ledgers, config)

    # 4. Compute Summary Statistics
    auto_matched_proposals = [p for p in proposals if p.status == MatchStatus.AUTO_MATCHED]
    matched_count = len(auto_matched_proposals)
    matched_amount_irr = sum((abs(p.allocations[0].allocated_amount_irr) for p in auto_matched_proposals if p.allocations), Decimal(0))

    allocated_bank_ids = {a.bank_transaction_id for p in auto_matched_proposals for a in p.allocations if a.bank_transaction_id}
    allocated_journal_ids = {a.journal_line_id for p in auto_matched_proposals for a in p.allocations if a.journal_line_id}

    unmatched_banks = [b for b in banks if b.id not in allocated_bank_ids]
    unmatched_ledgers = [item for item in ledgers if item.line_id not in allocated_journal_ids]

    unmatched_bank_count = len(unmatched_banks)
    unmatched_journal_count = len(unmatched_ledgers)
    unmatched_bank_amount_irr = sum((abs(b.amount_irr) for b in unmatched_banks), Decimal(0))
    unmatched_journal_amount_irr = sum((abs(item.amount_irr) for item in unmatched_ledgers), Decimal(0))

    now = datetime.now(UTC)
    min_date = period_start or (min((b.booking_date for b in banks), default=now.date()) if banks else now.date())
    max_date = period_end or (max((b.booking_date for b in banks), default=now.date()) if banks else now.date())

    suggested_count = sum(1 for p in proposals if p.status == MatchStatus.SUGGESTED_MATCH)
    needs_review_count = sum(1 for p in proposals if p.status == MatchStatus.NEEDS_REVIEW)
    counts_payload = {
        "total_bank_transactions": len(banks),
        "total_journal_lines": len(ledgers),
        "matched_count": matched_count,
        "suggested_count": suggested_count,
        "needs_review_count": needs_review_count,
        "unmatched_bank_count": unmatched_bank_count,
        "unmatched_journal_count": unmatched_journal_count,
        # Legacy compatibility keys
        "bank_transactions": len(banks),
        "accounting_entries": len(ledgers),
        "auto_matched": matched_count,
        "potential_matches": suggested_count,
        "amount_mismatches": 0,
        "date_mismatches": 0,
        "duplicates": 0,
        "unresolved": unmatched_bank_count,
    }

    existing_run = await session.get(ReconciliationRun, run_id) if run_id else None
    if existing_run is not None:
        run = existing_run
        run.status = ReconciliationStatus.COMPLETED
        run.period_start = min_date
        run.period_end = max_date
        run.config_version = "reconciliation-v2"
        run.config_json = config_params
        run.counts_json = counts_payload
        run.matched_count = matched_count
        run.unmatched_bank_count = unmatched_bank_count
        run.unmatched_journal_count = unmatched_journal_count
        run.matched_amount_irr = matched_amount_irr
        run.unmatched_bank_amount_irr = unmatched_bank_amount_irr
        run.unmatched_journal_amount_irr = unmatched_journal_amount_irr
        run.completed_at = now
    else:
        effective_run_id = run_id or uuid7()
        run = ReconciliationRun(
            id=effective_run_id,
            company_id=company_id,
            bank_account_id=bank_account_id,
            period_start=min_date,
            period_end=max_date,
            status=ReconciliationStatus.COMPLETED,
            config_version="reconciliation-v2",
            config_json=config_params,
            counts_json=counts_payload,
            matched_count=matched_count,
            unmatched_bank_count=unmatched_bank_count,
            unmatched_journal_count=unmatched_journal_count,
            matched_amount_irr=matched_amount_irr,
            unmatched_bank_amount_irr=unmatched_bank_amount_irr,
            unmatched_journal_amount_irr=unmatched_journal_amount_irr,
            idempotency_key=f"recon_{company_id}_{now.timestamp()}",
            created_by=actor_id,
            started_at=now,
            completed_at=now,
        )
        session.add(run)
    await session.flush()

    # 5. Persist Matches and Allocations
    match_alloc_pairs = []
    for p in proposals:
        match_id = uuid7()
        m = ReconciliationMatch(
            id=match_id,
            company_id=company_id,
            run_id=run.id,
            bank_transaction_id=p.bank_transaction_id,
            journal_entry_id=p.journal_entry_id,
            match_type=p.match_type,
            match_level=p.match_level,
            status=p.status,
            score=p.score,
            amount_difference_irr=p.amount_difference_irr,
            date_difference_days=p.date_difference_days,
            features_json=p.features,
            evidence_json=p.evidence,
            match_reasons_json=p.match_reasons,
            rule_code=p.rule_code,
            created_at=now,
        )
        session.add(m)
        match_alloc_pairs.append((m, p.allocations))
    await session.flush()

    for m, allocs in match_alloc_pairs:
        for alloc in allocs:
            a = ReconciliationAllocation(
                id=uuid7(),
                company_id=company_id,
                match_id=m.id,
                side=alloc.side,
                bank_transaction_id=alloc.bank_transaction_id,
                journal_line_id=alloc.journal_line_id,
                allocated_amount_irr=alloc.allocated_amount_irr,
                created_at=now,
            )
            session.add(a)
    await session.flush()


    record_audit_event(
        session,
        action="reconciliation.run_completed",
        entity_type="reconciliation_run",
        actor_id=actor_id,
        entity_id=run.id,
        company_id=company_id,
        metadata={
            "matched_count": matched_count,
            "unmatched_bank_count": unmatched_bank_count,
            "unmatched_journal_count": unmatched_journal_count,
        },
    )

    await session.commit()
    return run


async def manual_reconciliation_match(
    session: AsyncSession,
    *,
    company_id: UUID,
    actor_id: UUID,
    bank_transaction_ids: list[UUID],
    journal_line_ids: list[UUID],
    note: str | None = None,
) -> ReconciliationMatch:
    """Manually match bank transactions and journal lines, validating exact Rial balance."""
    # Check for already matched records
    matched_banks, matched_journals = await get_active_matched_ids(session, company_id)
    for b_id in bank_transaction_ids:
        if b_id in matched_banks:
            raise ValueError(f"تراکنش بانکی {b_id} قبلاً در یک تطبیق فعال تخصیص داده شده است.")
    for j_id in journal_line_ids:
        if j_id in matched_journals:
            raise ValueError(f"سطر سند حسابداری {j_id} قبلاً در یک تطبیق فعال تخصیص داده شده است.")

    # Fetch bank transactions
    bank_txs = (
        await session.scalars(
            select(BankTransaction).where(
                BankTransaction.company_id == company_id,
                BankTransaction.id.in_(bank_transaction_ids),
            )
        )
    ).all()
    if len(bank_txs) != len(bank_transaction_ids):
        raise ValueError("یک یا چند تراکنش بانکی انتخاب‌شده یافت نشد.")

    # Fetch journal lines
    journal_lines = (
        await session.execute(
            select(JournalLine, JournalEntry)
            .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
            .where(
                JournalLine.company_id == company_id,
                JournalLine.id.in_(journal_line_ids),
            )
        )
    ).all()
    if len(journal_lines) != len(journal_line_ids):
        raise ValueError("یک یا چند سطر سند حسابداری انتخاب‌شده یافت نشد.")

    total_bank = sum((Decimal(b.amount_irr) for b in bank_txs), Decimal(0))
    total_journal = sum((Decimal(line.debit_irr) - Decimal(line.credit_irr) for line, _ in journal_lines), Decimal(0))

    if total_bank != total_journal:
        raise ValueError(
            f"مبالغ طرفین تراز نیست: مجموع تراکنش‌های بانکی ({total_bank:,} ریال) با مجموع اسناد حسابداری ({total_journal:,} ریال) برابر نیست."
        )

    # Find or create a default manual reconciliation run
    latest_run = await session.scalar(
        select(ReconciliationRun)
        .where(ReconciliationRun.company_id == company_id)
        .order_by(ReconciliationRun.created_at.desc())
        .limit(1)
    )
    if not latest_run:
        now = datetime.now(UTC)
        latest_run = ReconciliationRun(
            id=uuid7(),
            company_id=company_id,
            status=ReconciliationStatus.COMPLETED,
            config_version="manual-v1",
            config_json={},
            counts_json={},
            idempotency_key=f"manual_run_{company_id}_{now.timestamp()}",
            created_by=actor_id,
            started_at=now,
            completed_at=now,
        )
        session.add(latest_run)
        await session.flush()

    now = datetime.now(UTC)
    match_id = uuid7()
    match_type = "one_to_one"
    if len(bank_txs) == 1 and len(journal_lines) > 1:
        match_type = "one_to_many"
    elif len(bank_txs) > 1 and len(journal_lines) == 1:
        match_type = "many_to_one"
    elif len(bank_txs) > 1 and len(journal_lines) > 1:
        match_type = "manual"

    first_entry_id = journal_lines[0][1].id if journal_lines else None
    first_bank_id = bank_txs[0].id if bank_txs else None

    match = ReconciliationMatch(
        id=match_id,
        company_id=company_id,
        run_id=latest_run.id,
        bank_transaction_id=first_bank_id,
        journal_entry_id=first_entry_id,
        match_type=match_type,
        match_level=MatchLevel.MANUAL,
        status=MatchStatus.CONFIRMED,
        score=Decimal("100.00"),
        amount_difference_irr=Decimal(0),
        date_difference_days=0,
        features_json={"manual_match": True, "note": note},
        evidence_json={"note": note},
        match_reasons_json=["تطبیق دستی متوازن توسط کاربر"],
        rule_code="MANUAL_BALANCED_MATCH",
        created_at=now,
    )
    session.add(match)
    await session.flush()

    for b in bank_txs:
        session.add(
            ReconciliationAllocation(
                id=uuid7(),
                company_id=company_id,
                match_id=match_id,
                side="bank",
                bank_transaction_id=b.id,
                journal_line_id=None,
                allocated_amount_irr=b.amount_irr,
                created_at=now,
            )
        )

    for line, _ in journal_lines:
        session.add(
            ReconciliationAllocation(
                id=uuid7(),
                company_id=company_id,
                match_id=match_id,
                side="journal",
                bank_transaction_id=None,
                journal_line_id=line.id,
                allocated_amount_irr=Decimal(line.debit_irr) - Decimal(line.credit_irr),
                created_at=now,
            )
        )

    record_audit_event(
        session,
        action="reconciliation.manual_match_created",
        entity_type="reconciliation_match",
        actor_id=actor_id,
        entity_id=match.id,
        company_id=company_id,
        metadata={"match_type": match_type, "total_irr": str(total_bank), "note": note},
    )

    await session.commit()
    await session.refresh(match)
    return match


async def reverse_reconciliation_match(
    session: AsyncSession,
    *,
    company_id: UUID,
    actor_id: UUID,
    match_id: UUID,
    reason: str,
) -> ReconciliationMatch:
    """Reverse a match (Undo) and release its allocations."""
    match = await session.scalar(
        select(ReconciliationMatch).where(
            ReconciliationMatch.id == match_id,
            ReconciliationMatch.company_id == company_id,
        )
    )
    if not match:
        raise ValueError("تطبیق مورد نظر یافت نشد.")
    if match.status == MatchStatus.REVERSED:
        raise ValueError("این تطبیق پیش‌تر لغو شده است.")

    now = datetime.now(UTC)
    match.status = MatchStatus.REVERSED
    match.reversed_by = actor_id
    match.reversed_at = now
    match.reversal_reason = reason

    # Delete allocations for reversed match so records become unmatched again
    await session.execute(
        delete(ReconciliationAllocation).where(
            ReconciliationAllocation.match_id == match_id,
            ReconciliationAllocation.company_id == company_id,
        )
    )

    record_audit_event(
        session,
        action="reconciliation.match_reversed",
        entity_type="reconciliation_match",
        actor_id=actor_id,
        entity_id=match.id,
        company_id=company_id,
        metadata={"reason": reason},
    )

    await session.commit()
    await session.refresh(match)
    return match


async def get_unmatched_records(
    session: AsyncSession,
    *,
    company_id: UUID,
    bank_account_id: UUID | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, Any]:
    """Retrieve all unmatched bank transactions and journal lines for a company."""
    matched_banks, matched_journals = await get_active_matched_ids(session, company_id)

    # Bank transactions
    b_stmt = select(BankTransaction).where(BankTransaction.company_id == company_id)
    if bank_account_id:
        b_stmt = b_stmt.where(BankTransaction.bank_account_id == bank_account_id)
    if period_start:
        b_stmt = b_stmt.where(BankTransaction.booking_date >= period_start)
    if period_end:
        b_stmt = b_stmt.where(BankTransaction.booking_date <= period_end)
    if matched_banks:
        b_stmt = b_stmt.where(BankTransaction.id.not_in(matched_banks))
    b_stmt = b_stmt.order_by(BankTransaction.booking_date.desc(), BankTransaction.id).limit(200)

    unmatched_bank_txs = (await session.scalars(b_stmt)).all()

    # Journal lines
    j_stmt = (
        select(
            JournalLine.id,
            JournalLine.entry_id,
            JournalLine.account_id,
            JournalLine.debit_irr,
            JournalLine.credit_irr,
            JournalLine.invoice_ref,
            JournalEntry.entry_date,
            JournalEntry.description,
            Counterparty.name.label("counterparty_name"),
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .outerjoin(Counterparty, Counterparty.id == JournalLine.counterparty_id)
        .where(
            JournalLine.company_id == company_id,
            or_(
                Account.source_code.startswith("101"),
                Account.source_code.startswith("102"),
                Account.source_code.startswith("10"),
            ),
        )
    )
    if period_start:
        j_stmt = j_stmt.where(JournalEntry.entry_date >= period_start - timedelta(days=15))
    if period_end:
        j_stmt = j_stmt.where(JournalEntry.entry_date <= period_end + timedelta(days=15))
    if matched_journals:
        j_stmt = j_stmt.where(JournalLine.id.not_in(matched_journals))
    j_stmt = j_stmt.order_by(JournalEntry.entry_date.desc(), JournalLine.id).limit(200)

    unmatched_j_lines = (await session.execute(j_stmt)).all()

    total_bank_amt = sum((abs(b.amount_irr) for b in unmatched_bank_txs), Decimal(0))
    total_journal_amt = sum((abs(Decimal(j.debit_irr) - Decimal(j.credit_irr)) for j in unmatched_j_lines), Decimal(0))

    return {
        "bank_transactions": [
            {
                "id": b.id,
                "bank_account_id": b.bank_account_id,
                "booking_date": b.booking_date,
                "amount_irr": b.amount_irr,
                "description": b.description,
                "reference": b.reference,
                "source_transaction_id": b.source_transaction_id,
            }
            for b in unmatched_bank_txs
        ],
        "journal_lines": [
            {
                "id": j.id,
                "entry_id": j.entry_id,
                "account_id": j.account_id,
                "entry_date": j.entry_date,
                "description": j.description,
                "debit_irr": j.debit_irr,
                "credit_irr": j.credit_irr,
                "net_amount_irr": Decimal(j.debit_irr) - Decimal(j.credit_irr),
                "counterparty_name": j.counterparty_name,
                "invoice_ref": j.invoice_ref,
            }
            for j in unmatched_j_lines
        ],
        "total_unmatched_bank_amount": total_bank_amt,
        "total_unmatched_journal_amount": total_journal_amt,
        "total_bank_count": len(unmatched_bank_txs),
        "total_journal_count": len(unmatched_j_lines),
    }


FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}


async def _inputs(
    session: AsyncSession, analysis: AnalysisRun
) -> tuple[list[BankRecord], list[LedgerRecord]]:
    manifest_ids = [UUID(item) for item in analysis.input_manifest_json.get("import_batch_ids", [])]
    if not manifest_ids:
        return [], []
    # Restrict bank data to the immutable import manifest through source-row lineage.
    bank_rows = (
        await session.execute(
            select(BankTransaction, SourceRow.import_batch_id)
            .join(SourceRow, SourceRow.id == BankTransaction.source_row_id)
            .where(
                BankTransaction.company_id == analysis.company_id,
                BankTransaction.booking_date.between(analysis.period_start, analysis.period_end),
                SourceRow.import_batch_id.in_(manifest_ids),
            )
            .order_by(BankTransaction.booking_date, BankTransaction.id)
        )
    ).all()
    banks = [
        BankRecord(
            id=row.id,
            source_row_id=row.source_row_id,
            booking_date=row.booking_date,
            amount_irr=Decimal(row.amount_irr),
            description=row.description,
            reference=row.reference,
            source_transaction_id=row.source_transaction_id,
        )
        for row, _ in bank_rows
    ]

    classification = (
        select(AccountClassification.account_class)
        .where(
            AccountClassification.company_id == analysis.company_id,
            AccountClassification.account_id == JournalLine.account_id,
            AccountClassification.effective_from <= JournalEntry.entry_date,
        )
        .order_by(AccountClassification.effective_from.desc())
        .limit(1)
        .correlate(JournalLine, JournalEntry)
        .scalar_subquery()
    )
    ledger_rows = (
        await session.execute(
            select(
                JournalEntry.id,
                JournalEntry.source_row_id,
                JournalEntry.entry_date,
                JournalEntry.description,
                JournalEntry.reference,
                JournalEntry.source_entry_id,
                JournalLine.id,
                JournalLine.debit_irr,
                JournalLine.credit_irr,
                JournalLine.invoice_ref,
            )
            .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
            .join(Account, Account.id == JournalLine.account_id)
            .where(
                JournalEntry.company_id == analysis.company_id,
                JournalEntry.import_batch_id.in_(manifest_ids),
                JournalEntry.entry_date.between(
                    analysis.period_start - timedelta(days=31),
                    analysis.period_end + timedelta(days=31),
                ),
                classification == AccountClass.ASSET,
                or_(
                    Account.source_code.startswith("10"),
                    Account.source_code.startswith("11"),
                ),
            )
            .order_by(JournalEntry.entry_date, JournalEntry.id, JournalLine.id)
        )
    ).all()
    ledgers: list[LedgerRecord] = []
    for row in ledger_rows:
        ledgers.append(
            LedgerRecord(
                entry_id=row[0],
                source_row_id=row[1],
                entry_date=row[2],
                description=row[3],
                reference=row[4],
                source_entry_id=row[5],
                line_id=row[6],
                amount_irr=Decimal(row[7]) - Decimal(row[8]),
                invoice_ref=row[9],
            )
        )
    return banks, ledgers


async def execute_reconciliation(
    session: AsyncSession, *, run_id: UUID, company_id: UUID, actor_id: UUID
) -> dict[str, object]:
    run = await session.scalar(
        select(ReconciliationRun)
        .where(ReconciliationRun.id == run_id, ReconciliationRun.company_id == company_id)
        .with_for_update()
    )
    if run is None:
        raise ValueError("Reconciliation run is not accessible")
    if run.status in {
        ReconciliationStatus.COMPLETED,
        ReconciliationStatus.COMPLETED_LIMITED,
    }:
        return {"status": run.status.value, "reconciliation_run_id": str(run.id)}
    if run.status not in {ReconciliationStatus.QUEUED, ReconciliationStatus.PROCESSING}:
        raise ValueError("Reconciliation run is not ready")
    analysis = await session.scalar(
        select(AnalysisRun).where(
            AnalysisRun.id == run.analysis_run_id,
            AnalysisRun.company_id == company_id,
            AnalysisRun.status.in_(FINAL_ANALYSIS),
        )
    )
    if analysis is None:
        raise ValueError("Analysis snapshot is not ready")
    run.status = ReconciliationStatus.PROCESSING
    run.started_at = run.started_at or datetime.now(UTC)
    banks, ledgers = await _inputs(session, analysis)
    config = ReconciliationConfig(
        rule_business_days=int(run.config_json.get("rule_business_days", 3)),
        review_calendar_days=int(run.config_json.get("review_calendar_days", 10)),
        fuzzy_threshold=Decimal(str(run.config_json.get("fuzzy_threshold", "70"))),
        ambiguity_margin=Decimal(str(run.config_json.get("ambiguity_margin", "5"))),
    )
    proposals = reconcile(banks, ledgers, config)
    now = datetime.now(UTC)
    if proposals:
        await session.execute(
            insert(ReconciliationMatch).values(
                [
                    {
                        "id": uuid7(),
                        "company_id": company_id,
                        "run_id": run.id,
                        "bank_transaction_id": item.bank_transaction_id,
                        "journal_entry_id": item.journal_entry_id,
                        "match_level": item.match_level,
                        "status": item.status,
                        "score": item.score,
                        "amount_difference_irr": item.amount_difference_irr,
                        "date_difference_days": item.date_difference_days,
                        "features_json": item.features,
                        "evidence_json": item.evidence,
                        "rule_code": item.rule_code,
                        "created_at": now,
                    }
                    for item in proposals
                ]
            )
        )
    status_counts = Counter(item.status.value for item in proposals)
    counts: dict[str, object] = {
        "bank_transactions": len(banks),
        "accounting_entries": len({item.entry_id for item in ledgers}),
        "auto_matched": status_counts[MatchStatus.AUTO_MATCHED.value],
        "potential_matches": status_counts[MatchStatus.POTENTIAL_MATCH.value],
        "amount_mismatches": status_counts[MatchStatus.AMOUNT_MISMATCH.value],
        "date_mismatches": status_counts[MatchStatus.DATE_MISMATCH.value],
        "duplicates": status_counts[MatchStatus.DUPLICATE_HIGH.value]
        + status_counts[MatchStatus.DUPLICATE_POSSIBLE.value],
        "unresolved": status_counts[MatchStatus.UNRESOLVED.value],
    }
    available = bool(banks) and bool(ledgers)
    run.counts_json = counts
    run.status = (
        ReconciliationStatus.COMPLETED if available else ReconciliationStatus.COMPLETED_LIMITED
    )
    run.completed_at = now
    run.failure_code = None
    run.failure_message = None
    record_audit_event(
        session,
        action="reconciliation.completed",
        entity_type="reconciliation_run",
        actor_id=actor_id,
        entity_id=run.id,
        company_id=company_id,
        metadata={"config_version": run.config_version, **counts},
    )
    await session.commit()
    return {
        "status": run.status.value,
        "reconciliation_run_id": str(run.id),
        "counts": counts,
    }
