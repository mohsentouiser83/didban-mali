from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Password = Annotated[str, StringConstraints(strip_whitespace=False)]


class LoginInput(InputModel):
    email: str = Field(min_length=3, max_length=254)
    password: Password = Field(min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def required_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("رمز عبور را وارد کنید.")
        return value


class CompanyInput(InputModel):
    name: str = Field(min_length=1, max_length=120)


class UserInput(InputModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: Password = Field(min_length=12, max_length=200)

    @field_validator("password")
    @classmethod
    def required_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("رمز عبور را وارد کنید.")
        return value


class MemberInput(InputModel):
    user_id: str
    role: Literal["owner", "finance_manager", "advisor", "viewer"]


class MemberPatch(InputModel):
    role: Literal["owner", "finance_manager", "advisor", "viewer"] | None = None
    active: bool | None = None
    approve_financial_report: bool | None = None


class PeriodInput(InputModel):
    name: str = Field(min_length=1, max_length=120)
    start: date
    end: date
    previous_period_id: str | None = None

    @model_validator(mode="after")
    def dates(self):
        if self.end < self.start:
            raise ValueError("پایان دوره باید پس از آغاز باشد.")
        return self


class SessionInput(InputModel):
    period_id: str | None = None
    parent_id: str | None = None


class RecalculateInput(InputModel):
    parent_id: str
    period_id: str


class SealInput(InputModel):
    file_ids: list[str] = Field(max_length=10)


class AnswerInput(InputModel):
    value: str | dict[str, object]
    expected_version: int = Field(ge=1)


class ExpectedVersion(InputModel):
    expected_version: int = Field(ge=1)


class DecisionInput(ExpectedVersion):
    decision: Literal["reviewed", "dismissed", "accepted", "rejected"]
    reason: str = Field(min_length=1, max_length=500)


class PlanInput(InputModel):
    label: str = Field(min_length=1, max_length=120)
    amount: str = Field(min_length=1, max_length=80)
    due_date: date
    obligation_id: str = Field(min_length=1, max_length=100)
    invoice_reference: str | None = Field(default=None, max_length=100)


class AllocationInput(InputModel):
    bank_id: str
    invoice_id: str
    amount: str = Field(min_length=1, max_length=80)


class ReversalInput(ExpectedVersion):
    reason: str = Field(min_length=1, max_length=500)


class NotificationInput(InputModel):
    read: bool


class BudgetInput(InputModel):
    cap: str = Field(min_length=1, max_length=80)
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class AssistantMessage(InputModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=12000)


class AssistantInput(InputModel):
    manifest_id: str | None = None
    question: str = Field(min_length=1, max_length=1000)
    history: list[AssistantMessage] = Field(default_factory=list, max_length=12)
