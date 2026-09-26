from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class IntegrationConnectionCreate(BaseModel):
    provider: str = Field(..., description="sepidar, bank_direct, rahkaran")
    name: str = Field(..., min_length=2, max_length=160)
    config: dict[str, Any] = Field(default_factory=dict)
    credentials: dict[str, Any] = Field(default_factory=dict)
    sync_interval_minutes: int = Field(default=1440, ge=60, le=10080)


class IntegrationConnectionUpdate(BaseModel):
    name: str | None = None
    config: dict[str, Any] | None = None
    credentials: dict[str, Any] | None = None
    sync_interval_minutes: int | None = None
    status: str | None = None


class IntegrationConnectionResponse(BaseModel):
    id: UUID
    company_id: UUID
    provider: str
    name: str
    status: str
    config: dict[str, Any]
    last_sync_at: datetime | None
    next_sync_at: datetime | None
    last_error_message: str | None
    last_sync_record_count: int
    sync_interval_minutes: int
    created_at: datetime
    updated_at: datetime


class IntegrationSyncJobResponse(BaseModel):
    id: UUID
    company_id: UUID
    connection_id: UUID
    sync_type: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    records_received: int
    records_imported: int
    records_rejected: int
    watermark_cursor: str | None
    summary: dict[str, Any]
    error_message: str | None
    created_at: datetime


class ConnectionTestResult(BaseModel):
    success: bool
    status: str
    message_fa: str
    latency_ms: int
    details: dict[str, Any] = Field(default_factory=dict)


class TriggerSyncRequest(BaseModel):
    sync_type: str = Field(default="manual")
    force_full_sync: bool = False
