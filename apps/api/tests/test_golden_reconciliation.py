from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core.tenant import set_request_company
from app.financial.models import (
    Account,
    BankAccount,
    BankTransaction,
    JournalEntry,
    JournalLine,
)
from app.identity.models import User, Workspace
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    SourceFile,
    SourceKind,
    SourceRow,
)
from app.reconciliation.engine import BankRecord, LedgerRecord, ReconciliationConfig, reconcile
from app.reconciliation.models import (
    MatchStatus,
    ReconciliationMatch,
)
from app.reconciliation.service import (
    get_unmatched_records,
    manual_reconciliation_match,
    reverse_reconciliation_match,
    run_canonical_reconciliation,
)

ADMIN_URL = (
    "postgresql+asyncpg://didban_admin:change-me-in-real-environments@localhost:55432/didban_mali"
)
test_engine = create_async_engine(ADMIN_URL, pool_pre_ping=True)
db_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture
async def golden_session():
    async with db_session_factory() as session:
        yield session
        await session.rollback()


@pytest.mark.asyncio
async def test_reconciliation_engine_logic() -> None:
    """Test Level 1, Level 2, Level 3 and 1:N batch settlement pure engine logic."""
    b_id1 = uuid4()
    b_id2 = uuid4()
    b_id3 = uuid4()
    l_id1 = uuid4()
    l_id2 = uuid4()
    l_id3 = uuid4()
    l_id4 = uuid4()

    banks = [
        # Exact match candidate
        BankRecord(
            id=b_id1,
            source_row_id=uuid4(),
            booking_date=date(2026, 9, 10),
            amount_irr=Decimal("15000000"),
            description="واریز حق‌العمل شرکت آلفا",
            reference="REF-1001",
        ),
        # Suggested match candidate (date diff 4 days, no exact ref)
        BankRecord(
            id=b_id2,
            source_row_id=uuid4(),
            booking_date=date(2026, 9, 15),
            amount_irr=Decimal("8200000"),
            description="واریز فروش نقدی",
        ),
        # 1:N batch outflow: 25,000,000 IRR equals 10,000,000 + 15,000,000
        BankRecord(
            id=b_id3,
            source_row_id=uuid4(),
            booking_date=date(2026, 9, 20),
            amount_irr=Decimal("-25000000"),
            description="تسویه گروهی حقوق و دستمزد",
        ),
    ]

    ledgers = [
        # Exactly matches b_id1
        LedgerRecord(
            entry_id=uuid4(),
            line_id=l_id1,
            source_row_id=uuid4(),
            entry_date=date(2026, 9, 10),
            amount_irr=Decimal("15000000"),
            description="دریافت حق العمل شرکت آلفا",
            reference="REF-1001",
        ),
        # Suggested match for b_id2
        LedgerRecord(
            entry_id=uuid4(),
            line_id=l_id2,
            source_row_id=uuid4(),
            entry_date=date(2026, 9, 11),
            amount_irr=Decimal("8200000"),
            description="فروش نقدی روزانه",
        ),
        # Batch outflow parts
        LedgerRecord(
            entry_id=uuid4(),
            line_id=l_id3,
            source_row_id=uuid4(),
            entry_date=date(2026, 9, 20),
            amount_irr=Decimal("-10000000"),
            description="پرداخت مساعده پرسنل الف",
        ),
        LedgerRecord(
            entry_id=uuid4(),
            line_id=l_id4,
            source_row_id=uuid4(),
            entry_date=date(2026, 9, 20),
            amount_irr=Decimal("-15000000"),
            description="پرداخت مساعده پرسنل ب",
        ),
    ]

    config = ReconciliationConfig(rule_business_days=3, review_calendar_days=7)
    proposals = reconcile(banks, ledgers, config)

    # 1. Exact match
    exact = next((p for p in proposals if p.bank_transaction_id == b_id1), None)
    assert exact is not None
    assert exact.status == MatchStatus.AUTO_MATCHED
    assert exact.score == Decimal(100)
    assert len(exact.allocations) == 2

    # 2. Suggested match
    suggested = next((p for p in proposals if p.bank_transaction_id == b_id2), None)
    assert suggested is not None
    assert suggested.status in {MatchStatus.SUGGESTED_MATCH, MatchStatus.POTENTIAL_MATCH}
    assert suggested.score >= Decimal(80)

    # 3. 1:N Batch match
    batch = next((p for p in proposals if p.bank_transaction_id == b_id3), None)
    assert batch is not None
    assert batch.match_type == "one_to_many"
    assert len(batch.allocations) == 3  # 1 bank, 2 journal
    assert sum(a.allocated_amount_irr for a in batch.allocations if a.side == "journal") == Decimal("-25000000")


@pytest.mark.asyncio
async def test_canonical_reconciliation_service_flow(golden_session: AsyncSession) -> None:
    """Test full database lifecycle of reconciliation, manual match, and reversal."""
    session = golden_session
    company_id = uuid4()

    user = User(
        id=uuid4(),
        email=f"recon-{uuid4()}@example.com",
        full_name="مدیر تطبیق",
        password_hash="fake-hash",
        is_active=True,
    )
    session.add(user)
    await session.flush()

    workspace = Workspace(
        id=uuid4(),
        name="فضای کاری تطبیق",
        owner_user_id=user.id,
    )
    session.add(workspace)
    await session.flush()

    company = Company(
        id=company_id,
        workspace_id=workspace.id,
        legal_name="شرکت آزمون تطبیق بانکی",
        national_id=f"1400{uuid4().int % 10000000:07d}",
        fiscal_year_start_month=1,
    )
    session.add(company)
    await session.flush()

    member = CompanyAccess(
        id=uuid4(),
        company_id=company_id,
        user_id=user.id,
        role=CompanyRole.FINANCE_MANAGER,
    )
    session.add(member)
    await session.flush()
    await set_request_company(session, company_id)

    # Create Bank Account
    ds = DataSource(
        id=uuid4(),
        company_id=company_id,
        kind=SourceKind.BANK,
        label="بانک تجارت",
        created_by=user.id,
    )
    session.add(ds)
    await session.flush()

    bank_acc = BankAccount(
        id=uuid4(),
        company_id=company_id,
        data_source_id=ds.id,
        bank_name="تجارت",
        label="جاری بازرگانی",
        account_last4="7766",
        iban_masked="IR99887766",
    )
    session.add(bank_acc)
    await session.flush()

    # Create Import Batch & Files
    src_file = SourceFile(
        id=uuid4(),
        company_id=company_id,
        object_key=f"obj-{uuid4()}",
        original_name="test.csv",
        sha256="hash1",
        size_bytes=1000,
        mime_type="text/csv",
        extension="csv",
        uploaded_by=user.id,
    )
    session.add(src_file)
    await session.flush()

    batch = ImportBatch(
        id=uuid4(),
        company_id=company_id,
        source_id=ds.id,
        file_id=src_file.id,
        stage="normalized",
        status=ImportStatus.COMPLETED,
        idempotency_key=f"idemp-{uuid4()}",
    )
    session.add(batch)
    await session.flush()

    # Create Accounts
    acc_bank = Account(
        id=uuid4(),
        company_id=company_id,
        source_code="10101",
        name="بانک تجارت جاری",
        normalized_name="بانک تجارت جاری",
    )
    acc_rev = Account(
        id=uuid4(),
        company_id=company_id,
        source_code="60101",
        name="درآمد خدمات",
        normalized_name="درآمد خدمات",
    )
    session.add_all([acc_bank, acc_rev])
    await session.flush()

    # Insert Bank Transactions
    row1 = SourceRow(id=uuid4(), company_id=company_id, import_batch_id=batch.id, sheet="Sheet1", row_number=1, raw_json={}, raw_hash="h1")
    row2 = SourceRow(id=uuid4(), company_id=company_id, import_batch_id=batch.id, sheet="Sheet1", row_number=2, raw_json={}, raw_hash="h2")
    row3 = SourceRow(id=uuid4(), company_id=company_id, import_batch_id=batch.id, sheet="Sheet1", row_number=3, raw_json={}, raw_hash="h3")
    session.add_all([row1, row2, row3])
    await session.flush()

    bt1 = BankTransaction(
        id=uuid4(),
        company_id=company_id,
        bank_account_id=bank_acc.id,
        source_row_id=row1.id,
        booking_date=date(2026, 9, 1),
        amount_irr=Decimal("50000000"),
        description="واریز حواله قرارداد ۱",
        description_normalized="واریز حواله قرارداد ۱",
        reference="TRACK-111",
    )
    bt2 = BankTransaction(
        id=uuid4(),
        company_id=company_id,
        bank_account_id=bank_acc.id,
        source_row_id=row2.id,
        booking_date=date(2026, 9, 5),
        amount_irr=Decimal("30000000"),
        description="واریز حواله دستی ۲",
        description_normalized="واریز حواله دستی ۲",
    )
    bt3 = BankTransaction(
        id=uuid4(),
        company_id=company_id,
        bank_account_id=bank_acc.id,
        source_row_id=row3.id,
        booking_date=date(2026, 9, 8),
        amount_irr=Decimal("12000000"),
        description="تراکنش بلاتکلیف ۳",
        description_normalized="تراکنش بلاتکلیف ۳",
    )
    session.add_all([bt1, bt2, bt3])
    await session.flush()

    jrow1 = SourceRow(id=uuid4(), company_id=company_id, import_batch_id=batch.id, sheet="Sheet1", row_number=10, raw_json={}, raw_hash="jh1")
    jrow2 = SourceRow(id=uuid4(), company_id=company_id, import_batch_id=batch.id, sheet="Sheet1", row_number=11, raw_json={}, raw_hash="jh2")
    jrow3 = SourceRow(id=uuid4(), company_id=company_id, import_batch_id=batch.id, sheet="Sheet1", row_number=12, raw_json={}, raw_hash="jh3")
    session.add_all([jrow1, jrow2, jrow3])
    await session.flush()

    # Insert Accounting Entries
    je1 = JournalEntry(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        source_row_id=jrow1.id,
        source_entry_key=f"k-{uuid4()}",
        entry_date=date(2026, 9, 1),
        description="سند واریز قرارداد ۱",
        description_normalized="سند واریز قرارداد ۱",
        reference="TRACK-111",
        fiscal_period="1405-06",
    )
    session.add(je1)
    await session.flush()

    jl1_debit = JournalLine(
        id=uuid4(),
        company_id=company_id,
        entry_id=je1.id,
        account_id=acc_bank.id,
        source_row_id=jrow1.id,
        debit_irr=Decimal("50000000"),
        credit_irr=Decimal("0"),
    )
    jl1_credit = JournalLine(
        id=uuid4(),
        company_id=company_id,
        entry_id=je1.id,
        account_id=acc_rev.id,
        source_row_id=jrow2.id,
        debit_irr=Decimal("0"),
        credit_irr=Decimal("50000000"),
    )

    je2 = JournalEntry(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        source_row_id=jrow3.id,
        source_entry_key=f"k-{uuid4()}",
        entry_date=date(2026, 9, 6),
        description="سند دستی واریز ۲",
        description_normalized="سند دستی واریز ۲",
        fiscal_period="1405-06",
    )
    session.add(je2)
    await session.flush()

    jl2_debit = JournalLine(
        id=uuid4(),
        company_id=company_id,
        entry_id=je2.id,
        account_id=acc_bank.id,
        source_row_id=jrow3.id,
        debit_irr=Decimal("30000000"),
        credit_irr=Decimal("0"),
    )

    session.add_all([jl1_debit, jl1_credit, jl2_debit])
    await session.commit()

    # 1. Run Canonical Auto-Reconciliation
    run = await run_canonical_reconciliation(
        session,
        company_id=company_id,
        actor_id=user.id,
        bank_account_id=bank_acc.id,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
    )
    assert run is not None
    assert run.matched_count >= 1
    assert run.matched_amount_irr >= Decimal("50000000")

    # 2. Check Unmatched Records (bt3 must be unmatched)
    unmatched = await get_unmatched_records(session, company_id=company_id)
    assert any(b["id"] == bt3.id for b in unmatched["bank_transactions"])

    # 3. Test Manual Match Validation (reject unbalanced)
    with pytest.raises(ValueError, match="مبالغ طرفین تراز نیست"):
        await manual_reconciliation_match(
            session,
            company_id=company_id,
            actor_id=user.id,
            bank_transaction_ids=[bt3.id],  # 12,000,000
            journal_line_ids=[jl2_debit.id],  # 30,000,000
            note="عدم تراز",
        )

    # 4. Test Match Reversal (Undo)
    auto_match = (
        await session.scalars(
            select(ReconciliationMatch).where(
                ReconciliationMatch.company_id == company_id,
                ReconciliationMatch.status == MatchStatus.AUTO_MATCHED,
            )
        )
    ).first()
    assert auto_match is not None

    reversed_m = await reverse_reconciliation_match(
        session,
        company_id=company_id,
        actor_id=user.id,
        match_id=auto_match.id,
        reason="اشتباه در انتساب خودکار",
    )
    assert reversed_m.status == MatchStatus.REVERSED
    assert reversed_m.reversal_reason == "اشتباه در انتساب خودکار"
    assert reversed_m.reversed_by == user.id

    # Check that after reversal, bt1 is once again in unmatched pool
    unmatched_after_rev = await get_unmatched_records(session, company_id=company_id)
    assert any(b["id"] == bt1.id for b in unmatched_after_rev["bank_transactions"])


@pytest.mark.asyncio
async def test_smart_many_to_one_and_fifo_allocation() -> None:
    """Test Q4 Roadmap: 1:N subset matching (3+ items) and counterparty-guided FIFO matching."""
    bank_tx_id = uuid4()
    bank_tx = BankRecord(
        id=bank_tx_id,
        source_row_id=uuid4(),
        booking_date=date(2026, 9, 25),
        amount_irr=Decimal("60000000"),
        description="واریز تجمیعی مشتری بازرگانی کاسپین بابت فاکتورها",
    )

    # 3 invoices summing to 60,000,000 IRR (10M + 20M + 30M)
    l1 = LedgerRecord(
        entry_id=uuid4(),
        line_id=uuid4(),
        source_row_id=uuid4(),
        entry_date=date(2026, 9, 22),
        amount_irr=Decimal("10000000"),
        description="فاکتور فروش ۱۰۰۱",
        counterparty_name="شرکت بازرگانی کاسپین",
    )
    l2 = LedgerRecord(
        entry_id=uuid4(),
        line_id=uuid4(),
        source_row_id=uuid4(),
        entry_date=date(2026, 9, 23),
        amount_irr=Decimal("20000000"),
        description="فاکتور فروش ۱۰۰۲",
        counterparty_name="شرکت بازرگانی کاسپین",
    )
    l3 = LedgerRecord(
        entry_id=uuid4(),
        line_id=uuid4(),
        source_row_id=uuid4(),
        entry_date=date(2026, 9, 24),
        amount_irr=Decimal("30000000"),
        description="فاکتور فروش ۱۰۰۳",
        counterparty_name="شرکت بازرگانی کاسپین",
    )
    # Extra unrelated ledger item
    l_other = LedgerRecord(
        entry_id=uuid4(),
        line_id=uuid4(),
        source_row_id=uuid4(),
        entry_date=date(2026, 9, 24),
        amount_irr=Decimal("5000000"),
        description="سند نامربوط",
        counterparty_name="شرکت متفرقه",
    )

    config = ReconciliationConfig(rule_business_days=3, review_calendar_days=7)
    proposals = reconcile([bank_tx], [l1, l2, l3, l_other], config)

    # Must find 1:N batch settlement matching all 3 items
    matched = next((p for p in proposals if p.bank_transaction_id == bank_tx_id), None)
    assert matched is not None
    assert matched.match_type == "one_to_many"
    assert len(matched.allocations) == 4  # 1 bank + 3 journal
    journal_allocs = [a for a in matched.allocations if a.side == "journal"]
    assert sum(a.allocated_amount_irr for a in journal_allocs) == Decimal("60000000")
