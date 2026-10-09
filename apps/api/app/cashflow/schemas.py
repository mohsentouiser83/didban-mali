from datetime import date
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

CashRunwayStatus = Literal["critical", "warning", "monitor", "healthy", "sustainable"]
ScenarioType = Literal["base", "pessimistic", "optimistic"]


OutflowMode = Literal["historical", "planned"]
PaymentCategory = Literal["payroll", "vendor", "rent", "tax", "other"]


class PlannedPaymentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=160)
    category: PaymentCategory
    payment_date: date
    amount_irr: Decimal = Field(gt=0, max_digits=24, decimal_places=0)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("عنوان پرداخت الزامی است.")
        return value.strip()


class PlannedPaymentItem(PlannedPaymentCreate):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    id: UUID

    @field_serializer("amount_irr")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, "f")


class CashMovement(BaseModel):
    title: str
    due_date: date
    amount_irr: Decimal
    source_id: UUID

    @field_serializer("amount_irr")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, "f")


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
    receipts: list[CashMovement] = Field(default_factory=list)
    payments: list[CashMovement] = Field(default_factory=list)

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
    cash_accounts: list[dict[str, Any]] = Field(default_factory=list)
    cash_balance_date: date | None = None
    cash_basis: Literal["reported", "estimated", "mixed"] = "reported"
    cash_warnings: list[str] = Field(default_factory=list)
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
    horizon_days: int = 91
    outflow_mode: OutflowMode = "historical"
    projected_inflows_30d_irr: Decimal = Decimal(0)
    projected_outflows_30d_irr: Decimal = Decimal(0)
    weeks: list[CashFlowWeekItem]
    inflow_sources: list[CashInflowSourceDetail]
    outflow_sources: list[CashOutflowSourceDetail]

    @field_serializer(
        "safety_buffer_irr",
        "current_cash_irr",
        "total_projected_inflows_irr",
        "total_projected_outflows_irr",
        "net_period_movement_irr",
        "projected_inflows_30d_irr",
        "projected_outflows_30d_irr",
    )
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")
