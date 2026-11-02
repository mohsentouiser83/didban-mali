"""Company-private discussion metadata with immutable native-document activities."""

from datetime import date

from sqlalchemy import JSON, Date, ForeignKey, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class NativeDocumentThread(Entity, Tenant, Versioned, Base):
    __tablename__ = "native_document_threads"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "draft_id"),
        ForeignKeyConstraint(
            ["company_id", "draft_id"], ["accounting_drafts.company_id", "accounting_drafts.id"]
        ),
        ForeignKeyConstraint(
            ["company_id", "assignee_membership_id"], ["memberships.company_id", "memberships.id"]
        ),
    )
    draft_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    assignee_membership_id: Mapped[str | None] = mapped_column(String(36))
    due_date: Mapped[date | None] = mapped_column(Date)
    state: Mapped[str] = mapped_column(String(24), default="open")
    next_action: Mapped[str] = mapped_column(String(500), default="")


class NativeDocumentActivity(Entity, Tenant, Base):
    __tablename__ = "native_document_activities"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "thread_id"], ["native_document_threads.company_id", "native_document_threads.id"]
        ),
    )
    thread_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(30))
    message: Mapped[str] = mapped_column(String(2000))
    context: Mapped[dict] = mapped_column(JSON)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
