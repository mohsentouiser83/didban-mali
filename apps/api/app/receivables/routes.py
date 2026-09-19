from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.companies.dependencies import CurrentCompanyAccess
from app.identity.dependencies import DbSession
from app.receivables.schemas import (
    BucketKey,
    CustomersReceivablesResponse,
    InvoicesReceivablesResponse,
    ReceivablesSummaryResponse,
)
from app.receivables.service import (
    get_customer_receivables,
    get_receivable_invoices,
    get_receivables_summary,
)

router = APIRouter(prefix="/companies/{company_id}/receivables", tags=["receivables"])


@router.get("/summary", response_model=ReceivablesSummaryResponse)
async def get_summary(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[date | None, Query(description="تاریخ مبنای محاسبه سنی مطالبات")] = None,
) -> ReceivablesSummaryResponse:
    del access
    return await get_receivables_summary(session, company_id=company_id, as_of_date=as_of_date)


@router.get("/customers", response_model=CustomersReceivablesResponse)
async def get_customers(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[date | None, Query(description="تاریخ مبنای محاسبه سنی مطالبات")] = None,
) -> CustomersReceivablesResponse:
    del access
    return await get_customer_receivables(session, company_id=company_id, as_of_date=as_of_date)


@router.get("/invoices", response_model=InvoicesReceivablesResponse)
async def get_invoices(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[date | None, Query(description="تاریخ مبنای محاسبه سنی")] = None,
    bucket: Annotated[BucketKey | None, Query(description="فیلتر بر اساس بازه سنی")] = None,
    counterparty_id: Annotated[UUID | None, Query(description="فیلتر بر اساس مشتری")] = None,
) -> InvoicesReceivablesResponse:
    del access
    return await get_receivable_invoices(
        session,
        company_id=company_id,
        as_of_date=as_of_date,
        bucket_key=bucket,
        counterparty_id=counterparty_id,
    )
