"""Immutable origin for operations which create human-reviewable drafts."""

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class OperationDraft(Entity, Tenant, Base):
    __tablename__ = "accounting_operations"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "kind", "source_reference"),
        UniqueConstraint("company_id", "draft_id"),
    )
    draft_id: Mapped[str] = mapped_column(ForeignKey("accounting_drafts.id"))
    kind: Mapped[str] = mapped_column(String(40))
    source_reference: Mapped[str] = mapped_column(String(120))
    payload: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))
    policy_version: Mapped[str] = mapped_column(String(60), default="user-provisional-2026-11-02-v1")

    @property
    def business_reference(self) -> str:
        if self.kind in ("purchase_goods", "sale_goods"):
            return self.payload["source_reference"]
        return self.source_reference
