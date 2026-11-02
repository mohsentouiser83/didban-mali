"""Cheque lifecycle metadata, append-only history and bank-evidence capacity."""

from datetime import date

from sqlalchemy import Date, ForeignKeyConstraint, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class Cheque(Entity, Tenant, Versioned, Base):
    __tablename__ = "cheques"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "direction", "bank_account", "number"),
    )
    direction: Mapped[str] = mapped_column(String(12))
    number: Mapped[str] = mapped_column(String(100))
    bank_name: Mapped[str] = mapped_column(String(120))
    bank_account: Mapped[str] = mapped_column(String(100))
    party_id: Mapped[str] = mapped_column(String(100))
    amount: Mapped[str] = mapped_column(Money())
    original_amount: Mapped[str] = mapped_column(String(80))
    original_unit: Mapped[str] = mapped_column(String(10))
    issue_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    state: Mapped[str] = mapped_column(String(20))
    endorsed_to: Mapped[str | None] = mapped_column(String(100))
    actor_id: Mapped[str] = mapped_column(String(36))


class ChequeEvent(Entity, Tenant, Base):
    __tablename__ = "cheque_events"
    __table_args__ = (
        ForeignKeyConstraint(["company_id", "cheque_id"], ["cheques.company_id", "cheques.id"]),
    )
    cheque_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(20))
    previous_state: Mapped[str | None] = mapped_column(String(20))
    new_state: Mapped[str] = mapped_column(String(20))
    event_date: Mapped[date] = mapped_column(Date)
    period_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(Text)


class ChequeClearance(Entity, Tenant, Base):
    __tablename__ = "cheque_clearances"
    __table_args__ = (
        UniqueConstraint("company_id", "cheque_id", "bank_id"),
        ForeignKeyConstraint(["company_id", "cheque_id"], ["cheques.company_id", "cheques.id"]),
        ForeignKeyConstraint(["company_id", "bank_id"], ["bank_movements.company_id", "bank_movements.id"]),
    )
    cheque_id: Mapped[str] = mapped_column(String(36))
    bank_id: Mapped[str] = mapped_column(String(36))
    event_id: Mapped[str] = mapped_column(String(36))
    amount: Mapped[str] = mapped_column(Money())
