"""Draft eliminations and user-declared reciprocal identity mappings, never posted journals."""

from sqlalchemy import JSON, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class IntercompanyMapping(Entity, Tenant, Base):
    __tablename__ = "intercompany_mappings"
    __table_args__ = (
        UniqueConstraint("company_id", "group_id", "left_company", "right_company", "version"),
        ForeignKeyConstraint(["company_id", "group_id"], ["company_groups.company_id", "company_groups.id"]),
    )
    group_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer)
    left_company: Mapped[str] = mapped_column(ForeignKey("companies.id"))
    right_company: Mapped[str] = mapped_column(ForeignKey("companies.id"))
    left_party_id: Mapped[str] = mapped_column(String(100))
    right_party_id: Mapped[str] = mapped_column(String(100))
    ownership_declaration: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class DraftConsolidationRun(Entity, Tenant, Base):
    __tablename__ = "draft_consolidation_runs"
    comparison_id: Mapped[str] = mapped_column(ForeignKey("company_comparison_runs.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    snapshot: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))
