"""Native invoice metadata is separate from immutable approved ledger evidence."""

from datetime import date

from sqlalchemy import JSON, Date, ForeignKeyConstraint, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class NativeInvoice(Entity, Tenant, Versioned, Base):
    __tablename__ = "native_invoices"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "operation_id"),
        ForeignKeyConstraint(
            ["company_id", "operation_id"], ["accounting_operations.company_id", "accounting_operations.id"]
        ),
    )
    operation_id: Mapped[str] = mapped_column(String(36))
    direction: Mapped[str] = mapped_column(String(10))
    source: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))


class NativeInvoiceTerms(Entity, Tenant, Base):
    __tablename__ = "native_invoice_terms"
    __table_args__ = (
        UniqueConstraint("company_id", "invoice_id", "version"),
        ForeignKeyConstraint(
            ["company_id", "invoice_id"], ["native_invoices.company_id", "native_invoices.id"]
        ),
    )
    invoice_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int]
    effective_date: Mapped[date] = mapped_column(Date)
    payload: Mapped[dict] = mapped_column(JSON)
    reason: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[str] = mapped_column(String(36))


class NativeInvoiceAllocation(Entity, Tenant, Base):
    __tablename__ = "native_invoice_allocations"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "operation_id"], ["accounting_operations.company_id", "accounting_operations.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "invoice_id"], ["native_invoices.company_id", "native_invoices.id"]
        ),
    )
    invoice_id: Mapped[str] = mapped_column(String(36))
    operation_id: Mapped[str] = mapped_column(String(36))
    amount: Mapped[str] = mapped_column(Money())
    date: Mapped[date] = mapped_column(Date)
    source: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))


class NativeInvoiceAllocationReversal(Entity, Tenant, Base):
    __tablename__ = "native_invoice_allocation_reversals"
    __table_args__ = (
        UniqueConstraint("company_id", "allocation_id"),
        ForeignKeyConstraint(
            ["company_id", "allocation_id"],
            ["native_invoice_allocations.company_id", "native_invoice_allocations.id"],
        ),
    )
    allocation_id: Mapped[str] = mapped_column(String(36))
    date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[str] = mapped_column(String(36))


class NativeInvoiceSnapshot(Entity, Tenant, Base):
    __tablename__ = "native_invoice_snapshots"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    as_of: Mapped[date] = mapped_column(Date)
    actor_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)


class NativeInvoiceSourceRevision(Entity, Tenant, Base):
    __tablename__ = "native_invoice_source_revisions"
    __table_args__ = (
        UniqueConstraint("company_id", "invoice_id", "journal_id"),
        UniqueConstraint("company_id", "invoice_id", "version"),
        ForeignKeyConstraint(
            ["company_id", "invoice_id"], ["native_invoices.company_id", "native_invoices.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "journal_id"], ["native_journals.company_id", "native_journals.id"]
        ),
    )
    version: Mapped[int]
    invoice_id: Mapped[str] = mapped_column(String(36))
    journal_id: Mapped[str] = mapped_column(String(36))
    effective_date: Mapped[date] = mapped_column(Date)
    source: Mapped[dict] = mapped_column(JSON)
    reason: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[str] = mapped_column(String(36))
