"""Commercial counterparties and nonfinancial proforma lifecycle."""

from datetime import date

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class CommercialCounterparty(Entity, Tenant, Versioned, Base):
    __tablename__ = "commercial_counterparties"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "code"),
        CheckConstraint("type IN ('supplier', 'customer', 'employee', 'other')", name="counterparty_type_valid"),
        CheckConstraint(
            "entity_kind IN ('natural_person', 'legal_entity', 'other')",
            name="counterparty_entity_kind_valid",
        ),
    )
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(20), default="other", server_default="other")
    entity_kind: Mapped[str] = mapped_column(String(20), default="other", server_default="other")
    roles: Mapped[list] = mapped_column(JSON, default=list)
    national_id: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    economic_code: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    registration_number: Mapped[str | None] = mapped_column(String(40), nullable=True, default=None)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    credit_limit_irr: Mapped[str | None] = mapped_column(Money(), nullable=True, default=None)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class CommercialCounterpartyRole(Entity, Tenant, Base):
    """Explicit commercial roles (customer, supplier, employee, other) per counterparty identity."""

    __tablename__ = "commercial_counterparty_roles"
    __table_args__ = (
        UniqueConstraint("company_id", "counterparty_id", "role"),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"],
            ["commercial_counterparties.company_id", "commercial_counterparties.id"],
        ),
        CheckConstraint(
            "role IN ('supplier', 'customer', 'employee', 'other')",
            name="counterparty_role_valid",
        ),
    )
    counterparty_id: Mapped[str] = mapped_column(String(36))
    role: Mapped[str] = mapped_column(String(20))


class ProformaInvoice(Entity, Tenant, Versioned, Base):
    __tablename__ = "proforma_invoices"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "number"),
    )
    number: Mapped[str] = mapped_column(String(100))
    direction: Mapped[str] = mapped_column(String(10))  # "sale" or "purchase"
    date: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    party_id: Mapped[str] = mapped_column(String(100))
    currency: Mapped[str] = mapped_column(String(10), default="IRR")
    lines: Mapped[list] = mapped_column(JSON)
    total_amount: Mapped[str] = mapped_column(Money())
    total_amount_irr: Mapped[str] = mapped_column(Money())
    invoice_discount: Mapped[str] = mapped_column(Money(), default="0", server_default="0")
    terms: Mapped[str | None] = mapped_column(String(1000), nullable=True, default=None)
    status: Mapped[str] = mapped_column(
        String(20), default="issued"
    )  # draft, issued, conversion_pending, converted, expired, cancelled
    converted_operation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    actor_id: Mapped[str] = mapped_column(String(36))
