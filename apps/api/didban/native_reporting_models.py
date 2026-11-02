"""Explicit versioned account semantics and immutable native-book statement snapshots."""

from sqlalchemy import JSON, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class NativeAccountRole(Entity, Tenant, Versioned, Base):
    __tablename__ = "native_account_roles"
    __table_args__ = (
        UniqueConstraint("company_id", "account_id"),
        ForeignKeyConstraint(
            ["company_id", "account_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]
        ),
    )
    account_id: Mapped[str] = mapped_column(String(36))
    role: Mapped[str | None] = mapped_column(String(40))
    actor_id: Mapped[str] = mapped_column(String(36))


class NativeStatementRun(Entity, Tenant, Base):
    __tablename__ = "native_statement_runs"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    actor_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)


class NativeOpeningEvidence(Entity, Tenant, Base):
    __tablename__ = "native_opening_evidence"
    __table_args__ = (
        UniqueConstraint("company_id", "journal_id"),
        ForeignKeyConstraint(
            ["company_id", "journal_id"], ["native_journals.company_id", "native_journals.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
    )
    journal_id: Mapped[str] = mapped_column(String(36))
    period_id: Mapped[str] = mapped_column(String(36))
    journal_digest: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(String(1000))
    actor_id: Mapped[str] = mapped_column(String(36))
    permission_provenance: Mapped[dict] = mapped_column(JSON)


class NativeZeroOpeningEvidence(Entity, Tenant, Base):
    __tablename__ = "native_zero_opening_evidence"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
    )
    period_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(1000))
    actor_id: Mapped[str] = mapped_column(String(36))
    permission_provenance: Mapped[dict] = mapped_column(JSON)


class NativeStatementApproval(Entity, Tenant, Base):
    __tablename__ = "native_statement_approvals"
    __table_args__ = (
        UniqueConstraint("company_id", "run_id", "actor_id"),
        ForeignKeyConstraint(
            ["company_id", "run_id"], ["native_statement_runs.company_id", "native_statement_runs.id"]
        ),
    )
    run_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[str] = mapped_column(String(36))
    actor_name: Mapped[str] = mapped_column(String(100))
    permission_provenance: Mapped[dict] = mapped_column(JSON)
