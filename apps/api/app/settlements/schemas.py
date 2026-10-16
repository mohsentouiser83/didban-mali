from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Direction = Literal["sales", "purchases"]


class InvoiceItem(BaseModel):
    source_row_id: UUID
    key: str
    direction: Direction
    number: str
    invoice_no: str = ""
    tax_id: str = ""
    canonical_invoice_id: UUID | None = None
    party_name: str
    party_id: str = ""
    tax_amount_irr: Decimal | None = None
    issue_date: date
    gross_amount_irr: Decimal
    allocated_amount_irr: Decimal = Decimal(0)
    unallocated_amount_irr: Decimal = Decimal(0)
    review_reason: str | None = None


class AllocationInput(BaseModel):
    invoice_source_row_id: UUID
    bank_transaction_id: UUID
    amount_irr: Decimal = Field(gt=0, max_digits=20, decimal_places=0)
    request_key: str = Field(min_length=8, max_length=128)
    confirm_history_complete: bool = False


class AllocationItem(BaseModel):
    id: UUID
    bank_transaction_id: UUID
    amount_irr: Decimal
    booking_date: date
    description: str
    reversed: bool


class BankCandidate(BaseModel):
    id: UUID
    booking_date: date
    description: str
    bank_label: str
    amount_irr: Decimal
    available_amount_irr: Decimal
    reason: str


class InvoiceDetail(BaseModel):
    receipt_history_complete: bool = False
    invoice: InvoiceItem
    allocations: list[AllocationItem]
    candidates: list[BankCandidate]
    transaction_total: int


class InvoicePage(BaseModel):
    items: list[InvoiceItem]
    total: int


class HistoryConfirmation(BaseModel):
    expected_allocated_amount_irr: Decimal = Field(ge=0, max_digits=20, decimal_places=0)
    confirm_complete: bool
