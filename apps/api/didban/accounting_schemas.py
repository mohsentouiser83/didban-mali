"""Strict draft input; decimal amounts are strings, never floats."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


class AccountInput(StrictInput):
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)
    active: bool = True


class DraftLine(StrictInput):
    account_id: str = Field(min_length=1, max_length=36)
    party_id: str = Field(default="", max_length=100)
    debit: str = Field(max_length=80)
    credit: str = Field(max_length=80)


class DraftInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    description: str = Field(min_length=1, max_length=500)
    unit: Literal["IRR", "TOMAN"]
    lines: list[DraftLine] = Field(min_length=2, max_length=200)


class PermissionInput(StrictInput):
    post_journal: bool
    reopen_period: bool
