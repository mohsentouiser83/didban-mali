"""Operational treasury accounts (bank, cashbox, petty cash) and receipt/payment tool lines."""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class TreasuryAccount(Entity, Tenant, Versioned, Base):
    """First-class operational bank, cashbox, or petty cash account linked to a ledger account."""

    __tablename__ = "treasury_accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "account_id"),
        ForeignKeyConstraint(
            ["company_id", "account_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]
        ),
        CheckConstraint("kind IN ('bank', 'cash', 'petty_cash')", name="treasury_account_kind_valid"),
    )
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(150))
    account_id: Mapped[str] = mapped_column(String(36))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Bank-specific fields
    bank_name: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    account_number: Mapped[str | None] = mapped_column(String(60), nullable=True, default=None)
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True, default=None)
    branch_name: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    branch_code: Mapped[str | None] = mapped_column(String(30), nullable=True, default=None)
    # Cashbox / petty-cash specific fields
    custodian_name: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    custodian_counterparty_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    petty_cash_limit_irr: Mapped[str | None] = mapped_column(Money(), nullable=True, default=None)
    needs_completion: Mapped[bool] = mapped_column(Boolean, default=False)


class TreasuryDocument(Entity, Tenant, Versioned, Base):
    """Commercial receipt or payment header with stable tool lines and invoice allocations."""

    __tablename__ = "treasury_documents"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "direction", "number"),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"],
            ["commercial_counterparties.company_id", "commercial_counterparties.id"],
        ),
        CheckConstraint("direction IN ('receipt', 'payment')", name="treasury_doc_direction_valid"),
        CheckConstraint("state IN ('draft', 'posted', 'reversed')", name="treasury_doc_state_valid"),
    )
    direction: Mapped[str] = mapped_column(String(20))
    number: Mapped[str] = mapped_column(String(100))
    date: Mapped[date] = mapped_column(Date)
    period_id: Mapped[str] = mapped_column(String(36))
    counterparty_id: Mapped[str] = mapped_column(String(36))
    total_amount: Mapped[str] = mapped_column(Money())
    original_unit: Mapped[str] = mapped_column(String(10), default="IRR")
    description: Mapped[str] = mapped_column(String(500), default="")
    operation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    journal_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    state: Mapped[str] = mapped_column(String(20), default="draft")
    actor_id: Mapped[str] = mapped_column(String(36))


class TreasuryToolLine(Entity, Tenant, Base):
    """Individual settlement instrument line (cash, bank transfer, cheque, card) on a receipt/payment."""

    __tablename__ = "treasury_tool_lines"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "document_id", "line_index"),
        ForeignKeyConstraint(
            ["company_id", "document_id"], ["treasury_documents.company_id", "treasury_documents.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "treasury_account_id"], ["treasury_accounts.company_id", "treasury_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "cheque_id"], ["cheques.company_id", "cheques.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "bank_movement_id"], ["bank_movements.company_id", "bank_movements.id"]
        ),
        CheckConstraint(
            "tool_kind IN ('cash', 'bank_transfer', 'cheque', 'card', 'other')",
            name="treasury_tool_kind_valid",
        ),
    )
    document_id: Mapped[str] = mapped_column(String(36))
    line_index: Mapped[int] = mapped_column(Integer)
    tool_kind: Mapped[str] = mapped_column(String(20))
    treasury_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    cheque_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    bank_movement_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    amount: Mapped[str] = mapped_column(Money())
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)


class TreasuryAllocation(Entity, Tenant, Base):
    """Many-to-many allocation between a treasury tool line and a native invoice with reversal support."""

    __tablename__ = "treasury_allocations"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "tool_line_id"], ["treasury_tool_lines.company_id", "treasury_tool_lines.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "invoice_id"], ["native_invoices.company_id", "native_invoices.id"]
        ),
    )
    tool_line_id: Mapped[str] = mapped_column(String(36))
    invoice_id: Mapped[str] = mapped_column(String(36))
    amount: Mapped[str] = mapped_column(Money())
    date: Mapped[date] = mapped_column(Date)
    actor_id: Mapped[str] = mapped_column(String(36))
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    reversed_by: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
