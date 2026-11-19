from pydantic import BaseModel, Field


class NumberingRuleInput(BaseModel):
    prefix: str = Field(default="", max_length=30)
    start_number: int = Field(default=1, ge=1)
    current_number: int = Field(default=1, ge=1)
    padding: int = Field(default=3, ge=1, le=10)
    suffix: str = Field(default="", max_length=30)
    description: str | None = Field(default=None, max_length=255)
    active: bool = True


class NumberingRuleResponse(BaseModel):
    id: str
    company_id: str
    entity_type: str
    entity_title: str
    prefix: str
    start_number: int
    current_number: int
    padding: int
    suffix: str
    sample: str
    description: str | None
    is_system: bool
    active: bool
    version: int


class NextNumberResponse(BaseModel):
    entity_type: str
    number: str
    current_number: int
