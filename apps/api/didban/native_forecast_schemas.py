from datetime import date
from typing import Literal

from pydantic import Field, model_validator

from .accounting_schemas import StrictInput


class NativeForecastInput(StrictInput):
    native_statement_id: str = Field(min_length=1, max_length=36)
    obligations_complete: bool


class NativeForecastAnswer(StrictInput):
    question_id: str = Field(min_length=1, max_length=64)
    expected_date: date | None = None
    unknown: bool = False
    choice: Literal["covered_by_invoice", "separate_obligation", "unknown"] | None = None

    @model_validator(mode="after")
    def answer(self):
        if sum((self.unknown, self.expected_date is not None, self.choice is not None)) != 1:
            raise ValueError("تاریخ یا زمان نامعلوم را انتخاب کنید.")
        return self
