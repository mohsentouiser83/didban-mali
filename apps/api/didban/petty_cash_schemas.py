"""Pydantic schemas for petty cash expenses and settlements."""

from datetime import date as CalendarDate
from typing import Annotated, Literal

from pydantic import Field, StrictInt

from .accounting_schemas import StrictInput

MoneyInput = Annotated[str, Field(max_length=80)] | StrictInt

ExpenseCategory = Literal[
    "cloud_server",
    "software_license",
    "subcontractor",
    "transport",
    "meals",
    "office_supplies",
    "utilities",
    "other",
]


class PettyCashExpenseInput(StrictInput):
    treasury_account_id: str = Field(min_length=1, max_length=36)
    period_id: str = Field(min_length=1, max_length=36)
    expense_account_id: str = Field(min_length=1, max_length=36)
    dimension_id: str | None = Field(default=None, min_length=1, max_length=36)
    category: ExpenseCategory = "other"
    expense_date: CalendarDate
    title: str = Field(min_length=1, max_length=200)
    amount_irr: MoneyInput
    receipt_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class PettyCashSettlementInput(StrictInput):
    treasury_account_id: str = Field(min_length=1, max_length=36)
    period_id: str = Field(min_length=1, max_length=36)
    settlement_date: CalendarDate
    expense_ids: list[str] | None = Field(default=None, max_length=500)
    replenish_from_treasury_id: str | None = Field(default=None, min_length=1, max_length=36)
    notes: str | None = Field(default=None, max_length=1000)
