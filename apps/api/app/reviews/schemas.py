from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.findings.models import FindingWorkflowStatus
from app.reviews.models import ReviewDecisionType


class ReviewDecisionRequest(BaseModel):
    decision: ReviewDecisionType
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("متن توضیح نباید خالی باشد.")
        return normalized


class ReviewDecisionResponse(BaseModel):
    id: UUID
    finding_id: UUID
    decision: ReviewDecisionType
    previous_status: FindingWorkflowStatus
    resulting_status: FindingWorkflowStatus
    note: str | None
    actor_id: UUID
    created_at: datetime


class FindingNoteRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    supersedes_id: UUID | None = None

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("متن یادداشت نباید خالی باشد.")
        return normalized


class FindingNoteResponse(BaseModel):
    id: UUID
    finding_id: UUID
    body: str
    actor_id: UUID
    supersedes_id: UUID | None
    created_at: datetime


class ReviewTimelineItem(BaseModel):
    kind: Literal["decision", "note"]
    id: UUID
    actor_id: UUID
    created_at: datetime
    decision: ReviewDecisionType | None = None
    previous_status: FindingWorkflowStatus | None = None
    resulting_status: FindingWorkflowStatus | None = None
    note: str | None = None
    body: str | None = None
    supersedes_id: UUID | None = None


class ReviewTimelineResponse(BaseModel):
    finding_id: UUID
    current_status: FindingWorkflowStatus
    items: list[ReviewTimelineItem]
    next_cursor: UUID | None
