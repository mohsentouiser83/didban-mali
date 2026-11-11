"""Frozen fiscal submissions and append-only transport evidence."""

from sqlalchemy import JSON, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class MoadianTransmission(Entity, Tenant, Base):
    __tablename__ = "moadian_transmissions"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "invoice_id"),
        UniqueConstraint("company_id", "tax_id"),
        UniqueConstraint("company_id", "memory_id", "serial"),
        UniqueConstraint("company_id", "uid"),
        ForeignKeyConstraint(
            ["company_id", "invoice_id"], ["native_invoices.company_id", "native_invoices.id"]
        ),
    )
    invoice_id: Mapped[str] = mapped_column(String(36))
    invoice_version: Mapped[int]
    invoice_reference: Mapped[str] = mapped_column(String(120))
    tax_id: Mapped[str] = mapped_column(String(22))
    uid: Mapped[str] = mapped_column(String(36))
    memory_id: Mapped[str] = mapped_column(String(6))
    serial: Mapped[str] = mapped_column(String(10))
    seller_tax_number: Mapped[str] = mapped_column(String(20))
    digest: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    input: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))


class MoadianTransmissionEvent(Entity, Tenant, Base):
    __tablename__ = "moadian_transmission_events"
    __table_args__ = (
        UniqueConstraint("company_id", "transmission_id", "sequence"),
        UniqueConstraint("company_id", "transmission_id", "kind", "request_key"),
        ForeignKeyConstraint(
            ["company_id", "transmission_id"],
            ["moadian_transmissions.company_id", "moadian_transmissions.id"],
        ),
    )
    transmission_id: Mapped[str] = mapped_column(String(36))
    sequence: Mapped[int]
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    reference_number: Mapped[str | None] = mapped_column(String(100))
    error_codes: Mapped[list] = mapped_column(JSON)
    evidence_digest: Mapped[str | None] = mapped_column(String(64))
    request_key: Mapped[str] = mapped_column(String(128))
    actor_id: Mapped[str] = mapped_column(String(36))
