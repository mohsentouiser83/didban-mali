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
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class CalculationRunStatus(enum.StrEnum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_WITH_WARNINGS = "completed_with_warnings"
    FAILED = "failed"


class MetricStatus(enum.StrEnum):
    AVAILABLE = "available"
    AVAILABLE_WITH_WARNING = "available_with_warning"
    APPROXIMATE = "approximate"
    INSUFFICIENT_DATA = "insufficient_data"
    NOT_APPLICABLE = "not_applicable"
    STALE = "stale"
    FAILED = "failed"


class MetricUnit(enum.StrEnum):
    IRR = "IRR"
    DAY = "day"
    MONTH = "month"
    RATIO = "ratio"
    COUNT = "count"
    BOOLEAN = "boolean"


class ConfidenceLevel(enum.StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class CalculationRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "calculation_runs"
    __table_args__ = (
        CheckConstraint("period_start <= period_end", name="ck_calc_run_period"),
        UniqueConstraint("id", "company_id", name="uq_calc_run_company"),
        Index("ix_calculation_runs_company_date", "company_id", "as_of_date"),
        Index("ix_calculation_runs_company_status", "company_id", "status"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    engine_version: Mapped[str] = mapped_column(
        String(80), nullable=False, default="financial-metrics-v1"
    )
    status: Mapped[CalculationRunStatus] = mapped_column(
        Enum(CalculationRunStatus, name="calc_run_status", native_enum=False),
        default=CalculationRunStatus.PROCESSING,
        nullable=False,
    )
    trigger_source: Mapped[str] = mapped_column(String(80), default="manual", nullable=False)
    triggered_by: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_message: Mapped[str | None] = mapped_column(Text)

    metric_results: Mapped[list["MetricResult"]] = relationship(
        "MetricResult", back_populates="calculation_run", cascade="all, delete-orphan"
    )


class MetricResult(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "metric_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["calculation_run_id", "company_id"],
            ["calculation_runs.id", "calculation_runs.company_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("calculation_run_id", "metric_key", name="uq_metric_result_run_key"),
        Index("ix_metric_results_company_metric", "company_id", "metric_key", "as_of_date"),
        Index("ix_metric_results_run_id", "calculation_run_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    calculation_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    metric_key: Mapped[str] = mapped_column(String(80), nullable=False)
    metric_version: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[MetricStatus] = mapped_column(
        Enum(MetricStatus, name="metric_status", native_enum=False), nullable=False
    )
    value_numeric: Mapped[Decimal | None] = mapped_column(Numeric(24, 4))
    unit: Mapped[MetricUnit] = mapped_column(
        Enum(MetricUnit, name="metric_unit", native_enum=False), nullable=False
    )
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    coverage_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    confidence: Mapped[ConfidenceLevel] = mapped_column(
        Enum(ConfidenceLevel, name="confidence_level", native_enum=False),
        default=ConfidenceLevel.HIGH,
        nullable=False,
    )
    input_record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    excluded_record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warnings: Mapped[list[Any]] = mapped_column(JSONB, default=list, nullable=False)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    input_record_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    calculation_run: Mapped["CalculationRun"] = relationship(
        "CalculationRun", back_populates="metric_results"
    )


class FinancialPolicy(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "financial_policies"
    __table_args__ = (UniqueConstraint("company_id", name="uq_financial_policy_company"),)

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    dso_period_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    dso_method: Mapped[str] = mapped_column(String(40), default="strict", nullable=False)
    burn_trailing_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    default_reporting_unit: Mapped[str] = mapped_column(String(40), default="toman", nullable=False)
    excluded_internal_transfer_accounts: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
