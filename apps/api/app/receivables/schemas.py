from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_serializer

RiskLevel = Literal["low", "medium", "high", "critical"]
BucketKey = Literal["not_due", "1_30", "31_60", "61_90", "90_plus"]


class AgingBucketDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bucket_key: BucketKey
    label_fa: str
    amount_irr: Decimal
    invoice_count: int
    share_percentage: float

    @field_serializer("amount_irr")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, "f")


class ReceivablesSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of_date: date
    total_receivables_irr: Decimal
    total_overdue_irr: Decimal
    overdue_ratio: float
    dso_days: int
    customer_count: int
    high_risk_customer_count: int
    buckets: list[AgingBucketDetail]

    @field_serializer("total_receivables_irr", "total_overdue_irr")
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")


class CustomerReceivableItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    counterparty_id: UUID
    name: str
    national_id: str | None
    total_outstanding_irr: Decimal
    overdue_amount_irr: Decimal
    overdue_ratio: float
    avg_delay_days: int
    risk_level: RiskLevel
    risk_score: int
    recommended_action: str
    buckets: dict[BucketKey, str]
    open_invoices_count: int

    @field_serializer("total_outstanding_irr", "overdue_amount_irr")
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")


class CustomersReceivablesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of_date: date
    items: list[CustomerReceivableItem]


class ReceivableInvoiceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    invoice_no: str
    counterparty_id: UUID
    counterparty_name: str
    issue_date: date
    due_date: date | None
    gross_amount_irr: Decimal
    paid_amount_irr: Decimal
    remaining_amount_irr: Decimal
    delay_days: int
    bucket_key: BucketKey
    status: str | None

    @field_serializer("gross_amount_irr", "paid_amount_irr", "remaining_amount_irr")
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")


class InvoicesReceivablesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of_date: date
    items: list[ReceivableInvoiceItem]
