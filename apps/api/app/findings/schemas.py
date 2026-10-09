from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer, model_validator

from app.findings.models import EvidenceType, FindingRunStatus


class DetectFindingsRequest(BaseModel):
    period_start: date | None = None
    period_end: date | None = None
    calculation_run_id: UUID | None = None
    reconciliation_run_id: UUID | None = None
    trigger_type: Literal["manual", "post_calculation", "post_reconciliation"] = "manual"


class AssignFindingsRequest(BaseModel):
    assigned_to_user_id: UUID
    due_date: date | None = None
    note: str | None = None


class ResolveFindingsRequest(BaseModel):
    resolution_type: Literal[
        "reconciled",
        "accounting_adjusted",
        "bank_clarified",
        "written_off",
        "false_positive",
        "policy_exception",
    ]
    resolution_note: str = Field(min_length=5, max_length=2000)


class VerifyFindingsRequest(BaseModel):
    verification_note: str | None = None


class ReopenFindingsRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=2000)


class DismissFindingsRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=2000)


class AddCommentRequest(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)


class SuppressFindingsRequest(BaseModel):
    rule_code: str
    entity_type: str
    entity_id: UUID
    reason: str = Field(min_length=5, max_length=1000)
    expires_at: datetime | None = None


class FindingEvidenceResponse(BaseModel):
    id: UUID
    ordinal: int
    evidence_type: str
    title_fa: str
    description_fa: str
    payload: dict[str, Any]
    created_at: datetime


class FindingActivityResponse(BaseModel):
    id: UUID
    user_id: UUID | None
    user_name: str | None = None
    action_type: str
    old_state: str | None
    new_state: str | None
    note: str | None
    metadata: dict[str, Any]
    created_at: datetime


class FindingListItemResponse(BaseModel):
    id: UUID
    fingerprint: str
    rule_code: str
    category: str
    severity: str
    status: str
    title_fa: str
    summary_fa: str
    financial_impact_irr: Decimal | None
    due_date: date | None
    assigned_to_user_id: UUID | None
    assigned_to_name: str | None = None
    resolution_type: str | None
    is_suppressed: bool
    created_at: datetime
    updated_at: datetime

    @field_serializer("financial_impact_irr")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class FindingDetailResponse(BaseModel):
    id: UUID
    fingerprint: str
    analysis_run_id: UUID | None = None
    generation_run_id: UUID | None = None
    finding_code: str
    kind: str
    assertion_status: str
    priority_band: str
    priority_score: Decimal
    priority_explanation: dict[str, Any]
    priority_model_version: str
    priority_config: dict[str, Any]
    confidence_score: Decimal
    confidence_basis: dict[str, Any]
    affected_amount_irr: Decimal | None
    affected_ratio: Decimal | None
    reason_code: str
    reason_parameters: dict[str, Any]
    calculation: dict[str, Any]
    rule_version: str
    workflow_status: str
    rule_code: str
    category: str
    severity: str
    status: str
    title_fa: str
    summary_fa: str
    financial_impact_irr: Decimal | None
    due_date: date | None
    assigned_to_user_id: UUID | None
    assigned_to_name: str | None = None
    source_entity_type: str | None
    source_entity_id: UUID | None
    reconciliation_match_id: UUID | None
    calculation_run_id: UUID | None
    resolution_type: str | None
    resolution_note: str | None
    resolved_by_user_id: UUID | None
    resolved_by_name: str | None = None
    resolved_at: datetime | None
    verified_by_user_id: UUID | None
    verified_by_name: str | None = None
    verified_at: datetime | None
    verification_note: str | None
    is_suppressed: bool
    period_start: date
    period_end: date
    evidence: list[FindingEvidenceResponse] = []
    activities: list[FindingActivityResponse] = []
    created_at: datetime
    updated_at: datetime

    @field_serializer("financial_impact_irr", "priority_score", "confidence_score", "affected_amount_irr", "affected_ratio")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class FindingDetectionRunResponse(BaseModel):
    id: UUID
    company_id: UUID
    trigger_type: str
    status: str
    period_start: date | None
    period_end: date | None
    findings_detected: int
    findings_created: int
    findings_updated: int
    findings_suppressed: int
    summary: dict[str, Any]
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


# Compatibility schemas for old tests / endpoints
class FindingResponse(BaseModel):
    status: str = "new"
    assigned_to_name: str | None = None
    due_date: date | None = None
    id: UUID
    analysis_run_id: UUID | None = None
    generation_run_id: UUID | None = None
    reconciliation_match_id: UUID | None = None
    finding_code: str
    kind: str
    category: str
    title_fa: str
    summary_fa: str
    assertion_status: str
    severity: str
    priority_band: str
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
    workflow_status: str
    created_at: datetime
    updated_at: datetime

    @field_serializer("priority_score", "confidence_score", "affected_amount_irr", "affected_ratio")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class FindingsResponse(BaseModel):
    items: list[FindingResponse]
    next_cursor: UUID | None = None
    total_count: int = 0


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


class InAppAlertItemResponse(BaseModel):
    id: UUID
    company_id: UUID
    user_id: UUID | None
    finding_id: UUID | None
    channel: str
    title_fa: str
    body_fa: str
    is_read: bool
    created_at: datetime


class InAppAlertsListResponse(BaseModel):
    items: list[InAppAlertItemResponse]
    unread_count: int

