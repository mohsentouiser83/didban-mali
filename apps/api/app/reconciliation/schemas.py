from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer, model_validator

from app.reconciliation.models import (
    MatchLevel,
    MatchStatus,
    ReconciliationStatus,
)


class ReconciliationRunRequest(BaseModel):
    config_version: Literal["reconciliation-v1"] = "reconciliation-v1"
    rule_business_days: int = Field(default=3, ge=0, le=10)
    review_calendar_days: int = Field(default=10, ge=1, le=31)
    fuzzy_threshold: Decimal = Field(default=Decimal("70"), ge=50, le=100)
    ambiguity_margin: Decimal = Field(default=Decimal("5"), ge=0, le=20)

    @model_validator(mode="after")
    def validate_windows(self) -> "ReconciliationRunRequest":
        if self.review_calendar_days < self.rule_business_days:
            raise ValueError("بازه بررسی نباید از بازه تطبیق قاعده‌ای کوچک‌تر باشد.")
        return self


class ReconciliationRunResponse(BaseModel):
    id: UUID
    company_id: UUID
    analysis_run_id: UUID
    status: ReconciliationStatus
    config_version: str
    config: dict[str, Any]
    counts: dict[str, Any]
    created_by: UUID
    started_at: datetime | None
    completed_at: datetime | None
    failure_code: str | None
    failure_message: str | None
    created_at: datetime
    updated_at: datetime


class ReconciliationMatchResponse(BaseModel):
    id: UUID
    bank_transaction_id: UUID | None
    journal_entry_id: UUID | None
    match_level: MatchLevel
    status: MatchStatus
    score: Decimal
    amount_difference_irr: Decimal | None
    date_difference_days: int | None
    features: dict[str, Any]
    evidence: dict[str, Any]
    rule_code: str
    created_at: datetime

    @field_serializer("score", "amount_difference_irr")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class ReconciliationMatchesResponse(BaseModel):
    items: list[ReconciliationMatchResponse]
    next_cursor: UUID | None
