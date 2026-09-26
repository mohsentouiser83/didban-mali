from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.calculations.base import CalculationContext
from app.calculations.burn_rate import BurnRateCalculator
from app.calculations.cash_forecast import CashForecastCalculator
from app.calculations.cash_movement import CashMovementCalculator
from app.calculations.cash_position import CashPositionCalculator
from app.calculations.ccc import CCCCalculator
from app.calculations.dpo import DPOCalculator
from app.calculations.dso import DSOCalculator
from app.calculations.models import CalculationRunStatus, FinancialPolicy, MetricStatus, MetricUnit
from app.calculations.payables import PayablesCalculator
from app.calculations.receivables import ReceivablesCalculator
from app.calculations.runway import RunwayCalculator
from app.calculations.service import (
    execute_calculation_run,
    get_executive_dashboard,
    get_metric_trace,
)
from app.financial.models import (
    Account,
    AccountClass,
    AccountClassification,
    BankAccount,
    BankTransaction,
    Counterparty,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    SourceFile,
    SourceKind,
    SourceRow,
)

ZERO = Decimal(0)

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
async def test_golden_dataset_financial_engine(golden_session: AsyncSession) -> None:
    session = golden_session
    company_id = uuid4()
    as_of = date(2026, 9, 20)

    from app.companies.models import Company
    from app.core.tenant import set_request_company
    from app.identity.models import User, Workspace

    user = User(
        id=uuid4(),
        email=f"tester-{uuid4()}@example.com",
        full_name="کاربر آزمون",
        password_hash="fake-hash",
        is_active=True,
    )
    session.add(user)
    await session.flush()

    workspace = Workspace(
        id=uuid4(),
        name="فضای کاری طلایی",
        owner_user_id=user.id,
    )
    session.add(workspace)
    await session.flush()

    company = Company(
        id=company_id,
        workspace_id=workspace.id,
        legal_name="شرکت نمونه آزمون طلایی",
        national_id="14009998877",
        fiscal_year_start_month=1,
    )
    session.add(company)
    await session.flush()
    await set_request_company(session, company_id)

    # 1. Setup Bank Accounts
    # Bank 1: Has latest running balance = 120,000,000 IRR
    # Bank 2: Has transactions only (no running balance) = 80,000,000 IRR
    # Bank 3: Stale / empty account (no balance)
    ds = DataSource(
        id=uuid4(),
        company_id=company_id,
        kind=SourceKind.BANK,
        label="بانک ملت",
        created_by=user.id,
    )
    session.add(ds)
    await session.flush()

    acc1 = BankAccount(
        id=uuid4(),
        company_id=company_id,
        data_source_id=ds.id,
        bank_name="ملت",
        label="جاری اصلی",
        iban_masked="IR***1234",
        account_last4="1234",
    )
    ds2 = DataSource(
        id=uuid4(),
        company_id=company_id,
        kind=SourceKind.BANK,
        label="بانک سامان",
        created_by=user.id,
    )
    session.add(ds2)
    await session.flush()
    acc2 = BankAccount(
        id=uuid4(),
        company_id=company_id,
        data_source_id=ds2.id,
        bank_name="سامان",
        label="جاری فرعی",
        iban_masked="IR***5678",
        account_last4="5678",
    )
    ds3 = DataSource(
        id=uuid4(),
        company_id=company_id,
        kind=SourceKind.BANK,
        label="بانک تجارت",
        created_by=user.id,
    )
    session.add(ds3)
    await session.flush()
    acc3 = BankAccount(
        id=uuid4(),
        company_id=company_id,
        data_source_id=ds3.id,
        bank_name="تجارت",
        label="سپرده",
        iban_masked="IR***9999",
        account_last4="9999",
    )
    session.add_all([acc1, acc2, acc3])
    await session.flush()

    # Source files and batches for Phase 1 traceability
    sfile = SourceFile(
        id=uuid4(),
        company_id=company_id,
        object_key=f"uploads/{uuid4()}/file.xlsx",
        original_name="mellat_sep.xlsx",
        sha256="hash1",
        size_bytes=1000,
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension="xlsx",
        uploaded_by=user.id,
    )
    session.add(sfile)
    await session.flush()

    batch = ImportBatch(
        id=uuid4(),
        company_id=company_id,
        source_id=ds.id,
        file_id=sfile.id,
        stage="normalized",
        status=ImportStatus.COMPLETED,
        idempotency_key=f"idemp-{uuid4()}",
    )
    session.add(batch)
    await session.flush()

    srow1 = SourceRow(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        sheet="Sheet1",
        row_number=2,
        raw_json={},
        raw_hash="h1",
    )
    srow2 = SourceRow(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        sheet="Sheet1",
        row_number=3,
        raw_json={},
        raw_hash="h2",
    )
    srow3 = SourceRow(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        sheet="Sheet1",
        row_number=4,
        raw_json={},
        raw_hash="h3",
    )
    session.add_all([srow1, srow2, srow3])
    await session.flush()

    # Bank 1: tx1 (+120M, running_balance = 120M)
    tx1 = BankTransaction(
        id=uuid4(),
        company_id=company_id,
        bank_account_id=acc1.id,
        source_row_id=srow1.id,
        booking_date=date(2026, 9, 15),
        amount_irr=Decimal("120000000"),
        running_balance_irr=Decimal("120000000"),
        description="واریز قرارداد",
        description_normalized="واریز قرارداد",
    )
    # Bank 2: tx2 (+80M, no running balance)
    tx2 = BankTransaction(
        id=uuid4(),
        company_id=company_id,
        bank_account_id=acc2.id,
        source_row_id=srow2.id,
        booking_date=date(2026, 9, 16),
        amount_irr=Decimal("80000000"),
        running_balance_irr=None,
        description="فروش نقدی",
        description_normalized="فروش نقدی",
    )
    # Internal Transfer: Company transfers 30,000,000 IRR from Bank 1 to Bank 2 on 2026-09-18
    srow4 = SourceRow(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        sheet="Sheet1",
        row_number=5,
        raw_json={},
        raw_hash="h4",
    )
    srow5 = SourceRow(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        sheet="Sheet1",
        row_number=6,
        raw_json={},
        raw_hash="h5",
    )
    session.add_all([srow4, srow5])
    await session.flush()

    tx_transfer_out = BankTransaction(
        id=uuid4(),
        company_id=company_id,
        bank_account_id=acc1.id,
        source_row_id=srow4.id,
        booking_date=date(2026, 9, 18),
        amount_irr=Decimal("-30000000"),
        running_balance_irr=Decimal("90000000"),  # 120M - 30M = 90M
        description="انتقال به حساب سامان",
        description_normalized="انتقال به حساب سامان",
    )
    tx_transfer_in = BankTransaction(
        id=uuid4(),
        company_id=company_id,
        bank_account_id=acc2.id,
        source_row_id=srow5.id,
        booking_date=date(2026, 9, 18),
        amount_irr=Decimal("30000000"),
        running_balance_irr=None,
        description="انتقال از حساب ملت",
        description_normalized="انتقال از حساب ملت",
    )
    session.add_all([tx1, tx2, tx_transfer_out, tx_transfer_in])
    await session.flush()

    # 2. Setup Customers and 30+ Sales Invoices
    customers = [
        Counterparty(
            id=uuid4(),
            company_id=company_id,
            name=f"مشتری {i}",
            normalized_name=f"مشتری {i}",
            kind="customer",
        )
        for i in range(1, 6)
    ]
    session.add_all(customers)
    await session.flush()

    # Create 32 invoices:
    # Invoices 1..10: Paid in full (gross 10M, paid 10M) -> outstanding = 0
    # Invoices 11..15: Current (not due, due in 10 days, gross 10M, paid 0) -> outstanding = 50M
    # Invoices 16..20: Overdue 1..30 days (due 10 days ago, gross 10M, paid 2M) -> outstanding = 40M
    # Invoices 21..25: Overdue 31..60 days (due 40 days ago, gross 10M, paid 0) -> outstanding = 50M
    # Invoices 26..28: Overdue 61..90 days (due 75 days ago, gross 10M, paid 0) -> outstanding = 30M
    # Invoices 29..30: Overdue >90 days (due 110 days ago, gross 10M, paid 0) -> outstanding = 20M
    # Invoices 31..32: Missing due date (due_date = None, gross 15M, paid 0) -> outstanding = 30M
    # Total open receivables expected = 50M + 40M + 50M + 30M + 20M + 30M = 220,000,000 IRR!
    # Overdue expected = 40M + 50M + 30M + 20M = 140,000,000 IRR!
    # Missing due date expected = 30,000,000 IRR!
    invoices: list[SalesInvoice] = []
    inv_srows: list[SourceRow] = []

    for i in range(1, 33):
        sr = SourceRow(
            id=uuid4(),
            company_id=company_id,
            import_batch_id=batch.id,
            sheet="Invoices",
            row_number=10 + i,
            raw_json={},
            raw_hash=f"h_inv_{i}",
        )
        inv_srows.append(sr)
    session.add_all(inv_srows)
    await session.flush()

    for i in range(1, 33):
        sr = inv_srows[i - 1]
        cp = customers[(i - 1) % 5]
        if i <= 10:
            inv = SalesInvoice(
                id=uuid4(),
                company_id=company_id,
                source_row_id=sr.id,
                counterparty_id=cp.id,
                invoice_no=f"INV-{i}",
                issue_date=as_of - timedelta(days=50),
                due_date=as_of - timedelta(days=20),
                gross_amount_irr=Decimal("10000000"),
                paid_amount_irr=Decimal("10000000"),
            )
        elif i <= 15:
            inv = SalesInvoice(
                id=uuid4(),
                company_id=company_id,
                source_row_id=sr.id,
                counterparty_id=cp.id,
                invoice_no=f"INV-{i}",
                issue_date=as_of - timedelta(days=5),
                due_date=as_of + timedelta(days=10),
                gross_amount_irr=Decimal("10000000"),
                paid_amount_irr=Decimal(0),
            )
        elif i <= 20:
            inv = SalesInvoice(
                id=uuid4(),
                company_id=company_id,
                source_row_id=sr.id,
                counterparty_id=cp.id,
                invoice_no=f"INV-{i}",
                issue_date=as_of - timedelta(days=40),
                due_date=as_of - timedelta(days=10),
                gross_amount_irr=Decimal("10000000"),
                paid_amount_irr=Decimal("2000000"),
            )
        elif i <= 25:
            inv = SalesInvoice(
                id=uuid4(),
                company_id=company_id,
                source_row_id=sr.id,
                counterparty_id=cp.id,
                invoice_no=f"INV-{i}",
                issue_date=as_of - timedelta(days=70),
                due_date=as_of - timedelta(days=40),
                gross_amount_irr=Decimal("10000000"),
                paid_amount_irr=Decimal(0),
            )
        elif i <= 28:
            inv = SalesInvoice(
                id=uuid4(),
                company_id=company_id,
                source_row_id=sr.id,
                counterparty_id=cp.id,
                invoice_no=f"INV-{i}",
                issue_date=as_of - timedelta(days=100),
                due_date=as_of - timedelta(days=75),
                gross_amount_irr=Decimal("10000000"),
                paid_amount_irr=Decimal(0),
            )
        elif i <= 30:
            inv = SalesInvoice(
                id=uuid4(),
                company_id=company_id,
                source_row_id=sr.id,
                counterparty_id=cp.id,
                invoice_no=f"INV-{i}",
                issue_date=as_of - timedelta(days=130),
                due_date=as_of - timedelta(days=110),
                gross_amount_irr=Decimal("10000000"),
                paid_amount_irr=Decimal(0),
            )
        else:
            inv = SalesInvoice(
                id=uuid4(),
                company_id=company_id,
                source_row_id=sr.id,
                counterparty_id=cp.id,
                invoice_no=f"INV-{i}",
                issue_date=as_of - timedelta(days=10),
                due_date=None,
                gross_amount_irr=Decimal("15000000"),
                paid_amount_irr=Decimal(0),
            )
        invoices.append(inv)

    session.add_all(invoices)
    await session.flush()

    # 3. Setup Suppliers and Payables in Accounting
    supplier = Counterparty(
        id=uuid4(),
        company_id=company_id,
        name="تامین‌کننده فولاد",
        normalized_name="تامین‌کننده فولاد",
        kind="vendor",
    )
    session.add(supplier)
    await session.flush()

    account = Account(
        id=uuid4(),
        company_id=company_id,
        source_code="201",
        name="بستانکاران تجاری",
        normalized_name="بستانکاران تجاری",
    )
    session.add(account)
    await session.flush()

    aclass = AccountClassification(
        id=uuid4(),
        company_id=company_id,
        account_id=account.id,
        account_class=AccountClass.LIABILITY,
        effective_from=date(2026, 1, 1),
        confirmed_by=user.id,
        rule_version="v1",
        confirmed_at=datetime.now(),
    )
    session.add(aclass)
    await session.flush()

    jentry = JournalEntry(
        id=uuid4(),
        company_id=company_id,
        import_batch_id=batch.id,
        source_row_id=srow1.id,
        source_entry_key="JE-1",
        entry_date=as_of - timedelta(days=15),
        description="خرید مواد اولیه",
        description_normalized="خرید مواد اولیه",
        fiscal_period="1405-06",
    )
    session.add(jentry)
    await session.flush()

    jline = JournalLine(
        id=uuid4(),
        company_id=company_id,
        entry_id=jentry.id,
        account_id=account.id,
        source_row_id=srow2.id,
        counterparty_id=supplier.id,
        debit_irr=Decimal(0),
        credit_irr=Decimal("75000000"),
        invoice_ref="BILL-100",
    )
    session.add(jline)
    await session.commit()

    policy = FinancialPolicy(
        id=uuid4(),
        company_id=company_id,
        dso_period_days=90,
        dso_method="strict",
        burn_trailing_days=90,
        default_reporting_unit="toman",
        excluded_internal_transfer_accounts=[],
        updated_at=datetime.now(),
    )

    ctx = CalculationContext(
        company_id=company_id,
        as_of_date=as_of,
        period_start=as_of - timedelta(days=30),
        period_end=as_of,
        policy=policy,
        session=session,
    )

    # =========================================================================
    # TEST 1: Cash Position
    # Expected: Bank 1 running balance = 90M, Bank 2 net = 80M + 30M = 110M.
    # Total Cash Position = 90M + 110M = 200,000,000 IRR!
    # Bank 3 is missing balance -> status should be available_with_warning.
    # =========================================================================
    calc_cash = CashPositionCalculator()
    res_cash = await calc_cash.calculate(ctx)
    assert res_cash.status == MetricStatus.AVAILABLE_WITH_WARNING
    assert res_cash.value_numeric == Decimal("200000000")
    assert res_cash.coverage_score == 67  # 2 out of 3 bank accounts usable
    assert len(res_cash.warnings) == 1
    assert "تجارت" in res_cash.warnings[0]

    # =========================================================================
    # TEST 2: Cash Movement with Internal Transfer Filter
    # Inflows: tx1 (120M) + tx2 (80M) + transfer_in (30M) = gross 230M.
    # Outflows: transfer_out (30M) = gross 30M.
    # Internal transfer detected: 30M.
    # Net inflows: 230M - 30M = 200M.
    # Net outflows: 30M - 30M = 0.
    # Net Movement = 200M - 0 = +200,000,000 IRR! (No double counting)
    # =========================================================================
    calc_move = CashMovementCalculator()
    res_move = await calc_move.calculate(ctx)
    assert res_move.status == MetricStatus.AVAILABLE
    assert res_move.value_numeric == Decimal("200000000")
    assert res_move.evidence_json["internal_transfers_count"] == 1
    assert res_move.evidence_json["internal_transfers_irr"] == "30000000"

    # =========================================================================
    # TEST 3: Receivables & 6 Aging Buckets Reconciliation
    # Total open: 220,000,000 IRR
    # Total overdue: 140,000,000 IRR
    # Missing due date count: 2 (amount: 30,000,000 IRR)
    # Reconciles: sum(buckets) == total_open!
    # =========================================================================
    calc_ar = ReceivablesCalculator()
    res_ar = await calc_ar.calculate(ctx)
    assert res_ar.status == MetricStatus.AVAILABLE_WITH_WARNING
    assert res_ar.value_numeric == Decimal("220000000")
    assert res_ar.evidence_json["total_overdue_irr"] == "140000000"

    buckets = {
        b["bucket_key"]: Decimal(b["amount_irr"]) for b in res_ar.evidence_json["aging_buckets"]
    }
    assert buckets["not_due"] == Decimal("50000000")
    assert buckets["1_30"] == Decimal("40000000")
    assert buckets["31_60"] == Decimal("50000000")
    assert buckets["61_90"] == Decimal("30000000")
    assert buckets["90_plus"] == Decimal("20000000")
    assert buckets["due_date_missing"] == Decimal("30000000")
    assert sum(buckets.values()) == Decimal("220000000")  # RECONCILED!

    # =========================================================================
    # TEST 4: Payables
    # Total open: 75,000,000 IRR
    # Due date missing count: 1 (no arbitrary 45 days assumed!)
    # =========================================================================
    calc_ap = PayablesCalculator()
    res_ap = await calc_ap.calculate(ctx)
    assert res_ap.status == MetricStatus.AVAILABLE_WITH_WARNING
    assert res_ap.value_numeric == Decimal("75000000")
    ap_buckets = {
        b["bucket_key"]: Decimal(b["amount_irr"]) for b in res_ap.evidence_json["aging_buckets"]
    }
    assert ap_buckets["due_date_missing"] == Decimal("75000000")
    assert sum(ap_buckets.values()) == Decimal("75000000")

    # =========================================================================
    # TEST 5: DSO
    # Sales in 90-day window: invoices 1..10 (100M) + 11..15 (50M) + 16..20 (50M) + 21..25 (50M) + 31..32 (30M) = 280,000,000 IRR
    # Open AR = 220,000,000 IRR
    # DSO = (220M / 280M) * 90 = 70.7 days!
    # =========================================================================
    calc_dso = DSOCalculator()
    res_dso = await calc_dso.calculate(ctx)
    assert res_dso.status == MetricStatus.APPROXIMATE
    assert res_dso.metric_version == "dso-sales-proxy-v1"
    assert res_dso.value_numeric == Decimal("70.7")
    assert res_dso.unit == MetricUnit.DAY

    # =========================================================================
    # TEST 6: DPO
    # Denominator (COGS/purchases/bank outflows) is 0 because no expenses exist and bank outflows were only internal transfers!
    # Expected: DPO must be INSUFFICIENT_DATA (never fake 45 days!)
    # =========================================================================
    calc_dpo = DPOCalculator()
    res_dpo = await calc_dpo.calculate(ctx)
    assert res_dpo.status == MetricStatus.INSUFFICIENT_DATA
    assert res_dpo.value_numeric is None

    # =========================================================================
    # TEST 7: CCC
    # DIO is missing from canonical data -> CCC must be INSUFFICIENT_DATA!
    # =========================================================================
    calc_ccc = CCCCalculator()
    res_ccc = await calc_ccc.calculate(ctx)
    assert res_ccc.status == MetricStatus.INSUFFICIENT_DATA
    assert res_ccc.value_numeric is None
    assert "DIO" in res_ccc.warnings[0]

    # =========================================================================
    # TEST 8: Net Cash Burn & Runway under Positive Cashflow
    # Inflows (200M) > Outflows (0M).
    # Burn Rate must be NOT_APPLICABLE (not a negative number!)
    # Runway must be NOT_APPLICABLE (not infinity ∞!)
    # =========================================================================
    calc_burn = BurnRateCalculator()
    res_burn = await calc_burn.calculate(ctx)
    assert res_burn.status == MetricStatus.NOT_APPLICABLE
    assert res_burn.value_numeric is None
    assert "مصرف خالص نقدینگی وجود نداشته است" in res_burn.warnings[0]

    calc_runway = RunwayCalculator()
    res_runway = await calc_runway.calculate(ctx)
    assert res_runway.status == MetricStatus.NOT_APPLICABLE
    assert res_runway.value_numeric is None
    assert "خودکفا است" in res_runway.warnings[0]

    # =========================================================================
    # TEST 9: 13-Week Cash Forecast
    # Starting Cash = 200,000,000 IRR.
    # Invoices 11..15 are due in 10 days (Week 2): +50,000,000 IRR.
    # Overdue invoices (140,000,000 IRR) separated as unscheduled!
    # Invoices without due date (30,000,000 IRR) separated as missing due date!
    # Inflows are not artificially inflated in Week 1!
    # =========================================================================
    calc_fc = CashForecastCalculator()
    res_fc = await calc_fc.calculate(ctx)
    assert res_fc.status == MetricStatus.AVAILABLE_WITH_WARNING
    ev = res_fc.evidence_json
    assert ev["starting_cash_irr"] == "200000000"
    assert ev["overdue_unscheduled_irr"] == "140000000"
    assert ev["missing_due_date_irr"] == "30000000"
    assert len(ev["weeks"]) == 13
    assert ev["weeks"][0]["expected_inflow_irr"] == "0"  # Week 1 has no artificial overdue dump!
    assert ev["weeks"][1]["expected_inflow_irr"] == "50000000"  # Week 2 receives invoices 11..15
    assert ev["first_deficit_week"] is None  # Sufficient cash, no deficit

    # =========================================================================
    # TEST 10: Service Orchestration, Executive Dashboard & Lineage Trace
    # =========================================================================
    run = await execute_calculation_run(session, company_id, as_of_date=as_of)
    assert run.status in (
        CalculationRunStatus.COMPLETED,
        CalculationRunStatus.COMPLETED_WITH_WARNINGS,
    )

    dashboard = await get_executive_dashboard(session, company_id)
    assert dashboard.calculation_run_id == run.id
    assert dashboard.primary_kpis["cash_position"].value_numeric == Decimal("200000000")
    assert dashboard.primary_kpis["open_receivables"].value_numeric == Decimal("220000000")
    assert len(dashboard.forecast_outlook["weeks"]) == 13
    assert len(dashboard.freshness.sources) >= 1

    trace = await get_metric_trace(session, company_id, "cash_position")
    assert trace.metric_key == "cash_position"
    assert len(trace.sample_records) >= 1
    assert trace.sample_records[0].entity_type == "bank_transaction"
