from typing import Annotated, Literal

from pydantic import Field

from .accounting_schemas import StrictInput

Identifier = Annotated[str, Field(min_length=1, max_length=36)]


class ManualGroupInput(StrictInput):
    run_id: str = Field(min_length=1, max_length=36)
    bank_ids: list[Identifier] = Field(min_length=1, max_length=100)
    ledger_ids: list[Identifier] = Field(min_length=1, max_length=100)


class ManualGroupDecision(StrictInput):
    expected_digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    expected_version: int = Field(ge=1)
    decision: Literal["accepted", "rejected"]
    reason: str = Field(min_length=1, max_length=500)
