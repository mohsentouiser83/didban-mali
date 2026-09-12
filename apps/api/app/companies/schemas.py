from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.companies.models import CompanyRole


class CompanyCreate(BaseModel):
    legal_name: str = Field(min_length=2, max_length=200)
    national_id: str | None = Field(default=None, min_length=8, max_length=32)
    fiscal_year_start_month: int = Field(default=1, ge=1, le=12)

    @field_validator("legal_name", "national_id")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class CompanyUpdate(BaseModel):
    legal_name: str | None = Field(default=None, min_length=2, max_length=200)
    national_id: str | None = Field(default=None, min_length=8, max_length=32)
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)


class CompanyResponse(BaseModel):
    id: UUID
    legal_name: str
    national_id: str | None
    currency: str
    fiscal_year_start_month: int
    timezone: str
    role: CompanyRole
    created_at: datetime


class MemberCreate(BaseModel):
    email: EmailStr
    role: CompanyRole


class MemberRoleUpdate(BaseModel):
    role: CompanyRole


class CompanyMemberResponse(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str
    role: CompanyRole
    created_at: datetime
