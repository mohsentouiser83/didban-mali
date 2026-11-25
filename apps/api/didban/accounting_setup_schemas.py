from typing import Literal

from pydantic import Field

from .accounting_schemas import AccountInput, StrictInput


class AccountingModeInput(StrictInput):
    mode: Literal["analysis", "primary"]


class ChartAccountInput(AccountInput):
    code: str = Field(min_length=1, max_length=100)
    parent_code: str | None = Field(default=None, min_length=1, max_length=100)


class ChartPreviewInput(StrictInput):
    rows: list[ChartAccountInput] = Field(min_length=1, max_length=20000)


class ChartImportInput(StrictInput):
    preview_id: str = Field(min_length=1, max_length=36)
