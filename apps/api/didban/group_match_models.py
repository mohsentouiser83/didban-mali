"""Append-only evidence and human decisions for grouped bank reconciliation."""

from sqlalchemy import JSON, ForeignKeyConstraint, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class GroupMatchDecision(Entity, Tenant, Base):
    __tablename__ = "group_match_decisions"
    __table_args__ = (
        UniqueConstraint("company_id", "candidate_key", "version"),
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    candidate_key: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer)
    manifest_id: Mapped[str] = mapped_column(String(36))
    decision: Mapped[str] = mapped_column(String(20))
    bank_ids: Mapped[list] = mapped_column(JSON)
    ledger_ids: Mapped[list] = mapped_column(JSON)
    snapshot: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(Text)
