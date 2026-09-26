from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.calculations.models import MetricResult
from app.calculations.schemas import (
    CalculationRunDTO,
    ExecutiveDashboardResponse,
    FinancialPolicyDTO,
    MetricResultDTO,
    MetricTraceResponse,
    RunCalculationRequest,
    UpdateFinancialPolicyRequest,
)
from app.calculations.service import (
    _to_metric_dto,
    execute_calculation_run,
    get_executive_dashboard,
    get_latest_calculation_run,
    get_metric_trace,
    get_or_create_financial_policy,
)
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.identity.dependencies import DbSession

calculations_router = APIRouter(tags=["calculations"])


@calculations_router.post(
    "/companies/{company_id}/calculations/run",
    response_model=CalculationRunDTO,
    status_code=status.HTTP_201_CREATED,
)
async def run_calculation(
    company_id: UUID,
    access: CurrentCompanyAccess,
    session: DbSession,
    payload: RunCalculationRequest | None = None,
) -> CalculationRunDTO:
    if access.role not in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="شما دسترسی لازم برای اجرای دستی محاسبات مالی را ندارید.",
        )

    req = payload or RunCalculationRequest()
    run = await execute_calculation_run(
        session=session,
        company_id=company_id,
        as_of_date=req.as_of_date,
        period_start=req.period_start,
        period_end=req.period_end,
        trigger_source="manual",
        triggered_by=access.user_id,
    )

    metrics_list = (
        await session.scalars(select(MetricResult).where(MetricResult.calculation_run_id == run.id))
    ).all()

    return CalculationRunDTO(
        id=run.id,
        company_id=run.company_id,
        as_of_date=run.as_of_date,
        period_start=run.period_start,
        period_end=run.period_end,
        engine_version=run.engine_version,
        status=run.status,
        trigger_source=run.trigger_source,
        started_at=run.started_at,
        completed_at=run.completed_at,
        summary=run.summary_json,
        metrics={m.metric_key: _to_metric_dto(m) for m in metrics_list},
    )


@calculations_router.get(
    "/companies/{company_id}/calculations/dashboard",
    response_model=ExecutiveDashboardResponse,
)
async def get_dashboard(
    company_id: UUID,
    access: CurrentCompanyAccess,
    session: DbSession,
) -> ExecutiveDashboardResponse:
    return await get_executive_dashboard(session, company_id)


@calculations_router.get(
    "/companies/{company_id}/calculations/latest",
    response_model=CalculationRunDTO,
)
async def get_latest_run(
    company_id: UUID,
    access: CurrentCompanyAccess,
    session: DbSession,
) -> CalculationRunDTO:
    run = await get_latest_calculation_run(session, company_id)
    if not run:
        # Run automatically on first view
        run = await execute_calculation_run(session, company_id)

    metrics_list = (
        await session.scalars(select(MetricResult).where(MetricResult.calculation_run_id == run.id))
    ).all()

    return CalculationRunDTO(
        id=run.id,
        company_id=run.company_id,
        as_of_date=run.as_of_date,
        period_start=run.period_start,
        period_end=run.period_end,
        engine_version=run.engine_version,
        status=run.status,
        trigger_source=run.trigger_source,
        started_at=run.started_at,
        completed_at=run.completed_at,
        summary=run.summary_json,
        metrics={m.metric_key: _to_metric_dto(m) for m in metrics_list},
    )


@calculations_router.get(
    "/companies/{company_id}/calculations/metrics/{metric_key}",
    response_model=MetricResultDTO,
)
async def get_metric(
    company_id: UUID,
    metric_key: str,
    access: CurrentCompanyAccess,
    session: DbSession,
) -> MetricResultDTO:
    run = await get_latest_calculation_run(session, company_id)
    if not run:
        run = await execute_calculation_run(session, company_id)

    metric = await session.scalar(
        select(MetricResult).where(
            MetricResult.calculation_run_id == run.id,
            MetricResult.metric_key == metric_key,
        )
    )
    if not metric:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"شاخص {metric_key} یافت نشد.",
        )
    return _to_metric_dto(metric)


@calculations_router.get(
    "/companies/{company_id}/calculations/metrics/{metric_key}/trace",
    response_model=MetricTraceResponse,
)
async def get_trace(
    company_id: UUID,
    metric_key: str,
    access: CurrentCompanyAccess,
    session: DbSession,
) -> MetricTraceResponse:
    try:
        return await get_metric_trace(session, company_id, metric_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@calculations_router.get(
    "/companies/{company_id}/calculations/policy",
    response_model=FinancialPolicyDTO,
)
async def get_policy(
    company_id: UUID,
    access: CurrentCompanyAccess,
    session: DbSession,
) -> FinancialPolicyDTO:
    pol = await get_or_create_financial_policy(session, company_id)
    return FinancialPolicyDTO(
        dso_period_days=pol.dso_period_days,
        dso_method=pol.dso_method,
        burn_trailing_days=pol.burn_trailing_days,
        default_reporting_unit=pol.default_reporting_unit,
        excluded_internal_transfer_accounts=pol.excluded_internal_transfer_accounts or [],
    )


@calculations_router.put(
    "/companies/{company_id}/calculations/policy",
    response_model=FinancialPolicyDTO,
)
async def update_policy(
    company_id: UUID,
    payload: UpdateFinancialPolicyRequest,
    access: CurrentCompanyAccess,
    session: DbSession,
) -> FinancialPolicyDTO:
    if access.role not in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="شما دسترسی لازم برای تغییر سیاست‌های محاسباتی مالی را ندارید.",
        )

    pol = await get_or_create_financial_policy(session, company_id)
    if payload.dso_period_days is not None:
        pol.dso_period_days = payload.dso_period_days
    if payload.dso_method is not None:
        pol.dso_method = payload.dso_method
    if payload.burn_trailing_days is not None:
        pol.burn_trailing_days = payload.burn_trailing_days
    if payload.default_reporting_unit is not None:
        pol.default_reporting_unit = payload.default_reporting_unit
    if payload.excluded_internal_transfer_accounts is not None:
        pol.excluded_internal_transfer_accounts = payload.excluded_internal_transfer_accounts

    pol.updated_at = datetime.now()
    await session.commit()

    return FinancialPolicyDTO(
        dso_period_days=pol.dso_period_days,
        dso_method=pol.dso_method,
        burn_trailing_days=pol.burn_trailing_days,
        default_reporting_unit=pol.default_reporting_unit,
        excluded_internal_transfer_accounts=pol.excluded_internal_transfer_accounts or [],
    )
