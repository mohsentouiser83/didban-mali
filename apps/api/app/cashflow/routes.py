from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select

from app.audit.service import record_audit_event
from app.cashflow.models import PlannedPayment
from app.cashflow.schemas import (
    CashFlowForecastResponse,
    CashFlowSummaryResponse,
    OutflowMode,
    PlannedPaymentCreate,
    PlannedPaymentItem,
    ScenarioType,
)
from app.cashflow.service import (
    get_cashflow_forecast,
    get_cashflow_summary,
)
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.identity.dependencies import DbSession

router = APIRouter(prefix="/companies/{company_id}/cashflow", tags=["cashflow"])


@router.get("/summary", response_model=CashFlowSummaryResponse)
async def get_summary(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    as_of_date: Annotated[date | None, Query(description="تاریخ مبنای محاسبه تاب‌آوری نقد")] = None,
    safety_buffer_irr: Annotated[Decimal | None, Query(ge=0)] = None,
) -> CashFlowSummaryResponse:
    del access
    return await get_cashflow_summary(
        session, company_id=company_id, as_of_date=as_of_date, safety_buffer_irr=safety_buffer_irr
    )


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
        Query(ge=0, description="حداقل بافر نقدینگی امن"),
    ] = None,
    horizon_days: Annotated[Literal["30", "91"], Query()] = "91",
    outflow_mode: Annotated[OutflowMode, Query()] = "historical",
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
        horizon_days=int(horizon_days),
        outflow_mode=outflow_mode,
        safety_buffer_irr=safety_buffer_irr,
        as_of_date=as_of_date,
    )


@router.get("/payments", response_model=list[PlannedPaymentItem])
async def list_payments(
    company_id: UUID, session: DbSession, access: CurrentCompanyAccess
) -> list[PlannedPaymentItem]:
    del access
    rows = await session.scalars(
        select(PlannedPayment)
        .where(PlannedPayment.company_id == company_id)
        .order_by(PlannedPayment.payment_date, PlannedPayment.id)
    )
    return [PlannedPaymentItem.model_validate(row) for row in rows.all()]


def _require_plan_writer(access: CurrentCompanyAccess) -> None:
    if access.role not in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}:
        raise HTTPException(status_code=403, detail="اجازه تغییر برنامه پرداخت را ندارید.")


@router.post("/payments", response_model=PlannedPaymentItem, status_code=201)
async def create_payment(
    company_id: UUID, body: PlannedPaymentCreate, session: DbSession, access: CurrentCompanyAccess
) -> PlannedPaymentItem:
    _require_plan_writer(access)
    row = PlannedPayment(company_id=company_id, **body.model_dump())
    session.add(row)
    await session.flush()
    record_audit_event(
        session,
        action="cashflow.payment.create",
        entity_type="planned_payment",
        entity_id=row.id,
        actor_id=access.user_id,
        company_id=company_id,
    )
    await session.commit()
    return PlannedPaymentItem.model_validate(row)


@router.delete("/payments/{payment_id}", status_code=204)
async def delete_payment(
    company_id: UUID, payment_id: UUID, session: DbSession, access: CurrentCompanyAccess
) -> Response:
    _require_plan_writer(access)
    row = await session.scalar(
        select(PlannedPayment).where(
            PlannedPayment.id == payment_id, PlannedPayment.company_id == company_id
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="پرداخت پیدا نشد.")
    record_audit_event(
        session,
        action="cashflow.payment.delete",
        entity_type="planned_payment",
        entity_id=row.id,
        actor_id=access.user_id,
        company_id=company_id,
    )
    await session.delete(row)
    await session.commit()
    return Response(status_code=204)
