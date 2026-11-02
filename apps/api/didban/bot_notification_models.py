"""Personal opt-in preferences and durable, once-claimed private delivery queue."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned, now


class BotNotificationPreference(Entity, Tenant, Versioned, Base):
    __tablename__ = "bot_notification_preferences"
    __table_args__ = (
        UniqueConstraint("company_id", "user_id", "provider"),
        UniqueConstraint("company_id", "id"),
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    provider: Mapped[str] = mapped_column(String(12))
    connection_id: Mapped[str | None] = mapped_column(ForeignKey("bot_connections.id"))
    connection_version: Mapped[int | None]
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    events: Mapped[list] = mapped_column(JSON, default=list)
    quiet_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    quiet_start: Mapped[str] = mapped_column(String(5), default="22:00")
    quiet_end: Mapped[str] = mapped_column(String(5), default="08:00")
    summary_time: Mapped[str] = mapped_column(String(5), default="09:00")
    enabled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BotNotificationDelivery(Entity, Tenant, Base):
    __tablename__ = "bot_notification_deliveries"
    __table_args__ = (
        UniqueConstraint("company_id", "dedupe_key"),
        ForeignKeyConstraint(
            ["company_id", "preference_id"],
            ["bot_notification_preferences.company_id", "bot_notification_preferences.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    preference_id: Mapped[str] = mapped_column(ForeignKey("bot_notification_preferences.id"))
    preference_version: Mapped[int]
    connection_id: Mapped[str] = mapped_column(ForeignKey("bot_connections.id"))
    connection_version: Mapped[int]
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    provider: Mapped[str] = mapped_column(String(12))
    event_type: Mapped[str] = mapped_column(String(30))
    event_id: Mapped[str] = mapped_column(String(80))
    event_version: Mapped[int]
    manifest_id: Mapped[str | None] = mapped_column(String(36))
    dedupe_key: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(30), default="pending")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_message_id: Mapped[str | None] = mapped_column(String(40))
