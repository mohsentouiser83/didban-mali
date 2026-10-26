"""Keep explicitly rejected source pairs out of later runs over the same records."""

from collections import defaultdict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.reconciliation.engine import ProposedMatch
from app.reconciliation.models import MatchStatus, ReconciliationAllocation, ReconciliationMatch


async def omit_rejected_proposals(
    session: AsyncSession,
    company_id: UUID,
    proposals: list[ProposedMatch],
) -> list[ProposedMatch]:
    if not proposals:
        return proposals
    rows = (
        await session.execute(
            select(
                ReconciliationMatch.id,
                ReconciliationAllocation.bank_transaction_id,
                ReconciliationAllocation.journal_line_id,
            )
            .join(
                ReconciliationAllocation,
                ReconciliationAllocation.match_id == ReconciliationMatch.id,
            )
            .where(
                ReconciliationMatch.company_id == company_id,
                ReconciliationAllocation.company_id == company_id,
                ReconciliationMatch.status == MatchStatus.REJECTED,
                ReconciliationMatch.features_json["review_decision"]["action"].as_string()
                == "reject",
            )
        )
    ).all()
    banks: dict[UUID, set[UUID]] = defaultdict(set)
    journals: dict[UUID, set[UUID]] = defaultdict(set)
    for match_id, bank_id, journal_id in rows:
        if bank_id:
            banks[match_id].add(bank_id)
        if journal_id:
            journals[match_id].add(journal_id)
    rejected = {
        (frozenset(banks[match_id]), frozenset(journals[match_id]))
        for match_id in banks
        if journals[match_id]
    }
    return [
        proposal
        for proposal in proposals
        if (
            frozenset(a.bank_transaction_id for a in proposal.allocations if a.bank_transaction_id),
            frozenset(a.journal_line_id for a in proposal.allocations if a.journal_line_id),
        )
        not in rejected
    ]
