from collections import Counter
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.analysis.models import AnalysisRun, AnalysisStatus
from app.audit.service import record_audit_event
from app.financial.models import (
    AccountClass,
    AccountClassification,
    BankTransaction,
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
    MatchStatus,
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)

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
            .where(
                JournalEntry.company_id == analysis.company_id,
                JournalEntry.import_batch_id.in_(manifest_ids),
                JournalEntry.entry_date.between(
                    analysis.period_start - timedelta(days=31),
                    analysis.period_end + timedelta(days=31),
                ),
                classification == AccountClass.ASSET,
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
        rule_business_days=int(run.config_json["rule_business_days"]),
        review_calendar_days=int(run.config_json["review_calendar_days"]),
        fuzzy_threshold=Decimal(str(run.config_json["fuzzy_threshold"])),
        ambiguity_margin=Decimal(str(run.config_json["ambiguity_margin"])),
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
