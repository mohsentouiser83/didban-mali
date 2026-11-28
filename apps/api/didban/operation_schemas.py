from datetime import date
from typing import Literal

from pydantic import Field, model_validator

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
    source_reference: str | None = Field(default=None, max_length=120)
    unit: Literal["IRR", "TOMAN"]
    party_id: str = Field(default="", max_length=100)
    accounts: dict[str, str] = Field(min_length=1, max_length=10)
    amounts: dict[str, str] = Field(min_length=1, max_length=10)
    cheque_event_id: str | None = Field(default=None, max_length=36)
    point_of_sale_id: str | None = Field(default=None, min_length=1, max_length=36)
    endorsee_party_id: str | None = Field(default=None, min_length=1, max_length=100)
    settlement_type: Literal["on_account", "cash", "mixed"] | None = "on_account"
    cash_amount: str | None = None
    cheque_amount: str | None = None
    on_account_amount: str | None = None
    cash_account_id: str | None = Field(default=None, max_length=36)
    cheque_account_id: str | None = Field(default=None, max_length=36)
    counterparty_account_id: str | None = Field(default=None, max_length=36)
    cheque_number: str | None = Field(default=None, max_length=100)
    cheque_due_date: date | None = None

    @model_validator(mode="after")
    def require_operation_accounts(self):
        if not self.point_of_sale_id and len(self.accounts) < 2:
            raise ValueError("حساب‌های بدهکار و بستانکار را مشخص کنید.")
        return self
