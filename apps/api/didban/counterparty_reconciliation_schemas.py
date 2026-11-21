"""Schemas for counterparty statement reconciliation."""

from pydantic import Field

from .schemas import InputModel


class StatementRowInput(InputModel):
    date: str = Field(min_length=1, max_length=20)
    reference: str = Field(default="", max_length=100)
    debit: str = Field(default="0", max_length=40)
    credit: str = Field(default="0", max_length=40)
    description: str = Field(default="", max_length=500)


class ReconcileCounterpartyInput(InputModel):
    counterparty_id: str = Field(min_length=1, max_length=100)
    as_of_date: str = Field(min_length=1, max_length=20)
    statement_rows: list[StatementRowInput] = Field(default_factory=list, max_length=1000)
    tolerance_days: int = Field(default=7, ge=0, le=60)


class CounterpartyReconciliationDecisionInput(InputModel):
    run_id: str = Field(min_length=1, max_length=50)
    status: str = Field(pattern=r"^(completed|reviewed|disputed)$")
    notes: str = Field(default="", max_length=1000)
