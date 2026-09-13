import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
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
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class SourceKind(enum.StrEnum):
    ACCOUNTING = "accounting"
    BANK = "bank"
    SALES = "sales"


class FileScanStatus(enum.StrEnum):
    PENDING = "pending"
    CLEAN = "clean"
    INFECTED = "infected"
    FAILED = "failed"


class ImportStatus(enum.StrEnum):
    UPLOADED = "uploaded"
    INSPECTING = "inspecting"
    AWAITING_MAPPING = "awaiting_mapping"
    VALIDATING = "validating"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_LIMITED = "completed_limited"
    FAILED = "failed"
    CANCELLED = "cancelled"


class IssueSeverity(enum.StrEnum):
    BLOCKING = "blocking"
    ERROR = "error"
    WARNING = "warning"


class DataSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "data_sources"
    __table_args__ = (
        Index("ix_data_sources_company_kind", "company_id", "kind"),
        Index("ix_data_sources_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[SourceKind] = mapped_column(
        Enum(SourceKind, name="source_kind", native_enum=False), nullable=False
    )
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )


class SourceFile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "source_files"
    __table_args__ = (
        Index("ix_source_files_company_created", "company_id", "created_at"),
        Index("ix_source_files_company_sha256", "company_id", "sha256"),
        Index("ix_source_files_uploaded_by", "uploaded_by"),
        Index("ix_source_files_duplicate_of_id", "duplicate_of_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    object_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(160), nullable=False)
    extension: Mapped[str] = mapped_column(String(12), nullable=False)
    scan_status: Mapped[FileScanStatus] = mapped_column(
        Enum(FileScanStatus, name="file_scan_status", native_enum=False),
        default=FileScanStatus.PENDING,
        nullable=False,
    )
    scan_result: Mapped[str | None] = mapped_column(String(255))
    uploaded_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    duplicate_of_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("source_files.id", ondelete="SET NULL")
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)


class ImportBatch(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "import_batches"
    __table_args__ = (
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_import_progress_range"),
        UniqueConstraint("file_id", name="uq_import_batches_file"),
        UniqueConstraint("id", "company_id", name="uq_import_batch_company"),
        UniqueConstraint("company_id", "idempotency_key", name="uq_import_company_idempotency"),
        Index("ix_import_batches_company_created", "company_id", "created_at"),
        Index("ix_import_batches_company_status", "company_id", "status"),
        Index("ix_import_batches_source_id", "source_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    source_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    file_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("source_files.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, name="import_status", native_enum=False),
        default=ImportStatus.UPLOADED,
        nullable=False,
    )
    stage: Mapped[str] = mapped_column(String(80), default="upload_received", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    sheet_name: Mapped[str | None] = mapped_column(String(160))
    header_row: Mapped[int | None] = mapped_column(Integer)
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accepted_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    coverage_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    failure_code: Mapped[str | None] = mapped_column(String(80))
    failure_message: Mapped[str | None] = mapped_column(Text)
    retryable: Mapped[bool] = mapped_column(default=False, nullable=False)


class MappingProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "mapping_profiles"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "source_kind",
            "column_fingerprint",
            "name",
            name="uq_mapping_profile_scope",
        ),
        UniqueConstraint("id", "company_id", name="uq_mapping_profile_company"),
        Index("ix_mapping_profiles_company_kind", "company_id", "source_kind"),
        Index("ix_mapping_profiles_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    source_kind: Mapped[SourceKind] = mapped_column(
        Enum(SourceKind, name="mapping_source_kind", native_enum=False), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    column_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    mapping_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    transforms_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )


class MappingVersion(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "mapping_versions"
    __table_args__ = (
        UniqueConstraint("import_batch_id", name="uq_mapping_version_batch"),
        ForeignKeyConstraint(
            ["import_batch_id", "company_id"],
            ["import_batches.id", "import_batches.company_id"],
            ondelete="CASCADE",
        ),
        Index("ix_mapping_versions_company_created", "company_id", "confirmed_at"),
        Index("ix_mapping_versions_profile_id", "profile_id"),
        Index("ix_mapping_versions_confirmed_by", "confirmed_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    profile_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("mapping_profiles.id", ondelete="SET NULL")
    )
    import_batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    mapping_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    transforms_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    confirmed_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SourceRow(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "source_rows"
    __table_args__ = (
        UniqueConstraint("import_batch_id", "sheet", "row_number", name="uq_source_row_location"),
        UniqueConstraint("id", "company_id", name="uq_source_row_company"),
        ForeignKeyConstraint(
            ["import_batch_id", "company_id"],
            ["import_batches.id", "import_batches.company_id"],
            ondelete="CASCADE",
        ),
        Index("ix_source_rows_company_batch", "company_id", "import_batch_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    import_batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    sheet: Mapped[str] = mapped_column(String(160), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    raw_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class ValidationIssue(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "validation_issues"
    __table_args__ = (
        ForeignKeyConstraint(
            ["import_batch_id", "company_id"],
            ["import_batches.id", "import_batches.company_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="CASCADE",
        ),
        Index("ix_validation_issues_company_batch", "company_id", "import_batch_id"),
        Index("ix_validation_issues_batch_severity", "import_batch_id", "severity"),
        Index("ix_validation_issues_source_row_id", "source_row_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    import_batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_row_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    field: Mapped[str | None] = mapped_column(String(80))
    severity: Mapped[IssueSeverity] = mapped_column(
        Enum(IssueSeverity, name="issue_severity", native_enum=False), nullable=False
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    raw_value: Mapped[str | None] = mapped_column(Text)
    remedy: Mapped[str | None] = mapped_column(Text)
