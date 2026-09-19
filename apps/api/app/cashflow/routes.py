from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.cashflow.schemas import (
    CashFlowForecastResponse,
    CashFlowSummaryResponse,
    ScenarioType,
)
from app.cashflow.service import (
    get_cashflow_forecast,
    get_cashflow_summary,
)
from app.companies.dependencies import CurrentCompanyAccess
from app.identity.dependencies import DbSession

router = APIRouter(prefix="/companies/{company_id}/cashflow", tags=["cashflow"])


@router.get("/summary", response_model=CashFlowSummaryResponse)
async def get_summary(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[date | None, Query(description="تاریخ مبنای محاسبه تاب‌آوری نقد")] = None,
) -> CashFlowSummaryResponse:
    del access
    return await get_cashflow_summary(session, company_id=company_id, as_of_date=as_of_date)


@router.get("/forecast", response_model=CashFlowForecastResponse)
async def get_forecast(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    scenario: Annotated[
        ScenarioType,
        Query(description="سناریوی پیش‌بینی (base, pessimistic, optimistic)"),
    ] = "base",
    safety_buffer_irr: Annotated[
        Decimal | None,
        Query(description="حداقل بافر نقدینگی امن"),
    ] = None,
    as_of_date: Annotated[
        date | None,
        Query(description="تاریخ مبنای شروع پیش‌بینی"),
    ] = None,
) -> CashFlowForecastResponse:
    del access
    return await get_cashflow_forecast(
        session,
        company_id=company_id,
        scenario=scenario,
        safety_buffer_irr=safety_buffer_irr,
        as_of_date=as_of_date,
    )
