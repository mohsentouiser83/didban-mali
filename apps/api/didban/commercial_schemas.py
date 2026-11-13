"""Schemas for commercial counterparties, credit controls, and proforma invoices."""

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, StrictInt

from .accounting_schemas import StrictInput


class CounterpartyInput(StrictInput):
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    national_id: str | None = Field(default=None, max_length=20)
    economic_code: str | None = Field(default=None, max_length=20)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    credit_limit_irr: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    active: bool = True


class UpdateCounterpartyInput(StrictInput):
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    national_id: str | None = Field(default=None, max_length=20)
    economic_code: str | None = Field(default=None, max_length=20)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    credit_limit_irr: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    active: bool | None = None


class ProformaLineInput(StrictInput):
    item_id: str | None = Field(default=None, max_length=36)
    description: str = Field(min_length=1, max_length=300)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    unit_price: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    discount: Annotated[str, Field(max_length=80)] | StrictInt = 0


class ProformaInput(StrictInput):
    number: str = Field(min_length=1, max_length=100)
    direction: Literal["sale", "purchase"] = "sale"
    date: date
    expiry_date: date | None = None
    party_id: str = Field(min_length=1, max_length=100)
    currency: Literal["IRR", "TOMAN"] = "IRR"
    lines: list[ProformaLineInput] = Field(min_length=1, max_length=100)
    terms: str | None = Field(default=None, max_length=1000)


class ConvertProformaInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    counterparty_account_id: str = Field(min_length=1, max_length=36)
    revenue_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    cost_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    source_reference: str = Field(min_length=1, max_length=120)
    allow_credit_override: bool = False
    credit_override_reason: str = ""
