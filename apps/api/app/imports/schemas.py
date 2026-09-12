from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.imports.models import FileScanStatus, ImportStatus, SourceKind


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
    created_at: datetime


class UploadPolicyResponse(BaseModel):
    allowed_extensions: list[str]
    maximum_size_bytes: int
    malware_scan_required: bool
    macro_enabled_files_allowed: bool
