from datetime import date
from typing import Literal

from pydantic import Field

from .accounting_schemas import StrictInput


class ChequeInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    direction: Literal["received", "issued", "guarantee_in", "guarantee_out"]
    number: str = Field(min_length=1, max_length=100)
    sayad_id: str | None = Field(default=None, max_length=32)
    sayad_status: Literal["not_verified", "registered", "confirmed", "rejected", "unknown"] = "not_verified"
    bank_name: str = Field(min_length=1, max_length=120)
    bank_account: str = Field(min_length=1, max_length=100)
    treasury_account_id: str | None = Field(default=None, max_length=36)
    party_id: str = Field(min_length=1, max_length=100)
    issuer_name: str | None = Field(default=None, max_length=150)
    holder_name: str | None = Field(default=None, max_length=150)
    amount: str = Field(min_length=1, max_length=80)
    unit: Literal["IRR", "TOMAN"]
    issue_date: date
    received_date: date | None = None
    due_date: date


class ChequeAction(StrictInput):
    action: Literal["deposit", "endorse", "clear", "return", "cancel"]
    period_id: str = Field(min_length=1, max_length=36)
    event_date: date
    reason: str = Field(min_length=1, max_length=1000)
    bank_id: str | None = Field(default=None, max_length=36)
    treasury_account_id: str | None = Field(default=None, max_length=36)
    endorsed_to: str | None = Field(default=None, max_length=100)
