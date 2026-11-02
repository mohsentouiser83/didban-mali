"""Optional dimensions; immutable allocations never modify source journal lines."""

from sqlalchemy import JSON, Boolean, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class Dimension(Entity, Tenant, Versioned, Base):
    __tablename__ = "financial_dimensions"
    __table_args__ = (UniqueConstraint("company_id", "id"), UniqueConstraint("company_id", "kind", "code"))
    kind: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class DimensionAllocation(Entity, Tenant, Base):
    __tablename__ = "dimension_allocations"
    __table_args__ = (
        UniqueConstraint("company_id", "line_id", "kind", "version"),
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    line_id: Mapped[str] = mapped_column(ForeignKey("journal_lines.id"))
    manifest_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))
    shares: Mapped[list] = mapped_column(JSON)
    review_reason: Mapped[str] = mapped_column(String(500))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class DimensionReportRun(Entity, Tenant, Base):
    __tablename__ = "dimension_report_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    manifest_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    snapshot: Mapped[dict] = mapped_column(JSON)


class NativeDimensionAllocation(Entity, Tenant, Base):
    __tablename__ = "native_dimension_allocations"
    __table_args__ = (
        UniqueConstraint("company_id", "line_id", "kind", "version"),
        ForeignKeyConstraint(
            ["company_id", "native_statement_id"],
            ["native_statement_runs.company_id", "native_statement_runs.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "journal_id"], ["native_journals.company_id", "native_journals.id"]
        ),
    )
    line_id: Mapped[str] = mapped_column(String(36))
    journal_id: Mapped[str] = mapped_column(String(36))
    line_index: Mapped[int] = mapped_column(Integer)
    source_role: Mapped[str] = mapped_column(String(40))
    native_statement_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))
    shares: Mapped[list] = mapped_column(JSON)
    review_reason: Mapped[str] = mapped_column(String(500))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class NativeDimensionReportRun(Entity, Tenant, Base):
    __tablename__ = "native_dimension_report_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "native_statement_id"],
            ["native_statement_runs.company_id", "native_statement_runs.id"],
        ),
    )
    native_statement_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    snapshot: Mapped[dict] = mapped_column(JSON)
