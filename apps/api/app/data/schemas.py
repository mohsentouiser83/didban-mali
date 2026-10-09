from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


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
