from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.cashflow.schemas import CashFlowForecastResponse, CashFlowSummaryResponse, CashFlowWeekItem
from app.main import app
from app.payables.schemas import PayablesSummaryResponse
from app.receivables.schemas import ReceivablesSummaryResponse
from app.simulation.schemas import (
    ComparativeMatrixRequest,
    DecisionMemoExportRequest,
    SavedScenarioCreateRequest,
    SimulationParametersRequest,
)
from app.simulation.service import (
    build_comparative_matrix,
    create_saved_scenario,
    delete_saved_scenario,
    generate_decision_memo_pdf,
    get_preset_scenarios,
    list_saved_scenarios,
    run_simulation,
)


def test_get_preset_scenarios_service() -> None:
    presets = get_preset_scenarios()
    assert len(presets.items) == 3
    ids = [p.id for p in presets.items]
    assert "cash_preservation" in ids
    assert "aggressive_growth" in ids
    assert "recession_stress" in ids


def test_simulation_openapi_paths() -> None:
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/companies/{company_id}/simulation/presets" in paths
    assert "/api/v1/companies/{company_id}/simulation/run" in paths
    assert "/api/v1/companies/{company_id}/simulation/scenarios" in paths
    assert "/api/v1/companies/{company_id}/simulation/matrix" in paths
    assert "/api/v1/companies/{company_id}/simulation/memo/pdf" in paths


def _mock_baseline_data():
    today = date(2026, 9, 20)
    weeks = [
        CashFlowWeekItem(
            week_number=i,
            start_date=today + timedelta(days=(i - 1) * 7),
            end_date=today + timedelta(days=i * 7 - 1),
            starting_cash_irr=Decimal("500000000"),
            projected_inflows_irr=Decimal("100000000"),
            projected_outflows_irr=Decimal("80000000"),
            net_change_irr=Decimal("20000000"),
            ending_cash_irr=Decimal(str(500000000 + i * 20000000)),
            is_deficit=False,
            deficit_amount_irr=Decimal(0),
        )
        for i in range(1, 14)
    ]

    cash_sum = CashFlowSummaryResponse(
        as_of_date=today,
        current_cash_irr=Decimal("500000000"),
        monthly_burn_rate_irr=Decimal("100000000"),
        runway_days=150,
        runway_months=5.0,
        runway_status="healthy",
        safety_buffer_irr=Decimal("100000000"),
        first_deficit_week=None,
        lowest_projected_cash_irr=Decimal("520000000"),
    )
    cash_forecast = CashFlowForecastResponse(
        as_of_date=today,
        scenario="base",
        safety_buffer_irr=Decimal("100000000"),
        current_cash_irr=Decimal("500000000"),
        total_projected_inflows_irr=Decimal("1300000000"),
        total_projected_outflows_irr=Decimal("1040000000"),
        net_period_movement_irr=Decimal("260000000"),
        weeks=weeks,
        inflow_sources=[],
        outflow_sources=[],
    )
    rec_sum = ReceivablesSummaryResponse(
        as_of_date=today,
        total_receivables_irr=Decimal("1200000000"),
        total_overdue_irr=Decimal("200000000"),
        overdue_ratio=0.166,
        dso_days=60,
        customer_count=20,
        high_risk_customer_count=2,
        buckets=[],
    )
    pay_sum = PayablesSummaryResponse(
        as_of_date=today,
        total_payables_irr=Decimal("800000000"),
        total_overdue_irr=Decimal("100000000"),
        overdue_ratio=0.125,
        dpo_days=40,
        dso_days=60,
        ccc_days=50,
        vendor_count=15,
        high_risk_vendor_count=1,
        buckets=[],
    )
    return cash_sum, cash_forecast, rec_sum, pay_sum


@pytest.mark.asyncio
async def test_simulation_baseline_zero_delta() -> None:
    cash_sum, cash_forecast, rec_sum, pay_sum = _mock_baseline_data()
    company_id = uuid4()
    mock_session = AsyncMock()

    with (
        patch(
            "app.simulation.service.get_cashflow_summary",
            new_callable=AsyncMock,
            return_value=cash_sum,
        ),
        patch(
            "app.simulation.service.get_cashflow_forecast",
            new_callable=AsyncMock,
            return_value=cash_forecast,
        ),
        patch(
            "app.simulation.service.get_receivables_summary",
            new_callable=AsyncMock,
            return_value=rec_sum,
        ),
        patch(
            "app.simulation.service.get_payables_summary",
            new_callable=AsyncMock,
            return_value=pay_sum,
        ),
    ):
        req = SimulationParametersRequest()
        result = await run_simulation(mock_session, company_id, req)

        assert len(result.weeks) == 13
        assert result.runway_days_delta.delta_value == Decimal(0)
        assert result.monthly_burn_rate_delta.delta_value == Decimal(0)
        assert result.cash_conversion_cycle_delta.delta_value == Decimal(0)
        assert result.net_annual_profit_impact_irr == Decimal(0)
        assert result.first_deficit_week_simulated is None


@pytest.mark.asyncio
async def test_simulation_dso_reduction_and_discount() -> None:
    cash_sum, cash_forecast, rec_sum, pay_sum = _mock_baseline_data()
    company_id = uuid4()
    mock_session = AsyncMock()

    with (
        patch(
            "app.simulation.service.get_cashflow_summary",
            new_callable=AsyncMock,
            return_value=cash_sum,
        ),
        patch(
            "app.simulation.service.get_cashflow_forecast",
            new_callable=AsyncMock,
            return_value=cash_forecast,
        ),
        patch(
            "app.simulation.service.get_receivables_summary",
            new_callable=AsyncMock,
            return_value=rec_sum,
        ),
        patch(
            "app.simulation.service.get_payables_summary",
            new_callable=AsyncMock,
            return_value=pay_sum,
        ),
    ):
        # Accelerate DSO by 15 days, 2% discount with 30% adoption
        req = SimulationParametersRequest(
            dso_change_days=-15,
            early_settlement_discount_pct=2.0,
            discount_adoption_rate_pct=30.0,
        )
        result = await run_simulation(mock_session, company_id, req)

        # 15 days faster collection -> liquidity released > 0
        assert result.liquidity_released_irr > Decimal(0)
        # Cash conversion cycle should decrease by 15 days
        assert result.cash_conversion_cycle_delta.delta_value == Decimal(-15)
        # Discount cost should be positive
        assert result.discount_cost_annual_irr > Decimal(0)
        # Net annual profit impact is negative due to discount
        assert result.net_annual_profit_impact_irr < Decimal(0)


@pytest.mark.asyncio
async def test_simulation_hiring_and_fixed_costs() -> None:
    cash_sum, cash_forecast, rec_sum, pay_sum = _mock_baseline_data()
    company_id = uuid4()
    mock_session = AsyncMock()

    with (
        patch(
            "app.simulation.service.get_cashflow_summary",
            new_callable=AsyncMock,
            return_value=cash_sum,
        ),
        patch(
            "app.simulation.service.get_cashflow_forecast",
            new_callable=AsyncMock,
            return_value=cash_forecast,
        ),
        patch(
            "app.simulation.service.get_receivables_summary",
            new_callable=AsyncMock,
            return_value=rec_sum,
        ),
        patch(
            "app.simulation.service.get_payables_summary",
            new_callable=AsyncMock,
            return_value=pay_sum,
        ),
    ):
        # 3 new hires @ 40M IRR each + 30M fixed cost increase = +150M monthly burn
        req = SimulationParametersRequest(
            new_hires_count=3,
            avg_salary_monthly_irr=Decimal("40000000"),
            fixed_cost_monthly_change_irr=Decimal("30000000"),
        )
        result = await run_simulation(mock_session, company_id, req)

        expected_burn_increase = Decimal("150000000")
        assert result.monthly_burn_rate_delta.delta_value == expected_burn_increase
        # Annual profit impact = -12 * 150M = -1,800,000,000 IRR
        assert result.net_annual_profit_impact_irr == -expected_burn_increase * Decimal(12)
        # Runway should shorten
        assert result.runway_days_delta.delta_value < Decimal(0)


@pytest.mark.asyncio
async def test_simulation_dpo_extension_buffers_cash() -> None:
    cash_sum, cash_forecast, rec_sum, pay_sum = _mock_baseline_data()
    company_id = uuid4()
    mock_session = AsyncMock()

    with (
        patch(
            "app.simulation.service.get_cashflow_summary",
            new_callable=AsyncMock,
            return_value=cash_sum,
        ),
        patch(
            "app.simulation.service.get_cashflow_forecast",
            new_callable=AsyncMock,
            return_value=cash_forecast,
        ),
        patch(
            "app.simulation.service.get_receivables_summary",
            new_callable=AsyncMock,
            return_value=rec_sum,
        ),
        patch(
            "app.simulation.service.get_payables_summary",
            new_callable=AsyncMock,
            return_value=pay_sum,
        ),
    ):
        # Extending DPO by 20 days reduces CCC by 20 days
        req = SimulationParametersRequest(
            dpo_change_days=20,
        )
        result = await run_simulation(mock_session, company_id, req)

        assert result.cash_conversion_cycle_delta.delta_value == Decimal(-20)
        assert result.runway_days_delta.delta_value >= Decimal(0)


@pytest.mark.asyncio
async def test_simulation_customer_default_shock() -> None:
    cash_sum, cash_forecast, rec_sum, pay_sum = _mock_baseline_data()
    company_id = uuid4()
    mock_session = AsyncMock()

    with (
        patch(
            "app.simulation.service.get_cashflow_summary",
            new_callable=AsyncMock,
            return_value=cash_sum,
        ),
        patch(
            "app.simulation.service.get_cashflow_forecast",
            new_callable=AsyncMock,
            return_value=cash_forecast,
        ),
        patch(
            "app.simulation.service.get_receivables_summary",
            new_callable=AsyncMock,
            return_value=rec_sum,
        ),
        patch(
            "app.simulation.service.get_payables_summary",
            new_callable=AsyncMock,
            return_value=pay_sum,
        ),
    ):
        # 25% default shock on total receivables (1.2B) = 300M loss
        req = SimulationParametersRequest(
            shock_default_pct=25.0,
        )
        result = await run_simulation(mock_session, company_id, req)

        assert result.net_annual_profit_impact_irr == Decimal("-300000000.00")
        assert result.runway_days_delta.delta_value < Decimal(0)


@pytest.mark.asyncio
async def test_saved_scenario_crud_and_matrix() -> None:
    cash_sum, cash_forecast, rec_sum, pay_sum = _mock_baseline_data()
    company_id = uuid4()
    mock_session = AsyncMock()

    with (
        patch(
            "app.simulation.service.get_cashflow_summary",
            new_callable=AsyncMock,
            return_value=cash_sum,
        ),
        patch(
            "app.simulation.service.get_cashflow_forecast",
            new_callable=AsyncMock,
            return_value=cash_forecast,
        ),
        patch(
            "app.simulation.service.get_receivables_summary",
            new_callable=AsyncMock,
            return_value=rec_sum,
        ),
        patch(
            "app.simulation.service.get_payables_summary",
            new_callable=AsyncMock,
            return_value=pay_sum,
        ),
    ):
        # 1. Create Saved Scenario
        req = SavedScenarioCreateRequest(
            name="برنامه جذب نیرو و شتاب فروش",
            description="افزایش ۲ نفر پرسنل و تسریع ۱۰ روزه وصول",
            is_favorite=True,
            parameters=SimulationParametersRequest(
                dso_change_days=-10,
                new_hires_count=2,
                avg_salary_monthly_irr=Decimal("35000000"),
            ),
        )
        saved = await create_saved_scenario(mock_session, company_id, req)
        assert saved.name == "برنامه جذب نیرو و شتاب فروش"
        assert saved.is_favorite is True
        assert "runway_days_delta" in saved.result_summary

        # 2. List Scenarios
        scenarios_res = await list_saved_scenarios(mock_session, company_id)
        assert len(scenarios_res.items) >= 1
        assert any(s.id == saved.id for s in scenarios_res.items)

        # 3. Comparative Matrix
        matrix_req = ComparativeMatrixRequest(
            scenario_ids=[saved.id],
            current_params=SimulationParametersRequest(dpo_change_days=15),
        )
        matrix_res = await build_comparative_matrix(mock_session, company_id, matrix_req)
        # Should have Baseline + Saved Scenario + Current Draft
        assert len(matrix_res.columns) == 3
        assert matrix_res.columns[0].is_baseline is True
        assert matrix_res.columns[0].scenario_id == "baseline"
        assert matrix_res.columns[1].scenario_id == str(saved.id)
        assert matrix_res.columns[1].risk_level in ["low", "medium", "high"]

        # 4. Delete Scenario
        deleted = await delete_saved_scenario(mock_session, company_id, saved.id)
        assert deleted is True


@pytest.mark.asyncio
async def test_decision_memo_pdf_generation() -> None:
    cash_sum, cash_forecast, rec_sum, pay_sum = _mock_baseline_data()
    company_id = uuid4()
    mock_session = AsyncMock()

    with (
        patch(
            "app.simulation.service.get_cashflow_summary",
            new_callable=AsyncMock,
            return_value=cash_sum,
        ),
        patch(
            "app.simulation.service.get_cashflow_forecast",
            new_callable=AsyncMock,
            return_value=cash_forecast,
        ),
        patch(
            "app.simulation.service.get_receivables_summary",
            new_callable=AsyncMock,
            return_value=rec_sum,
        ),
        patch(
            "app.simulation.service.get_payables_summary",
            new_callable=AsyncMock,
            return_value=pay_sum,
        ),
    ):
        memo_req = DecisionMemoExportRequest(
            scenario_title="سناریوی بهبود جریان نقد و اصلاح DPO",
            prepared_for="اعضای محترم هیئت مدیره",
            memo_subject="بررسی استراتژیک تغییر شرایط پرداخت تامین‌کنندگان",
            advisor_notes=(
                "اجرای این سناریو تاب‌آوری نقد را افزایش داده و ریسک توقف خط تولید در حد "
                "کنترل‌شده است."
            ),
            custom_params=SimulationParametersRequest(
                dso_change_days=-15,
                dpo_change_days=10,
                early_settlement_discount_pct=1.5,
                discount_adoption_rate_pct=25.0,
            ),
        )

        pdf_bytes = await generate_decision_memo_pdf(
            mock_session,
            company_id=company_id,
            req=memo_req,
            company_name="شرکت سهامی دیدبان مالی",
        )

        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 1000
        # Valid PDF header magic number
        assert pdf_bytes.startswith(b"%PDF")
