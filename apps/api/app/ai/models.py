import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
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
from app.core.models import UUIDPrimaryKeyMixin


class AiPurpose(enum.StrEnum):
    FINDING_EXPLANATION = "finding_explanation"
    SEMANTIC_MATCHING = "semantic_matching"


class AiInvocationStatus(enum.StrEnum):
    DISABLED = "disabled"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INVALID_OUTPUT = "invalid_output"


class AiCompanySettingRevision(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_company_setting_revisions"
    __table_args__ = (
        UniqueConstraint("company_id", "idempotency_key", name="uq_ai_setting_company_idempotency"),
        Index("ix_ai_setting_company_created", "company_id", "created_at", "id"),
        Index("ix_ai_setting_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    explanations_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    semantic_matching_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AiInvocation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_invocations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["source_reconciliation_run_id", "company_id"],
            ["reconciliation_runs.id", "reconciliation_runs.company_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint("latency_ms >= 0", name="ck_ai_invocation_latency"),
        CheckConstraint(
            "(purpose = 'FINDING_EXPLANATION' AND source_finding_id IS NOT NULL "
            "AND source_reconciliation_run_id IS NULL) OR "
            "(purpose = 'SEMANTIC_MATCHING' AND source_finding_id IS NULL "
            "AND source_reconciliation_run_id IS NOT NULL)",
            name="ck_ai_invocation_source",
        ),
        UniqueConstraint(
            "company_id", "idempotency_key", name="uq_ai_invocation_company_idempotency"
        ),
        UniqueConstraint("id", "company_id", name="uq_ai_invocation_company"),
        Index("ix_ai_invocation_company_created", "company_id", "created_at", "id"),
        Index("ix_ai_invocation_finding", "source_finding_id"),
        Index("ix_ai_invocation_reconciliation", "source_reconciliation_run_id"),
        Index("ix_ai_invocation_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    purpose: Mapped[AiPurpose] = mapped_column(
        Enum(AiPurpose, name="ai_purpose", native_enum=False), nullable=False
    )
    status: Mapped[AiInvocationStatus] = mapped_column(
        Enum(AiInvocationStatus, name="ai_invocation_status", native_enum=False), nullable=False
    )
    source_finding_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    source_reconciliation_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(80), nullable=False)
    input_manifest_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    allowed_numbers_json: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    evidence_ids_json: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    output_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    failure_code: Mapped[str | None] = mapped_column(String(80))
    failure_message: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
