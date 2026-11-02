"""Explicit exact-version confirmations, never free-text posting commands."""

from datetime import date

from pydantic import Field

from .accounting_schemas import DraftInput, StrictInput


class PostingItem(StrictInput):
    draft_id: str = Field(min_length=1, max_length=36)
    expected_version: int = Field(ge=1)
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")


class PostingBatch(StrictInput):
    items: list[PostingItem] = Field(min_length=1, max_length=100)


class ReversalInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    reason: str = Field(min_length=1, max_length=1000)


class ReplacementInput(DraftInput):
    reason: str = Field(min_length=1, max_length=1000)


class NativeReportInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    as_of: date | None = None


class DiscardInput(StrictInput):
    reason: str = Field(min_length=1, max_length=1000)
