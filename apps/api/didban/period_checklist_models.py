"""Company-period tasks supplement mandatory system closing checks."""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKeyConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class PeriodChecklistItem(Entity, Tenant, Versioned, Base):
    __tablename__ = "period_checklist_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "responsible_member_id"], ["memberships.company_id", "memberships.id"]
        ),
    )
    period_id: Mapped[str] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(200))
    required: Mapped[bool] = mapped_column(Boolean)
    responsible_member_id: Mapped[str | None] = mapped_column(String(36))
    due_date: Mapped[date | None] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[str | None] = mapped_column(String(36))
    completion_reason: Mapped[str | None] = mapped_column(Text)
