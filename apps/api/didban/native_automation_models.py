"""Frozen native rule previews and idempotent internal-action receipts."""

from sqlalchemy import JSON, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class NativeAutomationPreview(Entity, Tenant, Base):
    __tablename__ = "native_automation_previews"
    actor_id: Mapped[str] = mapped_column(String(36))
    period_id: Mapped[str] = mapped_column(String(36))
    source_digest: Mapped[str] = mapped_column(String(64))
    definition: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)


class NativeAutomationRun(Entity, Tenant, Base):
    __tablename__ = "native_automation_runs"
    __table_args__ = (
        UniqueConstraint("company_id", "rule_id", "rule_version", "journal_id", "source_digest"),
        ForeignKeyConstraint(
            ["company_id", "rule_id"], ["automation_rules.company_id", "automation_rules.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "journal_id"], ["native_journals.company_id", "native_journals.id"]
        ),
    )
    rule_id: Mapped[str] = mapped_column(String(36))
    rule_version: Mapped[int] = mapped_column()
    journal_id: Mapped[str] = mapped_column(String(36))
    source_digest: Mapped[str] = mapped_column(String(64))
    definition: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
