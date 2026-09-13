from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.imports.models import FileScanStatus, ImportStatus, IssueSeverity, SourceKind


class ImportBatchResponse(BaseModel):
    id: UUID
    company_id: UUID
    source_kind: SourceKind
    source_label: str
    status: ImportStatus
    stage: str
    progress: int
    original_name: str
    size_bytes: int
    mime_type: str
    sha256: str
    scan_status: FileScanStatus
    scan_result: str | None
    duplicate_detected: bool
    failure_code: str | None
    failure_message: str | None
    retryable: bool
    sheet_name: str | None = None
    header_row: int | None = None
    row_count: int = 0
    accepted_count: int = 0
    rejected_count: int = 0
    coverage: dict[str, object] = Field(default_factory=dict)
    created_at: datetime


class UploadPolicyResponse(BaseModel):
    allowed_extensions: list[str]
    maximum_size_bytes: int
    malware_scan_required: bool
    macro_enabled_files_allowed: bool


TransformName = Literal[
    "trim",
    "normalize_digits",
    "strip_thousands",
    "parse_date",
    "toman_to_rial",
    "withdrawal_negative",
]


class MappingRequest(BaseModel):
    sheet_name: str | None = Field(default=None, max_length=160)
    header_row: int = Field(default=1, ge=1, le=100)
    mapping: dict[str, str]
    transforms: dict[str, list[TransformName]] = Field(default_factory=dict)
    currency_unit: Literal["rial", "toman"]
    calendar: Literal["jalali", "gregorian"]
    profile_name: str | None = Field(default=None, min_length=2, max_length=160)

    @field_validator("mapping")
    @classmethod
    def mapping_must_be_one_to_one(cls, value: dict[str, str]) -> dict[str, str]:
        cleaned = {target.strip(): source.strip() for target, source in value.items()}
        if not cleaned or any(not target or not source for target, source in cleaned.items()):
            raise ValueError("نگاشت ستون نمی‌تواند خالی باشد.")
        if len(set(cleaned.values())) != len(cleaned):
            raise ValueError("هر ستون منبع فقط به یک فیلد قابل نگاشت است.")
        return cleaned


class MappingResponse(BaseModel):
    id: UUID
    import_batch_id: UUID
    version: int
    mapping: dict[str, str]
    transforms: dict[str, list[str]]
    currency_unit: str
    calendar: str
    sheet_name: str
    header_row: int
    column_fingerprint: str
    confirmed_at: datetime


class MappingSuggestion(BaseModel):
    target_field: str
    source_column: str
    confidence: int
    reason: str


class PreviewIssue(BaseModel):
    row_number: int | None
    field: str | None
    severity: IssueSeverity
    code: str
    message: str
    raw_value: str | None
    remedy: str | None


class PreviewRow(BaseModel):
    row_number: int
    raw: dict[str, object]
    transformed: dict[str, object] | None = None
    issues: list[PreviewIssue] = Field(default_factory=list)


class ImportPreviewResponse(BaseModel):
    sheets: list[str]
    selected_sheet: str
    header_row: int
    columns: list[str]
    column_fingerprint: str
    rows: list[PreviewRow]
    suggestions: list[MappingSuggestion]
    required_fields: list[str]
    alternative_required_fields: list[list[str]] = Field(default_factory=list)
    mapping: MappingResponse | None = None
    matching_profile_id: UUID | None = None


class ValidationIssueResponse(BaseModel):
    id: UUID
    row_number: int | None
    field: str | None
    severity: IssueSeverity
    code: str
    message: str
    raw_value: str | None
    remedy: str | None


class IssuesPage(BaseModel):
    items: list[ValidationIssueResponse]
    total: int
    limit: int
    offset: int


class ValidationResponse(BaseModel):
    batch: ImportBatchResponse
    issue_counts: dict[str, int]
    coverage: dict[str, object]
