"""Cheque lifecycle metadata, append-only history and bank-evidence capacity."""

from datetime import date

from sqlalchemy import Date, ForeignKeyConstraint, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from . import treasury_models as _treasury_models  # noqa: F401
from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class Cheque(Entity, Tenant, Versioned, Base):
    __tablename__ = "cheques"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "direction", "bank_account", "number"),
        ForeignKeyConstraint(
            ["company_id", "treasury_account_id"], ["treasury_accounts.company_id", "treasury_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"],
            ["commercial_counterparties.company_id", "commercial_counterparties.id"],
        ),
    )
    direction: Mapped[str] = mapped_column(String(20))
    number: Mapped[str] = mapped_column(String(100))
    sayad_id: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    sayad_status: Mapped[str] = mapped_column(String(30), default="not_verified", server_default="not_verified")
    bank_name: Mapped[str] = mapped_column(String(120))
    bank_account: Mapped[str] = mapped_column(String(100))
    treasury_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    party_id: Mapped[str] = mapped_column(String(100))
    counterparty_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    issuer_name: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    holder_name: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    amount: Mapped[str] = mapped_column(Money())
    original_amount: Mapped[str] = mapped_column(String(80))
    original_unit: Mapped[str] = mapped_column(String(10))
    issue_date: Mapped[date] = mapped_column(Date)
    received_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    due_date: Mapped[date] = mapped_column(Date)
    state: Mapped[str] = mapped_column(String(20))
    endorsed_to: Mapped[str | None] = mapped_column(String(100))
    endorsed_to_counterparty_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    actor_id: Mapped[str] = mapped_column(String(36))


class ChequeEvent(Entity, Tenant, Base):
    __tablename__ = "cheque_events"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(["company_id", "cheque_id"], ["cheques.company_id", "cheques.id"]),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
    )
    cheque_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(20))
    previous_state: Mapped[str | None] = mapped_column(String(20))
    new_state: Mapped[str] = mapped_column(String(20))
    event_date: Mapped[date] = mapped_column(Date)
    period_id: Mapped[str] = mapped_column(String(36))
    endorsed_to: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    endorsed_to_counterparty_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    treasury_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    reason: Mapped[str] = mapped_column(Text)


class ChequeClearance(Entity, Tenant, Base):
    __tablename__ = "cheque_clearances"
    __table_args__ = (
        UniqueConstraint("company_id", "cheque_id", "bank_id"),
        UniqueConstraint("company_id", "event_id"),
        ForeignKeyConstraint(["company_id", "cheque_id"], ["cheques.company_id", "cheques.id"]),
        ForeignKeyConstraint(["company_id", "bank_id"], ["bank_movements.company_id", "bank_movements.id"]),
        ForeignKeyConstraint(["company_id", "event_id"], ["cheque_events.company_id", "cheque_events.id"]),
    )
    cheque_id: Mapped[str] = mapped_column(String(36))
    bank_id: Mapped[str] = mapped_column(String(36))
    event_id: Mapped[str] = mapped_column(String(36))
    amount: Mapped[str] = mapped_column(Money())
