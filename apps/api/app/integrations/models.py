import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class IntegrationProvider(enum.StrEnum):
    SEPIDAR = "sepidar"
    BANK_DIRECT = "bank_direct"
    RAHKARAN = "rahkaran"


class ConnectionStatus(enum.StrEnum):
    CONNECTED = "connected"
    SYNCING = "syncing"
    REAUTH_REQUIRED = "reauth_required"
    ERROR = "error"
    INACTIVE = "inactive"
    DISCONNECTED = "disconnected"


class SyncJobType(enum.StrEnum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    WEBHOOK = "webhook"
    INITIAL = "initial"


class SyncJobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class SyncRecordStatus(enum.StrEnum):
    IMPORTED = "imported"
    SKIPPED_DUPLICATE = "skipped_duplicate"
    REJECTED = "rejected"


class IntegrationConnection(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "integration_connections"
    __table_args__ = (
        UniqueConstraint("company_id", "provider", name="uq_integration_company_provider"),
        Index("ix_integration_connections_company", "company_id", "status"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=ConnectionStatus.INACTIVE, nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    encrypted_credentials_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_sync_record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sync_interval_minutes: Mapped[int] = mapped_column(Integer, default=1440, nullable=False)

    sync_jobs: Mapped[list["IntegrationSyncJob"]] = relationship(
        back_populates="connection", cascade="all, delete-orphan"
    )


class IntegrationSyncJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "integration_sync_jobs"
    __table_args__ = (
        Index("ix_sync_jobs_company_conn", "company_id", "connection_id", "created_at"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    connection_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="CASCADE"), nullable=False
    )
    sync_type: Mapped[str] = mapped_column(String(32), default=SyncJobType.MANUAL, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=SyncJobStatus.QUEUED, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    records_received: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_imported: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_rejected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    watermark_cursor: Mapped[str | None] = mapped_column(String(128), nullable=True)
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    connection: Mapped[IntegrationConnection] = relationship(back_populates="sync_jobs")
    records: Mapped[list["IntegrationSyncRecord"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class IntegrationSyncRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "integration_sync_records"
    __table_args__ = (
        UniqueConstraint("company_id", "connection_id", "source_fingerprint", name="uq_sync_record_idempotency"),
        Index("ix_sync_records_job", "job_id", "status"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    connection_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("integration_sync_jobs.id", ondelete="CASCADE"), nullable=False
    )
    source_entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(128), nullable=False)
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical_record_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=SyncRecordStatus.IMPORTED, nullable=False)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    job: Mapped[IntegrationSyncJob] = relationship(back_populates="records")
