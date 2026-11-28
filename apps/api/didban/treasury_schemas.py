"""Pydantic schemas for operational treasury accounts, receipts/payments, and tool allocations."""

from datetime import date as CalendarDate
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StrictInt, StrictStr, field_validator

from .accounting_schemas import DraftWriteResponse, StrictInput


def _empty_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value


TreasuryAccountKind = Literal["bank", "cash", "petty_cash", "pos"]
TreasuryToolKind = Literal["cash", "bank_transfer", "cheque", "card", "other"]
TreasuryDirection = Literal["receipt", "payment"]


class TreasuryAccountOption(BaseModel):
    id: str
    name: str
    kind: TreasuryAccountKind
    active: bool


class TreasuryAccountOptions(BaseModel):
    items: list[TreasuryAccountOption]


class TreasuryAccountDetails(TreasuryAccountOption):
    company_id: str
    account_id: str
    account_code: str | None
    code: str | None
    account_name: str | None
    account_active: bool | None
    linked_bank_id: str | None = None
    linked_bank_name: str | None = None
    bank_name: str | None = None
    account_number: str | None = None
    iban: str | None = None
    branch_name: str | None = None
    branch_code: str | None = None
    custodian_name: str | None = None
    custodian_counterparty_id: str | None = None
    petty_cash_limit_irr: str | None = None
    needs_completion: bool = False
    version: int
    created_at: datetime


class TreasuryAccountDetailsList(BaseModel):
    items: list[TreasuryAccountDetails]


class TreasuryToolLineResponse(BaseModel):
    id: str
    company_id: str
    created_at: datetime
    document_id: str
    line_index: int
    tool_kind: TreasuryToolKind
    treasury_account_id: str | None
    point_of_sale_id: str | None = None
    point_of_sale_name: str | None = None
    cheque_id: str | None
    bank_movement_id: str | None
    amount: StrictStr
    allocated_amount: StrictStr
    remaining_amount: StrictStr
    has_payment_proof: bool
    reference: str | None
    due_date: CalendarDate | None


class TreasuryAllocationResponse(BaseModel):
    id: str
    company_id: str
    created_at: datetime
    tool_line_id: str
    invoice_id: str
    invoice_reference: str | None
    amount: StrictStr
    date: CalendarDate
    actor_id: str
    reversed_at: datetime | None
    reversed_by: str | None
    reversal_reason: str | None


class TreasuryDocumentResponse(BaseModel):
    id: str
    company_id: str
    created_at: datetime
    version: int
    direction: TreasuryDirection
    number: str
    date: CalendarDate
    period_id: str
    counterparty_id: str
    counterparty_name: str | None
    counterparty_code: str | None
    total_amount: StrictStr
    allocated_amount: StrictStr
    allocatable_amount: StrictStr
    has_payment_proof: bool
    original_unit: Literal["IRR", "TOMAN"]
    description: str
    operation_id: str | None
    journal_id: str | None
    state: Literal["draft", "posted", "reversed"]
    actor_id: str
    tools: list[TreasuryToolLineResponse]
    allocations: list[TreasuryAllocationResponse]


class TreasuryDocumentListResponse(BaseModel):
    items: list[TreasuryDocumentResponse]


class TreasuryPreparedDraftResponse(BaseModel):
    document: TreasuryDocumentResponse
    draft: DraftWriteResponse
    operation_id: str


class TreasuryAccountInput(StrictInput):
    kind: TreasuryAccountKind
    name: str = Field(min_length=1, max_length=150)
    account_id: str | None = Field(default=None, min_length=1, max_length=36)
    parent_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    code: str | None = Field(default=None, max_length=100)
    level: Literal["general", "subsidiary", "detail"] | None = None
    linked_bank_id: str | None = Field(default=None, min_length=1, max_length=36)
    active: bool = True
    bank_name: str | None = Field(default=None, max_length=120)
    account_number: str | None = Field(default=None, max_length=60)
    iban: str | None = Field(default=None, max_length=34)
    branch_name: str | None = Field(default=None, max_length=120)
    branch_code: str | None = Field(default=None, max_length=30)
    custodian_name: str | None = Field(default=None, max_length=120)
    custodian_counterparty_id: str | None = Field(default=None, max_length=36)
    petty_cash_limit_irr: Annotated[str, Field(max_length=80)] | StrictInt | None = None

    @field_validator(
        "account_id",
        "parent_account_id",
        "code",
        "linked_bank_id",
        "bank_name",
        "account_number",
        "iban",
        "branch_name",
        "branch_code",
        "custodian_name",
        "custodian_counterparty_id",
        "petty_cash_limit_irr",
        mode="before",
    )
    @classmethod
    def normalize_optional(cls, value):
        return _empty_to_none(value)


class UpdateTreasuryAccountInput(StrictInput):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    active: bool | None = None
    linked_bank_id: str | None = Field(default=None, min_length=1, max_length=36)
    bank_name: str | None = Field(default=None, max_length=120)
    account_number: str | None = Field(default=None, max_length=60)
    iban: str | None = Field(default=None, max_length=34)
    branch_name: str | None = Field(default=None, max_length=120)
    branch_code: str | None = Field(default=None, max_length=30)
    custodian_name: str | None = Field(default=None, max_length=120)
    custodian_counterparty_id: str | None = Field(default=None, max_length=36)
    petty_cash_limit_irr: Annotated[str, Field(max_length=80)] | StrictInt | None = None

    @field_validator(
        "linked_bank_id",
        "bank_name",
        "account_number",
        "iban",
        "branch_name",
        "branch_code",
        "custodian_name",
        "custodian_counterparty_id",
        "petty_cash_limit_irr",
        mode="before",
    )
    @classmethod
    def normalize_optional(cls, value):
        return _empty_to_none(value)


class TreasuryToolLineInput(StrictInput):
    tool_kind: TreasuryToolKind
    treasury_account_id: str | None = Field(default=None, max_length=36)
    point_of_sale_id: str | None = Field(default=None, min_length=1, max_length=36)
    cheque_id: str | None = Field(default=None, max_length=36)
    bank_movement_id: str | None = Field(default=None, max_length=36)
    amount: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    reference: str | None = Field(default=None, max_length=120)
    due_date: CalendarDate | None = None


class TreasuryAllocationInput(StrictInput):
    tool_line_id: str = Field(min_length=1, max_length=36)
    invoice_id: str = Field(min_length=1, max_length=36)
    amount: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt


class TreasuryAllocationItemInput(StrictInput):
    tool_line_index: int = Field(ge=0)
    invoice_id: str = Field(min_length=1, max_length=36)
    amount: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt


class TreasuryDocumentInput(StrictInput):
    direction: TreasuryDirection
    date: CalendarDate
    period_id: str = Field(min_length=1, max_length=36)
    party_id: str = Field(min_length=1, max_length=100)
    unit: Literal["IRR", "TOMAN"] = "IRR"
    description: str = Field(default="", max_length=500)
    tools: list[TreasuryToolLineInput] = Field(min_length=1, max_length=50)
    allocations: list[TreasuryAllocationItemInput] = Field(default_factory=list, max_length=100)


class ReverseTreasuryAllocationInput(StrictInput):
    reason: str = Field(min_length=1, max_length=500)


class PrepareTreasuryDraftInput(StrictInput):
    counterparty_account_id: str = Field(min_length=1, max_length=36)
    cheque_account_id: str | None = Field(default=None, max_length=36)
