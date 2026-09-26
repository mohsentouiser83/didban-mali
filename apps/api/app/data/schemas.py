from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.imports.models import IssueSeverity, SourceKind


class SourceCardHealth(BaseModel):
    source_kind: SourceKind
    source_title: str
    status: str  # "ready" | "needs_update" | "warning" | "error" | "no_data" | "processing"
    status_label: str
    last_successful_import: datetime | None = None
    accepted_records: int = 0
    rejected_records: int = 0
    warnings_count: int = 0
    estimated_coverage_pct: int = 0
    freshness_days: int | None = None
    freshness_label: str
    usable_for_calculations: bool = False
    primary_cta_label: str
    primary_cta_action: str
    summary_notes: list[str] = Field(default_factory=list)


class ActionableHealthIssue(BaseModel):
    id: str
    severity: str  # "blocking" | "error" | "warning" | "info"
    title: str
    description: str
    action_label: str
    action_tab: str  # "upload" | "quality" | "history" | "overview"
    batch_id: UUID | None = None


class DataOverviewResponse(BaseModel):
    company_id: UUID
    sources: list[SourceCardHealth]
    health_issues: list[ActionableHealthIssue]
    total_accepted_records: int
    total_rejected_records: int
    total_warnings: int
    overall_health_score: int


class QualityIssueGroup(BaseModel):
    code: str
    title: str
    severity: IssueSeverity
    count: int
    remedy: str | None = None
    sample_row_numbers: list[int] = Field(default_factory=list)
    affected_batches_count: int = 0


class QuarantinedRowItem(BaseModel):
    row_id: UUID
    batch_id: UUID
    source_filename: str
    source_kind: SourceKind
    sheet: str
    row_number: int
    raw_data: dict[str, Any]
    issues: list[dict[str, Any]]


class DataQualityResponse(BaseModel):
    company_id: UUID
    total_records: int
    accepted_records: int
    warning_records: int
    rejected_records: int
    health_score_pct: int
    groups: list[QualityIssueGroup]
    quarantined_rows: list[QuarantinedRowItem]


class RecordLineageResponse(BaseModel):
    company_id: UUID
    record_id: UUID
    entity_type: str
    import_id: UUID
    source_file_id: UUID
    source_filename: str
    source_file_sha256: str
    source_row_number: int
    sheet_name: str
    raw_values: dict[str, Any]
    mapping_version: int
    mapping_summary: dict[str, str]
    transforms_applied: dict[str, list[str]]
    normalized_fields: dict[str, Any]
    imported_at: datetime


class MappingTemplateResponse(BaseModel):
    id: UUID
    company_id: UUID
    source_kind: SourceKind
    name: str
    column_fingerprint: str
    mapping: dict[str, str]
    transforms: dict[str, list[str]]
    currency_unit: str
    calendar: str
    header_row: int | None = None
    created_at: datetime
    created_by: UUID
