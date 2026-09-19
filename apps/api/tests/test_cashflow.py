from datetime import date
from decimal import Decimal

from app.cashflow.schemas import (
    CashFlowForecastResponse,
    CashFlowSummaryResponse,
    CashFlowWeekItem,
    CashInflowSourceDetail,
    CashOutflowSourceDetail,
)
from app.cashflow.service import _compute_runway


def test_compute_runway_logic() -> None:
    # 1. Zero burn rate -> Sustainable
    days, months, status = _compute_runway(Decimal("1000000000"), Decimal(0))
    assert days == 999
    assert status == "sustainable"

    # 2. Critical: 10M cash, 15M monthly burn -> ~20 days (<30 days)
    days, months, status = _compute_runway(Decimal("10000000"), Decimal("15000000"))
    assert days == 20
    assert status == "critical"

    # 3. Warning: 45M cash, 30M monthly burn -> 45 days (30..60 days)
    days, months, status = _compute_runway(Decimal("45000000"), Decimal("30000000"))
    assert days == 45
    assert status == "warning"

    # 4. Monitor: 90M cash, 30M monthly burn -> 90 days (60..120 days)
    days, months, status = _compute_runway(Decimal("90000000"), Decimal("30000000"))
    assert days == 90
    assert status == "monitor"

    # 5. Healthy: 180M cash, 30M monthly burn -> 180 days (>120 days)
    days, months, status = _compute_runway(Decimal("180000000"), Decimal("30000000"))
    assert days == 180
    assert status == "healthy"


def test_cashflow_schemas_serialization() -> None:
    week1 = CashFlowWeekItem(
        week_number=1,
        start_date=date(2026, 9, 20),
        end_date=date(2026, 9, 26),
        starting_cash_irr=Decimal("100000000"),
        projected_inflows_irr=Decimal("30000000"),
        projected_outflows_irr=Decimal("50000000"),
        net_change_irr=Decimal("-20000000"),
        ending_cash_irr=Decimal("80000000"),
        is_deficit=False,
        deficit_amount_irr=Decimal(0),
    )

    summary = CashFlowSummaryResponse(
        as_of_date=date(2026, 9, 20),
        current_cash_irr=Decimal("100000000"),
        monthly_burn_rate_irr=Decimal("50000000"),
        runway_days=60,
        runway_months=2.0,
        runway_status="monitor",
        safety_buffer_irr=Decimal("10000000"),
        first_deficit_week=None,
        lowest_projected_cash_irr=Decimal("80000000"),
    )

    data = summary.model_dump()
    assert data["current_cash_irr"] == "100000000"
    assert data["monthly_burn_rate_irr"] == "50000000"
    assert data["runway_days"] == 60
    assert data["runway_status"] == "monitor"

    forecast = CashFlowForecastResponse(
        as_of_date=date(2026, 9, 20),
        scenario="base",
        safety_buffer_irr=Decimal("10000000"),
        current_cash_irr=Decimal("100000000"),
        total_projected_inflows_irr=Decimal("30000000"),
        total_projected_outflows_irr=Decimal("50000000"),
        net_period_movement_irr=Decimal("-20000000"),
        weeks=[week1],
        inflow_sources=[
            CashInflowSourceDetail(
                category="مطالبات", amount_irr=Decimal("30000000"), share_percentage=100.0
            )
        ],
        outflow_sources=[
            CashOutflowSourceDetail(
                category="حقوق", amount_irr=Decimal("50000000"), share_percentage=100.0
            )
        ],
    )

    f_data = forecast.model_dump()
    assert f_data["scenario"] == "base"
    assert len(f_data["weeks"]) == 1
    assert f_data["weeks"][0]["net_change_irr"] == "-20000000"
