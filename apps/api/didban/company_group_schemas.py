from pydantic import Field, model_validator

from .accounting_schemas import StrictInput


class GroupInput(StrictInput):
    name: str = Field(min_length=1, max_length=120)
    company_ids: list[str] = Field(min_length=2, max_length=20)

    @model_validator(mode="after")
    def unique_companies(self):
        if len(set(self.company_ids)) != len(self.company_ids):
            raise ValueError("شرکت تکراری است.")
        return self


class ComparisonInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    expected_version: int = Field(ge=1)
