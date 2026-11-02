from datetime import date
from typing import Literal

from pydantic import Field

from .accounting_schemas import StrictInput


class DocumentContext(StrictInput):
    subject_kind: Literal["draft", "journal"]
    subject_id: str = Field(min_length=1, max_length=36)
    expected_subject_digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    expected_version: int = Field(ge=1)


class DocumentActivityInput(DocumentContext):
    kind: Literal["comment", "document_request"]
    message: str = Field(min_length=1, max_length=2000)


class DocumentThreadInput(DocumentContext):
    assignee_membership_id: str | None = Field(default=None, max_length=36)
    due_date: date | None = None
    state: Literal["open", "in_progress", "resolved"]
    next_action: str = Field(default="", max_length=500)
    reason: str = Field(min_length=1, max_length=2000)
