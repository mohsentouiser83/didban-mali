"""Human approval applies only to the exact frozen selected-elimination report."""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class ConsolidationApproval(Entity, Tenant, Base):
    __tablename__ = "consolidation_approvals"
    __table_args__ = (UniqueConstraint("company_id", "draft_id", "actor_id", "draft_digest"),)
    draft_id: Mapped[str] = mapped_column(ForeignKey("draft_consolidation_runs.id"))
    draft_digest: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    permission_provenance: Mapped[str] = mapped_column(String(150))
    policy_version: Mapped[str] = mapped_column(String(80))
    scope: Mapped[str] = mapped_column(String(80), default="selected_intercompany_eliminations")
