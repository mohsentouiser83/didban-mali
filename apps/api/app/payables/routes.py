from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.companies.dependencies import CurrentCompanyAccess
from app.identity.dependencies import DbSession
from app.payables.schemas import (
    PayableEntriesResponse,
    PayablesSummaryResponse,
    VendorsPayablesResponse,
)
from app.payables.service import (
    get_payable_entries,
    get_payables_summary,
    get_vendors_payables,
)

router = APIRouter(prefix="/companies/{company_id}/payables", tags=["payables"])


@router.get("/summary", response_model=PayablesSummaryResponse)
async def get_summary(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[
        date | None,
        Query(description="تاریخ مبنای محاسبه تحلیل سنی بدهی‌ها به تامین‌کنندگان"),
    ] = None,
) -> PayablesSummaryResponse:
    del access
    return await get_payables_summary(session, company_id=company_id, as_of_date=as_of_date)


@router.get("/vendors", response_model=VendorsPayablesResponse)
async def get_vendors(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[
        date | None,
        Query(description="تاریخ مبنای محاسبه تحلیل سنی بدهی‌ها"),
    ] = None,
) -> VendorsPayablesResponse:
    del access
    return await get_vendors_payables(session, company_id=company_id, as_of_date=as_of_date)


@router.get("/vendors/{counterparty_id}/entries", response_model=PayableEntriesResponse)
async def get_entries(
    company_id: UUID,
    counterparty_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[date | None, Query(description="تاریخ مبنای اسناد بدهی")] = None,
) -> PayableEntriesResponse:
    del access
    return await get_payable_entries(session, company_id, counterparty_id, as_of_date)
