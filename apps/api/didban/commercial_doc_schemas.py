"""Pydantic schemas for multi-line commercial invoices, returns, quarantine, and credits."""

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, StrictInt

from .accounting_schemas import StrictInput


class CommercialDocumentLineInput(StrictInput):
    line_kind: Literal["goods", "service"] = "goods"
    item_id: str | None = Field(default=None, max_length=36)
    description: str = Field(min_length=1, max_length=300)
    unit: str | None = Field(default=None, min_length=1, max_length=40)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    unit_price: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    line_discount: Annotated[str, Field(max_length=80)] | StrictInt = 0


class CommercialDocumentInput(StrictInput):
    direction: Literal["sale", "purchase"]
    period_id: str = Field(min_length=1, max_length=36)
    issue_date: date
    due_date: date | None = None
    party_id: str = Field(min_length=1, max_length=100)
    warehouse_id: str | None = Field(default=None, min_length=1, max_length=36)
    currency: Literal["IRR", "TOMAN"] = "IRR"
    invoice_discount: Annotated[str, Field(max_length=80)] | StrictInt = 0
    lines: list[CommercialDocumentLineInput] = Field(min_length=1, max_length=100)
    vendor_reference: str | None = Field(default=None, max_length=120)
    description: str = Field(default="", max_length=500)
    settlement_type: Literal["on_account", "cash", "mixed"] = "on_account"
    cash_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    cheque_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    on_account_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    counterparty_account_id: str | None = Field(default=None, max_length=36)
    revenue_account_id: str | None = Field(default=None, max_length=36)
    service_revenue_account_id: str | None = Field(default=None, max_length=36)
    expense_account_id: str | None = Field(default=None, max_length=36)
    discount_account_id: str | None = Field(default=None, max_length=36)
    cost_account_id: str | None = Field(default=None, max_length=36)
    cash_account_id: str | None = Field(default=None, max_length=36)
    cheque_account_id: str | None = Field(default=None, max_length=36)
    cheque_number: str | None = Field(default=None, max_length=100)
    cheque_due_date: date | None = None
    allow_credit_override: bool = False
    credit_override_reason: str = ""


class CommercialReturnLineInput(StrictInput):
    document_line_id: str = Field(min_length=1, max_length=36)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    condition: Literal["healthy", "defective"] = "healthy"


class CommercialReturnInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    reason: str = Field(min_length=1, max_length=500)
    lines: list[CommercialReturnLineInput] = Field(min_length=1, max_length=100)
    return_account_id: str | None = Field(default=None, max_length=36)
    counterparty_account_id: str | None = Field(default=None, max_length=36)
    cost_account_id: str | None = Field(default=None, max_length=36)
    adjustment_account_id: str | None = Field(default=None, max_length=36)


class QuarantineDecisionInput(StrictInput):
    decision: Literal["restocked", "repaired", "scrapped"]
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    note: str = Field(min_length=1, max_length=500)
    cost_account_id: str | None = Field(default=None, max_length=36)
    loss_account_id: str | None = Field(default=None, max_length=36)


class ApplyCreditInput(StrictInput):
    target_document_id: str = Field(min_length=1, max_length=36)
    amount_irr: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    date: date


class CreditRefundInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    amount_irr: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    cash_account_id: str = Field(min_length=1, max_length=36)
    counterparty_account_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(min_length=1, max_length=500)
