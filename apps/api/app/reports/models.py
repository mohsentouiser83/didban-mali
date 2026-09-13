import enum
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import UUIDPrimaryKeyMixin


class ReportStatus(enum.StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ReportSnapshot(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "report_snapshots"
    __table_args__ = (
        ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint("period_start <= period_end", name="ck_report_snapshot_period"),
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_report_progress"),
        CheckConstraint(
            "(status = 'COMPLETED' AND object_key IS NOT NULL AND pdf_sha256 IS NOT NULL "
            "AND pdf_size_bytes > 0 AND completed_at IS NOT NULL) OR "
            "(status <> 'COMPLETED' AND object_key IS NULL AND pdf_sha256 IS NULL "
            "AND pdf_size_bytes IS NULL)",
            name="ck_report_completed_artifact",
        ),
        CheckConstraint(
            "advisor_note IS NULL OR (char_length(trim(advisor_note)) > 0 "
            "AND char_length(advisor_note) <= 4000)",
            name="ck_report_advisor_note_length",
        ),
        UniqueConstraint("id", "company_id", name="uq_report_snapshot_company"),
        UniqueConstraint("company_id", "idempotency_key", name="uq_report_company_idempotency"),
        Index("ix_report_snapshots_company_created", "company_id", "created_at", "id"),
        Index("ix_report_snapshots_company_analysis", "company_id", "analysis_run_id"),
        Index("ix_report_snapshots_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    analysis_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    title_fa: Mapped[str] = mapped_column(String(200), nullable=False)
    advisor_note: Mapped[str | None] = mapped_column(Text)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="report_status", native_enum=False), nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stage: Mapped[str] = mapped_column(String(80), nullable=False)
    object_key: Mapped[str | None] = mapped_column(String(500), unique=True)
    pdf_sha256: Mapped[str | None] = mapped_column(String(64))
    pdf_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_code: Mapped[str | None] = mapped_column(String(80))
    failure_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
