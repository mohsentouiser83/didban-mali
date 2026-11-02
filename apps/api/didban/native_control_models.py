"""Immutable checks of the native book; findings never rewrite journals."""

from sqlalchemy import JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant


class NativeControlRun(Entity, Tenant, Base):
    __tablename__ = "native_control_runs"
    __table_args__ = (UniqueConstraint("company_id", "digest"),)
    period_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[str] = mapped_column(String(36))
    trigger: Mapped[str] = mapped_column(String(40))
    snapshot: Mapped[dict] = mapped_column(JSON)
