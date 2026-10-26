"""All writes, including service commits, are rolled back with the outer transaction."""

import os
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core.tenant import set_request_company, set_request_user
from app.financial.models import Account, BankAccount, BankTransaction, JournalEntry, JournalLine
from app.identity.models import User, Workspace
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    SourceFile,
    SourceKind,
    SourceRow,
)
from app.reconciliation.account_links import AccountLinkConflict, list_accounts, set_account_link
from app.reconciliation.models import BankLedgerLink, MatchStatus, ReconciliationMatch
from app.reconciliation.service import get_unmatched_records, run_canonical_reconciliation

URL = os.getenv("ACCOUNTING_TEST_DATABASE_URL")
pytestmark = [pytest.mark.integration, pytest.mark.skipif(not URL, reason="Requires migrated test database")]


async def test_correspondence_line_evidence_recalculation_and_tenant_isolation():
    engine = create_async_engine(URL)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                async with AsyncSession(bind=connection, join_transaction_mode="create_savepoint",
                                        expire_on_commit=False) as session:
                    user = User(id=uuid4(), email=f"links-{uuid4()}@example.com",
                                full_name="آزمایش", password_hash="test-only", is_active=True)
                    session.add(user)
                    await session.flush()
                    workspace = Workspace(id=uuid4(), name="آزمایش", owner_user_id=user.id)
                    session.add(workspace)
                    await session.flush()
                    company = Company(id=uuid4(), workspace_id=workspace.id, legal_name="آزمایش")
                    other = Company(id=uuid4(), workspace_id=workspace.id, legal_name="شرکت دیگر")
                    session.add_all([company, other])
                    await session.flush()
                    session.add(CompanyAccess(id=uuid4(), company_id=company.id, user_id=user.id,
                                              role=CompanyRole.OWNER))
                    source = DataSource(id=uuid4(), company_id=company.id, kind=SourceKind.BANK,
                                        label="بانک آزمایشی", created_by=user.id)
                    other_source = DataSource(id=uuid4(), company_id=other.id, kind=SourceKind.BANK,
                                              label="بانک دیگر", created_by=user.id)
                    session.add_all([source, other_source])
                    await session.flush()
                    bank = BankAccount(id=uuid4(), company_id=company.id, data_source_id=source.id,
                                       bank_name="نمونه", label="نمونه")
                    other_bank = BankAccount(id=uuid4(), company_id=other.id,
                                             data_source_id=other_source.id, bank_name="دیگر", label="دیگر")
                    account = Account(id=uuid4(), company_id=company.id, source_code="unfamiliar-7",
                                      name="حساب سفارشی", normalized_name="حساب سفارشی", role="other")
                    session.add_all([bank, other_bank, account])
                    file = SourceFile(id=uuid4(), company_id=company.id, object_key=str(uuid4()),
                                      original_name="test.csv", sha256="a"*64, size_bytes=1,
                                      mime_type="text/csv", extension=".csv", uploaded_by=user.id)
                    session.add(file)
                    await session.flush()
                    batch = ImportBatch(id=uuid4(), company_id=company.id, source_id=source.id,
                                        file_id=file.id, stage="normalized", status=ImportStatus.COMPLETED,
                                        idempotency_key=str(uuid4()))
                    session.add(batch)
                    await session.flush()
                    rows = [SourceRow(id=uuid4(), company_id=company.id, import_batch_id=batch.id,
                                      sheet="test", row_number=n+1, raw_json={}, raw_hash=str(n))
                            for n in range(4)]
                    session.add_all(rows)
                    await session.flush()
                    voucher = JournalEntry(id=uuid4(), company_id=company.id, import_batch_id=batch.id,
                                           source_row_id=rows[0].id, source_entry_key="42",
                                           source_entry_id="42", entry_date=date(2026, 9, 1),
                                           description="شرح عمومی", description_normalized="شرح عمومی",
                                           fiscal_period="2026-09")
                    session.add(voucher)
                    await session.flush()
                    lines = []
                    for n, amount in enumerate((100, 200)):
                        session.add(BankTransaction(
                            id=uuid4(), company_id=company.id, bank_account_id=bank.id,
                            source_row_id=rows[n+2].id, booking_date=date(2026, 9, 1),
                            amount_irr=Decimal(amount), description=f"شرح ردیف {n}",
                            description_normalized=f"شرح ردیف {n}",
                        ))
                        line = JournalLine(
                            id=uuid4(), company_id=company.id, entry_id=voucher.id,
                            account_id=account.id, source_row_id=rows[n].id,
                            debit_irr=Decimal(amount), credit_irr=Decimal(0), description=f"شرح ردیف {n}",
                        )
                        lines.append(line)
                        session.add(line)
                    await session.flush()
                    await set_request_user(session, user.id)
                    await set_request_company(session, company.id)
                    await session.execute(text("SET LOCAL ROLE didban_app"))
                    with pytest.raises(LookupError):
                        await set_account_link(session, company_id=company.id, account_id=account.id,
                                               bank_account_id=other_bank.id, actor_id=user.id)
                    await set_account_link(session, company_id=company.id, account_id=account.id,
                                           bank_account_id=bank.id, actor_id=user.id)
                    assert len((await session.scalars(select(BankLedgerLink))).all()) == 1
                    assert (await list_accounts(session, other.id)) == []
                    run = await run_canonical_reconciliation(
                        session, company_id=company.id, actor_id=user.id, commit=False,
                    )
                    assert run.matched_count == 2
                    matches = (await session.scalars(select(ReconciliationMatch).where(
                        ReconciliationMatch.run_id == run.id,
                    ))).all()
                    assert all(m.status == MatchStatus.AUTO_MATCHED for m in matches)
                    assert {m.evidence_json["accounting"]["source_row_id"] for m in matches} == {
                        str(line.source_row_id) for line in lines
                    }
                    assert {m.evidence_json["accounting"]["description"] for m in matches} == {
                        "شرح ردیف 0", "شرح ردیف 1"
                    }
                    unmatched = await get_unmatched_records(session, company_id=company.id)
                    assert unmatched["total_bank_count"] == unmatched["total_journal_count"] == 0
                    await session.execute(text("RESET ROLE"))
                    with pytest.raises(AccountLinkConflict):
                        await set_account_link(session, company_id=company.id, account_id=account.id,
                                               bank_account_id=None, actor_id=user.id)
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()
