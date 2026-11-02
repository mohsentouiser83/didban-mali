"""Company accounting preferences and frozen chart-import previews."""

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned


class CompanyAccountingSetup(Tenant, Versioned, Base):
    __tablename__ = "company_accounting_setup"
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), primary_key=True)
    mode: Mapped[str] = mapped_column(String(20), default="analysis")


class AccountImportPreview(Entity, Tenant, Base):
    __tablename__ = "account_import_previews"
    actor_id: Mapped[str] = mapped_column(String(36))
    catalog_digest: Mapped[str] = mapped_column(String(64))
    rows: Mapped[list] = mapped_column(JSON)
