"""B2B client contracting, milestone billing, and statutory retention models for service companies."""

from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
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


class ClientContract(Entity, Tenant, Versioned, Base):
    """Master B2B contract with a client counterparty, optionally linked to a project dimension."""

    __tablename__ = "client_contracts"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "contract_number"),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"],
            ["commercial_counterparties.company_id", "commercial_counterparties.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "dimension_id"],
            ["financial_dimensions.company_id", "financial_dimensions.id"],
        ),
        CheckConstraint(
            "contract_kind IN ('fixed_project', 'retainer', 'time_and_material')",
            name="client_contract_kind_valid",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'completed', 'cancelled')",
            name="client_contract_status_valid",
        ),
        Index("ix_client_contracts_company_status", "company_id", "status"),
    )

    contract_number: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(200))
    counterparty_id: Mapped[str] = mapped_column(String(36))
    dimension_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    contract_kind: Mapped[str] = mapped_column(String(30), default="fixed_project", server_default="fixed_project")
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    total_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    advance_payment_irr: Mapped[str] = mapped_column(Money(), default="0")
    insurance_retention_rate: Mapped[str] = mapped_column(Money(), default="5")
    performance_retention_rate: Mapped[str] = mapped_column(Money(), default="10")
    withholding_tax_rate: Mapped[str] = mapped_column(Money(), default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)


class ClientContractMilestone(Entity, Tenant, Versioned, Base):
    """Contract billing milestone tracking invoicing, cash collection, and statutory retentions."""

    __tablename__ = "client_contract_milestones"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "contract_id", "sequence"),
        ForeignKeyConstraint(
            ["company_id", "contract_id"],
            ["client_contracts.company_id", "client_contracts.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "commercial_document_id"],
            ["commercial_documents.company_id", "commercial_documents.id"],
        ),
        CheckConstraint(
            "status IN ('planned', 'invoiced', 'settled')",
            name="client_contract_milestone_status_valid",
        ),
    )

    contract_id: Mapped[str] = mapped_column(String(36))
    sequence: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    status: Mapped[str] = mapped_column(String(20), default="planned", server_default="planned")
    commercial_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    invoiced_amount_irr: Mapped[str] = mapped_column(Money(), default="0")
    collected_cash_irr: Mapped[str] = mapped_column(Money(), default="0")
    insurance_retained_irr: Mapped[str] = mapped_column(Money(), default="0")
    performance_retained_irr: Mapped[str] = mapped_column(Money(), default="0")
    withholding_tax_irr: Mapped[str] = mapped_column(Money(), default="0")
    retention_released: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
