from typing import Literal

from pydantic import Field, field_validator, model_validator

from .accounting_schemas import StrictInput

Kind = Literal["project", "branch", "cost_center"]


class DimensionInput(StrictInput):
    kind: Kind
    code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    active: bool = True


class Share(StrictInput):
    dimension_id: str = Field(min_length=1, max_length=36)
    percent: str = Field(min_length=1, max_length=80)

    @field_validator("percent")
    @classmethod
    def valid_percent(cls, value: str) -> str:
        from .money_type import canonical_money

        return canonical_money(value)


class SourceInput(StrictInput):
    manifest_id: str | None = Field(default=None, min_length=1, max_length=36)
    native_statement_id: str | None = Field(default=None, min_length=1, max_length=36)

    @model_validator(mode="after")
    def one_source(self):
        if bool(self.manifest_id) == bool(self.native_statement_id):
            raise ValueError("فقط یک نسخهٔ منبع را انتخاب کنید.")
        return self


class AllocationInput(SourceInput):
    line_id: str = Field(min_length=1, max_length=36)
    kind: Kind
    method: Literal["direct", "shared"]
    shares: list[Share] = Field(min_length=1, max_length=100)
    review_reason: str = Field(min_length=1, max_length=500)


class RunInput(SourceInput):
    kind: Kind
