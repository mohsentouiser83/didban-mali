"""Strict draft input; decimal amounts are strings, never floats."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, StrictStr, field_validator


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


AccountLevel = Literal["group", "general", "subsidiary", "detail"]
AccountId = Annotated[str, Field(min_length=1, max_length=36)]


class AccountFields(StrictInput):
    code: str | None = Field(default=None, max_length=100)
    level: AccountLevel | None = None
    parent_id: str | None = Field(default=None, min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=150)
    nature: Literal["debit", "credit", "floating", "none"] = "debit"
    role: str | None = Field(default=None, max_length=40)
    active: bool = True
    confirm_reclassification: bool = False

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("level", mode="before")
    @classmethod
    def normalize_level(cls, value):
        if isinstance(value, str):
            return {
                "گروه": "group",
                "کل": "general",
                "معین": "subsidiary",
                "تفصیلی": "detail",
                "تفصیلی شناور": "detail",
                "": None,
            }.get(value.strip(), value.strip())
        return value

    @field_validator("nature", mode="before")
    @classmethod
    def normalize_nature(cls, value):
        if not value:
            return "debit"
        if isinstance(value, str):
            val = value.strip().lower()
            aliases = {
                "dual": "floating",
                "both": "floating",
                "neutral": "none",
                "memorandum": "none",
                "بدهکار": "debit",
                "بستانکار": "credit",
                "شناور": "floating",
                "دوگانه": "floating",
                "انتظامی": "none",
                "فاقد ماهیت": "none",
                "بدون ماهیت": "none",
            }
            return aliases.get(val, val)
        return value


class AccountInput(AccountFields):
    linked_account_ids: list[AccountId] | None = Field(default=None, max_length=200)


class AccountCreateInput(AccountInput):
    code: str | None = Field(default=None, max_length=100)
    level: AccountLevel | None = None


class DraftLine(StrictInput):
    account_id: str = Field(min_length=1, max_length=36)
    detail_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    party_id: str = Field(default="", max_length=100)
    counterparty_id: str | None = Field(default=None, max_length=36)
    debit: str = Field(max_length=80)
    credit: str = Field(max_length=80)
    description: str = Field(default="", max_length=500)
    reference_kind: str | None = Field(default=None, max_length=40)
    reference_id: str | None = Field(default=None, max_length=36)
    dimension_ids: list[str] = Field(default_factory=list, max_length=10)


class DraftInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    description: str = Field(min_length=1, max_length=500)
    unit: Literal["IRR", "TOMAN"]
    lines: list[DraftLine] = Field(min_length=2, max_length=200)


class DraftLineResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    account_id: str
    detail_account_id: str | None = None
    party_id: str | None = None
    counterparty_id: str | None = None
    debit: StrictStr
    credit: StrictStr
    original_debit: StrictStr
    original_credit: StrictStr
    description: str | None = None
    reference_kind: str | None = None
    reference_id: str | None = None
    dimension_ids: list[str]


class DraftWriteResponse(BaseModel):
    id: str
    company_id: str
    period_id: str
    date: date
    created_at: datetime
    description: str
    lines: list[DraftLineResponse]
    original_unit: Literal["IRR", "TOMAN"]
    actor_id: str
    state: Literal["draft", "posted", "discarded"]
    version: int
    posting_available: bool
    posting_reason: str | None


class PermissionInput(StrictInput):
    post_journal: bool
    reopen_period: bool
    view_payroll: bool = False


class AccountDetailLinkInput(StrictInput):
    detail_account_id: AccountId
    subsidiary_account_id: AccountId = Field(validation_alias=AliasChoices("target_account_id", "subsidiary_account_id"))
    counterparty_id: str | None = Field(default=None, max_length=36)
    active: bool = True
