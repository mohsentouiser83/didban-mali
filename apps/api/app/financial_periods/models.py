from datetime import date
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class FinancialPeriod(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "financial_periods"
    __table_args__ = (
        CheckConstraint("start_date <= end_date", name="ck_financial_period_dates"),
        UniqueConstraint("company_id", "name", name="uq_financial_period_company_name"),
        Index("ix_financial_period_company_dates", "company_id", "start_date", "end_date"),
    )
    company_id: Mapped[UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
