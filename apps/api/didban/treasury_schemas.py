"""Pydantic schemas for operational treasury accounts, receipts/payments, and tool allocations."""

from datetime import date as CalendarDate
from typing import Annotated, Literal

from pydantic import Field, StrictInt, field_validator

from .accounting_schemas import StrictInput


def _empty_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value


TreasuryAccountKind = Literal["bank", "cash", "petty_cash"]
TreasuryToolKind = Literal["cash", "bank_transfer", "cheque", "card", "other"]


class TreasuryAccountInput(StrictInput):
    kind: TreasuryAccountKind
    name: str = Field(min_length=1, max_length=150)
    account_id: str | None = Field(default=None, min_length=1, max_length=36)
    parent_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    code: str | None = Field(default=None, max_length=100)
    level: Literal["general", "subsidiary", "detail"] | None = None
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
    bank_name: str | None = Field(default=None, max_length=120)
    account_number: str | None = Field(default=None, max_length=60)
    iban: str | None = Field(default=None, max_length=34)
    branch_name: str | None = Field(default=None, max_length=120)
    branch_code: str | None = Field(default=None, max_length=30)
    custodian_name: str | None = Field(default=None, max_length=120)
    custodian_counterparty_id: str | None = Field(default=None, max_length=36)
    petty_cash_limit_irr: Annotated[str, Field(max_length=80)] | StrictInt | None = None

    @field_validator(
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
    direction: Literal["receipt", "payment"]
    date: CalendarDate
    period_id: str = Field(min_length=1, max_length=36)
    party_id: str = Field(min_length=1, max_length=100)
    unit: Literal["IRR", "TOMAN"] = "IRR"
    description: str = Field(default="", max_length=500)
    tools: list[TreasuryToolLineInput] = Field(min_length=1, max_length=50)
    allocations: list[TreasuryAllocationItemInput] = Field(default_factory=list, max_length=100)


class ReverseTreasuryAllocationInput(StrictInput):
    reason: str = Field(min_length=1, max_length=500)
