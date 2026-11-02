"""Named comparison groups and immutable runs; no consolidation journals."""

from sqlalchemy import JSON, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class CompanyGroup(Entity, Tenant, Versioned, Base):
    __tablename__ = "company_groups"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    name: Mapped[str] = mapped_column(String(120))
    company_ids: Mapped[list] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))


class CompanyComparisonRun(Entity, Tenant, Base):
    __tablename__ = "company_comparison_runs"
    __table_args__ = (
        ForeignKeyConstraint(["company_id", "group_id"], ["company_groups.company_id", "company_groups.id"]),
    )
    group_id: Mapped[str] = mapped_column(String(36))
    group_version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
