from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer, model_validator

from app.findings.models import (
    AssertionStatus,
    EvidenceType,
    FindingCategory,
    FindingCode,
    FindingKind,
    FindingRunStatus,
    FindingSeverity,
    FindingWorkflowStatus,
    PriorityBand,
)


class PriorityConfigRequest(BaseModel):
    model_version: Literal["priority-v1"] = "priority-v1"
    impact_weight: Decimal = Field(default=Decimal("0.40"), ge=0, le=1)
    materiality_weight: Decimal = Field(default=Decimal("0.25"), ge=0, le=1)
    confidence_weight: Decimal = Field(default=Decimal("0.20"), ge=0, le=1)
    urgency_weight: Decimal = Field(default=Decimal("0.15"), ge=0, le=1)
    critical_threshold: Decimal = Field(default=Decimal("80"), ge=0, le=100)
    high_threshold: Decimal = Field(default=Decimal("60"), ge=0, le=100)
    medium_threshold: Decimal = Field(default=Decimal("35"), ge=0, le=100)
    materiality_amount_irr: Decimal = Field(default=Decimal("100000000"), gt=0)
    revenue_ratio_full_score: Decimal = Field(default=Decimal("0.20"), gt=0, le=1)
    critical_minimum_confidence: Decimal = Field(default=Decimal("70"), ge=0, le=100)

    @model_validator(mode="after")
    def validate_priority_config(self) -> "PriorityConfigRequest":
        total = (
            self.impact_weight
            + self.materiality_weight
            + self.confidence_weight
            + self.urgency_weight
        )
        if total != Decimal("1"):
            raise ValueError("مجموع وزن‌های اولویت باید دقیقاً برابر ۱ باشد.")
        if not self.critical_threshold > self.high_threshold > self.medium_threshold:
            raise ValueError("مرزهای اولویت باید به‌ترتیب بحرانی، بالا و متوسط نزولی باشند.")
        return self


class FindingGenerationRequest(BaseModel):
    reconciliation_run_id: UUID | None = None
    config_version: Literal["finding-rules-v1"] = "finding-rules-v1"
    trend_ratio: Decimal = Field(default=Decimal("0.10"), ge=0, le=1)
    minimum_amount_irr: Decimal = Field(default=Decimal("1000000"), ge=0)
    priority: PriorityConfigRequest = Field(default_factory=PriorityConfigRequest)


class FindingGenerationRunResponse(BaseModel):
    id: UUID
    company_id: UUID
    analysis_run_id: UUID
    reconciliation_run_id: UUID | None
    status: FindingRunStatus
    config_version: str
    config: dict[str, Any]
    coverage: dict[str, Any]
    counts: dict[str, Any]
    created_by: UUID
    started_at: datetime | None
    completed_at: datetime | None
    failure_code: str | None
    failure_message: str | None
    created_at: datetime
    updated_at: datetime


class FindingResponse(BaseModel):
    id: UUID
    analysis_run_id: UUID
    generation_run_id: UUID
    reconciliation_match_id: UUID | None
    finding_code: FindingCode
    kind: FindingKind
    category: FindingCategory
    title_fa: str
    summary_fa: str
    assertion_status: AssertionStatus
    severity: FindingSeverity
    priority_band: PriorityBand
    priority_score: Decimal
    priority_explanation: dict[str, Any]
    priority_model_version: str
    priority_config: dict[str, Any]
    confidence_score: Decimal
    confidence_basis: dict[str, Any]
    affected_amount_irr: Decimal | None
    affected_ratio: Decimal | None
    period_start: date
    period_end: date
    reason_code: str
    reason_parameters: dict[str, Any]
    calculation: dict[str, Any]
    rule_version: str
    workflow_status: FindingWorkflowStatus
    created_at: datetime
    updated_at: datetime

    @field_serializer("priority_score", "confidence_score", "affected_amount_irr", "affected_ratio")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class FindingsResponse(BaseModel):
    items: list[FindingResponse]
    next_cursor: UUID | None


class EvidenceItemResponse(BaseModel):
    id: UUID
    ordinal: int
    evidence_type: EvidenceType
    claim_code: str
    source_entity_type: str | None
    source_entity_id: UUID | None
    source_row_id: UUID | None
    source_file_id: UUID | None
    field_snapshot: dict[str, Any]
    calculation: dict[str, Any]
    rule_code: str | None
    rule_version: str
    created_at: datetime


class EvidenceItemsResponse(BaseModel):
    items: list[EvidenceItemResponse]
