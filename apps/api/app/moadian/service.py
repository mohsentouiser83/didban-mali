from collections import Counter
from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.imports.models import SourceKind
from app.moadian.engine import compare_invoices
from app.moadian.repository import load_snapshot
from app.moadian.schemas import ComparisonResponse, MatchStatus


async def comparison_report(
    session: AsyncSession,
    *,
    company_id: UUID,
    internal_batch_id: UUID,
    portal_batch_id: UUID,
    direction: str,
    start_date: date,
    end_date: date,
    status: MatchStatus | None,
    limit: int,
    offset: int,
) -> ComparisonResponse:
    if start_date > end_date:
        raise HTTPException(422, "تاریخ شروع باید قبل از پایان باشد.")
    internal_kind, portal_kind = (
        (SourceKind.SALES, SourceKind.MOADIAN_SALES)
        if direction == "sales"
        else (SourceKind.PURCHASES, SourceKind.MOADIAN_PURCHASES)
    )
    internal_batch, internal = await load_snapshot(
        session, company_id, internal_batch_id, {internal_kind}
    )
    portal_batch, portal = await load_snapshot(session, company_id, portal_batch_id, {portal_kind})
    # Compare chains first; references outside the selected range still affect classification.
    results = await run_in_threadpool(compare_invoices, internal, portal)
    results = [
        r
        for r in results
        if any(i and start_date <= i.issue_date <= end_date for i in (r.internal, r.portal))
    ]
    counts: dict[str, int] = {
        str(key): value for key, value in Counter(r.status for r in results).items()
    }
    filtered = [r for r in results if status is None or r.status == status]
    return ComparisonResponse(
        internal_batch_id=internal_batch_id,
        portal_batch_id=portal_batch_id,
        start_date=start_date,
        end_date=end_date,
        counts=counts,
        total=len(filtered),
        items=filtered[offset : offset + limit],
        limit=limit,
        offset=offset,
        rejected_rows=internal_batch.rejected_count + portal_batch.rejected_count,
    )
