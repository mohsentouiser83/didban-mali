from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

MatchStatus = Literal[
    "matched", "difference", "suggested", "internal_only", "portal_only", "review"
]


class InvoiceSnapshot(BaseModel):
    row_id: UUID
    batch_id: UUID
    row_number: int
    sheet: str
    invoice_no: str = ""
    tax_id: str = ""
    issue_date: date
    party_name: str = ""
    party_id: str = ""
    gross_amount: str
    tax_amount: str | None = None
    subject: str = ""
    reference_tax_id: str = ""
    status: str = ""


class ComparisonItem(BaseModel):
    status: MatchStatus
    internal: InvoiceSnapshot | None = None
    portal: InvoiceSnapshot | None = None
    differences: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    reason: str = ""


class ComparisonResponse(BaseModel):
    internal_batch_id: UUID
    portal_batch_id: UUID
    start_date: date
    end_date: date
    counts: dict[str, int]
    total: int
    items: list[ComparisonItem]
    limit: int
    offset: int
    rejected_rows: int
