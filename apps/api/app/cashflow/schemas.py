from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_serializer

CashRunwayStatus = Literal["critical", "warning", "monitor", "healthy", "sustainable"]
ScenarioType = Literal["base", "pessimistic", "optimistic"]


class CashFlowWeekItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    week_number: int
    start_date: date
    end_date: date
    starting_cash_irr: Decimal
    projected_inflows_irr: Decimal
    projected_outflows_irr: Decimal
    net_change_irr: Decimal
    ending_cash_irr: Decimal
    is_deficit: bool
    deficit_amount_irr: Decimal

    @field_serializer(
        "starting_cash_irr",
        "projected_inflows_irr",
        "projected_outflows_irr",
        "net_change_irr",
        "ending_cash_irr",
        "deficit_amount_irr",
    )
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")


class CashInflowSourceDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    amount_irr: Decimal
    share_percentage: float

    @field_serializer("amount_irr")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, "f")


class CashOutflowSourceDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    amount_irr: Decimal
    share_percentage: float

    @field_serializer("amount_irr")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, "f")


class CashFlowSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of_date: date
    current_cash_irr: Decimal
    monthly_burn_rate_irr: Decimal
    runway_days: int
    runway_months: float
    runway_status: CashRunwayStatus
    safety_buffer_irr: Decimal
    first_deficit_week: int | None
    lowest_projected_cash_irr: Decimal

    @field_serializer(
        "current_cash_irr",
        "monthly_burn_rate_irr",
        "safety_buffer_irr",
        "lowest_projected_cash_irr",
    )
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")


class CashFlowForecastResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of_date: date
    scenario: ScenarioType
    safety_buffer_irr: Decimal
    current_cash_irr: Decimal
    total_projected_inflows_irr: Decimal
    total_projected_outflows_irr: Decimal
    net_period_movement_irr: Decimal
    weeks: list[CashFlowWeekItem]
    inflow_sources: list[CashInflowSourceDetail]
    outflow_sources: list[CashOutflowSourceDetail]

    @field_serializer(
        "safety_buffer_irr",
        "current_cash_irr",
        "total_projected_inflows_irr",
        "total_projected_outflows_irr",
        "net_period_movement_irr",
    )
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")
