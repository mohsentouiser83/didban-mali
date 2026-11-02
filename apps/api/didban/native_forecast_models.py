"""Persistent clarification plans and immutable native forecast publications."""

from sqlalchemy import JSON, Boolean, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class NativeForecastPlan(Entity, Tenant, Versioned, Base):
    __tablename__ = "native_forecast_plans"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "native_statement_id"],
            ["native_statement_runs.company_id", "native_statement_runs.id"],
        ),
    )
    native_statement_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(String(36))
    source_digest: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[str] = mapped_column(String(30), default="waiting_input")
    obligations_complete: Mapped[bool] = mapped_column(Boolean)
    forecast_run_id: Mapped[str | None] = mapped_column(String(36))


class NativeForecastRun(Entity, Tenant, Base):
    __tablename__ = "native_forecast_runs"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "plan_id"),
        ForeignKeyConstraint(
            ["company_id", "plan_id"], ["native_forecast_plans.company_id", "native_forecast_plans.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "native_statement_id"],
            ["native_statement_runs.company_id", "native_statement_runs.id"],
        ),
    )
    plan_id: Mapped[str] = mapped_column(String(36))
    native_statement_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
