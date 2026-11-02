"""Immutable explicit-selection previews for human bank/ledger group matching."""

from sqlalchemy import JSON, ForeignKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class ManualGroupPreview(Entity, Tenant, Base):
    __tablename__ = "manual_group_previews"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    run_id: Mapped[str] = mapped_column(String(36))
    manifest_id: Mapped[str] = mapped_column(String(36))
    candidate_key: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[str] = mapped_column(String(36))
    snapshot: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))
