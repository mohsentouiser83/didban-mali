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


class HoldingCompanyItem(BaseModel):
    id: UUID
    legal_name: str
    national_id: str | None
    currency: str
    cash_balance_irr: int
    receivables_irr: int
    payables_irr: int
    net_liquidity_irr: int
    critical_findings_count: int
    reconciliation_match_rate: float
    last_data_at: datetime | None
    is_live: bool


class HoldingForecastWeek(BaseModel):
    week_number: int
    projected_cash_irr: int
    inflow_irr: int
    outflow_irr: int


class HoldingIntercompanyItem(BaseModel):
    from_company_id: UUID
    from_company_name: str
    to_company_id: UUID
    to_company_name: str
    amount_irr: int
    status: str  # "matched", "unmatched_counterpart"
    description: str


class HoldingSummaryResponse(BaseModel):
    companies_count: int
    total_cash_balance_irr: int
    total_receivables_irr: int
    total_payables_irr: int
    total_net_liquidity_irr: int
    total_critical_findings_count: int
    companies: list[HoldingCompanyItem]
    weekly_forecast: list[HoldingForecastWeek]
    intercompany_transactions: list[HoldingIntercompanyItem]
    generated_at: datetime
