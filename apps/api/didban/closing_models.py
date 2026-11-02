"""Immutable provenance of explicitly selected native closing/opening drafts."""

from sqlalchemy import JSON, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class PeriodAccountingDraft(Entity, Tenant, Base):
    __tablename__ = "period_accounting_drafts"
    __table_args__ = (
        UniqueConstraint("company_id", "draft_id"),
        ForeignKeyConstraint(
            ["company_id", "source_period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "target_period_id"], ["financial_periods.company_id", "financial_periods.id"]
        ),
    )
    draft_id: Mapped[str] = mapped_column(String(36))
    source_period_id: Mapped[str] = mapped_column(String(36))
    target_period_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(1000))
    source_journal_ids: Mapped[list] = mapped_column(JSON)
    selection: Mapped[dict] = mapped_column(JSON)
    draft_digest: Mapped[str] = mapped_column(String(64))
