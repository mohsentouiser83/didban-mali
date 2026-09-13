import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import UUIDPrimaryKeyMixin
from app.findings.models import FindingWorkflowStatus


class ReviewDecisionType(enum.StrEnum):
    CONFIRMED = "confirmed"
    DISMISSED = "dismissed"
    FOLLOW_UP = "follow_up"
    RESOLVED = "resolved"


class ReviewDecision(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "review_decisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "note IS NULL OR (char_length(trim(note)) > 0 AND char_length(note) <= 2000)",
            name="ck_review_decision_note_length",
        ),
        UniqueConstraint(
            "company_id", "idempotency_key", name="uq_review_decision_company_idempotency"
        ),
        Index(
            "ix_review_decisions_finding_cursor",
            "finding_id",
            "id",
        ),
        Index("ix_review_decisions_company_created", "company_id", "created_at"),
        Index("ix_review_decisions_actor", "actor_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    decision: Mapped[ReviewDecisionType] = mapped_column(
        Enum(ReviewDecisionType, name="review_decision_type", native_enum=False), nullable=False
    )
    previous_status: Mapped[FindingWorkflowStatus] = mapped_column(
        Enum(
            FindingWorkflowStatus,
            name="review_previous_workflow_status",
            native_enum=False,
        ),
        nullable=False,
    )
    resulting_status: Mapped[FindingWorkflowStatus] = mapped_column(
        Enum(
            FindingWorkflowStatus,
            name="review_resulting_workflow_status",
            native_enum=False,
        ),
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FindingNote(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finding_notes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["finding_id", "company_id"],
            ["findings.id", "findings.company_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["supersedes_id", "company_id", "finding_id"],
            ["finding_notes.id", "finding_notes.company_id", "finding_notes.finding_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "char_length(trim(body)) > 0 AND char_length(body) <= 4000",
            name="ck_finding_note_body_length",
        ),
        UniqueConstraint("id", "company_id", "finding_id", name="uq_finding_note_scope"),
        UniqueConstraint("supersedes_id", name="uq_finding_note_supersedes"),
        UniqueConstraint(
            "company_id", "idempotency_key", name="uq_finding_note_company_idempotency"
        ),
        Index("ix_finding_notes_finding_cursor", "finding_id", "id"),
        Index("ix_finding_notes_company_created", "company_id", "created_at"),
        Index("ix_finding_notes_actor", "actor_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    actor_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    supersedes_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
