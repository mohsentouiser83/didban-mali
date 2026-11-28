"""Multi-line commercial invoice, return, quarantine, and counterparty credit models (D24–D34)."""

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class CommercialDocument(Entity, Tenant, Versioned, Base):
    __tablename__ = "commercial_documents"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "number"),
        ForeignKeyConstraint(["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"], ["commercial_counterparties.company_id", "commercial_counterparties.id"]
        ),
        CheckConstraint("direction IN ('sale', 'purchase')", name="commercial_doc_direction_valid"),
        CheckConstraint(
            "status IN ('draft', 'posted', 'partially_returned', 'fully_returned', 'reversed', 'discarded')",
            name="commercial_doc_status_valid",
        ),
        Index("ix_commercial_documents_company_date", "company_id", "issue_date"),
    )
    number: Mapped[str] = mapped_column(String(100))
    direction: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(30), default="draft")
    issue_date: Mapped[date] = mapped_column(Date)
    posting_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    period_id: Mapped[str] = mapped_column(String(36))
    counterparty_id: Mapped[str] = mapped_column(String(36))
    party_snapshot: Mapped[dict] = mapped_column(JSON)
    warehouse_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    proforma_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    currency: Mapped[str] = mapped_column(String(10), default="IRR")
    gross_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    line_discount_total_irr: Mapped[str] = mapped_column(Money(), default="0")
    invoice_discount_irr: Mapped[str] = mapped_column(Money(), default="0")
    vat_total_irr: Mapped[str] = mapped_column(Money(), default="0")
    net_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    settlement_type: Mapped[str] = mapped_column(String(20), default="on_account")
    cash_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    cheque_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    on_account_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    applied_credit_irr: Mapped[str] = mapped_column(Money(), default="0")
    vendor_reference: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    description: Mapped[str] = mapped_column(String(500), default="")
    operation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    draft_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    journal_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    native_invoice_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    accounts: Mapped[dict] = mapped_column(JSON, default=dict)
    actor_id: Mapped[str] = mapped_column(String(36))


class CommercialDocumentLine(Entity, Tenant, Base):
    __tablename__ = "commercial_document_lines"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "document_id", "line_index"),
        ForeignKeyConstraint(
            ["company_id", "document_id"], ["commercial_documents.company_id", "commercial_documents.id"]
        ),
        CheckConstraint("line_kind IN ('goods', 'service')", name="commercial_doc_line_kind_valid"),
        CheckConstraint("quantity >= 1", name="commercial_doc_line_qty_positive"),
    )
    document_id: Mapped[str] = mapped_column(String(36))
    line_index: Mapped[int] = mapped_column(Integer)
    line_kind: Mapped[str] = mapped_column(String(10))
    item_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    description: Mapped[str] = mapped_column(String(300))
    unit: Mapped[str] = mapped_column(String(40), default="عدد")
    quantity: Mapped[int] = mapped_column(BigInteger)
    unit_price_irr: Mapped[str] = mapped_column(Money())
    gross_amount_irr: Mapped[str] = mapped_column(Money())
    line_discount_irr: Mapped[str] = mapped_column(Money(), default="0")
    net_before_inv_disc_irr: Mapped[str] = mapped_column(Money())
    allocated_invoice_discount_irr: Mapped[str] = mapped_column(Money(), default="0")
    vat_rate_pct: Mapped[str] = mapped_column(String(20), default="0")
    vat_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    net_amount_irr: Mapped[str] = mapped_column(Money())
    cost_irr: Mapped[str] = mapped_column(Money(), default="0")
    cost_layers: Mapped[list] = mapped_column(JSON, default=list)
    returned_healthy_qty: Mapped[int] = mapped_column(BigInteger, default=0)
    returned_defective_qty: Mapped[int] = mapped_column(BigInteger, default=0)
    journal_line_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    inventory_movement_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)


class CommercialReturn(Entity, Tenant, Versioned, Base):
    __tablename__ = "commercial_returns"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "number"),
        ForeignKeyConstraint(
            ["company_id", "document_id"], ["commercial_documents.company_id", "commercial_documents.id"]
        ),
        ForeignKeyConstraint(["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]),
        CheckConstraint(
            "direction IN ('sale_return', 'purchase_return')",
            name="commercial_return_direction_valid",
        ),
        CheckConstraint(
            "status IN ('draft', 'posted', 'reversed', 'discarded')",
            name="commercial_return_status_valid",
        ),
    )
    number: Mapped[str] = mapped_column(String(100))
    document_id: Mapped[str] = mapped_column(String(36))
    direction: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    date: Mapped[date] = mapped_column(Date)
    period_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(500))
    total_return_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    vat_total_irr: Mapped[str] = mapped_column(Money(), default="0")
    invoice_balance_reduced_irr: Mapped[str] = mapped_column(Money(), default="0")
    credit_created_irr: Mapped[str] = mapped_column(Money(), default="0")
    operation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    draft_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    journal_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    accounts: Mapped[dict] = mapped_column(JSON, default=dict)
    actor_id: Mapped[str] = mapped_column(String(36))


class CommercialReturnLine(Entity, Tenant, Base):
    __tablename__ = "commercial_return_lines"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "return_id", "line_index"),
        ForeignKeyConstraint(
            ["company_id", "return_id"], ["commercial_returns.company_id", "commercial_returns.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "document_line_id"],
            ["commercial_document_lines.company_id", "commercial_document_lines.id"],
        ),
        CheckConstraint("condition IN ('healthy', 'defective')", name="commercial_return_condition_valid"),
        CheckConstraint("quantity >= 1", name="commercial_return_qty_positive"),
        CheckConstraint(
            "quarantine_status IN ('none', 'pending_inspection', 'restocked', 'repaired', 'scrapped')",
            name="commercial_return_quarantine_valid",
        ),
    )
    return_id: Mapped[str] = mapped_column(String(36))
    document_line_id: Mapped[str] = mapped_column(String(36))
    line_index: Mapped[int] = mapped_column(Integer)
    condition: Mapped[str] = mapped_column(String(20))
    quantity: Mapped[int] = mapped_column(BigInteger)
    return_net_amount_irr: Mapped[str] = mapped_column(Money())
    vat_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    return_cost_irr: Mapped[str] = mapped_column(Money(), default="0")
    restored_cost_layers: Mapped[list] = mapped_column(JSON, default=list)
    quarantine_status: Mapped[str] = mapped_column(String(30), default="none")
    quarantine_decision_note: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    quarantine_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    quarantine_journal_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)


class CounterpartyCredit(Entity, Tenant, Versioned, Base):
    __tablename__ = "counterparty_credits"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"], ["commercial_counterparties.company_id", "commercial_counterparties.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "return_id"], ["commercial_returns.company_id", "commercial_returns.id"]
        ),
        CheckConstraint(
            "credit_kind IN ('customer_credit', 'supplier_receivable')",
            name="counterparty_credit_kind_valid",
        ),
        CheckConstraint(
            "status IN ('open', 'partially_used', 'consumed', 'refunded', 'reversed')",
            name="counterparty_credit_status_valid",
        ),
    )
    counterparty_id: Mapped[str] = mapped_column(String(36))
    return_id: Mapped[str] = mapped_column(String(36))
    document_id: Mapped[str] = mapped_column(String(36))
    credit_kind: Mapped[str] = mapped_column(String(30))
    original_amount_irr: Mapped[str] = mapped_column(Money())
    remaining_amount_irr: Mapped[str] = mapped_column(Money())
    status: Mapped[str] = mapped_column(String(20), default="open")
    refund_operation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    actor_id: Mapped[str] = mapped_column(String(36))


class CounterpartyCreditApplication(Entity, Tenant, Base):
    __tablename__ = "counterparty_credit_applications"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "credit_id"], ["counterparty_credits.company_id", "counterparty_credits.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "target_document_id"], ["commercial_documents.company_id", "commercial_documents.id"]
        ),
    )
    credit_id: Mapped[str] = mapped_column(String(36))
    target_document_id: Mapped[str] = mapped_column(String(36))
    amount_irr: Mapped[str] = mapped_column(Money())
    date: Mapped[date] = mapped_column(Date)
    actor_id: Mapped[str] = mapped_column(String(36))
