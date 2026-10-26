from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.financial.models import (
    Account,
    BankAccount,
    BankTransaction,
    Counterparty,
    InvoiceAllocation,
    InvoiceReceipt,
    SalesInvoice,
)
from app.financial.normalization import normalize_text
from app.financial.queries import cash_account_scope
from app.imports.models import ImportBatch, ImportStatus, SourceRow
from app.settlements.bank_rules import account_keys, non_trade_movement
from app.settlements.catalog import invoice_catalog
from app.settlements.schemas import (
    AllocationInput,
    AllocationItem,
    BankCandidate,
    HistoryConfirmation,
    InvoiceDetail,
    InvoiceItem,
)


async def find_invoice(session: AsyncSession, company_id: UUID, row_id: UUID) -> InvoiceItem:
    invoices = await invoice_catalog(session, company_id)
    item = next((i for i in invoices if i.source_row_id == row_id), None)
    if item is None:
        raise HTTPException(404, "فاکتور پیدا نشد؛ فهرست را تازه کنید.")
    return item


async def _bank_rows(
    session: AsyncSession, company_id: UUID
) -> list[tuple[BankTransaction, str, Decimal]]:
    used = (
        select(
            InvoiceAllocation.bank_transaction_id.label("id"),
            func.sum(InvoiceAllocation.amount_irr).label("amount"),
        )
        .where(InvoiceAllocation.company_id == company_id, InvoiceAllocation.reversed_at.is_(None))
        .group_by(InvoiceAllocation.bank_transaction_id)
        .subquery()
    )
    rows = (
        await session.execute(
            select(BankTransaction, BankAccount.label, func.coalesce(used.c.amount, 0))
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
            .outerjoin(used, used.c.id == BankTransaction.id)
            .where(
                BankTransaction.company_id == company_id,
                ImportBatch.status.in_([ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]),
            )
        )
    ).all()
    return [(bank, label, Decimal(amount)) for bank, label, amount in rows]


def candidate_reason(invoice: InvoiceItem, bank: BankTransaction) -> str:
    description = normalize_text(bank.description)
    references = [normalize_text(value) for value in (invoice.tax_id, invoice.invoice_no)]
    if any(len(value) >= 6 and value in description for value in references):
        return "مرجع فاکتور در شرح بانک"
    if (
        abs(bank.amount_irr) == invoice.unallocated_amount_irr
        and bank.booking_date == invoice.issue_date
    ):
        return "مبلغ و تاریخ یکسان؛ نیازمند تأیید"
    if normalize_text(invoice.party_name) in description:
        return "نام طرف حساب در شرح بانک؛ نیازمند تأیید"
    return "انتخاب دستی"


async def _known_bank_keys(session: AsyncSession, company_id: UUID) -> set[str]:
    identities = (
        await session.execute(
            select(BankAccount.iban_fingerprint, BankAccount.account_number_fingerprint).where(
                BankAccount.company_id == company_id
            )
        )
    ).all()
    keys = {key for pair in identities for key in pair if key}
    names = (
        await session.execute(
            select(Account.name, Account.detail_name).where(
                Account.company_id == company_id, cash_account_scope()
            )
        )
    ).all()
    for pair in names:
        for name in pair:
            keys.update(account_keys(name or ""))
    return keys


async def detail(
    session: AsyncSession, company_id: UUID, row_id: UUID, *, search: str = "", offset: int = 0
) -> InvoiceDetail:
    invoice = await find_invoice(session, company_id, row_id)
    records = (
        await session.execute(
            select(InvoiceAllocation, BankTransaction)
            .join(
                BankTransaction,
                (BankTransaction.id == InvoiceAllocation.bank_transaction_id)
                & (BankTransaction.company_id == company_id),
            )
            .where(
                InvoiceAllocation.company_id == company_id,
                InvoiceAllocation.invoice_key == invoice.key,
            )
            .order_by(InvoiceAllocation.created_at)
        )
    ).all()
    candidates = []
    known_keys = await _known_bank_keys(session, company_id)
    for bank, label, used in await _bank_rows(session, company_id):
        if (bank.amount_irr > 0) != (
            invoice.direction == "sales"
        ) or bank.booking_date < invoice.issue_date:
            continue
        if non_trade_movement(bank.description, known_keys, invoice.direction):
            continue
        available = abs(bank.amount_irr) - used
        if available <= 0 or (
            search
            and normalize_text(search)
            not in normalize_text(
                f"{bank.description} {bank.source_transaction_id} {abs(bank.amount_irr)} {bank.booking_date}"
            )
        ):
            continue
        candidates.append(
            BankCandidate(
                id=bank.id,
                booking_date=bank.booking_date,
                description=bank.description,
                bank_label=label,
                amount_irr=abs(bank.amount_irr),
                available_amount_irr=available,
                reason=candidate_reason(invoice, bank),
            )
        )
    candidates.sort(
        key=lambda b: (
            b.reason == "انتخاب دستی",
            abs(b.amount_irr - invoice.unallocated_amount_irr),
            b.booking_date,
            str(b.id),
        )
    )
    receipt_history_complete = (
        bool(
            await session.scalar(
                select(SalesInvoice.receipt_history_complete).where(
                    SalesInvoice.company_id == company_id,
                    or_(
                        SalesInvoice.id == invoice.canonical_invoice_id,
                        SalesInvoice.source_row_id == invoice.source_row_id,
                        (SalesInvoice.invoice_no == invoice.number)
                        & (SalesInvoice.issue_date == invoice.issue_date),
                    ),
                )
            )
        )
        if invoice.direction == "sales"
        else False
    )
    return InvoiceDetail(
        receipt_history_complete=receipt_history_complete,
        invoice=invoice,
        allocations=[
            AllocationItem(
                id=a.id,
                bank_transaction_id=b.id,
                amount_irr=a.amount_irr,
                booking_date=b.booking_date,
                description=b.description,
                reversed=a.reversed_at is not None,
            )
            for a, b in records
        ],
        candidates=candidates[offset : offset + 25],
        transaction_total=len(candidates),
    )


async def _sync_receipts(
    session: AsyncSession, company_id: UUID, invoice: InvoiceItem, *, complete: bool
) -> None:
    if invoice.direction != "sales":
        return
    allocations = (
        await session.scalars(
            select(InvoiceAllocation)
            .where(
                InvoiceAllocation.company_id == company_id,
                InvoiceAllocation.invoice_key == invoice.key,
                InvoiceAllocation.reversed_at.is_(None),
            )
            .order_by(InvoiceAllocation.created_at)
        )
    ).all()
    total = sum((a.amount_irr for a in allocations), Decimal(0))
    canonical = await session.scalar(
        select(SalesInvoice)
        .where(
            SalesInvoice.company_id == company_id,
            or_(
                SalesInvoice.id == invoice.canonical_invoice_id,
                SalesInvoice.source_row_id == invoice.source_row_id,
                (SalesInvoice.invoice_no == invoice.number)
                & (SalesInvoice.issue_date == invoice.issue_date),
            ),
        )
        .with_for_update()
    )
    if canonical is None and not (complete or total == invoice.gross_amount_irr):
        # A partial bank attribution cannot establish the missing receipt history of a tax export.
        return
    if canonical is None:
        name = normalize_text(invoice.party_name)
        await session.execute(
            insert(Counterparty)
            .values(
                id=uuid7(),
                company_id=company_id,
                name=invoice.party_name,
                normalized_name=name,
                kind="customer",
                national_id=invoice.party_id or None,
            )
            .on_conflict_do_nothing(constraint="uq_counterparty_company_name")
        )
        party = await session.scalar(
            select(Counterparty.id).where(
                Counterparty.company_id == company_id, Counterparty.normalized_name == name
            )
        )
        canonical = SalesInvoice(
            id=uuid7(),
            company_id=company_id,
            source_row_id=invoice.source_row_id,
            invoice_no=invoice.number,
            counterparty_id=party,
            issue_date=invoice.issue_date,
            gross_amount_irr=invoice.gross_amount_irr,
            tax_amount_irr=invoice.tax_amount_irr,
            paid_amount_irr=total,
            receipt_history_complete=True,
            receipt_history_version=0,
        )
        session.add(canonical)
        await session.flush()
    if canonical.gross_amount_irr != invoice.gross_amount_irr:
        raise HTTPException(409, "مبلغ فاکتور ثبت‌شده با فایل انتخابی مغایرت دارد.")
    receipts = (
        await session.scalars(
            select(InvoiceReceipt).where(
                InvoiceReceipt.company_id == company_id, InvoiceReceipt.invoice_id == canonical.id
            )
        )
    ).all()
    if any(r.allocation_id is None for r in receipts):
        raise HTTPException(409, "فاکتور تاریخچه وصول دستی دارد؛ ابتدا آن را بررسی کنید.")
    # Source cumulative paid values must never be silently overwritten by a partial link.
    if (
        canonical.paid_amount_irr
        and not receipts
        and canonical.paid_amount_irr != total
        and not complete
    ):
        raise HTTPException(
            409, "مبلغ وصول قبلی با تخصیص بانک برابر نیست؛ کامل‌بودن تاریخچه را تأیید کنید."
        )
    linked = {r.allocation_id for r in receipts}
    for a in allocations:
        if a.id not in linked:
            bank = await session.get(BankTransaction, a.bank_transaction_id)
            assert bank is not None and bank.company_id == company_id
            session.add(
                InvoiceReceipt(
                    company_id=company_id,
                    invoice_id=canonical.id,
                    allocation_id=a.id,
                    received_on=bank.booking_date,
                    amount_irr=a.amount_irr,
                    reference=bank.source_transaction_id,
                )
            )
    canonical.paid_amount_irr = total
    canonical.receipt_history_complete = (
        complete or total == invoice.gross_amount_irr or canonical.receipt_history_complete
    )
    canonical.receipt_history_version += 1


async def allocate(
    session: AsyncSession, company_id: UUID, actor_id: UUID, payload: AllocationInput,
    *, commit: bool = True, settlement_source_row_id: UUID | None = None,
) -> UUID:
    # Serialize the two capacity constraints and idempotency in one tenant transaction.
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
    if previous:
        if previous.history_confirmed != payload.confirm_history_complete:
            raise HTTPException(409, "شناسه درخواست قبلاً با اطلاعات دیگری ثبت شده است.")
        if (previous.invoice_source_row_id, previous.bank_transaction_id, previous.amount_irr) != (
            payload.invoice_source_row_id,
            payload.bank_transaction_id,
            payload.amount_irr,
        ):
            raise HTTPException(409, "شناسه درخواست قبلاً با اطلاعات دیگری ثبت شده است.")
        return previous.id
    invoice = await find_invoice(session, company_id, payload.invoice_source_row_id)
    if invoice.review_reason:
        raise HTTPException(422, invoice.review_reason)
    bank = next(
        (
            b
            for b, _, _ in await _bank_rows(session, company_id)
            if b.id == payload.bank_transaction_id
        ),
        None,
    )
    if bank is None:
        raise HTTPException(404, "تراکنش بانک پیدا نشد.")
    if (bank.amount_irr > 0) != (invoice.direction == "sales"):
        raise HTTPException(422, "جهت تراکنش با فاکتور سازگار نیست.")
    if non_trade_movement(
        bank.description, await _known_bank_keys(session, company_id), invoice.direction
    ):
        raise HTTPException(422, "انتقال داخلی یا سود سپرده به فاکتور تخصیص نمی‌یابد.")
    if bank.booking_date < invoice.issue_date:
        raise HTTPException(
            422, "تراکنش قبل از تاریخ فاکتور است؛ پیش‌پرداخت نیازمند بررسی جداگانه است."
        )
    used = await session.scalar(
        select(func.coalesce(func.sum(InvoiceAllocation.amount_irr), 0)).where(
            InvoiceAllocation.company_id == company_id,
            InvoiceAllocation.bank_transaction_id == bank.id,
            InvoiceAllocation.reversed_at.is_(None),
        )
    )
    if payload.amount_irr > invoice.unallocated_amount_irr or payload.amount_irr > abs(
        bank.amount_irr
    ) - Decimal(used or 0):
        raise HTTPException(409, "مبلغ از ظرفیت فاکتور یا تراکنش بیشتر است.")
    allocation = InvoiceAllocation(
        id=uuid7(),
        company_id=company_id,
        invoice_source_row_id=invoice.source_row_id,
        settlement_source_row_id=settlement_source_row_id,
        invoice_key=invoice.key,
        bank_transaction_id=bank.id,
        direction=invoice.direction,
        amount_irr=payload.amount_irr,
        history_confirmed=payload.confirm_history_complete,
        request_key=payload.request_key,
        confirmed_by=actor_id,
    )
    session.add(allocation)
    await session.flush()
    await _sync_receipts(session, company_id, invoice, complete=payload.confirm_history_complete)
    record_audit_event(
        session,
        action="invoice.bank_allocated",
        entity_type="invoice_allocation",
        entity_id=allocation.id,
        company_id=company_id,
        actor_id=actor_id,
        metadata={
            "amount_irr": str(allocation.amount_irr),
            "bank_transaction_id": str(bank.id),
            "history_complete": payload.confirm_history_complete,
        },
    )
    if commit:
        await session.commit()
    return allocation.id


async def reverse(
    session: AsyncSession, company_id: UUID, actor_id: UUID, allocation_id: UUID
) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:tenant, 29))"),
        {"tenant": str(company_id)},
    )
    allocation = await session.scalar(
        select(InvoiceAllocation)
        .where(InvoiceAllocation.company_id == company_id, InvoiceAllocation.id == allocation_id)
        .with_for_update()
    )
    if allocation is None:
        raise HTTPException(404, "تخصیص پیدا نشد.")
    if allocation.reversed_at:
        return
    allocation.reversed_at = datetime.now(UTC)
    allocation.reversed_by = actor_id
    receipt = await session.scalar(
        select(InvoiceReceipt).where(
            InvoiceReceipt.company_id == company_id, InvoiceReceipt.allocation_id == allocation.id
        )
    )
    if receipt:
        canonical = await session.scalar(
            select(SalesInvoice)
            .where(SalesInvoice.company_id == company_id, SalesInvoice.id == receipt.invoice_id)
            .with_for_update()
        )
        assert canonical is not None
        await session.delete(receipt)
        canonical.paid_amount_irr = (
            canonical.paid_amount_irr or Decimal(0)
        ) - allocation.amount_irr
        canonical.receipt_history_complete = False
        canonical.receipt_history_version += 1
    record_audit_event(
        session,
        action="invoice.bank_allocation_reversed",
        entity_type="invoice_allocation",
        entity_id=allocation.id,
        company_id=company_id,
        actor_id=actor_id,
    )
    await session.commit()


async def confirm_history(
    session: AsyncSession,
    company_id: UUID,
    actor_id: UUID,
    row_id: UUID,
    payload: HistoryConfirmation,
) -> None:
    if not payload.confirm_complete:
        raise HTTPException(422, "کامل‌بودن تاریخچه وصول را تأیید کنید.")
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:tenant, 29))"),
        {"tenant": str(company_id)},
    )
    invoice = await find_invoice(session, company_id, row_id)
    if invoice.direction != "sales" or invoice.review_reason:
        raise HTTPException(422, invoice.review_reason or "تأیید تاریخچه فقط برای فروش است.")
    if invoice.allocated_amount_irr != payload.expected_allocated_amount_irr:
        raise HTTPException(409, "تخصیص‌ها تغییر کرده‌اند؛ اطلاعات را تازه کنید.")
    await _sync_receipts(session, company_id, invoice, complete=True)
    record_audit_event(
        session,
        action="invoice.bank_receipt_history_confirmed",
        entity_type="source_row",
        entity_id=row_id,
        company_id=company_id,
        actor_id=actor_id,
        metadata={"allocated_amount_irr": str(invoice.allocated_amount_irr)},
    )
    await session.commit()
