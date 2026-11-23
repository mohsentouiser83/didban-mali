"""Private originals of spreadsheets uploaded outside source-processing sessions."""

from sqlalchemy import ForeignKey, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, ImmutableFact, Tenant


class ArchivedSpreadsheet(Entity, Tenant, ImmutableFact, Base):
    __tablename__ = "archived_spreadsheets"
    __table_args__ = (UniqueConstraint("company_id", "actor_id", "origin", "sha256", "name"),)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    origin: Mapped[str] = mapped_column(String(20))
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int]
    scan_status: Mapped[str] = mapped_column(String(30))
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
