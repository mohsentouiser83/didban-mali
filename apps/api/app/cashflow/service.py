from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.calculations.base import CalculatedMetricResult, CalculationContext
from app.calculations.cash_position import CashPositionCalculator
from app.calculations.models import FinancialPolicy
from app.cashflow.models import PlannedPayment
from app.cashflow.schemas import (
    CashFlowForecastResponse,
    CashFlowSummaryResponse,
    CashFlowWeekItem,
    CashInflowSourceDetail,
    CashMovement,
    CashOutflowSourceDetail,
    CashRunwayStatus,
    OutflowMode,
    ScenarioType,
)
from app.financial.models import (
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
    del session, company_id
    return explicit_date or datetime.now(ZoneInfo("Asia/Tehran")).date()


async def _cash_position(
    session: AsyncSession, company_id: UUID, as_of_date: date
) -> CalculatedMetricResult:
    policy = await session.scalar(
        select(FinancialPolicy).where(FinancialPolicy.company_id == company_id)
    )
    if policy is None:
        policy = FinancialPolicy(company_id=company_id, excluded_internal_transfer_accounts=[])
    return await CashPositionCalculator().calculate(
        CalculationContext(
            company_id=company_id,
            as_of_date=as_of_date,
            period_start=as_of_date,
            period_end=as_of_date,
            policy=policy,
            session=session,
        )
    )


async def _get_current_liquid_cash(
    session: AsyncSession, company_id: UUID, as_of_date: date
) -> Decimal:
    result = await _cash_position(session, company_id, as_of_date)
    if result.value_numeric is None:
        raise HTTPException(status_code=422, detail="مانده قابل اتکای حساب‌های بانکی در دسترس نیست.")
    return result.value_numeric


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
    session: AsyncSession,
    company_id: UUID,
    as_of_date: date | None = None,
    safety_buffer_irr: Decimal | None = None,
) -> CashFlowSummaryResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)
    current_cash = await _get_current_liquid_cash(session, company_id, effective_date)
    monthly_burn = await _get_monthly_burn_rate(session, company_id, effective_date)

    runway_days, runway_months, runway_status = _compute_runway(current_cash, monthly_burn)

    # Minimum safety buffer = 20% of monthly burn rate or 10% of current cash
    safety_buffer = (
        (monthly_burn * Decimal("0.2")).quantize(Decimal("1"))
        if monthly_burn > ZERO
        else max(ZERO, current_cash * Decimal("0.1")).quantize(Decimal("1"))
    )

    if safety_buffer_irr is not None:
        safety_buffer = safety_buffer_irr
    cash_evidence = await _cash_position(session, company_id, effective_date)

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

    accounts = cash_evidence.evidence_json.get("breakdown", [])
    balance_dates = [
        date.fromisoformat(row["balance_date"])
        for row in accounts
        if row.get("balance_date") and row.get("method") == "running_balance"
    ]
    methods = {row.get("method") for row in accounts if row.get("balance_irr") is not None}
    cash_basis: Literal["reported", "estimated", "mixed"] = (
        "mixed"
        if len(methods) > 1
        else "estimated"
        if "transaction_net_sum" in methods
        else "reported"
    )
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
        cash_accounts=accounts,
        cash_balance_date=min(balance_dates) if balance_dates else None,
        cash_basis=cash_basis,
        cash_warnings=cash_evidence.warnings,
    )


async def get_cashflow_forecast(
    session: AsyncSession,
    company_id: UUID,
    scenario: ScenarioType = "base",
    safety_buffer_irr: Decimal | None = None,
    as_of_date: date | None = None,
    horizon_days: int = 91,
    outflow_mode: OutflowMode = "historical",
) -> CashFlowForecastResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)
    current_cash = await _get_current_liquid_cash(session, company_id, effective_date)
    monthly_burn = await _get_monthly_burn_rate(session, company_id, effective_date)

    if safety_buffer_irr is None:
        safety_buffer_irr = (
            (monthly_burn * Decimal("0.2")).quantize(Decimal("1"))
            if monthly_burn > ZERO
            else max(ZERO, current_cash * Decimal("0.1")).quantize(Decimal("1"))
        )

    # Fetch open sales invoices
    inv_query = (
        select(SalesInvoice, Counterparty)
        .join(Counterparty, SalesInvoice.counterparty_id == Counterparty.id)
        .where(SalesInvoice.company_id == company_id, SalesInvoice.issue_date <= effective_date)
    )
    inv_results = (await session.execute(inv_query)).all()

    planned: list[PlannedPayment] = []
    if outflow_mode == "planned":
        planned = list(
            (
                await session.scalars(
                    select(PlannedPayment)
                    .where(
                        PlannedPayment.company_id == company_id,
                        PlannedPayment.payment_date >= effective_date,
                        PlannedPayment.payment_date < effective_date + timedelta(days=horizon_days),
                    )
                    .order_by(PlannedPayment.payment_date, PlannedPayment.id)
                )
            ).all()
        )

    # Scenario multipliers
    if scenario == "pessimistic":
        collection_factor_multiplier = Decimal("0.70")  # 30% reduction in collections
        burn_multiplier = Decimal("1.10")  # 10% increase in expenses
    elif scenario == "optimistic":
        collection_factor_multiplier = Decimal("1.15")  # Faster collections
        burn_multiplier = Decimal("0.95")  # 5% expense savings
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

    inflows_30d = ZERO
    outflows_30d = ZERO
    planned_sources: dict[str, Decimal] = {}
    for w in range(1, (horizon_days + 6) // 7 + 1):
        w_start = effective_date + timedelta(days=(w - 1) * 7)
        w_end = effective_date + timedelta(days=min(w * 7, horizon_days) - 1)
        week_days = (w_end - w_start).days + 1
        receipts: list[CashMovement] = []
        payments: list[CashMovement] = []

        # Inflows for this week
        inflows = ZERO
        for invoice, counterparty in inv_results:
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
                collection_date = max(due, effective_date)
                if collection_date < effective_date + timedelta(days=30):
                    inflows_30d += weighted_inflow
                receipts.append(
                    CashMovement(
                        title=f"{counterparty.name} · {invoice.invoice_no}",
                        due_date=collection_date,
                        amount_irr=weighted_inflow,
                        source_id=invoice.id,
                    )
                )

        # Outflows for this week
        # If week contains end of calendar month (day 28-31), allocate higher payroll spike
        has_month_end = any(
            (w_start + timedelta(days=d)).day in (28, 29, 30, 31) for d in range(week_days)
        )

        w_payroll = ZERO
        if has_month_end and weekly_base_burn > ZERO:
            # Payroll spike: 45% of monthly burn
            w_payroll = (effective_monthly_burn * Decimal("0.45")).quantize(Decimal("1"))
            w_vendor = (weekly_base_burn * Decimal("0.40")).quantize(Decimal("1"))
            w_overhead = (weekly_base_burn * Decimal("0.15")).quantize(Decimal("1"))
            outflows = w_payroll + w_vendor + w_overhead
        else:
            w_vendor = (weekly_base_burn * Decimal("0.65")).quantize(Decimal("1"))
            w_overhead = (weekly_base_burn * Decimal("0.35")).quantize(Decimal("1"))
            outflows = w_vendor + w_overhead

        fraction = Decimal(week_days) / Decimal(7)
        w_payroll = (w_payroll * fraction).quantize(Decimal("1"))
        w_vendor = (w_vendor * fraction).quantize(Decimal("1"))
        w_overhead = (w_overhead * fraction).quantize(Decimal("1"))
        outflows = w_payroll + w_vendor + w_overhead
        covered_days = max(0, min(week_days, (effective_date + timedelta(days=30) - w_start).days))
        if outflow_mode == "planned":
            outflows = ZERO
            for payment in planned:
                if w_start <= payment.payment_date <= w_end:
                    outflows += payment.amount_irr
                    planned_sources[payment.category] = (
                        planned_sources.get(payment.category, ZERO) + payment.amount_irr
                    )
                    payments.append(
                        CashMovement(
                            title=payment.title,
                            due_date=payment.payment_date,
                            amount_irr=payment.amount_irr,
                            source_id=payment.id,
                        )
                    )
                    if payment.payment_date < effective_date + timedelta(days=30):
                        outflows_30d += payment.amount_irr
        else:
            payroll_outflow_sum += w_payroll
            vendor_outflow_sum += w_vendor
            overhead_outflow_sum += w_overhead
            outflows_30d += (outflows * Decimal(covered_days) / Decimal(week_days)).quantize(
                Decimal("1")
            )

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
                receipts=receipts,
                payments=payments,
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
    if total_outflows > ZERO and outflow_mode == "historical":
        payroll_share = float((payroll_outflow_sum / total_outflows * 100).quantize(Decimal("0.1")))
        vendor_share = float((vendor_outflow_sum / total_outflows * 100).quantize(Decimal("0.1")))
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
    elif outflow_mode == "planned":
        labels = {
            "payroll": "حقوق و بیمه",
            "vendor": "تامین‌کنندگان",
            "rent": "اجاره",
            "tax": "مالیات",
            "other": "سایر پرداخت‌ها",
        }
        outflow_sources = (
            [
                CashOutflowSourceDetail(
                    category=labels[key],
                    amount_irr=amount,
                    share_percentage=float(
                        (amount / total_outflows * 100).quantize(Decimal("0.1"))
                    ),
                )
                for key, amount in planned_sources.items()
            ]
            if total_outflows > ZERO
            else []
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
        horizon_days=horizon_days,
        outflow_mode=outflow_mode,
        projected_inflows_30d_irr=inflows_30d,
        projected_outflows_30d_irr=outflows_30d,
        inflow_sources=inflow_sources,
        outflow_sources=outflow_sources,
    )
