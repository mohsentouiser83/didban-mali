"""Validated collaboration commands; none of these commands records a payment."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ControlInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


class CaseCreate(ControlInput):
    kind: Literal["finding", "invoice"]
    subject_id: str = Field(min_length=1, max_length=36)
    assignee_membership_id: str | None = Field(default=None, max_length=36)
    due_date: date | None = None
    next_action: str = Field(default="", max_length=500)


class CaseUpdate(ControlInput):
    assignee_membership_id: str | None = Field(default=None, max_length=36)
    due_date: date | None = None
    state: Literal["open", "in_progress", "resolved", "accepted"]
    next_action: str = Field(default="", max_length=500)
    reason: str = Field(min_length=1, max_length=2000)


class ActivityCreate(ControlInput):
    kind: Literal["comment", "contact", "promise", "document_request"]
    message: str = Field(min_length=1, max_length=2000)
    promise_date: date | None = None
    promise_amount: str | None = Field(default=None, max_length=80)
    unit: Literal["IRR", "TOMAN"] = "IRR"
