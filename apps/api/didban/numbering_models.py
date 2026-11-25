"""Configurable numbering system for entities with serials and codes."""

from sqlalchemy import Boolean, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class NumberingSystem(Entity, Tenant, Versioned, Base):
    __tablename__ = "numbering_systems"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "entity_type"),
    )
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_title: Mapped[str] = mapped_column(String(120))
    prefix: Mapped[str] = mapped_column(String(30), default="")
    start_number: Mapped[int] = mapped_column(Integer, default=1)
    current_number: Mapped[int] = mapped_column(Integer, default=1)
    padding: Mapped[int] = mapped_column(Integer, default=3)
    suffix: Mapped[str] = mapped_column(String(30), default="")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    @property
    def sample(self) -> str:
        padded = str(self.current_number).zfill(self.padding)
        return f"{self.prefix}{padded}{self.suffix}"


class NumberingAssignment(Entity, Tenant, Base):
    """A stable reservation included in the exact journal approval snapshot."""

    __tablename__ = "numbering_assignments"
    __table_args__ = (
        UniqueConstraint("company_id", "entity_type", "record_id"),
        UniqueConstraint("company_id", "entity_type", "number"),
    )
    entity_type: Mapped[str] = mapped_column(String(60))
    record_id: Mapped[str] = mapped_column(String(36))
    number: Mapped[str] = mapped_column(String(120))
