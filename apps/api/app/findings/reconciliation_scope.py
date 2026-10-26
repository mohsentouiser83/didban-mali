"""Classify source rows using the latest completed reconciliation, without confirming proposals."""

from typing import Literal, cast
from uuid import UUID

from sqlalchemy import Select, and_, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import ScalarSelect

from app.findings.models import Finding
from app.reconciliation.models import (
    MatchStatus,
    ReconciliationAllocation,
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)
from app.reconciliation.summary import PROPOSAL_STATUSES

ReconciliationFilter = Literal["suggested", "missing_accounting", "missing_bank", "matched"]
ReconciliationState = Literal["suggested", "no_candidate", "matched", "unavailable", "not_applicable"]
UNMATCHED_RULE_SIDES = (
    ("unmatched_bank_transaction", "bank_transaction"),
    ("unmatched_accounting_entry", "journal_line"),
    ("large_unreconciled_transaction", "bank_transaction"),
    ("large_unreconciled_transaction", "journal_line"),
)


def source_finding_condition() -> ColumnElement[bool]:
    return or_(*[
        and_(Finding.rule_code == rule, Finding.source_entity_type == source)
        for rule, source in UNMATCHED_RULE_SIDES
    ])


def latest_reconciliation_id() -> ScalarSelect[UUID]:
    return (
        select(ReconciliationRun.id)
        .where(
            ReconciliationRun.company_id == Finding.company_id,
            ReconciliationRun.status.in_([
                ReconciliationStatus.COMPLETED, ReconciliationStatus.COMPLETED_LIMITED,
            ]),
        )
        .order_by(ReconciliationRun.created_at.desc(), ReconciliationRun.id.desc())
        .limit(1).correlate(Finding).scalar_subquery()
    )


def source_allocation_condition() -> ColumnElement[bool]:
    return or_(
        and_(Finding.source_entity_type == "bank_transaction",
             ReconciliationAllocation.bank_transaction_id == Finding.source_entity_id),
        and_(Finding.source_entity_type == "journal_line",
             ReconciliationAllocation.journal_line_id == Finding.source_entity_id),
    )


def reconciliation_state_expression() -> ColumnElement[str]:
    latest_id = latest_reconciliation_id()
    available = exists(select(ReconciliationRun.id).where(
        ReconciliationRun.id == latest_id,
        ReconciliationRun.company_id == Finding.company_id,
        ReconciliationRun.counts_json["inputs_available"].as_boolean().is_(True),
    ).correlate(Finding))
    related = select(ReconciliationAllocation.id).join(
        ReconciliationMatch, ReconciliationMatch.id == ReconciliationAllocation.match_id,
    ).where(
        ReconciliationAllocation.company_id == Finding.company_id,
        ReconciliationMatch.company_id == Finding.company_id,
        source_allocation_condition(),
    ).correlate(Finding)
    confirmed = exists(related.where(ReconciliationMatch.status.in_([
        MatchStatus.AUTO_MATCHED, MatchStatus.CONFIRMED,
    ])))
    proposed = exists(related.where(
        ReconciliationMatch.run_id == latest_id,
        ReconciliationMatch.status.in_(PROPOSAL_STATUSES),
    ))
    return case(
        (source_finding_condition().is_not(True), "not_applicable"),
        (confirmed, "matched"),
        (~available, "unavailable"),
        (proposed, "suggested"),
        else_="no_candidate",
    )


def unmatched_condition(direction: ReconciliationFilter) -> ColumnElement[bool]:
    state = reconciliation_state_expression()
    if direction in ("suggested", "matched"):
        return state == direction
    side = "bank_transaction" if direction == "missing_accounting" else "journal_line"
    return and_(Finding.source_entity_type == side, state == "no_candidate")


async def reconciliation_states(
    session: AsyncSession, findings: list[Finding],
) -> dict[UUID, ReconciliationState]:
    if not findings:
        return {}
    rows = (await session.execute(select(Finding.id, reconciliation_state_expression()).where(
        Finding.company_id == findings[0].company_id,
        Finding.id.in_([finding.id for finding in findings]),
    ))).all()
    return {row[0]: cast(ReconciliationState, row[1]) for row in rows}


async def review_direction_counts(session: AsyncSession, stmt: Select[tuple[Finding]]) -> dict[str, int]:
    # Correlated EXISTS keeps each finding a single row regardless of candidate count.
    count_stmt = stmt.with_only_columns(
        func.count().label("all"),
        func.count().filter(unmatched_condition("suggested")).label("suggested"),
        func.count().filter(unmatched_condition("matched")).label("matched"),
        func.count().filter(unmatched_condition("missing_accounting")).label("missing_accounting"),
        func.count().filter(unmatched_condition("missing_bank")).label("missing_bank"),
        maintain_column_froms=True,
    )
    row = (await session.execute(count_stmt)).one()
    return {key: int(getattr(row, key)) for key in ("all", "suggested", "missing_accounting", "missing_bank", "matched")}
