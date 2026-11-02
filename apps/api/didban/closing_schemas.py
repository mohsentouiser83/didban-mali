from pydantic import Field

from .accounting_schemas import StrictInput


class ClosingInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    account_ids: list[str] = Field(min_length=1, max_length=199)
    result_account_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(min_length=1, max_length=1000)


class OpeningInput(StrictInput):
    source_period_id: str = Field(min_length=1, max_length=36)
    target_period_id: str = Field(min_length=1, max_length=36)
    account_ids: list[str] = Field(min_length=2, max_length=200)
    reason: str = Field(min_length=1, max_length=1000)
