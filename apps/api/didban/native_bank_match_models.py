"""Immutable cross-source bank/native-book reconciliation previews."""

from sqlalchemy import JSON, ForeignKey, ForeignKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class NativeBankMatchPreview(Entity, Tenant, Base):
    __tablename__ = "native_bank_match_previews"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "bank_manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "native_statement_id"],
            ["native_statement_runs.company_id", "native_statement_runs.id"],
        ),
    )
    bank_manifest_id: Mapped[str] = mapped_column(String(36))
    native_statement_id: Mapped[str] = mapped_column(String(36))
    candidate_key: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    snapshot: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))
