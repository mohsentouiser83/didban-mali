import calendar
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.companies.dependencies import CurrentCompanyAccess
from app.dashboard.schemas import DashboardResponse
from app.dashboard.service import build_dashboard, resolve_analysis_run
from app.identity.dependencies import DbSession

router = APIRouter(prefix="/companies/{company_id}", tags=["dashboard"])


def _month_period(value: str) -> tuple[date, date]:
    try:
        year_text, month_text = value.split("-", maxsplit=1)
        year, month = int(year_text), int(month_text)
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, 1), date(year, month, last_day)
    except (ValueError, IndexError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="دوره باید به شکل YYYY-MM و بر پایه تقویم میلادی باشد.",
        ) from exc


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    period: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    analysis_run_id: UUID | None = None,
    top_limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> DashboardResponse:
    del access
    period_start, period_end = _month_period(period) if period is not None else (None, None)
    analysis = await resolve_analysis_run(
        session,
        company_id=company_id,
        analysis_run_id=analysis_run_id,
        period_start=period_start,
        period_end=period_end,
    )
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="snapshot تکمیل‌شده‌ای برای داشبورد پیدا نشد.",
        )
    return await build_dashboard(
        session,
        company_id=company_id,
        analysis=analysis,
        top_limit=top_limit,
    )
