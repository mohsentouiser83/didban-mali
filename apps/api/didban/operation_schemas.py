from datetime import date
from typing import Literal

from pydantic import Field

from .accounting_schemas import StrictInput

OperationKind = Literal[
    "sale_service",
    "purchase_service",
    "receipt",
    "payment",
    "expense",
    "transfer",
    "payroll",
    "payroll_payment",
    "cheque_received",
    "cheque_collected",
    "cheque_received_return",
    "cheque_issued",
    "cheque_paid",
    "cheque_issued_return",
    "cheque_endorsed",
]


class OperationInput(StrictInput):
    kind: OperationKind
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    description: str = Field(min_length=1, max_length=500)
    source_reference: str = Field(min_length=1, max_length=120)
    unit: Literal["IRR", "TOMAN"]
    party_id: str = Field(default="", max_length=100)
    accounts: dict[str, str] = Field(min_length=2, max_length=10)
    amounts: dict[str, str] = Field(min_length=1, max_length=10)
    cheque_event_id: str | None = Field(default=None, max_length=36)
    endorsee_party_id: str | None = Field(default=None, min_length=1, max_length=100)
