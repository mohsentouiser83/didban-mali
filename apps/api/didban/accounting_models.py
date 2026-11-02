"""Additive accounting workspace; drafts never create financial facts."""

from datetime import date

from sqlalchemy import JSON, Boolean, Date, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class Account(Entity, Tenant, Versioned, Base):
    __tablename__ = "accounting_accounts"
    __table_args__ = (UniqueConstraint("company_id", "id"), UniqueConstraint("company_id", "code"))
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(150))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Draft(Entity, Tenant, Versioned, Base):
    __tablename__ = "accounting_drafts"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
    )
    period_id: Mapped[str] = mapped_column(String(36))
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(500))
    lines: Mapped[list] = mapped_column(JSON)
    original_unit: Mapped[str] = mapped_column(String(10))
    actor_id: Mapped[str] = mapped_column(String(36))
    state: Mapped[str] = mapped_column(String(30), default="draft")


class AccountingPermission(Entity, Tenant, Versioned, Base):
    __tablename__ = "accounting_permissions"
    __table_args__ = (
        UniqueConstraint("company_id", "membership_id"),
        ForeignKeyConstraint(["company_id", "membership_id"], ["memberships.company_id", "memberships.id"]),
    )
    membership_id: Mapped[str] = mapped_column(String(36))
    post_journal: Mapped[bool] = mapped_column(Boolean, default=False)
    reopen_period: Mapped[bool] = mapped_column(Boolean, default=False)
