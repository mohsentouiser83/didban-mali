from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.alerts.models import AlertCategory, AlertCode, AlertSeverity, AlertStatus


class EarlyWarningAlertItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    code: AlertCode
    category: AlertCategory
    severity: AlertSeverity
    title_fa: str
    summary_fa: str
    metric_key: str
    current_value: Decimal | None = None
    threshold_value: Decimal | None = None
    metric_unit: str = "IRR"
    suggested_action_fa: str
    target_route: str
    status: AlertStatus
    triggered_at: datetime
    acknowledged_at: datetime | None = None
    acknowledged_by_user_id: UUID | None = None
    resolved_at: datetime | None = None
    action_note: str | None = None


class AlertsListResponse(BaseModel):
    items: list[EarlyWarningAlertItem]
    total_count: int


class AlertsSummaryResponse(BaseModel):
    total_active: int
    critical_count: int
    warning_count: int
    info_count: int
    liquidity_count: int
    credit_risk_count: int
    supply_chain_count: int
    compliance_count: int
    active_alerts: list[EarlyWarningAlertItem]


class AlertAcknowledgeRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class AlertResolveRequest(BaseModel):
    action_note: str = Field(min_length=3, max_length=1000)


class AlertWebhookCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    url: str = Field(min_length=8, max_length=500)
    secret_token: str | None = Field(default=None, max_length=256)
    min_severity: AlertSeverity = AlertSeverity.WARNING


class AlertWebhookItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str
    url: str
    min_severity: AlertSeverity
    is_active: bool
    created_at: datetime
    last_triggered_at: datetime | None = None
    last_delivery_status: str | None = None
    last_delivery_code: int | None = None


class AlertWebhooksListResponse(BaseModel):
    items: list[AlertWebhookItem]


class AlertWebhookTestResult(BaseModel):
    webhook_id: UUID
    is_success: bool
    status_code: int | None = None
    message: str
    duration_ms: int
