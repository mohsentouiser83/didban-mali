from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class PlannedPayment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cashflow_planned_payments"
    __table_args__ = (
        CheckConstraint("amount_irr > 0", name="ck_planned_payment_positive"),
        Index("ix_planned_payments_company_date", "company_id", "payment_date"),
    )
    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_irr: Mapped[Decimal] = mapped_column(Numeric(24, 0), nullable=False)
