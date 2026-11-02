"""Versioned opt-out/name overrides and append-only evidence for posted-operation suggestions."""

from sqlalchemy import JSON, Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class OperationLearningPattern(Entity, Tenant, Versioned, Base):
    __tablename__ = "operation_learning_patterns"
    __table_args__ = (UniqueConstraint("company_id", "operation_id"),)
    operation_id: Mapped[str] = mapped_column(ForeignKey("accounting_operations.id"))
    name: Mapped[str] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class OperationLearningEvent(Entity, Tenant, Base):
    __tablename__ = "operation_learning_events"
    operation_id: Mapped[str] = mapped_column(ForeignKey("accounting_operations.id"))
    pattern_id: Mapped[str] = mapped_column(ForeignKey("operation_learning_patterns.id"))
    actor_id: Mapped[str] = mapped_column(String(36))
    before: Mapped[dict] = mapped_column(JSON)
    after: Mapped[dict] = mapped_column(JSON)
    source_proof: Mapped[dict] = mapped_column(JSON)


class OperationLearningCorrection(Entity, Tenant, Base):
    __tablename__ = "operation_learning_corrections"
    __table_args__ = (UniqueConstraint("company_id", "operation_id", "journal_id"),)
    operation_id: Mapped[str] = mapped_column(ForeignKey("accounting_operations.id"))
    journal_id: Mapped[str] = mapped_column(ForeignKey("native_journals.id"))
    journal_digest: Mapped[str] = mapped_column(String(64))
    approved_draft_version: Mapped[int] = mapped_column()
    accounts: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(1000))
