"""Proposal counts distinguish candidate pairs from unique bank and ledger rows."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.reconciliation.engine import ProposedMatch
from app.reconciliation.models import MatchStatus, ReconciliationAllocation, ReconciliationMatch

PROPOSAL_STATUSES = (MatchStatus.POTENTIAL_MATCH, MatchStatus.SUGGESTED_MATCH)


def proposal_counts(proposals: list[ProposedMatch]) -> dict[str, int]:
    suggested = [proposal for proposal in proposals if proposal.status in PROPOSAL_STATUSES]
    return {
        "suggested_count": len(suggested),
        "suggested_bank_count": len({allocation.bank_transaction_id for proposal in suggested
                                     for allocation in proposal.allocations if allocation.bank_transaction_id}),
        "suggested_journal_count": len({allocation.journal_line_id for proposal in suggested
                                        for allocation in proposal.allocations if allocation.journal_line_id}),
    }


async def saved_proposal_counts(session: AsyncSession, company_id: UUID, run_id: UUID) -> dict[str, int]:
    row = (await session.execute(select(
        func.count(func.distinct(ReconciliationMatch.id)).label("suggested_count"),
        func.count(func.distinct(ReconciliationAllocation.bank_transaction_id)).label("suggested_bank_count"),
        func.count(func.distinct(ReconciliationAllocation.journal_line_id)).label("suggested_journal_count"),
    ).select_from(ReconciliationMatch).outerjoin(ReconciliationAllocation, (
        (ReconciliationAllocation.match_id == ReconciliationMatch.id)
        & (ReconciliationAllocation.company_id == company_id)
    )).where(
        ReconciliationMatch.company_id == company_id,
        ReconciliationMatch.run_id == run_id,
        ReconciliationMatch.status.in_(PROPOSAL_STATUSES),
    ))).one()
    return {key: int(getattr(row, key)) for key in (
        "suggested_count", "suggested_bank_count", "suggested_journal_count",
    )}
