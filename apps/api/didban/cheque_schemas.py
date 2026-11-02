from datetime import date
from typing import Literal

from pydantic import Field

from .accounting_schemas import StrictInput


class ChequeInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    direction: Literal["received", "issued"]
    number: str = Field(min_length=1, max_length=100)
    bank_name: str = Field(min_length=1, max_length=120)
    bank_account: str = Field(min_length=1, max_length=100)
    party_id: str = Field(min_length=1, max_length=100)
    amount: str = Field(min_length=1, max_length=80)
    unit: Literal["IRR", "TOMAN"]
    issue_date: date
    due_date: date


class ChequeAction(StrictInput):
    action: Literal["deposit", "endorse", "clear", "return", "cancel"]
    period_id: str = Field(min_length=1, max_length=36)
    event_date: date
    reason: str = Field(min_length=1, max_length=1000)
    bank_id: str | None = Field(default=None, max_length=36)
    endorsed_to: str | None = Field(default=None, max_length=100)
