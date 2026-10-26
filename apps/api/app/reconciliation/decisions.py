"""Transactional user decisions on existing, balanced reconciliation proposals."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.financial.models import BankTransaction, JournalLine
from app.findings.models import Finding, FindingActivity, FindingStatus, FindingWorkflowStatus
from app.findings.reconciliation_scope import UNMATCHED_RULE_SIDES
from app.reconciliation.account_links import AccountLinkConflict, validate_match_accounts
from app.reconciliation.locking import lock_reconciliation_company
from app.reconciliation.models import (
    MatchStatus,
    ReconciliationAllocation,
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)
from app.reconciliation.proposal_state import invalidate_competing_proposals
from app.reconciliation.service import get_active_matched_ids
from app.reconciliation.summary import PROPOSAL_STATUSES

ProposalDecision = Literal["confirm", "reject"]


class ProposalConflict(ValueError):
    """The proposal cannot be applied to the current records."""


class ProposalNotFound(ValueError):
    """No accessible proposal is related to the requested finding."""


def validate_balanced_allocations(
    allocations: list[ReconciliationAllocation],
    banks: list[BankTransaction],
    journals: list[JournalLine],
) -> None:
    bank_ids = [
        allocation.bank_transaction_id
        for allocation in allocations
        if allocation.bank_transaction_id
    ]
    journal_ids = [
        allocation.journal_line_id for allocation in allocations if allocation.journal_line_id
    ]
    if (
        not bank_ids
        or not journal_ids
        or len(bank_ids) != len(set(bank_ids))
        or len(journal_ids) != len(set(journal_ids))
        or set(bank_ids) != {bank.id for bank in banks}
        or set(journal_ids) != {line.id for line in journals}
        or any(bool(a.bank_transaction_id) == bool(a.journal_line_id) for a in allocations)
    ):
        raise ProposalConflict("ردیف‌های پیشنهاد معتبر نیست؛ جزئیات را به‌روز کنید.")
    amounts = {
        **{bank.id: Decimal(bank.amount_irr) for bank in banks},
        **{line.id: Decimal(line.debit_irr) - Decimal(line.credit_irr) for line in journals},
    }
    for allocation in allocations:
        target_id = allocation.bank_transaction_id or allocation.journal_line_id
        if target_id is None or Decimal(allocation.allocated_amount_irr) != amounts[target_id]:
            raise ProposalConflict("مبلغ ردیف‌ها تغییر کرده؛ جزئیات را به‌روز کنید.")
    total_bank = sum((Decimal(bank.amount_irr) for bank in banks), Decimal(0))
    total_journal = sum(
        (Decimal(line.debit_irr) - Decimal(line.credit_irr) for line in journals), Decimal(0)
    )
    signs = {amount > 0 for amount in amounts.values()}
    if total_bank != total_journal or total_bank == 0 or len(signs) != 1:
        raise ProposalConflict("مبلغ یا جهت گردش دو طرف برابر نیست؛ تأیید ممکن نیست.")


async def decide_proposal(
    session: AsyncSession,
    *,
    company_id: UUID,
    finding_id: UUID,
    proposal_id: UUID,
    actor_id: UUID,
    decision: ProposalDecision,
) -> ReconciliationMatch:
    # All canonical writers share a transaction lock, including advisor-role requests.
    await lock_reconciliation_company(session, company_id)
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    proposal = await session.scalar(
        select(ReconciliationMatch)
        .where(
            ReconciliationMatch.id == proposal_id,
            ReconciliationMatch.company_id == company_id,
        )
        .with_for_update()
    )
    if (
        not finding
        or not proposal
        or (finding.rule_code, finding.source_entity_type) not in UNMATCHED_RULE_SIDES
    ):
        raise ProposalNotFound("پیشنهاد یافت نشد.")
    allocations = list(
        (
            await session.scalars(
                select(ReconciliationAllocation).where(
                    ReconciliationAllocation.match_id == proposal.id,
                    ReconciliationAllocation.company_id == company_id,
                )
            )
        ).all()
    )
    bank_ids = {a.bank_transaction_id for a in allocations if a.bank_transaction_id}
    journal_ids = {a.journal_line_id for a in allocations if a.journal_line_id}
    related = finding.source_entity_id in (
        bank_ids if finding.source_entity_type == "bank_transaction" else journal_ids
    )
    if not related:
        raise ProposalNotFound("پیشنهاد یافت نشد.")
    previous = proposal.features_json.get("review_decision", {})
    expected = MatchStatus.CONFIRMED if decision == "confirm" else MatchStatus.REJECTED
    if proposal.status == expected and previous.get("action") == decision:
        return proposal  # An identical retry does not create a second decision/audit event.
    latest = await session.scalar(
        select(ReconciliationRun.id)
        .where(
            ReconciliationRun.company_id == company_id,
            ReconciliationRun.status.in_(
                [ReconciliationStatus.COMPLETED, ReconciliationStatus.COMPLETED_LIMITED]
            ),
        )
        .order_by(ReconciliationRun.created_at.desc(), ReconciliationRun.id.desc())
        .limit(1)
    )
    if proposal.run_id != latest or proposal.status not in PROPOSAL_STATUSES:
        raise ProposalConflict("این پیشنهاد دیگر قابل انتخاب نیست؛ جزئیات را به‌روز کنید.")

    now = datetime.now(UTC)
    if decision == "confirm":
        banks = list(
            (
                await session.scalars(
                    select(BankTransaction)
                    .where(
                        BankTransaction.company_id == company_id,
                        BankTransaction.id.in_(bank_ids),
                    )
                    .order_by(BankTransaction.id)
                )
            ).all()
        )
        journals = list(
            (
                await session.scalars(
                    select(JournalLine)
                    .where(
                        JournalLine.company_id == company_id,
                        JournalLine.id.in_(journal_ids),
                    )
                    .order_by(JournalLine.id)
                )
            ).all()
        )
        validate_balanced_allocations(allocations, banks, journals)
        try:
            await validate_match_accounts(session, company_id, banks, journals)
        except AccountLinkConflict as exc:
            raise ProposalConflict(str(exc)) from exc
        active_banks, active_journals = await get_active_matched_ids(session, company_id)
        if bank_ids & active_banks or journal_ids & active_journals:
            raise ProposalConflict("یکی از ردیف‌ها قبلاً تطبیق شده؛ جزئیات را به‌روز کنید.")
        await invalidate_competing_proposals(
            session,
            company_id=company_id,
            proposal_id=proposal.id,
            bank_ids=bank_ids,
            journal_ids=journal_ids,
            actor_id=actor_id,
            now=now,
        )
        affected_findings = (
            await session.scalars(
                select(Finding)
                .where(
                    Finding.company_id == company_id,
                    or_(
                        *[
                            and_(Finding.rule_code == rule, Finding.source_entity_type == side)
                            for rule, side in UNMATCHED_RULE_SIDES
                        ]
                    ),
                    or_(
                        and_(
                            Finding.source_entity_type == "bank_transaction",
                            Finding.source_entity_id.in_(bank_ids),
                        ),
                        and_(
                            Finding.source_entity_type == "journal_line",
                            Finding.source_entity_id.in_(journal_ids),
                        ),
                    ),
                    Finding.status.in_(["new", "triaged", "in_progress", "reopened"]),
                )
                .with_for_update()
            )
        ).all()
        for item in affected_findings:
            old_status = item.status
            item.status = FindingStatus.RESOLVED
            item.workflow_status = FindingWorkflowStatus.RESOLVED
            item.resolution_type = "reconciled"
            item.resolution_note = "پیشنهاد تطبیق توسط کاربر تأیید شد."
            item.resolved_by_user_id = actor_id
            item.resolved_at = now
            item.updated_at = now
            session.add(
                FindingActivity(
                    id=uuid7(),
                    company_id=company_id,
                    finding_id=item.id,
                    user_id=actor_id,
                    action_type="proposal_confirmed",
                    old_state=old_status,
                    new_state="resolved",
                    note=item.resolution_note,
                    metadata_json={"proposal_id": str(proposal.id)},
                    created_at=now,
                )
            )
    else:
        session.add(
            FindingActivity(
                id=uuid7(),
                company_id=company_id,
                finding_id=finding.id,
                user_id=actor_id,
                action_type="proposal_rejected",
                old_state=finding.status,
                new_state=finding.status,
                note="پیشنهاد تطبیق رد شد.",
                metadata_json={"proposal_id": str(proposal.id)},
                created_at=now,
            )
        )
    proposal.status = expected
    proposal.features_json = {
        **proposal.features_json,
        "review_decision": {
            "action": decision,
            "actor_id": str(actor_id),
            "at": now.isoformat(),
        },
    }
    record_audit_event(
        session,
        action=f"reconciliation.proposal_{'confirmed' if decision == 'confirm' else 'rejected'}",
        entity_type="reconciliation_match",
        actor_id=actor_id,
        entity_id=proposal.id,
        company_id=company_id,
        metadata={"finding_id": str(finding_id), "decision": decision},
    )
    await session.flush()
    return proposal
