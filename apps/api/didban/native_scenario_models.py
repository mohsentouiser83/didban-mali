"""Immutable manual cash scenarios pinned to native statement evidence."""

from sqlalchemy import JSON, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class NativeCashScenario(Entity, Tenant, Base):
    __tablename__ = "native_cash_scenarios"
    __table_args__ = (
        UniqueConstraint("company_id", "series_id", "version"),
        ForeignKeyConstraint(
            ["company_id", "native_statement_id"],
            ["native_statement_runs.company_id", "native_statement_runs.id"],
        ),
    )
    series_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    native_statement_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(String(36))
    baseline: Mapped[dict] = mapped_column(JSON)
    changes: Mapped[dict] = mapped_column(JSON)
    comparison: Mapped[dict] = mapped_column(JSON)
