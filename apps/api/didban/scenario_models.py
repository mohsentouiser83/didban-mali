"""Immutable scenario revisions, independent of financial facts and reports."""

from sqlalchemy import JSON, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class CashScenario(Entity, Tenant, Base):
    __tablename__ = "cash_scenarios"
    __table_args__ = (
        UniqueConstraint("company_id", "series_id", "version"),
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    series_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    manifest_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    baseline: Mapped[dict] = mapped_column(JSON)
    changes: Mapped[dict] = mapped_column(JSON)
    comparison: Mapped[dict] = mapped_column(JSON)
