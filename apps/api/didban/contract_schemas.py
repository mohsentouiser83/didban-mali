"""Pydantic schemas for B2B client contracts, milestones, and statutory deductions."""

from datetime import date as CalendarDate
from typing import Annotated, Literal

from pydantic import Field, StrictInt

from .accounting_schemas import StrictInput

MoneyInput = Annotated[str, Field(max_length=80)] | StrictInt


class ContractMilestoneInput(StrictInput):
    sequence: StrictInt = Field(ge=1, le=500)
    title: str = Field(min_length=1, max_length=200)
    due_date: CalendarDate | None = None
    amount_irr: MoneyInput
    notes: str | None = Field(default=None, max_length=1000)


class ClientContractInput(StrictInput):
    contract_number: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    counterparty_id: str = Field(min_length=1, max_length=36)
    dimension_id: str | None = Field(default=None, min_length=1, max_length=36)
    contract_kind: Literal["fixed_project", "retainer", "time_and_material"] = "fixed_project"
    status: Literal["draft", "active", "completed", "cancelled"] = "active"
    start_date: CalendarDate
    end_date: CalendarDate | None = None
    total_amount_irr: MoneyInput
    advance_payment_irr: MoneyInput = "0"
    insurance_retention_rate: MoneyInput = "5"
    performance_retention_rate: MoneyInput = "10"
    withholding_tax_rate: MoneyInput = "0"
    notes: str | None = Field(default=None, max_length=2000)
    milestones: list[ContractMilestoneInput] = Field(default_factory=list, max_length=100)


class UpdateClientContractInput(StrictInput):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    dimension_id: str | None = Field(default=None, min_length=1, max_length=36)
    status: Literal["draft", "active", "completed", "cancelled"] | None = None
    end_date: CalendarDate | None = None
    total_amount_irr: MoneyInput | None = None
    insurance_retention_rate: MoneyInput | None = None
    performance_retention_rate: MoneyInput | None = None
    withholding_tax_rate: MoneyInput | None = None
    notes: str | None = Field(default=None, max_length=2000)


class MilestoneBillingInput(StrictInput):
    invoiced_amount_irr: MoneyInput | None = None
    commercial_document_id: str | None = Field(default=None, min_length=1, max_length=36)


class MilestoneCollectionInput(StrictInput):
    auto_compute_retentions: bool = False
    cash_received_irr: MoneyInput | None = None
    insurance_retained_irr: MoneyInput = "0"
    performance_retained_irr: MoneyInput = "0"
    withholding_tax_irr: MoneyInput = "0"
