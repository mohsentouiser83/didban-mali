"""Operational follow-up metadata is separate from immutable financial evidence."""

from datetime import date

from sqlalchemy import JSON, CheckConstraint, Date, ForeignKeyConstraint, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class ControlCase(Entity, Tenant, Versioned, Base):
    __tablename__ = "control_cases"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "finding_id"),
        UniqueConstraint("company_id", "invoice_id"),
        CheckConstraint(
            "(finding_id IS NOT NULL AND invoice_id IS NULL) OR (finding_id IS NULL AND invoice_id IS NOT NULL)",
            name="control_one_subject",
        ),
        ForeignKeyConstraint(["company_id", "finding_id"], ["findings.company_id", "findings.id"]),
        ForeignKeyConstraint(["company_id", "invoice_id"], ["invoices.company_id", "invoices.id"]),
        ForeignKeyConstraint(
            ["company_id", "assignee_membership_id"], ["memberships.company_id", "memberships.id"]
        ),
    )
    finding_id: Mapped[str | None] = mapped_column(String(36))
    invoice_id: Mapped[str | None] = mapped_column(String(36))
    assignee_membership_id: Mapped[str | None] = mapped_column(String(36))
    due_date: Mapped[date | None] = mapped_column(Date)
    state: Mapped[str] = mapped_column(String(20), default="open")
    next_action: Mapped[str] = mapped_column(String(500), default="")
    resolution_reason: Mapped[str | None] = mapped_column(Text)
    source_snapshot: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))


class ControlActivity(Entity, Tenant, Base):
    __tablename__ = "control_activities"
    __table_args__ = (
        ForeignKeyConstraint(["company_id", "case_id"], ["control_cases.company_id", "control_cases.id"]),
    )
    case_id: Mapped[str] = mapped_column(String(36), index=True)
    actor_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(30))
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
