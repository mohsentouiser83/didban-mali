from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer

from app.reconciliation.models import (
    MatchLevel,
    MatchStatus,
    ReconciliationStatus,
)


class ReconciliationRunRequest(BaseModel):
    config_version: Literal["reconciliation-v1", "reconciliation-v2"] = "reconciliation-v2"
    bank_account_id: UUID | None = None
    period_start: date | None = None
    period_end: date | None = None
    rule_business_days: int = Field(default=3, ge=0, le=14)
    review_calendar_days: int = Field(default=10, ge=1, le=31)
    fuzzy_threshold: Decimal = Field(default=Decimal("70"), ge=50, le=100)
    ambiguity_margin: Decimal = Field(default=Decimal("5"), ge=0, le=20)


class ManualMatchRequest(BaseModel):
    bank_transaction_ids: list[UUID] = Field(min_length=1)
    journal_line_ids: list[UUID] = Field(min_length=1)
    note: str | None = None


class ReverseMatchRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ReconciliationRunResponse(BaseModel):
    id: UUID
    company_id: UUID
    analysis_run_id: UUID | None = None
    bank_account_id: UUID | None = None
    period_start: date | None = None
    period_end: date | None = None
    status: ReconciliationStatus
    config_version: str
    config: dict[str, Any]
    counts: dict[str, Any]
    matched_count: int = 0
    unmatched_bank_count: int = 0
    unmatched_journal_count: int = 0
    matched_amount_irr: Decimal = Decimal(0)
    unmatched_bank_amount_irr: Decimal = Decimal(0)
    unmatched_journal_amount_irr: Decimal = Decimal(0)
    created_by: UUID
    started_at: datetime | None
    completed_at: datetime | None
    failure_code: str | None
    failure_message: str | None
    created_at: datetime
    updated_at: datetime

    @field_serializer("matched_amount_irr", "unmatched_bank_amount_irr", "unmatched_journal_amount_irr")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else "0"


class ReconciliationAllocationResponse(BaseModel):
    id: UUID
    match_id: UUID
    side: str
    bank_transaction_id: UUID | None
    journal_line_id: UUID | None
    allocated_amount_irr: Decimal

    @field_serializer("allocated_amount_irr")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else "0"


class ReconciliationMatchResponse(BaseModel):
    id: UUID
    bank_transaction_id: UUID | None
    journal_entry_id: UUID | None
    match_type: str = "one_to_one"
    match_level: MatchLevel
    status: MatchStatus
    score: Decimal
    amount_difference_irr: Decimal | None
    date_difference_days: int | None
    features: dict[str, Any]
    evidence: dict[str, Any]
    match_reasons: list[Any] = []
    rule_code: str
    reversed_by: UUID | None = None
    reversed_at: datetime | None = None
    reversal_reason: str | None = None
    allocations: list[ReconciliationAllocationResponse] = []
    created_at: datetime

    # Display helper details
    bank_description: str | None = None
    bank_date: date | None = None
    bank_amount_irr: Decimal | None = None
    journal_description: str | None = None
    journal_date: date | None = None
    journal_amount_irr: Decimal | None = None

    @field_serializer("score", "amount_difference_irr", "bank_amount_irr", "journal_amount_irr")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class ReconciliationMatchesResponse(BaseModel):
    items: list[ReconciliationMatchResponse]
    next_cursor: UUID | None = None
    total_count: int = 0


class UnmatchedBankTransactionItem(BaseModel):
    id: UUID
    bank_account_id: UUID
    booking_date: date
    amount_irr: Decimal
    description: str
    reference: str | None = None
    source_transaction_id: str | None = None

    @field_serializer("amount_irr")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else "0"


class UnmatchedJournalLineItem(BaseModel):
    id: UUID
    entry_id: UUID
    account_id: UUID
    entry_date: date
    description: str
    debit_irr: Decimal
    credit_irr: Decimal
    net_amount_irr: Decimal
    counterparty_name: str | None = None
    invoice_ref: str | None = None

    @field_serializer("debit_irr", "credit_irr", "net_amount_irr")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else "0"


class UnmatchedRecordsResponse(BaseModel):
    bank_transactions: list[UnmatchedBankTransactionItem]
    journal_lines: list[UnmatchedJournalLineItem]
    total_unmatched_bank_amount: Decimal
    total_unmatched_journal_amount: Decimal
    total_bank_count: int
    total_journal_count: int

    @field_serializer("total_unmatched_bank_amount", "total_unmatched_journal_amount")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else "0"
