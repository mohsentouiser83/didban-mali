import enum
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class AlertSeverity(enum.StrEnum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class AlertCategory(enum.StrEnum):
    LIQUIDITY = "liquidity"
    CREDIT_RISK = "credit_risk"
    SUPPLY_CHAIN = "supply_chain"
    COMPLIANCE = "compliance"


class AlertCode(enum.StrEnum):
    RUNWAY_CRITICAL = "runway_critical"
    RUNWAY_WARNING = "runway_warning"
    CASH_GAP_HIGH = "cash_gap_high"
    DEBTOR_CONCENTRATION = "debtor_concentration"
    OVERDUE_RECEIVABLES_SURGE = "overdue_receivables_surge"
    CUSTOMER_CREDIT_ALERT = "customer_credit_alert"
    SUPPLIER_STOPPAGE_RISK = "supplier_stoppage_risk"
    PAYABLES_OVERDUE_SURGE = "payables_overdue_surge"
    UNMATCHED_BANK_OUTFLOW = "unmatched_bank_outflow"


class AlertStatus(enum.StrEnum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class EarlyWarningAlert(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "early_warning_alerts"
    __table_args__ = (
        Index("ix_alerts_company_status", "company_id", "status"),
        Index("ix_alerts_company_severity", "company_id", "severity"),
        Index("ix_alerts_code_status", "company_id", "code", "status"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[AlertCode] = mapped_column(
        Enum(AlertCode, name="alert_code", native_enum=False), nullable=False
    )
    category: Mapped[AlertCategory] = mapped_column(
        Enum(AlertCategory, name="alert_category", native_enum=False), nullable=False
    )
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_severity", native_enum=False), nullable=False
    )
    title_fa: Mapped[str] = mapped_column(String(200), nullable=False)
    summary_fa: Mapped[str] = mapped_column(Text, nullable=False)
    metric_key: Mapped[str] = mapped_column(String(64), nullable=False)
    current_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 4), nullable=True)
    threshold_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 4), nullable=True)
    metric_unit: Mapped[str] = mapped_column(String(32), default="IRR", nullable=False)
    suggested_action_fa: Mapped[str] = mapped_column(Text, nullable=False)
    target_route: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus, name="alert_status", native_enum=False),
        default=AlertStatus.ACTIVE,
        nullable=False,
    )
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    action_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class AlertWebhookConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "alert_webhook_configs"
    __table_args__ = (Index("ix_alert_webhooks_company", "company_id", "is_active"),)

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    secret_token: Mapped[str | None] = mapped_column(String(256), nullable=True)
    min_severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_webhook_min_severity", native_enum=False),
        default=AlertSeverity.WARNING,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_delivery_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_delivery_code: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AlertWebhookDeliveryLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "alert_webhook_delivery_logs"
    __table_args__ = (Index("ix_alert_delivery_webhook", "webhook_id", "created_at"),)

    webhook_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("alert_webhook_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    alert_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("early_warning_alerts.id", ondelete="SET NULL"),
        nullable=True,
    )
    request_payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    response_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
