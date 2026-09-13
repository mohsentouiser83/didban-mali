from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, field_serializer, model_validator

from app.analysis.models import AnalysisStatus, MetricCode


class AnalysisRunRequest(BaseModel):
    period_start: date
    period_end: date
    rule_set_version: Literal["financial-metrics-v1"] = "financial-metrics-v1"

    @model_validator(mode="after")
    def validate_period(self) -> "AnalysisRunRequest":
        if self.period_start > self.period_end:
            raise ValueError("ابتدای دوره نباید بعد از انتهای دوره باشد.")
        if (self.period_end - self.period_start).days > 732:
            raise ValueError("طول دوره تحلیل نمی‌تواند بیشتر از دو سال باشد.")
        return self


class AnalysisRunResponse(BaseModel):
    id: UUID
    company_id: UUID
    period_start: date
    period_end: date
    status: AnalysisStatus
    input_manifest: dict[str, Any]
    rule_set_version: str
    coverage: dict[str, Any]
    created_by: UUID
    started_at: datetime | None
    completed_at: datetime | None
    failure_code: str | None
    failure_message: str | None
    created_at: datetime
    updated_at: datetime


class MetricObservationResponse(BaseModel):
    analysis_run_id: UUID
    metric_code: MetricCode
    period_start: date
    period_end: date
    value_irr: Decimal | None
    value_ratio: Decimal | None
    calculation: dict[str, Any]
    calculated_at: datetime

    @field_serializer("value_irr", "value_ratio")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class MetricsResponse(BaseModel):
    analysis_run: AnalysisRunResponse
    metrics: list[MetricObservationResponse]
