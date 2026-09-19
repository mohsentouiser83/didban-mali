from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class SimulationParametersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dso_change_days: int = Field(default=0, ge=-60, le=90)
    early_settlement_discount_pct: float = Field(default=0.0, ge=0.0, le=20.0)
    discount_adoption_rate_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    new_hires_count: int = Field(default=0, ge=0, le=100)
    avg_salary_monthly_irr: Decimal = Field(default=Decimal(0), ge=0)
    fixed_cost_monthly_change_irr: Decimal = Field(default=Decimal(0))
    dpo_change_days: int = Field(default=0, ge=-60, le=90)
    shock_customer_id: UUID | None = None
    shock_delay_days: int = Field(default=0, ge=0, le=180)
    shock_default_pct: float = Field(default=0.0, ge=0.0, le=100.0)

    @field_serializer("avg_salary_monthly_irr", "fixed_cost_monthly_change_irr")
    def serialize_decimals(self, value: Decimal) -> str:
        return format(value, "f")


class MetricDeltaItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseline_value: Decimal
    simulated_value: Decimal
    delta_value: Decimal
    unit: str
    is_improvement: bool

    @field_serializer("baseline_value", "simulated_value", "delta_value")
    def serialize_decimals(self, value: Decimal) -> str:
        return format(value, "f")


class SimulatedWeekItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    week_number: int
    start_date: str
    end_date: str
    baseline_closing_cash_irr: Decimal
    simulated_closing_cash_irr: Decimal
    simulated_inflows_irr: Decimal
    simulated_outflows_irr: Decimal
    is_baseline_deficit: bool
    is_simulated_deficit: bool

    @field_serializer(
        "baseline_closing_cash_irr",
        "simulated_closing_cash_irr",
        "simulated_inflows_irr",
        "simulated_outflows_irr",
    )
    def serialize_decimals(self, value: Decimal) -> str:
        return format(value, "f")


class SimulationResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runway_days_delta: MetricDeltaItem
    monthly_burn_rate_delta: MetricDeltaItem
    cash_conversion_cycle_delta: MetricDeltaItem
    liquidity_released_irr: Decimal
    discount_cost_annual_irr: Decimal
    net_annual_profit_impact_irr: Decimal
    first_deficit_week_baseline: int | None = None
    first_deficit_week_simulated: int | None = None
    executive_verdict_fa: str
    risk_warnings_fa: list[str]
    weeks: list[SimulatedWeekItem]

    @field_serializer(
        "liquidity_released_irr",
        "discount_cost_annual_irr",
        "net_annual_profit_impact_irr",
    )
    def serialize_decimals(self, value: Decimal) -> str:
        return format(value, "f")


class PresetScenarioItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name_fa: str
    description_fa: str
    icon: str
    parameters: SimulationParametersRequest


class PresetScenariosResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PresetScenarioItem]


class SavedScenarioCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    is_favorite: bool = False
    parameters: SimulationParametersRequest


class SavedScenarioItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    company_id: UUID
    name: str
    description: str | None = None
    is_favorite: bool = False
    parameters: SimulationParametersRequest
    result_summary: dict[str, Any]
    created_at: str
    updated_at: str


class SavedScenariosListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[SavedScenarioItem]


class ComparativeMatrixColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_id: str
    name: str
    is_baseline: bool = False
    runway_days: int
    runway_delta_days: int
    monthly_burn_irr: Decimal
    monthly_burn_delta_irr: Decimal
    ccc_days: int
    ccc_delta_days: int
    liquidity_released_irr: Decimal
    net_annual_profit_impact_irr: Decimal
    first_deficit_week: int | None = None
    verdict_fa: str
    risk_level: str

    @field_serializer(
        "monthly_burn_irr",
        "monthly_burn_delta_irr",
        "liquidity_released_irr",
        "net_annual_profit_impact_irr",
    )
    def serialize_decimals(self, value: Decimal) -> str:
        return format(value, "f")


class ComparativeMatrixRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_ids: list[UUID] = Field(default_factory=list)
    current_params: SimulationParametersRequest | None = None


class ComparativeMatrixResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[ComparativeMatrixColumn]


class DecisionMemoExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_id: UUID | None = None
    custom_params: SimulationParametersRequest | None = None
    scenario_title: str = Field(default="سناریوی پیشنهادی مدیریت مالی")
    prepared_for: str = Field(default="اعضای محترم هیئت مدیره و مدیرعامل")
    memo_subject: str = Field(default="ارزیابی اثرات مالی تصمیمات بر تاب‌آوری خزانه")
    advisor_notes: str | None = None
