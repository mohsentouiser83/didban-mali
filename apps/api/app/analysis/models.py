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


class AnalysisStatus(enum.StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_LIMITED = "completed_limited"
    FAILED = "failed"


class MetricCode(enum.StrEnum):
    REVENUE_IRR = "revenue_irr"
    EXPENSES_IRR = "expenses_irr"
    NET_PROFIT_IRR = "net_profit_irr"
    NET_MARGIN_RATIO = "net_margin_ratio"
    TOTAL_ASSETS_IRR = "total_assets_irr"
    TOTAL_LIABILITIES_IRR = "total_liabilities_irr"
    TOTAL_EQUITY_IRR = "total_equity_irr"
    NET_CASH_MOVEMENT_IRR = "net_cash_movement_irr"
    SALES_INVOICED_IRR = "sales_invoiced_irr"
    SALES_COLLECTED_IRR = "sales_collected_irr"
    SALES_OUTSTANDING_IRR = "sales_outstanding_irr"


class AnalysisRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (
        CheckConstraint("period_start <= period_end", name="ck_analysis_run_period"),
        UniqueConstraint("id", "company_id", name="uq_analysis_run_company"),
        UniqueConstraint(
            "company_id", "idempotency_key", name="uq_analysis_run_company_idempotency"
        ),
        Index("ix_analysis_runs_company_period", "company_id", "period_start", "period_end"),
        Index("ix_analysis_runs_company_status", "company_id", "status"),
        Index("ix_analysis_runs_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[AnalysisStatus] = mapped_column(
        Enum(AnalysisStatus, name="analysis_status", native_enum=False), nullable=False
    )
    input_manifest_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    rule_set_version: Mapped[str] = mapped_column(String(80), nullable=False)
    coverage_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_code: Mapped[str | None] = mapped_column(String(80))
    failure_message: Mapped[str | None] = mapped_column(Text)


class MetricObservation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "metric_observations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("period_start <= period_end", name="ck_metric_period"),
        CheckConstraint(
            "(value_irr IS NOT NULL AND value_ratio IS NULL) OR "
            "(value_irr IS NULL AND value_ratio IS NOT NULL)",
            name="ck_metric_exactly_one_value",
        ),
        UniqueConstraint("analysis_run_id", "metric_code", name="uq_metric_observation_run_code"),
        Index("ix_metric_observations_company_period", "company_id", "period_start", "period_end"),
        Index("ix_metric_observations_run", "analysis_run_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    analysis_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    metric_code: Mapped[MetricCode] = mapped_column(
        Enum(MetricCode, name="metric_code", native_enum=False), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    value_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0))
    value_ratio: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    calculation_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
