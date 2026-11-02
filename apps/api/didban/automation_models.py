"""Versioned user rules and immutable, idempotent internal action receipts."""

from sqlalchemy import JSON, Boolean, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class AutomationRule(Entity, Tenant, Versioned, Base):
    __tablename__ = "automation_rules"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    name: Mapped[str] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    actor_id: Mapped[str] = mapped_column(String(36))
    definition: Mapped[dict] = mapped_column(JSON)


class AutomationRun(Entity, Tenant, Base):
    __tablename__ = "automation_runs"
    __table_args__ = (
        UniqueConstraint("company_id", "rule_id", "rule_version", "manifest_id"),
        ForeignKeyConstraint(
            ["company_id", "rule_id"], ["automation_rules.company_id", "automation_rules.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    rule_id: Mapped[str] = mapped_column(String(36))
    rule_version: Mapped[int] = mapped_column(Integer)
    manifest_id: Mapped[str] = mapped_column(String(36))
    definition: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)


class LearningPattern(Entity, Tenant, Versioned, Base):
    __tablename__ = "learning_patterns"
    __table_args__ = (UniqueConstraint("company_id", "fingerprint"),)
    name: Mapped[str] = mapped_column(String(120))
    fingerprint: Mapped[str] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    interpretation_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(String(36))
    payload: Mapped[dict] = mapped_column(JSON)


class AutomationPreview(Entity, Tenant, Base):
    __tablename__ = "automation_previews"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    actor_id: Mapped[str] = mapped_column(String(36))
    manifest_id: Mapped[str] = mapped_column(String(36))
    definition: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
