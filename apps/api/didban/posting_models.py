"""Native final journals and explicit correction links; imported facts stay separate."""

from datetime import date

from sqlalchemy import JSON, Date, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant
from .money_type import Money


class NativeJournal(Entity, Tenant, Base):
    __tablename__ = "native_journals"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "sequence"),
        UniqueConstraint("company_id", "draft_id"),
        UniqueConstraint("company_id", "reversal_of"),
        UniqueConstraint("company_id", "replacement_of"),
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "reversal_of"], ["native_journals.company_id", "native_journals.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "replacement_of"], ["native_journals.company_id", "native_journals.id"]
        ),
    )
    draft_id: Mapped[str] = mapped_column(String(36))
    draft_version: Mapped[int] = mapped_column(Integer)
    period_id: Mapped[str] = mapped_column(String(36))
    date: Mapped[date] = mapped_column(Date)
    sequence: Mapped[int] = mapped_column(Integer)
    digest: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(String(36))
    permission_provenance: Mapped[dict] = mapped_column(JSON)
    reversal_of: Mapped[str | None] = mapped_column(String(36))
    replacement_of: Mapped[str | None] = mapped_column(String(36))


class NativeJournalLine(Entity, Tenant, Base):
    """Immutable relational line of a posted native journal for referential integrity."""

    __tablename__ = "native_journal_lines"
    __immutable_fact__ = True
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "journal_id", "line_index"),
        ForeignKeyConstraint(
            ["company_id", "journal_id"], ["native_journals.company_id", "native_journals.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "account_id"], ["accounting_accounts.company_id", "accounting_accounts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "counterparty_id"],
            ["commercial_counterparties.company_id", "commercial_counterparties.id"],
        ),
    )
    journal_id: Mapped[str] = mapped_column(String(36))
    line_index: Mapped[int] = mapped_column(Integer)
    account_id: Mapped[str] = mapped_column(String(36))
    debit: Mapped[str] = mapped_column(Money())
    credit: Mapped[str] = mapped_column(Money())
    original_debit: Mapped[str] = mapped_column(String(80))
    original_credit: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(500), default="")
    party_id: Mapped[str] = mapped_column(String(100), default="")
    counterparty_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    reference_kind: Mapped[str | None] = mapped_column(String(40), nullable=True, default=None)
    reference_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    dimension_ids: Mapped[list] = mapped_column(JSON, default=list)


class JournalCorrectionDraft(Entity, Tenant, Base):
    __tablename__ = "journal_correction_drafts"
    __table_args__ = (
        UniqueConstraint("company_id", "draft_id"),
        ForeignKeyConstraint(
            ["company_id", "original_journal_id"], ["native_journals.company_id", "native_journals.id"]
        ),
    )
    draft_id: Mapped[str] = mapped_column(String(36))
    original_journal_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(1000))
    actor_id: Mapped[str] = mapped_column(String(36))


class NativeBookReportRun(Entity, Tenant, Base):
    __tablename__ = "native_book_report_runs"
    actor_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
