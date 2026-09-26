from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.calculations.models import (
    CalculationRun,
    CalculationRunStatus,
    ConfidenceLevel,
    MetricResult,
    MetricStatus,
    MetricUnit,
)
from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core.tenant import set_request_company
from app.financial.models import (
    Account,
    BankAccount,
    BankTransaction,
    Counterparty,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
from app.findings.engine import execute_finding_detection
from app.findings.models import (
    Finding,
    FindingSuppression,
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

ADMIN_URL = (
    "postgresql+asyncpg://didban_admin:change-me-in-real-environments@localhost:55432/didban_mali"
)
test_engine = create_async_engine(ADMIN_URL, poolclass=NullPool)
db_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.mark.asyncio
async def test_reconciliation_finding_rules_detection() -> None:
    """Test detection of reconciliation findings: unmatched bank tx, unmatched entry, duplicate tx, large unreconciled."""
    async with db_session_factory() as session:
        # 1. Setup Company & User
        user = User(
            id=uuid4(),
            email=f"find_test_{uuid4()}@example.com",
            full_name="Findings Tester",
            password_hash="hash",
            is_active=True,
        )
        session.add(user)
        await session.flush()

        ws = Workspace(id=uuid4(), name=f"WS_{uuid4()}", owner_user_id=user.id)
        session.add(ws)
        await session.flush()

        company = Company(
            id=uuid4(),
            workspace_id=ws.id,
            legal_name="شرکت آزمایشی کنترل",
            national_id=f"101{uuid4().int % 100000000:08d}",
            fiscal_year_start_month=1,
        )
        session.add(company)
        await session.flush()

        access = CompanyAccess(
            id=uuid4(),
            company_id=company.id,
            user_id=user.id,
            role=CompanyRole.FINANCE_MANAGER,
        )
        session.add(access)
        await session.flush()
        await set_request_company(session, company.id)

        # Create DataSource, SourceFile, ImportBatch
        ds = DataSource(
            id=uuid4(),
            company_id=company.id,
            kind=SourceKind.BANK,
            label="بانک ملت",
            created_by=user.id,
        )
        session.add(ds)
        await session.flush()

        src_file = SourceFile(
            id=uuid4(),
            company_id=company.id,
            object_key=f"obj-{uuid4()}",
            original_name="bank_test.csv",
            sha256="hash_bank_test",
            size_bytes=1000,
            mime_type="text/csv",
            extension="csv",
            uploaded_by=user.id,
        )
        session.add(src_file)
        await session.flush()

        batch = ImportBatch(
            id=uuid4(),
            company_id=company.id,
            source_id=ds.id,
            file_id=src_file.id,
            stage="normalized",
            status=ImportStatus.COMPLETED,
            idempotency_key=f"idemp-{uuid4()}",
        )
        session.add(batch)
        await session.flush()

        bank_acc = BankAccount(
            id=uuid4(),
            company_id=company.id,
            data_source_id=ds.id,
            bank_name="ملت",
            label="جاری",
            account_last4="1234",
            iban_masked="IR1234",
        )
        session.add(bank_acc)
        await session.flush()

        now = datetime.now(UTC)
        # Bank transaction 1: Unmatched and aged > 7 days (e.g., 15 days old)
        # Bank transaction 2 & 3: Potential duplicates (same amount, same date, same bank account)
        # Bank transaction 4: Large unreconciled transaction (> 500,000,000 IRR)
        r1 = SourceRow(id=uuid4(), company_id=company.id, import_batch_id=batch.id, sheet="Sheet1", row_number=1, raw_json={}, raw_hash="h1")
        r2 = SourceRow(id=uuid4(), company_id=company.id, import_batch_id=batch.id, sheet="Sheet1", row_number=2, raw_json={}, raw_hash="h2")
        r3 = SourceRow(id=uuid4(), company_id=company.id, import_batch_id=batch.id, sheet="Sheet1", row_number=3, raw_json={}, raw_hash="h3")
        r4 = SourceRow(id=uuid4(), company_id=company.id, import_batch_id=batch.id, sheet="Sheet1", row_number=4, raw_json={}, raw_hash="h4")
        session.add_all([r1, r2, r3, r4])
        await session.flush()

        tx_old = BankTransaction(
            id=uuid4(),
            company_id=company.id,
            bank_account_id=bank_acc.id,
            source_row_id=r1.id,
            booking_date=date(2026, 9, 1),
            amount_irr=Decimal("-15000000"),
            description="هزینه بدون سند حسابداری",
            description_normalized="هزینه بدون سند حسابداری",
        )
        tx_dup1 = BankTransaction(
            id=uuid4(),
            company_id=company.id,
            bank_account_id=bank_acc.id,
            source_row_id=r2.id,
            booking_date=date(2026, 9, 20),
            amount_irr=Decimal("45000000"),
            description="واریزی تکراری الف",
            description_normalized="واریزی تکراری الف",
        )
        tx_dup2 = BankTransaction(
            id=uuid4(),
            company_id=company.id,
            bank_account_id=bank_acc.id,
            source_row_id=r3.id,
            booking_date=date(2026, 9, 20),
            amount_irr=Decimal("45000000"),
            description="واریزی تکراری ب",
            description_normalized="واریزی تکراری ب",
        )
        tx_large = BankTransaction(
            id=uuid4(),
            company_id=company.id,
            bank_account_id=bank_acc.id,
            source_row_id=r4.id,
            booking_date=date(2026, 9, 10),
            amount_irr=Decimal("2500000000"),  # 2.5 billion IRR
            description="انتقال کلان تطبیق‌نشده",
            description_normalized="انتقال کلان تطبیق‌نشده",
        )
        session.add_all([tx_old, tx_dup1, tx_dup2, tx_large])

        # Accounting entry: Unmatched and aged > 7 days
        jr1 = SourceRow(id=uuid4(), company_id=company.id, import_batch_id=batch.id, sheet="Sheet1", row_number=5, raw_json={}, raw_hash="jh1")
        session.add(jr1)
        await session.flush()

        acc = Account(
            id=uuid4(),
            company_id=company.id,
            source_code="10201",
            name="بانک ریالی",
            normalized_name="بانک ریالی",
        )
        session.add(acc)
        await session.flush()

        je_old = JournalEntry(
            id=uuid4(),
            company_id=company.id,
            import_batch_id=batch.id,
            source_row_id=jr1.id,
            source_entry_key=f"k-{uuid4()}",
            entry_date=date(2026, 9, 2),
            description="سند بانکی بدون تطبیق صورتحساب",
            description_normalized="سند بانکی بدون تطبیق صورتحساب",
            fiscal_period="1405-06",
        )
        session.add(je_old)
        await session.flush()

        jl_old = JournalLine(
            id=uuid4(),
            company_id=company.id,
            entry_id=je_old.id,
            account_id=acc.id,
            source_row_id=jr1.id,
            debit_irr=Decimal("80000000"),
            credit_irr=Decimal("0"),
        )
        session.add(jl_old)
        await session.commit()

        # Run Detection
        det_run = await execute_finding_detection(
            session,
            company_id=company.id,
            actor_id=user.id,
            period_end=date(2026, 9, 23),
        )
        assert det_run is not None
        assert det_run.findings_created >= 4

        # Verify Findings created in DB
        findings = (
            await session.scalars(
                select(Finding).where(Finding.company_id == company.id)
            )
        ).all()

        rule_codes = {f.rule_code for f in findings}
        assert "unmatched_bank_transaction" in rule_codes
        assert "unmatched_accounting_entry" in rule_codes
        assert "potential_duplicate_transaction" in rule_codes
        assert "large_unreconciled_transaction" in rule_codes

        # Check deduplication fingerprint idempotency:
        # Running detection a second time should NOT duplicate findings
        det_run_2 = await execute_finding_detection(
            session,
            company_id=company.id,
            actor_id=user.id,
            period_end=date(2026, 9, 23),
        )
        assert det_run_2.findings_created == 0  # No new findings
        assert det_run_2.findings_updated >= 4


@pytest.mark.asyncio
async def test_receivables_and_liquidity_finding_rules() -> None:
    """Test overdue receivables, concentration, and Phase 2 guardrails for runway and cash deficit."""
    async with db_session_factory() as session:
        user = User(
            id=uuid4(),
            email=f"find_rec_{uuid4()}@example.com",
            full_name="Receivables Tester",
            password_hash="hash",
            is_active=True,
        )
        session.add(user)
        await session.flush()

        ws = Workspace(id=uuid4(), name=f"WS_{uuid4()}", owner_user_id=user.id)
        session.add(ws)
        await session.flush()

        company = Company(
            id=uuid4(),
            workspace_id=ws.id,
            legal_name="شرکت بازرگانی آزمون وصول",
            national_id=f"102{uuid4().int % 100000000:08d}",
            fiscal_year_start_month=1,
        )
        session.add(company)
        await session.flush()

        access = CompanyAccess(
            id=uuid4(),
            company_id=company.id,
            user_id=user.id,
            role=CompanyRole.OWNER,
        )
        session.add(access)
        await session.flush()
        await set_request_company(session, company.id)

        # Create Counterparties
        c1 = Counterparty(
            id=uuid4(),
            company_id=company.id,
            name="شرکت مشتری الف",
            normalized_name="شرکت مشتری الف",
            kind="customer",
        )
        session.add(c1)
        await session.flush()

        ds = DataSource(id=uuid4(), company_id=company.id, kind=SourceKind.SALES, label="فروش", created_by=user.id)
        src_file = SourceFile(
            id=uuid4(),
            company_id=company.id,
            object_key=f"obj-{uuid4()}",
            original_name="inv.csv",
            sha256="hash_inv",
            size_bytes=500,
            mime_type="text/csv",
            extension="csv",
            uploaded_by=user.id,
        )
        session.add_all([ds, src_file])
        await session.flush()

        batch = ImportBatch(
            id=uuid4(),
            company_id=company.id,
            source_id=ds.id,
            file_id=src_file.id,
            stage="normalized",
            status=ImportStatus.COMPLETED,
            idempotency_key=f"idemp-{uuid4()}",
        )
        session.add(batch)
        await session.flush()

        ir1 = SourceRow(id=uuid4(), company_id=company.id, import_batch_id=batch.id, sheet="Sheet1", row_number=1, raw_json={}, raw_hash="ih1")
        session.add(ir1)
        await session.flush()

        # Significant overdue receivable (> 60 days overdue, significant amount)
        inv = SalesInvoice(
            id=uuid4(),
            company_id=company.id,
            source_row_id=ir1.id,
            invoice_no="INV-9901",
            counterparty_id=c1.id,
            issue_date=date(2026, 6, 1),
            due_date=date(2026, 7, 1),  # overdue by > 80 days relative to 2026-09-23
            status="ISSUED",
            gross_amount_irr=Decimal("350000000"),
            paid_amount_irr=Decimal("0"),
        )
        session.add(inv)
        await session.flush()

        # Phase 2 Calculation Run with Low Runway (< 1.5 months)
        calc_run = CalculationRun(
            id=uuid4(),
            company_id=company.id,
            triggered_by=user.id,
            status=CalculationRunStatus.COMPLETED,
            engine_version="engine-v2",
            trigger_source="manual",
            as_of_date=date(2026, 9, 23),
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 23),
        )
        session.add(calc_run)
        await session.flush()

        # Metric: runway_months = 0.8 (< 1.5 threshold -> CRITICAL)
        m_runway = MetricResult(
            id=uuid4(),
            calculation_run_id=calc_run.id,
            company_id=company.id,
            metric_key="runway_months",
            metric_version="v1",
            status=MetricStatus.AVAILABLE,
            value_numeric=Decimal("0.8"),
            unit=MetricUnit.MONTH,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 23),
            as_of_date=date(2026, 9, 23),
            calculated_at=datetime.now(UTC),
            confidence=ConfidenceLevel.HIGH,
            coverage_score=100,
        )
        session.add(m_runway)
        await session.commit()

        # Run Detection
        # Run Detection
        det_run = await execute_finding_detection(
            session,
            company_id=company.id,
            actor_id=user.id,
            period_end=date(2026, 9, 23),
        )
        assert det_run.findings_created >= 2

        findings = (
            await session.scalars(
                select(Finding).where(Finding.company_id == company.id)
            )
        ).all()

        rule_codes = {f.rule_code for f in findings}
        assert "significant_overdue_receivable" in rule_codes
        assert "low_runway" in rule_codes

        # Test Suppression: If rule low_runway is suppressed for this calc_run, detection should ignore it
        suppression = FindingSuppression(
            id=uuid4(),
            company_id=company.id,
            rule_code="low_runway",
            entity_type="calculation_run",
            entity_id=calc_run.id,
            reason="افزایش سرمایه در جریان است",
            suppressed_by_user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=30),
            created_at=datetime.now(UTC),
        )
        session.add(suppression)
        await session.commit()

        # Run detection again
        det_run_supp = await execute_finding_detection(
            session,
            company_id=company.id,
            actor_id=user.id,
            period_end=date(2026, 9, 23),
        )
        assert det_run_supp.findings_suppressed >= 1
