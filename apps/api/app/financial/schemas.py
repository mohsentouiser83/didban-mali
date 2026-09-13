from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.financial.models import AccountClass


class AccountResponse(BaseModel):
    id: UUID
    source_code: str
    name: str
    normalized_name: str
    current_class: AccountClass | None = None
    created_at: datetime


class AccountClassificationRequest(BaseModel):
    account_class: AccountClass
    effective_from: date
    rule_version: str = Field(default="human-v1", min_length=2, max_length=40)


class AccountClassificationResponse(BaseModel):
    id: UUID
    account_id: UUID
    account_class: AccountClass
    effective_from: date
    rule_version: str
    confirmed_by: UUID
    confirmed_at: datetime
