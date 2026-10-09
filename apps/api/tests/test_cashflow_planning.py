from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app import main  # noqa: F401 — initialize the application's model registry
from app.cashflow import service
from app.cashflow.routes import _require_plan_writer, delete_payment
from app.cashflow.schemas import PlannedPaymentCreate
from app.companies.models import CompanyRole


@pytest.mark.asyncio
async def test_planned_payments_replace_history_and_respect_day_30_boundary(monkeypatch):
    company = uuid4()
    monkeypatch.setattr(service, "_get_current_liquid_cash", AsyncMock(return_value=Decimal(1000)))
    monkeypatch.setattr(service, "_get_monthly_burn_rate", AsyncMock(return_value=Decimal(9000)))
    session = AsyncMock()
    invoices = MagicMock()
    invoices.all.return_value = []
    session.execute.return_value = invoices
    payments = [
        SimpleNamespace(
            id=uuid4(),
            title="حقوق",
            category="payroll",
            payment_date=date(2026, 10, 31),
            amount_irr=Decimal(500),
        ),
        SimpleNamespace(
            id=uuid4(),
            title="اجاره",
            category="rent",
            payment_date=date(2026, 11, 7),
            amount_irr=Decimal(800),
        ),
    ]
    rows = MagicMock()
    rows.all.return_value = payments
    session.scalars.return_value = rows
    result = await service.get_cashflow_forecast(
        session,
        company,
        as_of_date=date(2026, 10, 9),
        horizon_days=30,
        outflow_mode="planned",
        scenario="pessimistic",
    )
    assert len(result.weeks) == 5
    assert result.weeks[-1].end_date == date(2026, 11, 7)
    assert result.total_projected_outflows_irr == Decimal(1300)
    assert result.projected_outflows_30d_irr == Decimal(1300)
    assert result.weeks[-1].ending_cash_irr == Decimal(-300)
    assert result.weeks[-1].deficit_amount_irr == result.safety_buffer_irr + Decimal(300)
    assert sum(row.amount_irr for row in result.outflow_sources) == Decimal(1300)
    query = str(session.scalars.call_args.args[0])
    assert "company_id" in query and "payment_date" in query


@pytest.mark.asyncio
async def test_receipts_are_weighted_and_outside_month_not_in_30_day_total(monkeypatch):
    monkeypatch.setattr(service, "_get_current_liquid_cash", AsyncMock(return_value=Decimal(1000)))
    monkeypatch.setattr(service, "_get_monthly_burn_rate", AsyncMock(return_value=Decimal(0)))
    session = AsyncMock()
    invoice = SimpleNamespace(
        id=uuid4(),
        invoice_no="INV-1",
        issue_date=date(2026, 10, 1),
        due_date=date(2026, 11, 8),
        gross_amount_irr=Decimal(100),
        paid_amount_irr=Decimal(0),
    )
    rows = MagicMock()
    rows.all.return_value = [(invoice, SimpleNamespace(name="مشتری"))]
    session.execute.return_value = rows
    result = await service.get_cashflow_forecast(session, uuid4(), as_of_date=date(2026, 10, 9))
    assert result.total_projected_inflows_irr == Decimal(90)
    assert result.projected_inflows_30d_irr == 0
    assert result.weeks[4].receipts[0].source_id == invoice.id
    assert result.weeks[4].receipts[0].amount_irr == Decimal(90)


def test_payment_validation_rejects_blank_title_negative_and_fractional_amounts():
    for override in (
        {"title": " "},
        {"amount_irr": "-1"},
        {"amount_irr": "0"},
        {"amount_irr": "1.5"},
    ):
        values = {
            "title": "اجاره",
            "category": "rent",
            "payment_date": "2026-10-09",
            "amount_irr": "1000",
        } | override
        with pytest.raises(ValidationError):
            PlannedPaymentCreate(**values)


def test_viewer_cannot_modify_payment_plan():
    with pytest.raises(HTTPException) as error:
        _require_plan_writer(SimpleNamespace(role=CompanyRole.VIEWER))
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_payment_deletion_scopes_company_and_does_not_delete_foreign_row():
    session = AsyncMock()
    session.scalar.return_value = None
    with pytest.raises(HTTPException) as error:
        await delete_payment(uuid4(), uuid4(), session, SimpleNamespace(role=CompanyRole.OWNER))
    assert error.value.status_code == 404
    session.delete.assert_not_awaited()
    assert "company_id" in str(session.scalar.call_args.args[0])


def test_forecast_http_query_parses_both_supported_horizons(monkeypatch):
    from fastapi.testclient import TestClient

    from app.cashflow import routes
    from app.cashflow.schemas import CashFlowForecastResponse
    from app.companies.dependencies import get_company_access
    from app.core.database import get_db

    response = CashFlowForecastResponse(
        as_of_date=date(2026, 10, 9),
        scenario="base",
        safety_buffer_irr=Decimal(0),
        current_cash_irr=Decimal(1),
        total_projected_inflows_irr=Decimal(0),
        total_projected_outflows_irr=Decimal(0),
        net_period_movement_irr=Decimal(0),
        weeks=[],
        inflow_sources=[],
        outflow_sources=[],
    )
    forecast = AsyncMock(return_value=response)
    monkeypatch.setattr(routes, "get_cashflow_forecast", forecast)
    main.app.dependency_overrides[get_company_access] = lambda: SimpleNamespace(
        role=CompanyRole.VIEWER
    )
    main.app.dependency_overrides[get_db] = lambda: AsyncMock()
    try:
        client = TestClient(main.app)
        for horizon in (30, 91):
            result = client.get(
                f"/api/v1/companies/{uuid4()}/cashflow/forecast?scenario=base&horizon_days={horizon}&outflow_mode=planned"
            )
            assert result.status_code == 200
            assert forecast.call_args.kwargs["horizon_days"] == horizon
        assert (
            client.get(f"/api/v1/companies/{uuid4()}/cashflow/forecast?horizon_days=31").status_code
            == 422
        )
    finally:
        main.app.dependency_overrides.clear()
