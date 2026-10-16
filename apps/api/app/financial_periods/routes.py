from datetime import date, datetime
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import delete, select

from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.financial.models import Counterparty, InvoiceReceipt, SalesInvoice
from app.financial_periods import period_repository, period_service
from app.financial_periods.schemas import (
    DateRange,
    InvoiceHistory,
    PeriodCreate,
    PeriodItem,
    PeriodReport,
    ReceiptHistory,
    ReceiptItem,
)
from app.financial_periods.service import ZERO, get_period_report
from app.identity.dependencies import CsrfProtected, DbSession

router = APIRouter(prefix="/companies/{company_id}", tags=["financial-periods"])


def require_writer(access: CurrentCompanyAccess) -> None:
    if access.role not in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}:
        raise HTTPException(403, "دسترسی ثبت اطلاعات مالی ندارید.")


@router.get("/financial-periods", response_model=list[PeriodItem])
async def list_periods(
    company_id: UUID, session: DbSession, access: CurrentCompanyAccess
) -> list[PeriodItem]:
    return [
        PeriodItem.model_validate(row)
        for row in await period_repository.list_for_company(session, company_id)
    ]


@router.get("/financial-periods/{period_id:uuid}", response_model=PeriodItem)
async def get_period(
    company_id: UUID, period_id: UUID, session: DbSession, access: CurrentCompanyAccess
) -> PeriodItem:
    period = await period_repository.find_for_company(session, company_id, period_id)
    if period is None:
        raise HTTPException(404, "دوره پیدا نشد.")
    return PeriodItem.model_validate(period)


@router.post("/financial-periods", response_model=PeriodItem, status_code=201)
async def create_period(
    company_id: UUID,
    payload: PeriodCreate,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> PeriodItem:
    require_writer(access)
    try:
        period = await period_service.save_period(session, company_id, access.user_id, payload)
    except period_service.PeriodNameConflict as exc:
        raise HTTPException(409, "نام دوره تکراری است.") from exc
    return PeriodItem.model_validate(period)


@router.put("/financial-periods/{period_id}", response_model=PeriodItem)
async def update_period(
    company_id: UUID,
    period_id: UUID,
    payload: PeriodCreate,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> PeriodItem:
    require_writer(access)
    try:
        period = await period_service.save_period(
            session, company_id, access.user_id, payload, period_id
        )
    except period_service.PeriodNotFound as exc:
        raise HTTPException(404, "دوره پیدا نشد.") from exc
    except period_service.PeriodNameConflict as exc:
        raise HTTPException(409, "نام دوره تکراری است.") from exc
    return PeriodItem.model_validate(period)


@router.delete("/financial-periods/{period_id}", status_code=204)
async def delete_period(
    company_id: UUID,
    period_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> Response:
    require_writer(access)
    try:
        await period_service.remove_period(session, company_id, access.user_id, period_id)
    except period_service.PeriodNotFound as exc:
        raise HTTPException(404, "دوره پیدا نشد.") from exc
    return Response(status_code=204)


@router.get("/financial-periods/report", response_model=PeriodReport)
async def report(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
) -> PeriodReport:
    from pydantic import ValidationError

    try:
        period = DateRange(start_date=start_date, end_date=end_date)
    except ValidationError as exc:
        raise HTTPException(422, "بازه باید مرتب و حداکثر دو سال باشد.") from exc
    return await get_period_report(session, company_id, period)


@router.get("/receivables/receipt-history", response_model=list[InvoiceHistory])
async def histories(
    company_id: UUID, session: DbSession, access: CurrentCompanyAccess
) -> list[InvoiceHistory]:
    rows = (
        await session.execute(
            select(SalesInvoice, Counterparty)
            .join(Counterparty, Counterparty.id == SalesInvoice.counterparty_id)
            .where(SalesInvoice.company_id == company_id)
            .order_by(SalesInvoice.issue_date.desc(), SalesInvoice.invoice_no)
        )
    ).all()
    receipts = (
        await session.scalars(
            select(InvoiceReceipt)
            .where(InvoiceReceipt.company_id == company_id)
            .order_by(InvoiceReceipt.received_on, InvoiceReceipt.id)
        )
    ).all()
    by_invoice: dict[UUID, list[ReceiptItem]] = {}
    for receipt in receipts:
        by_invoice.setdefault(receipt.invoice_id, []).append(ReceiptItem.model_validate(receipt))
    return [
        InvoiceHistory(
            invoice_id=invoice.id,
            invoice_no=invoice.invoice_no,
            customer_name=cp.name,
            issue_date=invoice.issue_date,
            gross_amount_irr=str(invoice.gross_amount_irr),
            paid_amount_irr=str(invoice.paid_amount_irr)
            if invoice.paid_amount_irr is not None
            else None,
            version=invoice.receipt_history_version,
            complete=invoice.receipt_history_complete or invoice.paid_amount_irr == ZERO,
            receipts=by_invoice.get(invoice.id, []),
        )
        for invoice, cp in rows
    ]


@router.put("/receivables/invoices/{invoice_id}/receipt-history", response_model=list[ReceiptItem])
async def save_history(
    company_id: UUID,
    invoice_id: UUID,
    payload: ReceiptHistory,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> list[ReceiptItem]:
    require_writer(access)
    if not payload.confirm_complete:
        raise HTTPException(422, "کامل‌بودن تاریخچه وصول را تأیید کنید.")
    invoice = await session.scalar(
        select(SalesInvoice)
        .where(SalesInvoice.company_id == company_id, SalesInvoice.id == invoice_id)
        .with_for_update()
    )
    if invoice is None:
        raise HTTPException(404, "فاکتور پیدا نشد.")
    if invoice.receipt_history_version != payload.expected_version:
        raise HTTPException(409, "تاریخچه وصول تغییر کرده است؛ اطلاعات را دوباره دریافت کنید.")
    today = datetime.now(ZoneInfo("Asia/Tehran")).date()
    if any(
        row.received_on < invoice.issue_date or row.received_on > today for row in payload.receipts
    ):
        raise HTTPException(422, "تاریخ وصول باید از تاریخ فاکتور تا امروز باشد.")
    total = sum((row.amount_irr for row in payload.receipts), ZERO)
    if total > invoice.gross_amount_irr:
        raise HTTPException(422, "مجموع وصول از مبلغ فاکتور بیشتر است.")
    previous = (
        await session.scalars(
            select(InvoiceReceipt).where(
                InvoiceReceipt.company_id == company_id, InvoiceReceipt.invoice_id == invoice_id
            )
        )
    ).all()
    if any(row.allocation_id for row in previous):
        raise HTTPException(409, "وصول متصل به بانک را از دریافت و پرداخت اصلاح کنید.")
    before = [ReceiptItem.model_validate(row).model_dump(mode="json") for row in previous]
    old_paid = str(invoice.paid_amount_irr) if invoice.paid_amount_irr is not None else None
    await session.execute(
        delete(InvoiceReceipt).where(
            InvoiceReceipt.company_id == company_id, InvoiceReceipt.invoice_id == invoice_id
        )
    )
    receipts = [
        InvoiceReceipt(company_id=company_id, invoice_id=invoice_id, **row.model_dump())
        for row in payload.receipts
    ]
    session.add_all(receipts)
    invoice.paid_amount_irr = total
    invoice.receipt_history_complete = True
    invoice.receipt_history_version += 1
    await session.flush()
    record_audit_event(
        session,
        action="invoice.receipt_history_replaced",
        entity_type="sales_invoice",
        entity_id=invoice_id,
        company_id=company_id,
        actor_id=access.user_id,
        metadata={
            "previous_paid_amount_irr": old_paid,
            "previous_receipts": before,
            "receipts": payload.model_dump(mode="json")["receipts"],
        },
    )
    await session.commit()
    return [ReceiptItem.model_validate(row) for row in receipts]
