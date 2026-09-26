import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, synonym

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
    CASH_AND_BANK = "cash_and_bank"
    REVENUE_AND_AR = "revenue_and_ar"
    LIQUIDITY_AND_RUNWAY = "liquidity_and_runway"


class AssertionStatus(enum.StrEnum):
    DETERMINISTIC = "deterministic"
    HYPOTHESIS = "hypothesis"


class FindingSeverity(enum.StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class PriorityBand(enum.StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class FindingStatus(enum.StrEnum):
    NEW = "new"
    OPEN = "new"
    TRIAGED = "triaged"
    IN_PROGRESS = "in_progress"
    INVESTIGATING = "in_progress"
    RESOLVED = "resolved"
    VERIFIED = "verified"
    DISMISSED = "dismissed"
    REOPENED = "reopened"


class ResolutionType(enum.StrEnum):
    RECONCILED = "reconciled"
    ACCOUNTING_ADJUSTED = "accounting_adjusted"
    BANK_CLARIFIED = "bank_clarified"
    WRITTEN_OFF = "written_off"
    FALSE_POSITIVE = "false_positive"
    POLICY_EXCEPTION = "policy_exception"


class EvidenceType(enum.StrEnum):
    SOURCE_RECORD = "source_record"
    COMPARISON = "comparison"
    CALCULATION = "calculation"
    RULE = "rule"
    COVERAGE = "coverage"
    CALCULATION_METRIC = "calculation_metric"
    RECONCILIATION_DETAIL = "reconciliation_detail"
    POLICY_THRESHOLD = "policy_threshold"


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


class FindingDetectionRun(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finding_detection_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["calculation_run_id", "company_id"],
            ["calculation_runs.id", "calculation_runs.company_id"],
            ondelete="SET NULL",
        ),
        ForeignKeyConstraint(
            ["reconciliation_run_id", "company_id"],
            ["reconciliation_runs.id", "reconciliation_runs.company_id"],
            ondelete="SET NULL",
        ),
        UniqueConstraint("id", "company_id", name="uq_finding_detection_run_company"),
        Index("ix_finding_detection_company_status", "company_id", "status"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    trigger_type: Mapped[str] = mapped_column(String(40), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    calculation_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    reconciliation_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    findings_detected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    findings_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    findings_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    findings_suppressed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Finding(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "findings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["reconciliation_match_id", "company_id"],
            ["reconciliation_matches.id", "reconciliation_matches.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["calculation_run_id", "company_id"],
            ["calculation_runs.id", "calculation_runs.company_id"],
            ondelete="SET NULL",
        ),
        UniqueConstraint("id", "company_id", name="uq_finding_company"),
        Index("ix_findings_company_status", "company_id", "status"),
        Index("ix_findings_company_fingerprint", "company_id", "fingerprint", unique=True),
        Index("ix_findings_company_assigned", "company_id", "assigned_to_user_id"),
        Index("ix_findings_company_period", "company_id", "period_start", "period_end"),
        Index("ix_findings_company_code", "company_id", "finding_code"),
        Index("ix_findings_company_workflow", "company_id", "workflow_status"),
        Index("ix_findings_company_priority", "company_id", "priority_band", "priority_score", "id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    analysis_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    generation_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    calculation_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    reconciliation_match_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)
    finding_code: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[FindingKind] = mapped_column(
        Enum(FindingKind, name="finding_kind", native_enum=False), default=FindingKind.RISK, nullable=False
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    title_fa: Mapped[str] = mapped_column(String(255), nullable=False)
    summary_fa: Mapped[str] = mapped_column(Text, nullable=False)
    assertion_status: Mapped[AssertionStatus] = mapped_column(
        Enum(AssertionStatus, name="assertion_status", native_enum=False), default=AssertionStatus.DETERMINISTIC, nullable=False
    )
    severity: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    priority_band: Mapped[PriorityBand] = mapped_column(
        Enum(PriorityBand, name="priority_band", native_enum=False), default=PriorityBand.MEDIUM, nullable=False
    )
    priority_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("50.0"), nullable=False)
    priority_explanation_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    priority_model_version: Mapped[str] = mapped_column(String(80), default="1.0", nullable=False)
    priority_config_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("100.0"), nullable=False)
    confidence_basis_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    affected_amount_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0), nullable=True)
    financial_impact_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0), nullable=True)
    affected_ratio: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    reason_code: Mapped[str] = mapped_column(String(100), default="rule", nullable=False)
    reason_parameters_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    calculation_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    rule_version: Mapped[str] = mapped_column(String(80), default="1.0", nullable=False)
    workflow_status: Mapped[FindingWorkflowStatus] = mapped_column(
        Enum(FindingWorkflowStatus, name="finding_workflow_status", native_enum=False),
        default=FindingWorkflowStatus.NEEDS_REVIEW,
        nullable=False,
    )

    # Phase 3 Action & Workflow fields
    status: Mapped[str] = mapped_column(String(32), default="new", nullable=False)
    assigned_to_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    resolution_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_suppressed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rule_code = synonym("finding_code")
    action_owner_id = synonym("assigned_to_user_id")
    resolved_by = synonym("resolved_by_user_id")
    verified_by = synonym("verified_by_user_id")
    description_fa = synonym("summary_fa")
    impact_irr = synonym("financial_impact_irr")


class FindingEvidence(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finding_evidence"
    __table_args__ = (
        ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("id", "company_id", name="uq_finding_evidence_company"),
        Index("ix_finding_evidence_finding", "finding_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title_fa: Mapped[str] = mapped_column(String(255), nullable=False)
    description_fa: Mapped[str] = mapped_column(Text, nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FindingActivity(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finding_activities"
    __table_args__ = (
        ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("id", "company_id", name="uq_finding_activity_company"),
        Index("ix_finding_activities_finding", "finding_id", "created_at"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action_type: Mapped[str] = mapped_column(String(40), nullable=False)
    old_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    new_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FindingSuppression(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finding_suppressions"
    __table_args__ = (
        UniqueConstraint("id", "company_id", name="uq_finding_suppression_company"),
        UniqueConstraint("company_id", "rule_code", "entity_type", "entity_id", name="uq_finding_suppression_target"),
        Index("ix_finding_suppressions_company", "company_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    suppressed_by_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FinancialControlPolicy(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "financial_control_policies"
    __table_args__ = (
        UniqueConstraint("id", "company_id", name="uq_financial_control_policy_company"),
        UniqueConstraint("company_id", "rule_code", name="uq_financial_control_policy_company_rule"),
        Index("ix_control_policies_company", "company_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    severity_override: Mapped[str | None] = mapped_column(String(20), nullable=True)
    thresholds_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    updated_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class InAppAlert(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "in_app_alerts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("id", "company_id", name="uq_in_app_alert_company"),
        Index("ix_in_app_alerts_user", "company_id", "user_id", "is_read"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    title_fa: Mapped[str] = mapped_column(String(255), nullable=False)
    summary_fa: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# Legacy EvidenceItem kept for backward compatibility
class EvidenceItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "evidence_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("ordinal > 0", name="ck_evidence_item_ordinal_positive"),
        UniqueConstraint("finding_id", "ordinal", name="uq_evidence_finding_ordinal"),
        Index("ix_evidence_items_company_type", "company_id", "evidence_type"),
        Index("ix_evidence_items_finding", "finding_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence_type: Mapped[EvidenceType] = mapped_column(
        Enum(EvidenceType, name="evidence_type", native_enum=False), nullable=False
    )
    claim_code: Mapped[str] = mapped_column(String(100), nullable=False)
    source_entity_type: Mapped[str | None] = mapped_column(String(80))
    source_entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    source_row_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    source_file_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    field_snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    calculation_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    rule_code: Mapped[str | None] = mapped_column(String(100))
    rule_version: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
