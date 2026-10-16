from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query

from app.companies.dependencies import CurrentCompanyAccess
from app.identity.dependencies import DbSession
from app.moadian.schemas import ComparisonResponse, MatchStatus
from app.moadian.service import comparison_report

router = APIRouter(prefix="/companies/{company_id}/moadian", tags=["moadian"])


@router.get("/comparison", response_model=ComparisonResponse)
async def get_comparison(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    internal_batch_id: UUID,
    portal_batch_id: UUID,
    direction: Literal["sales", "purchases"],
    start_date: date,
    end_date: date,
    status: MatchStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ComparisonResponse:
    del access
    return await comparison_report(
        session,
        company_id=company_id,
        internal_batch_id=internal_batch_id,
        portal_batch_id=portal_batch_id,
        direction=direction,
        start_date=start_date,
        end_date=end_date,
        status=status,
        limit=limit,
        offset=offset,
    )
