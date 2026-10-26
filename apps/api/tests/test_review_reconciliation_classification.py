"""Execute the actual classification against transaction-local, temporary PostgreSQL tables."""

import os
from collections import Counter
from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.findings.models import Finding
from app.findings.reconciliation_scope import reconciliation_state_expression, unmatched_condition
from app.findings.titles import finding_title_expression
from app.reconciliation.engine import ProposedAllocation, ProposedMatch
from app.reconciliation.models import MatchLevel, MatchStatus
from app.reconciliation.summary import proposal_counts


def test_proposal_counter_includes_both_proposal_statuses_without_multiplying_source_rows():
    bank, ledger1, ledger2 = UUID(int=1), UUID(int=2), UUID(int=3)
    proposals = [ProposedMatch(
        bank, None, MatchLevel.FUZZY, status, Decimal(85), None, None, "test",
        allocations=[ProposedAllocation("bank", bank, None, Decimal(100)),
                     ProposedAllocation("journal", None, ledger, Decimal(100))],
    ) for status, ledger in [(MatchStatus.POTENTIAL_MATCH, ledger1),
                             (MatchStatus.SUGGESTED_MATCH, ledger2),
                             (MatchStatus.REJECTED, UUID(int=4))]]
    assert proposal_counts(proposals) == {
        "suggested_count": 2, "suggested_bank_count": 1, "suggested_journal_count": 2,
    }
    assert all(proposal.status != MatchStatus.CONFIRMED for proposal in proposals)


@pytest.mark.integration
async def test_latest_tenant_scoped_classification_counts_each_source_once():
    url = os.getenv("ACCOUNTING_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a PostgreSQL connection; only temporary tables are written")
    engine = create_async_engine(url)
    company, other = UUID(int=100), UUID(int=200)
    old_run, run, other_run = UUID(int=300), UUID(int=301), UUID(int=302)
    try:
        async with engine.connect() as connection:
            async with connection.begin():
                for table, columns in {
                    "findings": "id uuid, company_id uuid, finding_code text, source_entity_type text, source_entity_id uuid, financial_impact_irr numeric, affected_amount_irr numeric, title_fa text",
                    "reconciliation_runs": "id uuid, company_id uuid, status text, created_at timestamp, counts_json jsonb",
                    "reconciliation_matches": "id uuid, company_id uuid, run_id uuid, status text",
                    "reconciliation_allocations": "id uuid, company_id uuid, match_id uuid, bank_transaction_id uuid, journal_line_id uuid",
                }.items():
                    await connection.execute(text(f"CREATE TEMP TABLE {table} ({columns}) ON COMMIT DROP"))
                for number, side in [(1, "bank_transaction"), (2, "journal_line"), (3, "journal_line"), (4, "bank_transaction"), (5, "journal_line"), (6, "bank_transaction")]:
                    await connection.execute(text("INSERT INTO findings VALUES (:id,:company,:code,:side,:source,100,100,'old title')"), {
                        "id": UUID(int=number), "company": company, "source": UUID(int=number), "side": side,
                        "code": "unmatched_bank_transaction" if side == "bank_transaction" else "unmatched_accounting_entry",
                    })
                # Unknown source sides remain neutral. The other company has no usable inputs.
                await connection.execute(text("INSERT INTO findings VALUES (:id,:company,'large_unreconciled_transaction',NULL,NULL,100,100,'unknown')"), {"id": UUID(int=7), "company": company})
                await connection.execute(text("INSERT INTO findings VALUES (:id,:company,'unmatched_bank_transaction','bank_transaction',:source,100,100,'other')"), {"id": UUID(int=8), "company": other, "source": UUID(int=1)})
                for run_id, tenant, created, available in [(old_run, company, "2026-09-01", True), (run, company, "2026-10-01", True), (other_run, other, "2026-10-02", False)]:
                    await connection.execute(text("INSERT INTO reconciliation_runs VALUES (:id,:company,'COMPLETED',:created,CAST(:inputs AS jsonb))"), {
                        "id": run_id, "company": tenant, "created": date.fromisoformat(created), "inputs": '{"inputs_available":' + str(available).lower() + '}',
                    })
                for number, run_id, tenant, status, bank, ledger in [
                    (11, run, company, "POTENTIAL_MATCH", 1, 2),
                    (12, run, company, "SUGGESTED_MATCH", 1, 3),
                    (13, old_run, company, "POTENTIAL_MATCH", 4, 5),
                    (14, run, company, "REJECTED", 4, 5),
                    (15, run, company, "REVERSED", 4, 5),
                    (16, other_run, other, "POTENTIAL_MATCH", 4, 5),
                    (17, run, company, "CONFIRMED", 6, None),
                ]:
                    match_id = UUID(int=number)
                    await connection.execute(text("INSERT INTO reconciliation_matches VALUES (:id,:company,:run,:status)"), {"id": match_id, "company": tenant, "run": run_id, "status": status})
                    # Repeated allocation to bank 1 must not duplicate its source finding.
                    for bank_id, ledger_id in [(bank, None), (None, ledger)]:
                        if bank_id is None and ledger_id is None:
                            continue
                        await connection.execute(text("INSERT INTO reconciliation_allocations VALUES (:id,:company,:match,:bank,:ledger)"), {
                            "id": UUID(int=number * 10 + (1 if bank_id else 2)), "company": tenant, "match": match_id,
                            "bank": UUID(int=bank_id) if bank_id else None, "ledger": UUID(int=ledger_id) if ledger_id else None,
                        })
                rows = (await connection.execute(select(Finding.id, reconciliation_state_expression(), finding_title_expression()).where(Finding.company_id == company))).all()
                assert Counter(row[1] for row in rows) == {"suggested": 3, "no_candidate": 2, "matched": 1, "not_applicable": 1}
                assert len(rows) == len({row[0] for row in rows}) == 7
                assert "دارای پیشنهاد تطبیق" in rows[0][2]
                for direction, expected in [("suggested", {1, 2, 3}), ("missing_accounting", {4}), ("missing_bank", {5})]:
                    ids = set((await connection.scalars(select(Finding.id).where(Finding.company_id == company, unmatched_condition(direction)))).all())
                    assert ids == {UUID(int=number) for number in expected}
                other_state = await connection.scalar(select(reconciliation_state_expression()).where(Finding.id == UUID(int=8)))
                assert other_state == "unavailable"
    finally:
        await engine.dispose()
