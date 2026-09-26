from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class CustomerSuccessRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customer_success_records"
    __table_args__ = (UniqueConstraint("company_id", name="uq_customer_success_company"),)

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    industry: Mapped[str] = mapped_column(String(120), nullable=False)
    finance_team_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    accounting_system: Mapped[str] = mapped_column(String(120), default="سپیدار", nullable=False)
    bank_account_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    monthly_transaction_volume: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    main_pain_point: Mapped[str] = mapped_column(Text, nullable=False)
    primary_use_case: Mapped[str] = mapped_column(String(200), nullable=False)
    champion_name: Mapped[str] = mapped_column(String(120), nullable=False)
    executive_sponsor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    go_live_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    baseline_process_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    expected_outcomes_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    review_30d_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    review_60d_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    review_90d_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    health_status: Mapped[str] = mapped_column(String(32), default="healthy", nullable=False)
    implementation_hours_dev: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal(0), nullable=False)
    implementation_hours_consultant: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal(0), nullable=False)
    implementation_hours_cs: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal(0), nullable=False)
    pricing_tier: Mapped[str] = mapped_column(String(64), default="control", nullable=False)
    monthly_contract_value_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), default=Decimal(0), nullable=False)


class GoLiveValidation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "go_live_validations"

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    validated_by_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    validated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cash_position_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    receivables_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    payables_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    reconciliation_difference_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    opening_balance_confirmed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    user_statement: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class SupportTicket(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "support_tickets"

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    current_route: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_digest: Mapped[str | None] = mapped_column(String(128), nullable=True)
    safe_diagnostic_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProductFeedback(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "product_feedbacks"

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    problem_statement: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    impact: Mapped[str] = mapped_column(String(64), default="medium", nullable=False)
    workaround: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class ProductAnalyticsEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "product_analytics_events"
    __table_args__ = (
        Index("ix_analytics_events_company_name", "company_id", "event_name"),
        Index("ix_analytics_events_occurred", "occurred_at"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_name: Mapped[str] = mapped_column(String(100), nullable=False)
    properties_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
