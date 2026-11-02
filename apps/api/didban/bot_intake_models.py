"""Private queued attachments, never automatically posted or imported."""

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class BotIntake(Entity, Tenant, Versioned, Base):
    __tablename__ = "bot_intakes"
    __table_args__ = (
        UniqueConstraint("company_id", "provider", "update_id"),
        ForeignKeyConstraint(
            ["company_id", "source_file_id"], ["source_files.company_id", "source_files.id"]
        ),
    )
    provider: Mapped[str] = mapped_column(String(12))
    update_id: Mapped[str] = mapped_column(String(30))
    connection_id: Mapped[str] = mapped_column(ForeignKey("bot_connections.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20))
    storage_key: Mapped[str] = mapped_column(String(36))
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    scan_status: Mapped[str] = mapped_column(String(40))
    state: Mapped[str] = mapped_column(String(40), default="awaiting_import")
    source_file_id: Mapped[str | None] = mapped_column(String(36))
