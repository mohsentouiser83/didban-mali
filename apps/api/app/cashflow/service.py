from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cashflow.schemas import (
    CashFlowForecastResponse,
    CashFlowSummaryResponse,
    CashFlowWeekItem,
    CashInflowSourceDetail,
    CashOutflowSourceDetail,
    CashRunwayStatus,
    ScenarioType,
)
from app.financial.models import (
    Account,
    AccountClass,
    AccountClassification,
    BankTransaction,
    Counterparty,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)

ZERO = Decimal(0)


async def _resolve_as_of_date(
    session: AsyncSession, company_id: UUID, explicit_date: date | None
) -> date:
    if explicit_date:
        return explicit_date

    max_bank_date = await session.scalar(
        select(func.max(BankTransaction.booking_date)).where(
            BankTransaction.company_id == company_id
        )
    )
    max_inv_date = await session.scalar(
        select(func.max(SalesInvoice.issue_date)).where(
            SalesInvoice.company_id == company_id
        )
    )

    dates = [d for d in (max_bank_date, max_inv_date) if d is not None]
    return max(dates) if dates else date.today()


async def _get_current_liquid_cash(
    session: AsyncSession, company_id: UUID, as_of_date: date
) -> Decimal:
    """Calculates available liquid cash across bank accounts as of the given date."""
    # 1. Try sum of latest running balances per bank account
    subq = (
        select(
            BankTransaction.bank_account_id,
            func.max(BankTransaction.booking_date).label("max_date"),
        )
        .where(
            BankTransaction.company_id == company_id,
            BankTransaction.booking_date <= as_of_date,
            BankTransaction.running_balance_irr.isnot(None),
        )
        .group_by(BankTransaction.bank_account_id)
        .subquery()
    )

    query = select(BankTransaction.running_balance_irr).join(
        subq,
        (BankTransaction.bank_account_id == subq.c.bank_account_id)
        & (BankTransaction.booking_date == subq.c.max_date),
    )
    raw_balances = (await session.execute(query)).scalars().all()
    valid_balances = [b for b in raw_balances if b is not None]
    if valid_balances:
        total_balance = sum(valid_balances, ZERO)
        if total_balance > ZERO:
            return total_balance

    # 2. If no running balances, sum all net bank transactions
    net_bank = await session.scalar(
        select(func.sum(BankTransaction.amount_irr)).where(
            BankTransaction.company_id == company_id,
            BankTransaction.booking_date <= as_of_date,
        )
    )
    if net_bank is not None and net_bank > ZERO:
        return net_bank

    # 3. Check cash/bank ledger lines
    cash_ledger = await session.scalar(
        select(func.sum(JournalLine.debit_irr - JournalLine.credit_irr))
        .join(Account, JournalLine.account_id == Account.id)
        .join(
            AccountClassification,
            (AccountClassification.account_id == Account.id)
            & (AccountClassification.account_class == AccountClass.ASSET),
        )
        .where(
            JournalLine.company_id == company_id,
            (Account.source_code.ilike("%101%"))
            | (Account.name.ilike("%بانک%"))
            | (Account.name.ilike("%نقد%")),
        )
    )
    if cash_ledger is not None and cash_ledger > ZERO:
        return cash_ledger

    return ZERO


async def _get_monthly_burn_rate(
    session: AsyncSession, company_id: UUID, as_of_date: date
) -> Decimal:
    """Calculates average monthly cash outflow over the preceding 90 days."""
    start_90_days = as_of_date - timedelta(days=90)

    # Sum negative bank transactions (outflows)
    bank_outflows = await session.scalar(
        select(func.sum(func.abs(BankTransaction.amount_irr))).where(
            BankTransaction.company_id == company_id,
            BankTransaction.booking_date >= start_90_days,
            BankTransaction.booking_date <= as_of_date,
            BankTransaction.amount_irr < 0,
        )
    )
    if bank_outflows is not None and bank_outflows > ZERO:
        return Decimal(str((bank_outflows / Decimal(3)).quantize(Decimal("1"))))

    # If no bank transactions, sum expense ledger lines
    expense_outflows = await session.scalar(
        select(func.sum(JournalLine.debit_irr - JournalLine.credit_irr))
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .join(
            AccountClassification,
            (AccountClassification.account_id == JournalLine.account_id)
            & (AccountClassification.account_class == AccountClass.EXPENSE),
        )
        .where(
            JournalLine.company_id == company_id,
            JournalEntry.entry_date >= start_90_days,
            JournalEntry.entry_date <= as_of_date,
        )
    )
    if expense_outflows is not None and expense_outflows > ZERO:
        return (expense_outflows / Decimal(3)).quantize(Decimal("1"))

    return ZERO


def _compute_runway(
    current_cash: Decimal, monthly_burn_rate: Decimal
) -> tuple[int, float, CashRunwayStatus]:
    if monthly_burn_rate <= ZERO:
        return 999, 99.0, "sustainable"

    daily_burn = monthly_burn_rate / Decimal(30)
    if daily_burn <= ZERO:
        return 999, 99.0, "sustainable"

    runway_days = int(current_cash / daily_burn)
    runway_months = float(Decimal(str(runway_days / 30)).quantize(Decimal("0.1")))

    if runway_days < 30:
        status: CashRunwayStatus = "critical"
    elif runway_days < 60:
        status = "warning"
    elif runway_days < 120:
        status = "monitor"
    else:
        status = "healthy"

    return runway_days, runway_months, status


async def get_cashflow_summary(
    session: AsyncSession, company_id: UUID, as_of_date: date | None = None
) -> CashFlowSummaryResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)
    current_cash = await _get_current_liquid_cash(session, company_id, effective_date)
    monthly_burn = await _get_monthly_burn_rate(session, company_id, effective_date)

    runway_days, runway_months, runway_status = _compute_runway(current_cash, monthly_burn)

    # Minimum safety buffer = 20% of monthly burn rate or 10% of current cash
    safety_buffer = (
        (monthly_burn * Decimal("0.2")).quantize(Decimal("1"))
        if monthly_burn > ZERO
        else (current_cash * Decimal("0.1")).quantize(Decimal("1"))
    )

    # Calculate 13-week quick projection to find first deficit week
    forecast = await get_cashflow_forecast(
        session,
        company_id,
        scenario="base",
        safety_buffer_irr=safety_buffer,
        as_of_date=effective_date,
    )

    first_deficit_week: int | None = None
    lowest_cash = current_cash

    for week in forecast.weeks:
        if week.ending_cash_irr < lowest_cash:
            lowest_cash = week.ending_cash_irr
        if week.is_deficit and first_deficit_week is None:
            first_deficit_week = week.week_number

    return CashFlowSummaryResponse(
        as_of_date=effective_date,
        current_cash_irr=current_cash,
        monthly_burn_rate_irr=monthly_burn,
        runway_days=runway_days,
        runway_months=runway_months,
        runway_status=runway_status,
        safety_buffer_irr=safety_buffer,
        first_deficit_week=first_deficit_week,
        lowest_projected_cash_irr=lowest_cash,
    )


async def get_cashflow_forecast(
    session: AsyncSession,
    company_id: UUID,
    scenario: ScenarioType = "base",
    safety_buffer_irr: Decimal | None = None,
    as_of_date: date | None = None,
) -> CashFlowForecastResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)
    current_cash = await _get_current_liquid_cash(session, company_id, effective_date)
    monthly_burn = await _get_monthly_burn_rate(session, company_id, effective_date)

    if safety_buffer_irr is None:
        safety_buffer_irr = (
            (monthly_burn * Decimal("0.2")).quantize(Decimal("1"))
            if monthly_burn > ZERO
            else (current_cash * Decimal("0.1")).quantize(Decimal("1"))
        )

    # Fetch open sales invoices
    inv_query = (
        select(SalesInvoice, Counterparty)
        .join(Counterparty, SalesInvoice.counterparty_id == Counterparty.id)
        .where(SalesInvoice.company_id == company_id)
    )
    inv_results = (await session.execute(inv_query)).all()

    # Scenario multipliers
    if scenario == "pessimistic":
        collection_factor_multiplier = Decimal("0.70")  # 30% reduction in collections
        burn_multiplier = Decimal("1.10")               # 10% increase in expenses
    elif scenario == "optimistic":
        collection_factor_multiplier = Decimal("1.15")  # Faster collections
        burn_multiplier = Decimal("0.95")               # 5% expense savings
    else:
        collection_factor_multiplier = Decimal("1.00")
        burn_multiplier = Decimal("1.00")

    effective_monthly_burn = monthly_burn * burn_multiplier
    weekly_base_burn = (
        (effective_monthly_burn / Decimal("4.333")).quantize(Decimal("1"))
        if effective_monthly_burn > ZERO
        else ZERO
    )

    weeks: list[CashFlowWeekItem] = []
    running_balance = current_cash
    total_inflows = ZERO
    total_outflows = ZERO

    credit_sales_inflow_sum = ZERO
    payroll_outflow_sum = ZERO
    vendor_outflow_sum = ZERO
    overhead_outflow_sum = ZERO

    for w in range(1, 14):
        w_start = effective_date + timedelta(days=(w - 1) * 7)
        w_end = effective_date + timedelta(days=w * 7 - 1)

        # Inflows for this week
        inflows = ZERO
        for invoice, _ in inv_results:
            remaining = invoice.gross_amount_irr - (invoice.paid_amount_irr or ZERO)
            if remaining <= ZERO:
                continue

            due = invoice.due_date or (invoice.issue_date + timedelta(days=30))
            is_overdue = due < effective_date

            # Invoices due in this week or overdue in early weeks
            if (w_start <= due <= w_end) or (is_overdue and w == 1):
                delay = (effective_date - due).days if is_overdue else 0
                if delay <= 0:
                    prob = Decimal("0.90")
                elif delay <= 30:
                    prob = Decimal("0.75")
                elif delay <= 60:
                    prob = Decimal("0.50")
                else:
                    prob = Decimal("0.25")

                prob = min(Decimal("1.0"), prob * collection_factor_multiplier)
                weighted_inflow = (remaining * prob).quantize(Decimal("1"))
                inflows += weighted_inflow
                credit_sales_inflow_sum += weighted_inflow

        # Outflows for this week
        # If week contains end of calendar month (day 28-31), allocate higher payroll spike
        has_month_end = any(
            (w_start + timedelta(days=d)).day in (28, 29, 30, 31)
            for d in range(7)
        )

        if has_month_end and weekly_base_burn > ZERO:
            # Payroll spike: 45% of monthly burn
            w_payroll = (effective_monthly_burn * Decimal("0.45")).quantize(Decimal("1"))
            w_vendor = (weekly_base_burn * Decimal("0.40")).quantize(Decimal("1"))
            w_overhead = (weekly_base_burn * Decimal("0.15")).quantize(Decimal("1"))
            outflows = w_payroll + w_vendor + w_overhead
            payroll_outflow_sum += w_payroll
            vendor_outflow_sum += w_vendor
            overhead_outflow_sum += w_overhead
        else:
            w_vendor = (weekly_base_burn * Decimal("0.65")).quantize(Decimal("1"))
            w_overhead = (weekly_base_burn * Decimal("0.35")).quantize(Decimal("1"))
            outflows = w_vendor + w_overhead
            vendor_outflow_sum += w_vendor
            overhead_outflow_sum += w_overhead

        net_change = inflows - outflows
        ending_cash = running_balance + net_change
        is_deficit = ending_cash < safety_buffer_irr
        deficit_amt = max(ZERO, safety_buffer_irr - ending_cash) if is_deficit else ZERO

        weeks.append(
            CashFlowWeekItem(
                week_number=w,
                start_date=w_start,
                end_date=w_end,
                starting_cash_irr=running_balance,
                projected_inflows_irr=inflows,
                projected_outflows_irr=outflows,
                net_change_irr=net_change,
                ending_cash_irr=ending_cash,
                is_deficit=is_deficit,
                deficit_amount_irr=deficit_amt,
            )
        )

        total_inflows += inflows
        total_outflows += outflows
        running_balance = ending_cash

    net_period = total_inflows - total_outflows

    # Compute breakdown shares
    inflow_sources: list[CashInflowSourceDetail] = []
    if total_inflows > ZERO:
        inflow_share = float(
            (credit_sales_inflow_sum / total_inflows * 100).quantize(Decimal("0.1"))
        )
        inflow_sources.append(
            CashInflowSourceDetail(
                category="وصول مطالبات فروش اعتباری",
                amount_irr=credit_sales_inflow_sum,
                share_percentage=inflow_share,
            )
        )
    else:
        inflow_sources.append(
            CashInflowSourceDetail(
                category="وصول مطالبات فاکتورها",
                amount_irr=ZERO,
                share_percentage=0.0,
            )
        )

    outflow_sources: list[CashOutflowSourceDetail] = []
    if total_outflows > ZERO:
        payroll_share = float(
            (payroll_outflow_sum / total_outflows * 100).quantize(Decimal("0.1"))
        )
        vendor_share = float(
            (vendor_outflow_sum / total_outflows * 100).quantize(Decimal("0.1"))
        )
        overhead_share = float(
            (overhead_outflow_sum / total_outflows * 100).quantize(Decimal("0.1"))
        )
        outflow_sources.append(
            CashOutflowSourceDetail(
                category="حقوق، دستمزد و بیمه پرسنل",
                amount_irr=payroll_outflow_sum,
                share_percentage=payroll_share,
            )
        )
        outflow_sources.append(
            CashOutflowSourceDetail(
                category="تامین‌کنندگان و خرید مواد",
                amount_irr=vendor_outflow_sum,
                share_percentage=vendor_share,
            )
        )
        outflow_sources.append(
            CashOutflowSourceDetail(
                category="سربار عمومی، اداری و اجاره",
                amount_irr=overhead_outflow_sum,
                share_percentage=overhead_share,
            )
        )
    else:
        outflow_sources.append(
            CashOutflowSourceDetail(
                category="هزینه‌های عملیاتی جاری",
                amount_irr=ZERO,
                share_percentage=0.0,
            )
        )

    return CashFlowForecastResponse(
        as_of_date=effective_date,
        scenario=scenario,
        safety_buffer_irr=safety_buffer_irr,
        current_cash_irr=current_cash,
        total_projected_inflows_irr=total_inflows,
        total_projected_outflows_irr=total_outflows,
        net_period_movement_irr=net_period,
        weeks=weeks,
        inflow_sources=inflow_sources,
        outflow_sources=outflow_sources,
    )
