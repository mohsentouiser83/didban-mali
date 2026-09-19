from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_serializer

PayablesRiskLevel = Literal["low", "medium", "high", "critical"]
PayablesBucketKey = Literal["not_due", "1_30", "31_60", "61_90", "90_plus"]


class PayableAgingBucketDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bucket_key: PayablesBucketKey
    label_fa: str
    amount_irr: Decimal
    vendor_count: int
    share_percentage: float

    @field_serializer("amount_irr")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, "f")


class VendorPayableItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    counterparty_id: UUID
    name: str
    national_id: str | None
    total_payable_irr: Decimal
    overdue_amount_irr: Decimal
    overdue_ratio: float
    avg_delay_days: int
    risk_level: PayablesRiskLevel
    risk_score: int
    recommended_action: str
    buckets: dict[PayablesBucketKey, str]
    share_of_total_payables: float

    @field_serializer("total_payable_irr", "overdue_amount_irr")
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")


class PayablesSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of_date: date
    total_payables_irr: Decimal
    total_overdue_irr: Decimal
    overdue_ratio: float
    dpo_days: int
    dso_days: int
    ccc_days: int
    vendor_count: int
    high_risk_vendor_count: int
    buckets: list[PayableAgingBucketDetail]

    @field_serializer("total_payables_irr", "total_overdue_irr")
    def serialize_amounts(self, value: Decimal) -> str:
        return format(value, "f")


class VendorsPayablesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of_date: date
    items: list[VendorPayableItem]
