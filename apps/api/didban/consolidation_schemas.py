from typing import Literal

from pydantic import Field, model_validator

from .accounting_schemas import StrictInput


class MappingInput(StrictInput):
    group_id: str = Field(min_length=1, max_length=36)
    left_company: str = Field(min_length=1, max_length=36)
    right_company: str = Field(min_length=1, max_length=36)
    left_party_id: str = Field(min_length=1, max_length=100)
    right_party_id: str = Field(min_length=1, max_length=100)
    ownership_100: Literal[True]
    ownership_note: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def different(self):
        if self.left_company == self.right_company:
            raise ValueError("Companies must differ")
        return self


class PairInput(StrictInput):
    mapping_id: str = Field(min_length=1, max_length=36)
    left_line_id: str = Field(min_length=1, max_length=36)
    right_line_id: str = Field(min_length=1, max_length=36)
    kind: Literal["balance", "services"]
    review_reason: str = Field(min_length=1, max_length=500)


class DraftInput(StrictInput):
    comparison_id: str = Field(min_length=1, max_length=36)
    pairs: list[PairInput] = Field(min_length=1, max_length=1000)
