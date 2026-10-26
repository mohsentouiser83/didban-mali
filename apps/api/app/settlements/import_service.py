"""Process settlement source rows atomically with their bank allocations."""

from collections import Counter, defaultdict
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_audit_event
from app.core.tenant import set_request_company, set_request_user
from app.financial.models import BankAccount, BankTransaction, InvoiceAllocation
from app.imports.mapping import transform_and_validate_row
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    MappingVersion,
    SourceKind,
    SourceRow,
)
from app.imports.structure import effective_raw
from app.settlements.catalog import invoice_catalog
from app.settlements.import_matching import (
    input_signature,
    select_bank,
    select_invoice,
    settlement_group,
    settlement_key,
)
from app.settlements.schemas import AllocationInput
from app.settlements.service import allocate


async def _banks(session: AsyncSession, company_id: UUID) -> list[Any]:
    return list(
        (
            await session.execute(
                select(BankTransaction, BankAccount)
                .join(
                    BankAccount,
                    (BankAccount.id == BankTransaction.bank_account_id)
                    & (BankAccount.company_id == company_id),
                )
                .join(
                    SourceRow,
                    (SourceRow.id == BankTransaction.source_row_id)
                    & (SourceRow.company_id == company_id),
                )
                .join(
                    ImportBatch,
                    (ImportBatch.id == SourceRow.import_batch_id)
                    & (ImportBatch.company_id == company_id),
                )
                .where(
                    BankTransaction.company_id == company_id,
                    ImportBatch.status.in_(
                        [ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]
                    ),
                )
            )
        ).all()
    )


async def process_settlement_import(
    session: AsyncSession,
    batch: ImportBatch,
    source: DataSource,
    version: MappingVersion,
    actor_id: UUID,
) -> dict[str, object]:
    company_id = batch.company_id
    direction = "sales" if source.kind == SourceKind.SETTLEMENT_SALES else "purchases"
    rows = list(
        (
            await session.scalars(
                select(SourceRow)
                .where(
                    SourceRow.company_id == company_id,
                    SourceRow.import_batch_id == batch.id,
                )
                .order_by(SourceRow.row_number)
            )
        ).all()
    )
    parsed: dict[UUID, dict[str, object]] = {}
    groups: dict[tuple[str, ...], set[tuple[str, ...]]] = defaultdict(set)
    for row in rows:
        values, issues = transform_and_validate_row(
            source_kind=source.kind,
            row_number=row.row_number,
            raw=effective_raw(row.raw_json, row.processing_result),
            mapping=version.mapping_json["fields"],
            transforms=version.transforms_json,
            currency_unit=version.mapping_json["currency_unit"],
            calendar=version.mapping_json["calendar"],
        )
        if any(i.severity.value in {"error", "blocking"} for i in issues):
            row.processing_result = {"status": "invalid", "reason": "ردیف خطای اعتبارسنجی دارد."}
            continue
        parsed[row.id] = values
        group = settlement_group(values)
        groups[group].add(input_signature(values))
    await session.commit()
    await set_request_user(session, actor_id)
    await set_request_company(session, company_id)
    invoices = await invoice_catalog(session, company_id)
    banks = await _banks(session, company_id)
    for row in rows:
        if row.id not in parsed or row.processing_result.get("status") in {"matched", "duplicate"}:
            continue
        values = parsed[row.id]
        result: dict[str, Any] = {"status": "review"}
        group = settlement_group(values)
        invoice, reason = select_invoice(values, invoices, direction)
        if invoice:
            result["invoice_source_row_id"] = str(invoice.source_row_id)
        if len(groups[group]) > 1:
            reason = "ردیف‌های دارای شناسه تسویه یکسان، اطلاعات متعارض دارند."
        if not reason and invoice:
            bank, reason = select_bank(values, banks, direction)
            if bank:
                result["bank_transaction_id"] = str(bank.id)
            if not reason and bank:
                payload = AllocationInput(
                    invoice_source_row_id=invoice.source_row_id,
                    bank_transaction_id=bank.id,
                    amount_irr=Decimal(str(values["settlement_amount"])),
                    request_key=settlement_key(direction, invoice.key, values),
                )
                try:
                    async with session.begin_nested():
                        # Same lock as manual allocation, including duplicate detection.
                        await session.execute(
                            text("SELECT pg_advisory_xact_lock(hashtextextended(:tenant, 29))"),
                            {"tenant": str(company_id)},
                        )
                        previous = await session.scalar(
                            select(InvoiceAllocation).where(
                                InvoiceAllocation.company_id == company_id,
                                InvoiceAllocation.request_key == payload.request_key,
                            )
                        )
                        if previous and previous.reversed_at:
                            raise HTTPException(
                                409, "تخصیص قبلی برگشت داده شده؛ ثبت مجدد خودکار مجاز نیست."
                            )
                        similar = await session.scalar(
                            select(InvoiceAllocation.id)
                            .where(
                                InvoiceAllocation.company_id == company_id,
                                InvoiceAllocation.invoice_key == invoice.key,
                                InvoiceAllocation.bank_transaction_id == bank.id,
                                InvoiceAllocation.amount_irr == payload.amount_irr,
                                InvoiceAllocation.reversed_at.is_(None),
                                InvoiceAllocation.request_key != payload.request_key,
                            )
                            .limit(1)
                        )
                        if similar:
                            raise HTTPException(
                                409, "تخصیص مشابه قبلاً ثبت شده؛ تکراری‌بودن تسویه را بررسی کنید."
                            )
                        if previous:
                            # A portal re-export may replace the selected source row;
                            # the stable tax invoice key, bank and amount must agree.
                            if (
                                previous.invoice_key,
                                previous.bank_transaction_id,
                                previous.amount_irr,
                            ) != (
                                invoice.key,
                                bank.id,
                                payload.amount_irr,
                            ):
                                raise HTTPException(
                                    409, "شناسه تسویه قبلاً با مبلغ یا تراکنش دیگری ثبت شده است."
                                )
                            allocation_id = previous.id
                        else:
                            allocation_id = await allocate(
                                session,
                                company_id,
                                actor_id,
                                payload,
                                commit=False,
                                settlement_source_row_id=row.id,
                            )
                        result.update(
                            status="duplicate" if previous else "matched",
                            allocation_id=str(allocation_id),
                        )
                        record_audit_event(
                            session,
                            action="settlement_import.row_linked",
                            entity_type="source_row",
                            entity_id=row.id,
                            actor_id=actor_id,
                            company_id=company_id,
                            metadata={
                                "allocation_id": str(allocation_id),
                                "duplicate": bool(previous),
                            },
                        )
                except HTTPException as exc:
                    reason = str(exc.detail)
        if reason:
            result["reason"] = reason
        row.processing_result = {**row.processing_result, **result}
        await session.commit()
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
    counts = Counter(row.processing_result.get("status", "review") for row in rows)
    batch.coverage_json = {**batch.coverage_json, "settlement_results": dict(counts)}
    batch.status = (
        ImportStatus.COMPLETED_LIMITED
        if counts["review"] or counts["invalid"]
        else ImportStatus.COMPLETED
    )
    batch.stage, batch.progress, batch.retryable = "normalized", 100, False
    batch.failure_code = batch.failure_message = None
    await session.commit()
    return {"status": batch.status.value, "settlement_results": dict(counts)}
