"""Additive accounting workspace; drafts never create financial facts."""

from datetime import date

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class Account(Entity, Tenant, Versioned, Base):
    __tablename__ = "accounting_accounts"
    __table_args__ = (UniqueConstraint("company_id", "id"), UniqueConstraint("company_id", "code"))
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(150))
    nature: Mapped[str] = mapped_column(String(20), default="debit")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AccountHierarchy(Tenant, Base):
    """Explicit classification; existing accounts remain unclassified until assigned."""

    __tablename__ = "accounting_account_hierarchy"
    __table_args__ = (
        ForeignKeyConstraint(["company_id", "account_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]),
        ForeignKeyConstraint(["company_id", "parent_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]),
        CheckConstraint("level IN ('group', 'general', 'subsidiary', 'detail')", name="account_hierarchy_level"),
        CheckConstraint("(level = 'group' AND parent_id IS NULL) OR (level != 'group' AND parent_id IS NOT NULL)", name="account_hierarchy_parent"),
        CheckConstraint("parent_id IS NULL OR parent_id != account_id", name="account_hierarchy_no_self_parent"),
        CheckConstraint("code_status IN ('standard', 'legacy')", name="account_hierarchy_code_status"),
    )
    account_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    level: Mapped[str] = mapped_column(String(20))
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    code_status: Mapped[str] = mapped_column(String(20), default="standard", server_default="standard")


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
    view_payroll: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class AccountDetailLink(Entity, Tenant, Base):
    """Explicit allowed relationship between a detail account, subsidiary accounts, and an optional counterparty."""

    __tablename__ = "account_detail_links"
    __table_args__ = (
        UniqueConstraint("company_id", "detail_account_id", "subsidiary_account_id"),
        ForeignKeyConstraint(
            ["company_id", "detail_account_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "subsidiary_account_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"],
            ["commercial_counterparties.company_id", "commercial_counterparties.id"],
        ),
    )
    detail_account_id: Mapped[str] = mapped_column(String(36))
    subsidiary_account_id: Mapped[str] = mapped_column(String(36))
    counterparty_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
