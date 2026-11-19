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
    nature: Literal["debit", "credit", "floating", "none"] = "debit"
    active: bool = True

    @field_validator("nature", mode="before")
    @classmethod
    def normalize_nature(cls, value):
        if not value:
            return "debit"
        if isinstance(value, str):
            val = value.strip().lower()
            aliases = {
                "dual": "floating",
                "both": "floating",
                "neutral": "none",
                "memorandum": "none",
                "بدهکار": "debit",
                "بستانکار": "credit",
                "شناور": "floating",
                "دوگانه": "floating",
                "انتظامی": "none",
                "فاقد ماهیت": "none",
                "بدون ماهیت": "none",
            }
            return aliases.get(val, val)
        return value


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
