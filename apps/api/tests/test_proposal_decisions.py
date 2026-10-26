from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.audit.models import AuditEvent
from app.companies.models import CompanyRole
from app.financial.models import Account, BankAccount, BankTransaction, JournalEntry, JournalLine
from app.findings.models import Finding, FindingActivity
from app.findings.reconciliation_scope import reconciliation_states
from app.findings.routes import decide_finding_proposal
from app.findings.schemas import ProposalDecisionRequest
from app.findings.service import list_findings
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    SourceFile,
    SourceKind,
    SourceRow,
)
from app.reconciliation.decisions import (
    ProposalConflict,
    ProposalNotFound,
    decide_proposal,
    validate_balanced_allocations,
)
from app.reconciliation.models import (
    MatchLevel,
    MatchStatus,
    ReconciliationAllocation,
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)
from app.reconciliation.service import run_canonical_reconciliation


@pytest.mark.parametrize("bank_amount,journal_amount", [("100", "99"), ("100", "-100"), ("0", "0")])
def test_confirmation_rejects_unbalanced_or_opposite_movements(bank_amount, journal_amount):
    bank_id, line_id = uuid4(), uuid4()
    allocations = [
        SimpleNamespace(
            bank_transaction_id=bank_id,
            journal_line_id=None,
            allocated_amount_irr=Decimal(bank_amount),
        ),
        SimpleNamespace(
            bank_transaction_id=None,
            journal_line_id=line_id,
            allocated_amount_irr=Decimal(journal_amount),
        ),
    ]
    banks = [SimpleNamespace(id=bank_id, amount_irr=Decimal(bank_amount))]
    lines = [
        SimpleNamespace(
            id=line_id,
            debit_irr=max(Decimal(journal_amount), 0),
            credit_irr=max(-Decimal(journal_amount), 0),
        )
    ]
    with pytest.raises(ProposalConflict):
        validate_balanced_allocations(allocations, banks, lines)


def test_confirmation_preserves_exact_large_values_and_checks_stale_allocations():
    bank_id, line_id = uuid4(), uuid4()
    amount = Decimal("90071992547409931")
    allocations = [
        SimpleNamespace(
            bank_transaction_id=bank_id, journal_line_id=None, allocated_amount_irr=amount
        ),
        SimpleNamespace(
            bank_transaction_id=None, journal_line_id=line_id, allocated_amount_irr=amount
        ),
    ]
    banks = [SimpleNamespace(id=bank_id, amount_irr=amount)]
    lines = [SimpleNamespace(id=line_id, debit_irr=amount, credit_irr=Decimal(0))]
    validate_balanced_allocations(allocations, banks, lines)
    allocations[0].allocated_amount_irr -= 1
    with pytest.raises(ProposalConflict, match="تغییر"):
        validate_balanced_allocations(allocations, banks, lines)


async def test_viewers_cannot_make_proposal_decisions():
    with pytest.raises(HTTPException) as result:
        await decide_finding_proposal(
            uuid4(),
            uuid4(),
            uuid4(),
            ProposalDecisionRequest(decision="confirm"),
            None,
            SimpleNamespace(id=uuid4()),
            SimpleNamespace(role=CompanyRole.VIEWER),
            None,
        )
    assert result.value.status_code == 403


async def seed_proposals(session, user, company):
    cid = company.id
    ds = DataSource(company_id=cid, kind=SourceKind.BANK, label="test", created_by=user.id)
    sf = SourceFile(
        company_id=cid,
        object_key=str(uuid4()),
        original_name="test.csv",
        sha256=uuid4().hex * 2,
        size_bytes=10,
        mime_type="text/csv",
        extension="csv",
        uploaded_by=user.id,
    )
    session.add_all([ds, sf])
    await session.flush()
    batch = ImportBatch(
        company_id=cid,
        source_id=ds.id,
        file_id=sf.id,
        status=ImportStatus.COMPLETED,
        idempotency_key=str(uuid4()),
    )
    account = Account(
        company_id=cid,
        source_code="bank",
        name="بانک آزمون",
        normalized_name="بانک آزمون",
        role="cash",
    )
    bank_account = BankAccount(company_id=cid, data_source_id=ds.id, label="bank", bank_name="test")
    session.add_all([batch, account, bank_account])
    await session.flush()
    rows = [
        SourceRow(
            company_id=cid,
            import_batch_id=batch.id,
            sheet="test",
            row_number=i + 1,
            raw_hash=str(i),
            raw_json={},
        )
        for i in range(5)
    ]
    session.add_all(rows)
    await session.flush()
    banks = [
        BankTransaction(
            company_id=cid,
            bank_account_id=bank_account.id,
            source_row_id=rows[i].id,
            booking_date=date(2026, 9, 1),
            amount_irr=Decimal(100),
            description="bank",
            description_normalized="bank",
        )
        for i in range(2)
    ]
    entries = [
        JournalEntry(
            company_id=cid,
            import_batch_id=batch.id,
            source_row_id=rows[i + 2].id,
            source_entry_key=str(uuid4()),
            entry_date=date(2026, 9, 1),
            description="ledger",
            description_normalized="ledger",
            fiscal_period="1405-06",
        )
        for i in range(3)
    ]
    session.add_all([*banks, *entries])
    await session.flush()
    lines = [
        JournalLine(
            company_id=cid,
            entry_id=entry.id,
            account_id=account.id,
            source_row_id=rows[i + 2].id,
            debit_irr=Decimal(100),
            credit_irr=Decimal(0),
        )
        for i, entry in enumerate(entries)
    ]
    session.add_all(lines)
    await session.flush()
    run = ReconciliationRun(
        company_id=cid,
        status=ReconciliationStatus.COMPLETED,
        config_version="test",
        config_json={},
        counts_json={"inputs_available": True},
        idempotency_key=str(uuid4()),
        created_by=user.id,
    )
    session.add(run)
    await session.flush()
    findings = [
        Finding(
            company_id=cid,
            fingerprint=str(uuid4()),
            finding_code="unmatched_bank_transaction" if i < 2 else "unmatched_accounting_entry",
            source_entity_type="bank_transaction" if i < 2 else "journal_line",
            source_entity_id=record.id,
            category="cash_and_bank",
            title_fa="test",
            summary_fa="test",
            financial_impact_irr=Decimal(100),
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 1),
        )
        for i, record in enumerate([*banks, *lines])
    ]
    session.add_all(findings)
    await session.flush()
    matches = []
    for bank_index, line_index in [(0, 0), (0, 1), (1, 0), (1, 2)]:
        bank, line = banks[bank_index], lines[line_index]
        match = ReconciliationMatch(
            company_id=cid,
            run_id=run.id,
            bank_transaction_id=bank.id,
            journal_entry_id=line.entry_id,
            match_level=MatchLevel.FUZZY,
            status=MatchStatus.POTENTIAL_MATCH,
            score=Decimal(85),
            amount_difference_irr=Decimal(0),
            date_difference_days=0,
            features_json={},
            evidence_json={},
            rule_code="test",
            created_at=datetime.now(UTC),
        )
        session.add(match)
        await session.flush()
        session.add_all(
            [
                ReconciliationAllocation(
                    company_id=cid,
                    match_id=match.id,
                    side="bank",
                    bank_transaction_id=bank.id,
                    allocated_amount_irr=Decimal(100),
                    created_at=datetime.now(UTC),
                ),
                ReconciliationAllocation(
                    company_id=cid,
                    match_id=match.id,
                    side="journal",
                    journal_line_id=line.id,
                    allocated_amount_irr=Decimal(100),
                    created_at=datetime.now(UTC),
                ),
            ]
        )
        matches.append(match)
    await session.flush()
    return run, findings, matches, banks, lines


@pytest.mark.integration
async def test_confirm_and_reject_update_unique_counts_and_keep_audit(integration_company):
    session, user, company = integration_company
    _, findings, matches, banks, lines = await seed_proposals(session, user, company)
    _, total, before = await list_findings(session, company_id=company.id)
    assert total == 5 and before["suggested"] == 5 and before["matched"] == 0
    await decide_proposal(
        session,
        company_id=company.id,
        finding_id=findings[0].id,
        proposal_id=matches[0].id,
        actor_id=user.id,
        decision="confirm",
    )
    await session.flush()
    assert matches[0].status == MatchStatus.CONFIRMED
    assert matches[1].status == matches[2].status == MatchStatus.REJECTED
    assert matches[3].status == MatchStatus.POTENTIAL_MATCH
    assert findings[0].status == findings[2].status == "resolved"
    _, total, after = await list_findings(session, company_id=company.id)
    assert total == 5
    assert after == {
        "all": 5,
        "suggested": 2,
        "missing_accounting": 0,
        "missing_bank": 1,
        "matched": 2,
    }
    states = await reconciliation_states(session, findings)
    assert states[findings[0].id] == states[findings[2].id] == "matched"
    # Repeating an acknowledged decision is idempotent.
    await decide_proposal(
        session,
        company_id=company.id,
        finding_id=findings[0].id,
        proposal_id=matches[0].id,
        actor_id=user.id,
        decision="confirm",
    )
    audit_count = await session.scalar(
        select(func.count())
        .select_from(AuditEvent)
        .where(
            AuditEvent.company_id == company.id,
            AuditEvent.action == "reconciliation.proposal_confirmed",
        )
    )
    assert audit_count == 1
    with pytest.raises(ProposalConflict):
        await decide_proposal(
            session,
            company_id=company.id,
            finding_id=findings[1].id,
            proposal_id=matches[2].id,
            actor_id=user.id,
            decision="confirm",
        )
    with pytest.raises(ProposalNotFound):
        await decide_proposal(
            session,
            company_id=company.id,
            finding_id=findings[4].id,
            proposal_id=matches[0].id,
            actor_id=user.id,
            decision="reject",
        )
    await decide_proposal(
        session,
        company_id=company.id,
        finding_id=findings[1].id,
        proposal_id=matches[3].id,
        actor_id=user.id,
        decision="reject",
    )
    _, _, rejected = await list_findings(session, company_id=company.id)
    assert rejected == {
        "all": 5,
        "suggested": 0,
        "missing_accounting": 1,
        "missing_bank": 2,
        "matched": 2,
    }
    newer = await run_canonical_reconciliation(
        session, company_id=company.id, actor_id=user.id, commit=False
    )
    new_allocations = (
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
                ReconciliationMatch.company_id == company.id, ReconciliationMatch.run_id == newer.id
            )
        )
    ).all()
    for match_id in {row[0] for row in new_allocations}:
        bank_ids = {row[1] for row in new_allocations if row[0] == match_id and row[1]}
        ledger_ids = {row[2] for row in new_allocations if row[0] == match_id and row[2]}
        assert (bank_ids, ledger_ids) != ({banks[1].id}, {lines[2].id})
    assert banks[0].amount_irr == banks[1].amount_irr == lines[0].debit_irr == Decimal(100)
    assert (
        await session.scalar(
            select(func.count())
            .select_from(FindingActivity)
            .where(FindingActivity.company_id == company.id)
        )
        == 3
    )


@pytest.mark.integration
async def test_stale_runs_and_cross_company_proposals_are_not_actionable(integration_company):
    session, user, company = integration_company
    run, findings, matches, _, _ = await seed_proposals(session, user, company)
    with pytest.raises(ProposalNotFound):
        await decide_proposal(
            session,
            company_id=uuid4(),
            finding_id=findings[0].id,
            proposal_id=matches[0].id,
            actor_id=user.id,
            decision="confirm",
        )
    session.add(
        ReconciliationRun(
            company_id=company.id,
            status=ReconciliationStatus.COMPLETED,
            config_version="new",
            config_json={},
            counts_json={"inputs_available": True},
            idempotency_key=str(uuid4()),
            created_by=user.id,
        )
    )
    await session.flush()
    with pytest.raises(ProposalConflict):
        await decide_proposal(
            session,
            company_id=company.id,
            finding_id=findings[0].id,
            proposal_id=matches[0].id,
            actor_id=user.id,
            decision="confirm",
        )
    assert all(match.status == MatchStatus.POTENTIAL_MATCH for match in matches)


@pytest.mark.integration
async def test_an_active_allocation_blocks_another_confirmation(integration_company):
    session, user, company = integration_company
    _, findings, matches, _, _ = await seed_proposals(session, user, company)
    matches[2].status = MatchStatus.CONFIRMED
    await session.flush()
    with pytest.raises(ProposalConflict, match="قبلاً تطبیق"):
        await decide_proposal(
            session,
            company_id=company.id,
            finding_id=findings[0].id,
            proposal_id=matches[0].id,
            actor_id=user.id,
            decision="confirm",
        )
    assert matches[0].status == MatchStatus.POTENTIAL_MATCH


@pytest.mark.integration
async def test_advisors_can_decide_without_update_access_to_financial_sources(integration_company):
    from sqlalchemy import text, update

    from app.companies.models import CompanyAccess

    session, user, company = integration_company
    _, findings, matches, _, _ = await seed_proposals(session, user, company)
    await session.execute(text("RESET ROLE"))
    await session.execute(
        update(CompanyAccess)
        .where(CompanyAccess.company_id == company.id, CompanyAccess.user_id == user.id)
        .values(role=CompanyRole.ADVISOR)
    )
    await session.execute(text("SET LOCAL ROLE didban_app"))
    result = await decide_proposal(
        session,
        company_id=company.id,
        finding_id=findings[0].id,
        proposal_id=matches[0].id,
        actor_id=user.id,
        decision="confirm",
    )
    assert result.status == MatchStatus.CONFIRMED
