from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.calculations.models import CalculationRunStatus, ConfidenceLevel, MetricStatus, MetricUnit


class MetricEvidenceDTO(BaseModel):
    title_fa: str
    definition_fa: str
    formula_fa: str
    formula_version: str
    components: dict[str, Any] = Field(default_factory=dict)
    breakdown: list[dict[str, Any]] = Field(default_factory=list)
    reconciliation_notes: list[str] = Field(default_factory=list)


class MetricResultDTO(BaseModel):
    id: UUID | None = None
    metric_key: str
    metric_version: str
    status: MetricStatus
    value_numeric: Decimal | None = None
    value_formatted: str | None = None
    unit: MetricUnit
    as_of_date: date
    period_start: date | None = None
    period_end: date | None = None
    coverage_score: int
    confidence: ConfidenceLevel
    input_record_count: int
    excluded_record_count: int
    warnings: list[str] = Field(default_factory=list)
    evidence: MetricEvidenceDTO | None = None
    calculated_at: datetime


class CalculationRunDTO(BaseModel):
    id: UUID
    company_id: UUID
    as_of_date: date
    period_start: date
    period_end: date
    engine_version: str
    status: CalculationRunStatus
    trigger_source: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    summary: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, MetricResultDTO] = Field(default_factory=dict)


class FinancialPolicyDTO(BaseModel):
    dso_period_days: int = 90
    dso_method: str = "strict"  # "strict" or "sales_proxy"
    burn_trailing_days: int = 90
    default_reporting_unit: str = "toman"  # "rial" or "toman"
    excluded_internal_transfer_accounts: list[str] = Field(default_factory=list)


class UpdateFinancialPolicyRequest(BaseModel):
    dso_period_days: int | None = None
    dso_method: str | None = None
    burn_trailing_days: int | None = None
    default_reporting_unit: str | None = None
    excluded_internal_transfer_accounts: list[str] | None = None


class RunCalculationRequest(BaseModel):
    as_of_date: date | None = None
    period_start: date | None = None
    period_end: date | None = None


class KeyChangeItem(BaseModel):
    metric_key: str
    title_fa: str
    change_statement: str
    direction: str  # "increase", "decrease", "stable", "not_comparable"
    previous_value: Decimal | None = None
    current_value: Decimal | None = None
    unit: str
    severity: str = "neutral"  # "positive", "warning", "critical", "neutral"


class DataFreshnessSource(BaseModel):
    source_kind: str  # "accounting", "banking", "sales"
    title_fa: str
    last_record_date: date | None = None
    last_import_at: datetime | None = None
    days_stale: int = 0
    is_stale: bool = False
    message: str


class DataFreshnessSummary(BaseModel):
    as_of_date: date
    is_any_stale: bool
    sources: list[DataFreshnessSource]


class ForecastWeekSummary(BaseModel):
    week_number: int
    jalali_range: str
    start_date: date
    end_date: date
    opening_cash_irr: Decimal
    expected_inflow_irr: Decimal
    expected_outflow_irr: Decimal
    net_movement_irr: Decimal
    closing_cash_irr: Decimal
    is_deficit: bool
    deficit_amount_irr: Decimal = Decimal(0)


class ExecutiveDashboardResponse(BaseModel):
    calculation_run_id: UUID
    as_of_date: date
    period_start: date
    period_end: date
    engine_version: str
    primary_kpis: dict[
        str, MetricResultDTO
    ]  # 4 primary cards: cash_position, receivables, payables, runway_or_outlook
    key_changes: list[KeyChangeItem]
    forecast_outlook: dict[
        str, Any
    ]  # 13-week summary (trend, lowest projected, deficit week, coverage)
    freshness: DataFreshnessSummary


class MetricTraceRecord(BaseModel):
    entity_type: str
    record_id: UUID
    description: str
    amount_irr: Decimal | None = None
    date: date
    source_file_id: UUID | None = None
    source_file_name: str | None = None
    source_file_sha256: str | None = None
    source_row_number: int | None = None
    sheet_name: str | None = None
    raw_json: dict[str, Any] = Field(default_factory=dict)


class MetricTraceResponse(BaseModel):
    metric_key: str
    metric_version: str
    calculation_run_id: UUID
    total_records: int
    excluded_records: int
    sample_records: list[MetricTraceRecord]
