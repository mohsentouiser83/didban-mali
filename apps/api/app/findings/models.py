import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class FindingCode(enum.StrEnum):
    POTENTIAL_MISSING_TRANSACTION = "potential_missing_transaction"
    DUPLICATE_TRANSACTION = "duplicate_transaction"
    AMOUNT_MISMATCH = "amount_mismatch"
    DATE_MISMATCH = "date_mismatch"
    REVENUE_DROP = "revenue_drop"
    PROFIT_DROP = "profit_drop"
    EXPENSE_INCREASE = "expense_increase"
    RECEIVABLES_INCREASE = "receivables_increase"


class FindingKind(enum.StrEnum):
    RISK = "risk"
    ANOMALY = "anomaly"
    DISCREPANCY = "discrepancy"
    INSIGHT = "insight"


class FindingCategory(enum.StrEnum):
    RECONCILIATION = "reconciliation"
    FINANCIAL_ANALYSIS = "financial_analysis"


class AssertionStatus(enum.StrEnum):
    DETERMINISTIC = "deterministic"
    HYPOTHESIS = "hypothesis"


class FindingSeverity(enum.StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class FindingWorkflowStatus(enum.StrEnum):
    NEEDS_REVIEW = "needs_review"
    CONFIRMED = "confirmed"
    DISMISSED = "dismissed"
    FOLLOW_UP = "follow_up"
    RESOLVED = "resolved"


class FindingRunStatus(enum.StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_LIMITED = "completed_limited"
    FAILED = "failed"


class FindingGenerationRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "finding_generation_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["reconciliation_run_id", "company_id"],
            ["reconciliation_runs.id", "reconciliation_runs.company_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "company_id", name="uq_finding_generation_run_company"),
        UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_finding_generation_company_idempotency",
        ),
        Index("ix_finding_generation_company_status", "company_id", "status"),
        Index("ix_finding_generation_analysis", "analysis_run_id"),
        Index("ix_finding_generation_reconciliation", "reconciliation_run_id"),
        Index("ix_finding_generation_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    analysis_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    reconciliation_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    status: Mapped[FindingRunStatus] = mapped_column(
        Enum(FindingRunStatus, name="finding_run_status", native_enum=False), nullable=False
    )
    config_version: Mapped[str] = mapped_column(String(80), nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    coverage_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    counts_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_code: Mapped[str | None] = mapped_column(String(80))
    failure_message: Mapped[str | None] = mapped_column(Text)


class Finding(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "findings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["generation_run_id", "company_id"],
            ["finding_generation_runs.id", "finding_generation_runs.company_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["reconciliation_match_id", "company_id"],
            ["reconciliation_matches.id", "reconciliation_matches.company_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "confidence_score >= 0 AND confidence_score <= 100",
            name="ck_finding_confidence_range",
        ),
        UniqueConstraint("analysis_run_id", "fingerprint", name="uq_finding_run_fingerprint"),
        Index(
            "ix_findings_company_period",
            "company_id",
            "period_start",
            "period_end",
        ),
        Index("ix_findings_company_code", "company_id", "finding_code"),
        Index("ix_findings_company_workflow", "company_id", "workflow_status"),
        Index("ix_findings_generation_run", "generation_run_id"),
        Index("ix_findings_reconciliation_match", "reconciliation_match_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    analysis_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    generation_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    reconciliation_match_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    finding_code: Mapped[FindingCode] = mapped_column(
        Enum(FindingCode, name="finding_code", native_enum=False), nullable=False
    )
    kind: Mapped[FindingKind] = mapped_column(
        Enum(FindingKind, name="finding_kind", native_enum=False), nullable=False
    )
    category: Mapped[FindingCategory] = mapped_column(
        Enum(FindingCategory, name="finding_category", native_enum=False), nullable=False
    )
    title_fa: Mapped[str] = mapped_column(String(240), nullable=False)
    summary_fa: Mapped[str] = mapped_column(Text, nullable=False)
    assertion_status: Mapped[AssertionStatus] = mapped_column(
        Enum(AssertionStatus, name="assertion_status", native_enum=False), nullable=False
    )
    severity: Mapped[FindingSeverity] = mapped_column(
        Enum(FindingSeverity, name="finding_severity", native_enum=False), nullable=False
    )
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    confidence_basis_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    affected_amount_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0))
    affected_ratio: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    reason_code: Mapped[str] = mapped_column(String(100), nullable=False)
    reason_parameters_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    calculation_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    rule_version: Mapped[str] = mapped_column(String(80), nullable=False)
    workflow_status: Mapped[FindingWorkflowStatus] = mapped_column(
        Enum(FindingWorkflowStatus, name="finding_workflow_status", native_enum=False),
        nullable=False,
    )
