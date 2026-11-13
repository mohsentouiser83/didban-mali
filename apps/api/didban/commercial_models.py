"""Commercial counterparties and nonfinancial proforma lifecycle."""

from datetime import date

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
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
    )
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(200))
    national_id: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    economic_code: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    credit_limit_irr: Mapped[str | None] = mapped_column(Money(), nullable=True, default=None)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


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
    terms: Mapped[str | None] = mapped_column(String(1000), nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="issued")  # draft, issued, converted, expired, cancelled
    converted_operation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    actor_id: Mapped[str] = mapped_column(String(36))
