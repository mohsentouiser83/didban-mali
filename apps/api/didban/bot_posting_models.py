"""Frozen private bot reviews; tokens authorize no effect without live checks."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class BotPostingReview(Entity, Tenant, Base):
    __tablename__ = "bot_posting_reviews"
    __table_args__ = (UniqueConstraint("token_hash"), UniqueConstraint("company_id", "id"))
    user_id: Mapped[str] = mapped_column(String(36))
    connection_id: Mapped[str] = mapped_column(String(36))
    connection_version: Mapped[int]
    token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    items: Mapped[list] = mapped_column(JSON)
    snapshots: Mapped[list] = mapped_column(JSON)


class BotPostingDispatch(Entity, Tenant, Base):
    __tablename__ = "bot_posting_dispatches"
    __table_args__ = (
        UniqueConstraint("review_id"),
        ForeignKeyConstraint(
            ["company_id", "review_id"], ["bot_posting_reviews.company_id", "bot_posting_reviews.id"]
        ),
    )
    review_id: Mapped[str] = mapped_column(String(36))
    state: Mapped[str] = mapped_column(String(24), default="prepared")
    sent_message_id: Mapped[str | None] = mapped_column(String(30))
    result: Mapped[dict | None] = mapped_column(JSON)
