import enum
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class ReconciliationStatus(enum.StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_LIMITED = "completed_limited"
    FAILED = "failed"


class MatchLevel(enum.StrEnum):
    DUPLICATE = "duplicate"
    EXACT = "exact"
    RULE = "rule"
    FUZZY = "fuzzy"
    MISMATCH = "mismatch"
    UNRESOLVED = "unresolved"


class MatchStatus(enum.StrEnum):
    AUTO_MATCHED = "auto_matched"
    POTENTIAL_MATCH = "potential_match"
    AMOUNT_MISMATCH = "amount_mismatch"
    DATE_MISMATCH = "date_mismatch"
    DUPLICATE_HIGH = "duplicate_high"
    DUPLICATE_POSSIBLE = "duplicate_possible"
    UNRESOLVED = "unresolved"


class ReconciliationRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reconciliation_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["analysis_run_id", "company_id"],
            ["analysis_runs.id", "analysis_runs.company_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("id", "company_id", name="uq_reconciliation_run_company"),
        UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_reconciliation_run_company_idempotency",
        ),
        Index("ix_reconciliation_runs_company_status", "company_id", "status"),
        Index("ix_reconciliation_runs_analysis", "analysis_run_id"),
        Index("ix_reconciliation_runs_created_by", "created_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    analysis_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    status: Mapped[ReconciliationStatus] = mapped_column(
        Enum(ReconciliationStatus, name="reconciliation_status", native_enum=False),
        nullable=False,
    )
    config_version: Mapped[str] = mapped_column(String(80), nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    counts_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_code: Mapped[str | None] = mapped_column(String(80))
    failure_message: Mapped[str | None] = mapped_column(Text)


class ReconciliationMatch(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "reconciliation_matches"
    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "company_id"],
            ["reconciliation_runs.id", "reconciliation_runs.company_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["bank_transaction_id", "company_id"],
            ["bank_transactions.id", "bank_transactions.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["journal_entry_id", "company_id"],
            ["journal_entries.id", "journal_entries.company_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "bank_transaction_id IS NOT NULL OR journal_entry_id IS NOT NULL",
            name="ck_reconciliation_match_has_record",
        ),
        CheckConstraint("score >= 0 AND score <= 100", name="ck_reconciliation_score_range"),
        UniqueConstraint(
            "run_id",
            "bank_transaction_id",
            "journal_entry_id",
            "rule_code",
            name="uq_reconciliation_candidate",
        ),
        UniqueConstraint("id", "company_id", name="uq_reconciliation_match_company"),
        Index("ix_reconciliation_matches_run_status", "run_id", "status"),
        Index("ix_reconciliation_matches_bank", "bank_transaction_id"),
        Index("ix_reconciliation_matches_journal", "journal_entry_id"),
        Index(
            "uq_reconciliation_auto_bank",
            "run_id",
            "bank_transaction_id",
            unique=True,
            postgresql_where=text("status = 'AUTO_MATCHED' AND bank_transaction_id IS NOT NULL"),
        ),
        Index(
            "uq_reconciliation_auto_journal",
            "run_id",
            "journal_entry_id",
            unique=True,
            postgresql_where=text("status = 'AUTO_MATCHED' AND journal_entry_id IS NOT NULL"),
        ),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    bank_transaction_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    journal_entry_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    match_level: Mapped[MatchLevel] = mapped_column(
        Enum(MatchLevel, name="match_level", native_enum=False), nullable=False
    )
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="match_status", native_enum=False), nullable=False
    )
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    amount_difference_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0))
    date_difference_days: Mapped[int | None] = mapped_column(Integer)
    features_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    rule_code: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
