"""Operational period locks; no closing or opening journal entries."""

from sqlalchemy import JSON, Boolean, ForeignKeyConstraint, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class PeriodLock(Entity, Tenant, Versioned, Base):
    __tablename__ = "period_locks"
    __table_args__ = (
        UniqueConstraint("company_id", "period_id"),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
    )
    period_id: Mapped[str] = mapped_column(String(36))
    closed: Mapped[bool] = mapped_column(Boolean, default=False)


class PeriodLockEvent(Entity, Tenant, Base):
    __tablename__ = "period_lock_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
    )
    period_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Text)
    checklist: Mapped[dict] = mapped_column(JSON)
