from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query
from sqlalchemy import select

from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.moadian.models import InvoiceComparisonRun
from app.moadian.runs import create_run, decide_result, read_run
from app.moadian.schemas import (
    ComparisonDecisionRequest,
    ComparisonItem,
    ComparisonRequest,
    ComparisonResponse,
    MatchStatus,
)
from app.moadian.service import comparison_report

router = APIRouter(prefix="/companies/{company_id}/moadian", tags=["moadian"])


def _require_write(role: CompanyRole) -> None:
    if role not in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}:
        raise HTTPException(403, "اجازه ثبت گزارش یا رسیدگی را ندارید.")


@router.get("/comparison", response_model=ComparisonResponse)
async def get_comparison(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    direction: Literal["sales", "purchases"],
    start_date: date,
    end_date: date,
    internal_batch_id: UUID | None = None,
    portal_batch_id: UUID | None = None,
    internal_batch_ids: Annotated[list[UUID] | None, Query(max_length=100)] = None,
    portal_batch_ids: Annotated[list[UUID] | None, Query(max_length=100)] = None,
    internal_complete: bool = False,
    portal_complete: bool = False,
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
        internal_batch_ids=internal_batch_ids,
        portal_batch_ids=portal_batch_ids,
        internal_complete=internal_complete,
        portal_complete=portal_complete,
        direction=direction,
        start_date=start_date,
        end_date=end_date,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.post("/comparisons", response_model=ComparisonResponse)
async def start_comparison(
    company_id: UUID,
    payload: ComparisonRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    request_key: Annotated[UUID, Header(alias="Idempotency-Key")],
) -> ComparisonResponse:
    _require_write(access.role)
    return await create_run(session, company_id, current_user.id, payload, request_key)


@router.get("/comparisons", response_model=list[dict[str, object]])
async def list_comparisons(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, object]]:
    rows = (
        await session.scalars(
            select(InvoiceComparisonRun)
            .where(
                InvoiceComparisonRun.company_id == company_id,
            )
            .order_by(InvoiceComparisonRun.created_at.desc(), InvoiceComparisonRun.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        {
            "id": str(row.id),
            "direction": row.direction,
            "start_date": row.start_date.isoformat(),
            "end_date": row.end_date.isoformat(),
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.get("/comparisons/{run_id}", response_model=ComparisonResponse)
async def comparison_snapshot(
    company_id: UUID,
    run_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    status: MatchStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ComparisonResponse:
    return await read_run(session, company_id, run_id, status=status, limit=limit, offset=offset)


@router.put("/comparisons/{run_id}/results/{item_key}", response_model=ComparisonItem)
async def review_comparison(
    company_id: UUID,
    run_id: UUID,
    item_key: str,
    payload: ComparisonDecisionRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> ComparisonItem:
    _require_write(access.role)
    return await decide_result(session, company_id, current_user.id, run_id, item_key, payload)
