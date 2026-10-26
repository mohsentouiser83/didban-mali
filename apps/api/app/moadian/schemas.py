from datetime import date
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

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
    source_rows: list[dict[str, object]] = Field(default_factory=list)
    import_limitations: list[str] = Field(default_factory=list)


class ComparisonItem(BaseModel):
    status: MatchStatus
    internal: InvoiceSnapshot | None = None
    portal: InvoiceSnapshot | None = None
    differences: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    reason: str = ""
    related_documents: list[InvoiceSnapshot] = Field(default_factory=list)
    absence_confirmed: bool = False
    key: str = ""
    decision: str | None = None
    note: str = ""


class ComparisonResponse(BaseModel):
    direction: Literal["sales", "purchases"] = "sales"
    internal_batch_id: UUID
    portal_batch_id: UUID
    internal_batch_ids: list[UUID] = Field(default_factory=list)
    portal_batch_ids: list[UUID] = Field(default_factory=list)
    coverage: dict[str, Any] = Field(default_factory=dict)
    overlapping_copies: int = 0
    run_id: UUID | None = None
    start_date: date
    end_date: date
    counts: dict[str, int]
    total: int
    items: list[ComparisonItem]
    limit: int
    offset: int
    rejected_rows: int


class ComparisonRequest(BaseModel):
    internal_batch_ids: list[UUID] = Field(min_length=1, max_length=100)
    portal_batch_ids: list[UUID] = Field(min_length=1, max_length=100)
    direction: Literal["sales", "purchases"]
    start_date: date
    end_date: date
    internal_complete: bool = False
    portal_complete: bool = False


class ComparisonDecisionRequest(BaseModel):
    decision: Literal["open", "resolved"]
    note: str = Field(min_length=1, max_length=2000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("شرح رسیدگی خالی است.")
        return value.strip()
