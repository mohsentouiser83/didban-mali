"""Petty cash expense tracking and settlement/replenishment models."""

from datetime import date

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class PettyCashSettlement(Entity, Tenant, Versioned, Base):
    """Batch settlement of recorded petty cash expenses with optional bank replenishment."""

    __tablename__ = "petty_cash_settlements"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "treasury_account_id"], ["treasury_accounts.company_id", "treasury_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "replenish_from_treasury_id"], ["treasury_accounts.company_id", "treasury_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "draft_id"], ["accounting_drafts.company_id", "accounting_drafts.id"]
        ),
        CheckConstraint("status IN ('draft', 'approved')", name="petty_cash_settlement_status_valid"),
    )

    treasury_account_id: Mapped[str] = mapped_column(String(36))
    period_id: Mapped[str] = mapped_column(String(36))
    settlement_date: Mapped[date] = mapped_column(Date)
    total_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    replenish_from_treasury_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    draft_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)


class PettyCashExpense(Entity, Tenant, Versioned, Base):
    """Individual petty cash expense item optionally tagged to a project/cost-center dimension."""

    __tablename__ = "petty_cash_expenses"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "treasury_account_id"], ["treasury_accounts.company_id", "treasury_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "expense_account_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "dimension_id"], ["financial_dimensions.company_id", "financial_dimensions.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "settlement_id"], ["petty_cash_settlements.company_id", "petty_cash_settlements.id"]
        ),
        CheckConstraint("status IN ('recorded', 'settled', 'cancelled')", name="petty_cash_expense_status_valid"),
        CheckConstraint(
            "category IN ('cloud_server', 'software_license', 'subcontractor', 'transport', 'meals', 'office_supplies', 'utilities', 'other')",
            name="petty_cash_expense_category_valid",
        ),
        Index("ix_petty_cash_expenses_company_account", "company_id", "treasury_account_id", "status"),
    )

    treasury_account_id: Mapped[str] = mapped_column(String(36))
    period_id: Mapped[str] = mapped_column(String(36))
    expense_account_id: Mapped[str] = mapped_column(String(36))
    dimension_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    category: Mapped[str] = mapped_column(String(40), default="other", server_default="other")
    expense_date: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(200))
    amount_irr: Mapped[str] = mapped_column(Money())
    receipt_reference: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="recorded", server_default="recorded")
    settlement_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
