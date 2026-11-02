"""Durable media attempts and immutable unverified/reviewed extraction records."""

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class BotExtractionAttempt(Entity, Tenant, Base):
    __tablename__ = "bot_extraction_attempts"
    __table_args__ = (UniqueConstraint("company_id", "request_key"),)
    intake_id: Mapped[str] = mapped_column(ForeignKey("bot_intakes.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    request_key: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(30), default="dispatched")


class BotExtractionProposal(Entity, Tenant, Base):
    __tablename__ = "bot_extraction_proposals"
    __table_args__ = (UniqueConstraint("attempt_id"),)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("bot_extraction_attempts.id"))
    intake_id: Mapped[str] = mapped_column(ForeignKey("bot_intakes.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_sha256: Mapped[str] = mapped_column(String(64))
    model_request_id: Mapped[str | None] = mapped_column(String(36))
    method: Mapped[str] = mapped_column(String(20))
    proposal: Mapped[dict] = mapped_column(JSON)


class BotExtractionReview(Entity, Tenant, Base):
    __tablename__ = "bot_extraction_reviews"
    __table_args__ = (UniqueConstraint("proposal_id"),)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("bot_extraction_proposals.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_file_id: Mapped[str] = mapped_column(ForeignKey("source_files.id"))
    reviewed: Mapped[dict] = mapped_column(JSON)
