from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial.models import (
    BankAccount,
    BankTransaction,
    Counterparty,
    InvoiceReceipt,
    SalesInvoice,
)
from app.financial_periods.schemas import (
    CashDay,
    CashPeriodReport,
    DateRange,
    PeriodReport,
    ReceivablesPeriodReport,
)
from app.receivables.schemas import AgingBucketDetail, ReceivableInvoiceItem
from app.receivables.service import BUCKET_CONFIG, _classify_delay, _customer_items

ZERO = Decimal(0)


def account_balance(transactions: list[BankTransaction], cutoff: date) -> Decimal | None:
    """Use a recorded balance plus later movements; never assume a zero opening balance."""
    anchors = [
        i
        for i, tx in enumerate(transactions)
        if tx.booking_date <= cutoff and tx.running_balance_irr is not None
    ]
    if anchors:
        i = anchors[-1]
        anchor_balance = transactions[i].running_balance_irr
        assert anchor_balance is not None
        return Decimal(anchor_balance) + sum(
            (Decimal(tx.amount_irr) for tx in transactions[i + 1 :] if tx.booking_date <= cutoff),
            ZERO,
        )
    # A statement beginning the very next day permits deriving the previous day's closing balance.
    if transactions and cutoff >= transactions[0].booking_date - timedelta(days=1):
        for i, tx in enumerate(transactions):
            if tx.running_balance_irr is not None:
                return Decimal(tx.running_balance_irr) - sum(
                    (
                        Decimal(row.amount_irr)
                        for row in transactions[: i + 1]
                        if row.booking_date > cutoff
                    ),
                    ZERO,
                )
    return None


def cash_report(
    accounts: list[BankAccount], transactions: list[BankTransaction], period: DateRange
) -> CashPeriodReport:
    by_account: dict[UUID, list[BankTransaction]] = defaultdict(list)
    for tx in transactions:
        by_account[tx.bank_account_id].append(tx)
    warnings: list[str] = []
    start = period.start_date - timedelta(days=1)

    def balance(cutoff: date) -> str | None:
        amounts = [account_balance(by_account[acc.id], cutoff) for acc in accounts]
        if not amounts or any(amount is None for amount in amounts):
            return None
        return str(sum((amount for amount in amounts if amount is not None), ZERO))

    opening, closing = balance(start), balance(period.end_date)
    current = {acc.id: account_balance(by_account[acc.id], start) for acc in accounts}
    discrepancy = False
    rows = [tx for tx in transactions if period.start_date <= tx.booking_date <= period.end_date]
    # Preserve actual statement flows. Matching amounts alone cannot prove an internal transfer.
    inflows = sum((Decimal(tx.amount_irr) for tx in rows if tx.amount_irr > 0), ZERO)
    outflows = sum((-Decimal(tx.amount_irr) for tx in rows if tx.amount_irr < 0), ZERO)
    if opening is None:
        warnings.append(
            "مانده ابتدای دوره برای همه حساب‌ها قابل محاسبه نیست؛ مانده معتبر یا گردش کامل لازم است."
        )
    if closing is None:
        warnings.append("مانده پایان دوره برای همه حساب‌ها قابل محاسبه نیست.")
    if not transactions:
        warnings.append("گردش بانکی برای این بازه موجود نیست؛ نبود داده به معنی گردش صفر نیست.")
    warnings.append(
        "دریافت و پرداخت، جمع گردش ثبت‌شده بانک‌هاست و انتقال بین حساب‌های شرکت را هم شامل می‌شود. کامل‌بودن فایل‌های منبع را بررسی کنید."
    )
    by_day: dict[date, list[BankTransaction]] = defaultdict(list)
    for tx in rows:
        by_day[tx.booking_date].append(tx)
    days: list[CashDay] = []
    cursor = period.start_date
    while cursor <= period.end_date:
        day_rows = by_day[cursor]
        for tx in day_rows:
            previous = current.get(tx.bank_account_id)
            expected = previous + tx.amount_irr if previous is not None else None
            if tx.running_balance_irr is not None:
                if expected is not None and expected != tx.running_balance_irr:
                    discrepancy = True
                current[tx.bank_account_id] = tx.running_balance_irr
            else:
                current[tx.bank_account_id] = expected
        day_balance = (
            None
            if not current or any(value is None for value in current.values())
            else str(sum((value for value in current.values() if value is not None), ZERO))
        )
        days.append(
            CashDay(
                date=cursor,
                inflows_irr=str(
                    sum((Decimal(tx.amount_irr) for tx in day_rows if tx.amount_irr > 0), ZERO)
                ),
                outflows_irr=str(
                    sum((-Decimal(tx.amount_irr) for tx in day_rows if tx.amount_irr < 0), ZERO)
                ),
                balance_irr=day_balance,
            )
        )
        cursor += timedelta(days=1)
    if discrepancy:
        warnings.append(
            "گردش ثبت‌شده با مانده‌های بانکی تطبیق ندارد؛ ممکن است بخشی از تراکنش‌ها موجود نباشد."
        )
    return CashPeriodReport(
        opening_balance_irr=opening,
        closing_balance_irr=closing,
        inflows_irr=str(inflows) if transactions else None,
        outflows_irr=str(outflows) if transactions else None,
        days=days,
        warnings=warnings,
    )


def receivables_report(
    rows: list[Any], receipts: list[InvoiceReceipt], period: DateRange
) -> ReceivablesPeriodReport:
    relevant = [(inv, cp) for inv, cp in rows if inv.issue_date <= period.end_date]
    incomplete = [
        inv
        for inv, _ in relevant
        if not inv.receipt_history_complete
        and (inv.paid_amount_irr is None or inv.paid_amount_irr > ZERO)
    ]
    if incomplete:
        return ReceivablesPeriodReport(
            opening_balance_irr=None,
            sales_irr=None,
            receipts_irr=None,
            closing_balance_irr=None,
            overdue_irr=None,
            history_complete=False,
            buckets=[],
            customers=[],
            invoices=[],
            warnings=[
                f"تاریخچه وصول {len(incomplete)} فاکتور کامل نیست. برای محاسبه مانده تاریخی، تاریخ و مبلغ تمام وصول‌ها را ثبت کنید."
            ],
        )
    if not relevant:
        return ReceivablesPeriodReport(
            opening_balance_irr=None,
            sales_irr=None,
            receipts_irr=None,
            closing_balance_irr=None,
            overdue_irr=None,
            history_complete=True,
            buckets=[],
            customers=[],
            invoices=[],
            warnings=["فاکتور فروش تا پایان دوره موجود نیست؛ نبود داده به معنی مطالبات صفر نیست."],
        )
    paid_start: dict[UUID, Decimal] = defaultdict(lambda: ZERO)
    paid_end: dict[UUID, Decimal] = defaultdict(lambda: ZERO)
    invoice_ids = {inv.id for inv, _ in relevant}
    receipts_total = ZERO
    for receipt in receipts:
        if receipt.invoice_id not in invoice_ids:
            continue
        if receipt.received_on < period.start_date:
            paid_start[receipt.invoice_id] += receipt.amount_irr
        if receipt.received_on <= period.end_date:
            paid_end[receipt.invoice_id] += receipt.amount_irr
        if period.start_date <= receipt.received_on <= period.end_date:
            receipts_total += receipt.amount_irr
    opening = sum(
        (
            inv.gross_amount_irr - paid_start[inv.id]
            for inv, _ in relevant
            if inv.issue_date < period.start_date
        ),
        ZERO,
    )
    sales = sum(
        (inv.gross_amount_irr for inv, _ in relevant if inv.issue_date >= period.start_date), ZERO
    )
    totals: dict[str, Decimal] = {key: ZERO for key, _ in BUCKET_CONFIG}
    counts: dict[str, int] = {key: 0 for key, _ in BUCKET_CONFIG}
    invoices: list[ReceivableInvoiceItem] = []
    for inv, cp in relevant:
        remaining = inv.gross_amount_irr - paid_end[inv.id]
        if remaining <= ZERO:
            continue
        delay = (period.end_date - inv.due_date).days if inv.due_date else 0
        bucket = _classify_delay(delay) if inv.due_date else "due_date_missing"
        totals[bucket] += remaining
        counts[bucket] += 1
        invoices.append(
            ReceivableInvoiceItem(
                id=inv.id,
                invoice_no=inv.invoice_no,
                counterparty_id=cp.id,
                counterparty_name=cp.name,
                issue_date=inv.issue_date,
                due_date=inv.due_date,
                gross_amount_irr=inv.gross_amount_irr,
                paid_amount_irr=paid_end[inv.id],
                remaining_amount_irr=remaining,
                delay_days=delay,
                bucket_key=bucket,
                status=inv.status,
            )
        )
    closing = sum(totals.values(), ZERO)
    overdue = sum((totals[key] for key in ("1_30", "31_60", "61_90", "90_plus")), ZERO)
    buckets = [
        AgingBucketDetail(
            bucket_key=key,
            label_fa=label,
            amount_irr=totals[key],
            invoice_count=counts[key],
            share_percentage=float(totals[key] / closing * 100) if closing else 0,
        )
        for key, label in BUCKET_CONFIG
    ]
    warnings = (
        ["برخی فاکتورها تاریخ سررسید ندارند و جداگانه نمایش داده شده‌اند."]
        if counts["due_date_missing"]
        else []
    )
    return ReceivablesPeriodReport(
        opening_balance_irr=str(opening),
        sales_irr=str(sales),
        receipts_irr=str(receipts_total),
        closing_balance_irr=str(closing),
        overdue_irr=str(overdue),
        history_complete=True,
        warnings=warnings,
        buckets=buckets,
        customers=_customer_items(relevant, period.end_date, paid_by_invoice=paid_end),
        invoices=invoices,
    )


async def get_period_report(
    session: AsyncSession, company_id: UUID, period: DateRange
) -> PeriodReport:
    accounts = list(
        (
            await session.scalars(select(BankAccount).where(BankAccount.company_id == company_id))
        ).all()
    )
    transactions = list(
        (
            await session.scalars(
                select(BankTransaction)
                .where(
                    BankTransaction.company_id == company_id,
                    BankTransaction.booking_date <= period.end_date,
                )
                .order_by(BankTransaction.booking_date, BankTransaction.id)
            )
        ).all()
    )
    rows = list(
        (
            await session.execute(
                select(SalesInvoice, Counterparty)
                .join(
                    Counterparty,
                    SalesInvoice.counterparty_id == Counterparty.id,
                )
                .where(
                    SalesInvoice.company_id == company_id,
                    SalesInvoice.issue_date <= period.end_date,
                )
            )
        ).all()
    )
    receipts = list(
        (
            await session.scalars(
                select(InvoiceReceipt).where(
                    InvoiceReceipt.company_id == company_id,
                    InvoiceReceipt.received_on <= period.end_date,
                )
            )
        ).all()
    )
    return PeriodReport(
        **period.model_dump(),
        cash=cash_report(accounts, transactions, period),
        receivables=receivables_report(rows, receipts, period),
    )
