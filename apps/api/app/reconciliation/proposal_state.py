"""Invalidate alternatives when a confirmed match consumes one of their source rows."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.reconciliation.models import MatchStatus, ReconciliationAllocation, ReconciliationMatch
from app.reconciliation.summary import PROPOSAL_STATUSES


async def invalidate_competing_proposals(
    session: AsyncSession,
    *,
    company_id: UUID,
    proposal_id: UUID,
    bank_ids: set[UUID],
    journal_ids: set[UUID],
    actor_id: UUID,
    now: datetime,
) -> None:
    competing_ids = select(ReconciliationAllocation.match_id).where(
        ReconciliationAllocation.company_id == company_id,
        or_(
            ReconciliationAllocation.bank_transaction_id.in_(bank_ids),
            ReconciliationAllocation.journal_line_id.in_(journal_ids),
        ),
    )
    competing = (
        await session.scalars(
            select(ReconciliationMatch)
            .where(
                ReconciliationMatch.company_id == company_id,
                ReconciliationMatch.id != proposal_id,
                ReconciliationMatch.id.in_(competing_ids),
                ReconciliationMatch.status.in_(PROPOSAL_STATUSES),
            )
            .order_by(ReconciliationMatch.id)
            .with_for_update()
        )
    ).all()
    for match in competing:
        match.status = MatchStatus.REJECTED
        match.features_json = {
            **match.features_json,
            "review_decision": {
                "action": "superseded",
                "confirmed_proposal_id": str(proposal_id),
                "actor_id": str(actor_id),
                "at": now.isoformat(),
            },
        }
