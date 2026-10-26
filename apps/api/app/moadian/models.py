from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import Date, ForeignKey, ForeignKeyConstraint, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class InvoiceComparisonRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "invoice_comparison_runs"
    __table_args__ = (
        UniqueConstraint("id", "company_id", name="uq_invoice_comparison_run_company"),
        UniqueConstraint("company_id", "request_key", name="uq_invoice_comparison_request"),
        Index("ix_invoice_comparison_runs_company", "company_id", "created_at"),
    )
    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False
    )
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    request_key: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    selection_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class InvoiceComparisonResult(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "invoice_comparison_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "company_id"],
            ["invoice_comparison_runs.id", "invoice_comparison_runs.company_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("run_id", "item_key", name="uq_invoice_comparison_result_key"),
        Index("ix_invoice_comparison_results_run", "company_id", "run_id", "status"),
    )
    company_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    item_key: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    ordinal: Mapped[int]
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    decision: Mapped[str] = mapped_column(
        String(16), default="open", server_default="open", nullable=False
    )
    note: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    decided_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
