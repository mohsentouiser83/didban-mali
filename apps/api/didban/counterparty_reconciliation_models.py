"""Versioned counterparty statement reconciliation models and audit evidence."""

from datetime import date

from sqlalchemy import JSON, Date, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class CounterpartyReconciliationRun(Entity, Tenant, Versioned, Base):
    __tablename__ = "counterparty_reconciliation_runs"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    counterparty_id: Mapped[str] = mapped_column(String(100))
    party_name: Mapped[str] = mapped_column(String(200))
    as_of_date: Mapped[date] = mapped_column(Date)
    book_balance: Mapped[str] = mapped_column(Money())
    statement_balance: Mapped[str] = mapped_column(Money())
    discrepancy: Mapped[str] = mapped_column(Money())
    matched_count: Mapped[int] = mapped_column(Integer, default=0)
    open_book_count: Mapped[int] = mapped_column(Integer, default=0)
    open_statement_count: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="completed")  # completed, reviewed, disputed
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    actor_id: Mapped[str] = mapped_column(String(36))
