from typing import Literal

from pydantic import Field

from .accounting_schemas import AccountInput, StrictInput


class AccountingModeInput(StrictInput):
    mode: Literal["analysis", "primary"]


class ChartPreviewInput(StrictInput):
    rows: list[AccountInput] = Field(min_length=1, max_length=20000)


class ChartImportInput(StrictInput):
    preview_id: str = Field(min_length=1, max_length=36)
