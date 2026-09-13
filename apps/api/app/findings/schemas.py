from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer

from app.findings.models import (
    AssertionStatus,
    FindingCategory,
    FindingCode,
    FindingKind,
    FindingRunStatus,
    FindingSeverity,
    FindingWorkflowStatus,
)


class FindingGenerationRequest(BaseModel):
    reconciliation_run_id: UUID | None = None
    config_version: Literal["finding-rules-v1"] = "finding-rules-v1"
    trend_ratio: Decimal = Field(default=Decimal("0.10"), ge=0, le=1)
    minimum_amount_irr: Decimal = Field(default=Decimal("1000000"), ge=0)


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

    @field_serializer("confidence_score", "affected_amount_irr", "affected_ratio")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class FindingsResponse(BaseModel):
    items: list[FindingResponse]
    next_cursor: UUID | None
