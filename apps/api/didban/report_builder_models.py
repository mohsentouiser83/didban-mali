"""Company-scoped saved report definitions and immutable evaluated runs."""

from sqlalchemy import JSON, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class SavedReportDefinition(Entity, Tenant, Versioned, Base):
    __tablename__ = "report_builder_definitions"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    name: Mapped[str] = mapped_column(String(120))
    spec: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class SavedReportRun(Entity, Tenant, Base):
    __tablename__ = "report_builder_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "definition_id"],
            ["report_builder_definitions.company_id", "report_builder_definitions.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    definition_id: Mapped[str] = mapped_column(String(36))
    definition_version: Mapped[int] = mapped_column(Integer)
    manifest_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    snapshot: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))


class NativeBuilderRun(Entity, Tenant, Base):
    """Additive native source; historical imported runs retain their original FK and evidence."""

    __tablename__ = "native_report_builder_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "definition_id"],
            ["report_builder_definitions.company_id", "report_builder_definitions.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "native_statement_id"],
            ["native_statement_runs.company_id", "native_statement_runs.id"],
        ),
    )
    definition_id: Mapped[str] = mapped_column(String(36))
    definition_version: Mapped[int] = mapped_column(Integer)
    native_statement_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    snapshot: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))


class NativeInvoiceBuilderRun(Entity, Tenant, Base):
    __tablename__ = "native_invoice_builder_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "definition_id"],
            ["report_builder_definitions.company_id", "report_builder_definitions.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "native_invoice_snapshot_id"],
            ["native_invoice_snapshots.company_id", "native_invoice_snapshots.id"],
        ),
    )
    definition_id: Mapped[str] = mapped_column(String(36))
    definition_version: Mapped[int] = mapped_column(Integer)
    native_invoice_snapshot_id: Mapped[str] = mapped_column(String(36))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    snapshot: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))
