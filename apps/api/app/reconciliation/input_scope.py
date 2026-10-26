"""Coverage of selected bank and accounting inputs; successful parsing is not completeness."""

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial.models import BankAccount, BankTransaction, JournalEntry
from app.imports.completeness import assess_coverage
from app.imports.models import DataSource, ImportBatch, ImportStatus, SourceKind, SourceRow
from app.imports.structure import InputScope


async def input_coverage(
    session: AsyncSession,
    company_id: UUID,
    start: date,
    end: date,
    *,
    bank_account_id: UUID | None,
    explicit_period: bool,
    accounting_confirmed: bool,
    bank_confirmed: bool,
    unmapped_count: int,
) -> dict[str, Any]:
    bank_ids = set(
        (
            await session.scalars(
                select(SourceRow.import_batch_id)
                .join(BankTransaction, BankTransaction.source_row_id == SourceRow.id)
                .where(
                    SourceRow.company_id == company_id,
                    BankTransaction.booking_date.between(start, end),
                    *(
                        [BankTransaction.bank_account_id == bank_account_id]
                        if bank_account_id
                        else []
                    ),
                )
            )
        ).all()
    )
    ledger_ids = set(
        (
            await session.scalars(
                select(JournalEntry.import_batch_id).where(
                    JournalEntry.company_id == company_id,
                    JournalEntry.entry_date.between(start, end),
                )
            )
        ).all()
    )
    bank_sources = set(
        (
            await session.scalars(
                select(BankAccount.data_source_id).where(
                    BankAccount.company_id == company_id,
                    *([BankAccount.id == bank_account_id] if bank_account_id else []),
                )
            )
        ).all()
    )
    rows = (
        await session.execute(
            select(ImportBatch, DataSource.kind)
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(
                ImportBatch.company_id == company_id,
                DataSource.kind.in_([SourceKind.ACCOUNTING, SourceKind.BANK]),
                ImportBatch.status.in_(
                    [
                        ImportStatus.COMPLETED,
                        ImportStatus.COMPLETED_LIMITED,
                        ImportStatus.PROCESSING,
                    ]
                ),
            )
        )
    ).all()
    ledger_batches, bank_batches = [], []
    for batch, kind in rows:
        if batch.status == ImportStatus.PROCESSING and batch.stage != "reconciliation":
            continue
        scope = InputScope.model_validate(batch.coverage_json.get("input_scope", {}))
        overlaps = bool(
            scope.start_date
            and scope.end_date
            and scope.start_date <= end
            and scope.end_date >= start
        )
        if kind == SourceKind.ACCOUNTING and (batch.id in ledger_ids or overlaps):
            ledger_batches.append(batch)
        elif (
            kind == SourceKind.BANK
            and batch.source_id in bank_sources
            and (batch.id in bank_ids or overlaps)
        ):
            bank_batches.append(batch)
    accounting = assess_coverage(ledger_batches, start, end, confirmed=accounting_confirmed)
    bank = assess_coverage(bank_batches, start, end, confirmed=bank_confirmed)
    reasons = [f"حسابداری: {reason}" for reason in accounting["reasons"]]
    reasons += [f"بانک: {reason}" for reason in bank["reasons"]]
    if not explicit_period:
        reasons.append("بازه بررسی انتخاب نشده؛ نبود ثبت متناظر قطعی نیست.")
    if bank_account_id is None:
        reasons.append("حساب بانکی بررسی مشخص نشده است.")
    if unmapped_count:
        reasons.append(f"ارتباط حساب بانکی {unmapped_count} ردیف دفتر تأیید نشده است.")
    return {
        "accounting": accounting,
        "bank": bank,
        "absence_checks_available": accounting["complete"]
        and bank["complete"]
        and explicit_period
        and bank_account_id is not None
        and unmapped_count == 0,
        "limitations": reasons,
    }
