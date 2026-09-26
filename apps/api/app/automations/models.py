import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class AutomationActionType(enum.StrEnum):
    DAILY_MORNING_CYCLE = "daily_morning_cycle"
    RECONCILE_AND_FINDINGS = "reconcile_and_findings"
    ASSIGN_OVERDUE_AR = "assign_overdue_ar"
    NOTIFY_STALENESS = "notify_staleness"


class AutomationTriggerType(enum.StrEnum):
    SCHEDULED = "scheduled"
    MANUAL = "manual"
    EVENT = "event"


class AutomationRunStatus(enum.StrEnum):
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AutomationRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "automation_rules"
    __table_args__ = (
        Index("ix_automation_rules_company", "company_id", "is_enabled"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    schedule_cron: Mapped[str] = mapped_column(String(64), default="0 7 * * *", nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str] = mapped_column(String(32), default="idle", nullable=False)

    runs: Mapped[list["AutomationRun"]] = relationship(
        back_populates="rule", cascade="all, delete-orphan"
    )


class AutomationRun(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "automation_runs"
    __table_args__ = (
        Index("ix_automation_runs_company_rule", "company_id", "rule_id", "created_at"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False
    )
    trigger_type: Mapped[str] = mapped_column(String(32), default=AutomationTriggerType.SCHEDULED, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=AutomationRunStatus.RUNNING, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    steps_executed_json: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    rule: Mapped[AutomationRule] = relationship(back_populates="runs")
