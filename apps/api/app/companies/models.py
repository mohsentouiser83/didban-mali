import enum
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class CompanyRole(enum.StrEnum):
    OWNER = "owner"
    FINANCE_MANAGER = "finance_manager"
    ADVISOR = "advisor"
    VIEWER = "viewer"


class Company(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "companies"
    __table_args__ = (Index("ix_companies_workspace_created", "workspace_id", "created_at"),)

    workspace_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    national_id: Mapped[str | None] = mapped_column(String(32))
    currency: Mapped[str] = mapped_column(String(3), default="IRR", nullable=False)
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Tehran", nullable=False)


class CompanyAccess(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "company_access"
    __table_args__ = (
        UniqueConstraint("company_id", "user_id", name="uq_company_access_company_user"),
        Index("ix_company_access_user_company", "user_id", "company_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[CompanyRole] = mapped_column(
        Enum(CompanyRole, name="company_role", native_enum=False), nullable=False
    )
