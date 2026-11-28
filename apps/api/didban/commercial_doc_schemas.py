"""Pydantic schemas for multi-line commercial invoices, returns, quarantine, and credits."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, JsonValue, StrictInt, StrictStr

from .accounting_schemas import DraftWriteResponse, StrictInput

CommercialDirection = Literal["sale", "purchase"]
CommercialLineKind = Literal["goods", "service"]
CommercialSettlementType = Literal["on_account", "cash", "mixed"]


class CommercialCostLayerResponse(BaseModel):
    journal_id: str
    quantity: int
    unit_cost_irr: StrictStr


class CommercialDocumentLineResponse(BaseModel):
    id: str
    company_id: str
    created_at: datetime
    document_id: str
    line_index: int
    line_kind: CommercialLineKind
    item_id: str | None
    description: str
    unit: str
    quantity: int
    unit_price_irr: StrictStr
    gross_amount_irr: StrictStr
    line_discount_irr: StrictStr
    net_before_inv_disc_irr: StrictStr
    allocated_invoice_discount_irr: StrictStr
    vat_rate_pct: StrictStr = "0"
    vat_amount_irr: StrictStr = "0"
    net_amount_irr: StrictStr
    cost_irr: StrictStr
    cost_layers: list[CommercialCostLayerResponse]
    returned_healthy_qty: int
    returned_defective_qty: int
    journal_line_id: str | None
    inventory_movement_id: str | None
    remaining_returnable_qty: int


class CommercialDocumentResponse(BaseModel):
    id: str
    company_id: str
    created_at: datetime
    version: int
    number: str
    direction: CommercialDirection
    status: Literal["draft", "posted", "partially_returned", "fully_returned", "reversed", "discarded"]
    issue_date: date
    posting_date: date | None
    due_date: date | None
    period_id: str
    counterparty_id: str
    party_snapshot: dict[str, JsonValue]
    party_name: str | None
    warehouse_id: str | None
    warehouse_name: str | None
    proforma_id: str | None
    currency: Literal["IRR", "TOMAN"]
    gross_amount_irr: StrictStr
    line_discount_total_irr: StrictStr
    invoice_discount_irr: StrictStr
    vat_total_irr: StrictStr = "0"
    net_amount_irr: StrictStr
    open_balance_irr: StrictStr | None
    settlement_type: CommercialSettlementType
    cash_amount_irr: StrictStr
    cheque_amount_irr: StrictStr
    on_account_amount_irr: StrictStr
    applied_credit_irr: StrictStr
    vendor_reference: str | None
    description: str
    operation_id: str | None
    draft_id: str | None
    journal_id: str | None
    native_invoice_id: str | None
    accounts: dict[str, str | None]
    actor_id: str
    lines: list[CommercialDocumentLineResponse]


class CommercialDocumentListResponse(BaseModel):
    total: int
    items: list[CommercialDocumentResponse]


class CommercialDocumentDraftResponse(BaseModel):
    document: CommercialDocumentResponse
    operation_id: str
    draft: DraftWriteResponse
    source_reference: str
    financial_effect: Literal[False]


class CommercialDocumentLineInput(StrictInput):
    line_kind: CommercialLineKind = "goods"
    item_id: str | None = Field(default=None, max_length=36)
    description: str = Field(min_length=1, max_length=300)
    unit: str | None = Field(default=None, min_length=1, max_length=40)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    unit_price: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    line_discount: Annotated[str, Field(max_length=80)] | StrictInt = 0
    vat_rate_pct: Annotated[str, Field(max_length=20)] | StrictInt = 0


class CommercialDocumentInput(StrictInput):
    direction: CommercialDirection
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
    settlement_type: CommercialSettlementType = "on_account"
    cash_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    cheque_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    on_account_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    counterparty_account_id: str | None = Field(default=None, max_length=36)
    revenue_account_id: str | None = Field(default=None, max_length=36)
    service_revenue_account_id: str | None = Field(default=None, max_length=36)
    expense_account_id: str | None = Field(default=None, max_length=36)
    discount_account_id: str | None = Field(default=None, max_length=36)
    vat_account_id: str | None = Field(default=None, max_length=36)
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
