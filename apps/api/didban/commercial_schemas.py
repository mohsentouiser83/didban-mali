"""Schemas for commercial counterparties, credit controls, and proforma invoices."""

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, StrictInt, model_validator

from .accounting_schemas import StrictInput

CounterpartyType = Literal["supplier", "customer", "employee", "other"]
CounterpartyEntityKind = Literal["natural_person", "legal_entity", "other"]


class CounterpartyInput(StrictInput):
    type: CounterpartyType | None = None
    entity_kind: CounterpartyEntityKind = "other"
    roles: list[CounterpartyType] | None = None
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    national_id: str | None = Field(default=None, max_length=20)
    economic_code: str | None = Field(default=None, max_length=20)
    registration_number: str | None = Field(default=None, max_length=40)
    postal_code: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    credit_limit_irr: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    active: bool = True

    @model_validator(mode="after")
    def require_type_or_roles(self):
        if "type" in self.model_fields_set and self.type is None:
            raise ValueError("type cannot be null")
        if self.type is None and not self.roles:
            raise ValueError("type or roles is required")
        return self


class UpdateCounterpartyInput(StrictInput):
    type: CounterpartyType | None = None
    entity_kind: CounterpartyEntityKind | None = None
    roles: list[CounterpartyType] | None = None
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    national_id: str | None = Field(default=None, max_length=20)
    economic_code: str | None = Field(default=None, max_length=20)
    registration_number: str | None = Field(default=None, max_length=40)
    postal_code: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)
    credit_limit_irr: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def reject_null_type(self):
        if "type" in self.model_fields_set and self.type is None:
            raise ValueError("type cannot be null")
        return self


class ProformaLineInput(StrictInput):
    item_id: str | None = Field(default=None, max_length=36)
    line_kind: Literal["goods", "service"] = "goods"
    unit: str | None = Field(default=None, min_length=1, max_length=40)
    description: str = Field(min_length=1, max_length=300)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    unit_price: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    discount: Annotated[str, Field(max_length=80)] | StrictInt = 0


class ProformaInput(StrictInput):
    number: str | None = Field(default=None, min_length=1, max_length=100)
    direction: Literal["sale"] = "sale"
    date: date
    expiry_date: date | None = None
    party_id: str = Field(min_length=1, max_length=100)
    currency: Literal["IRR", "TOMAN"] = "IRR"
    lines: list[ProformaLineInput] = Field(min_length=1, max_length=100)
    invoice_discount: Annotated[str, Field(max_length=80)] | StrictInt = 0
    terms: str | None = Field(default=None, max_length=1000)


class ProformaCancelInput(StrictInput):
    reason: str = Field(min_length=1, max_length=500)


class ConvertProformaInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str | None = Field(default=None, min_length=1, max_length=36)
    issue_date: date | None = None
    counterparty_account_id: str | None = Field(default=None, max_length=36)
    revenue_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    service_revenue_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    discount_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    cost_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    invoice_discount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    source_reference: str | None = Field(default=None, min_length=1, max_length=120)
    allow_credit_override: bool = False
    credit_override_reason: str = ""
    settlement_type: Literal["on_account", "cash", "mixed"] = "on_account"
    cash_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    cheque_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    on_account_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    cash_account_id: str | None = Field(default=None, max_length=36)
    cheque_account_id: str | None = Field(default=None, max_length=36)
    cheque_number: str | None = Field(default=None, max_length=100)
    cheque_due_date: date | None = None
