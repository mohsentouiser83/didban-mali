from datetime import date
from typing import Literal

from pydantic import Field, model_validator

from .accounting_schemas import StrictInput


class TermsInput(StrictInput):
    due_date: date | None = None
    due_unknown: bool
    expected_date: date | None = None
    expected_unknown: bool

    @model_validator(mode="after")
    def explicit_dates(self):
        # null + false explicitly requests an evidence-based estimate. It is
        # distinct from null + true, the user's choice to leave it unknown.
        if (self.due_date is None) != self.due_unknown or (
            self.expected_date is not None and self.expected_unknown
        ):
            raise ValueError("تاریخ یا نامشخص‌بودن آن را صریح انتخاب کنید.")
        return self


class InvoiceInput(TermsInput):
    operation_id: str = Field(min_length=1, max_length=36)
    journal_digest: str = Field(min_length=64, max_length=64)
    reference: str = Field(min_length=1, max_length=120)


class TermsUpdate(TermsInput):
    effective_date: date
    reason: str = Field(min_length=1, max_length=1000)


class AllocationInput(StrictInput):
    journal_id: str | None = Field(default=None, min_length=1, max_length=36)
    operation_id: str = Field(min_length=1, max_length=36)
    journal_digest: str = Field(min_length=64, max_length=64)
    amount: str = Field(min_length=1, max_length=50)


class AllocationReversalInput(StrictInput):
    reason: str = Field(min_length=1, max_length=1000)


class SnapshotInput(StrictInput):
    as_of: date
    direction: Literal["sale", "purchase"] | None = None


class SourceRevisionInput(StrictInput):
    journal_id: str = Field(min_length=1, max_length=36)
    journal_digest: str = Field(min_length=64, max_length=64)
    approved_draft_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=1000)
