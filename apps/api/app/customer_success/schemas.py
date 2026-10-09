from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class OnboardingStep(BaseModel):
    key: str
    title_fa: str
    status: Literal["completed", "in_progress", "pending", "blocked"]
    blocker_message: str | None = None
    cta_label: str | None = None
    cta_route: str | None = None
    responsible_role: str | None = None


class OnboardingStatusResponse(BaseModel):
    company_id: UUID
    is_live: bool
    onboarding_stage: str
    progress_percentage: int
    steps: list[OnboardingStep]
    active_blocker: str | None = None
    next_action_fa: str | None = None
    responsible_party_fa: str | None = None


class GoLiveValidationRequest(BaseModel):
    cash_position_irr: Decimal
    receivables_irr: Decimal
    payables_irr: Decimal
    reconciliation_difference_irr: Decimal = Decimal(0)
    opening_balance_confirmed: bool = True
    user_statement: str = Field(min_length=10, max_length=1000)


class GoLiveValidationResponse(BaseModel):
    id: UUID
    company_id: UUID
    validated_by_user_id: UUID
    validated_at: datetime
    cash_position_irr: Decimal
    receivables_irr: Decimal
    payables_irr: Decimal
    reconciliation_difference_irr: Decimal
    opening_balance_confirmed: bool
    user_statement: str


class GoLiveResponse(BaseModel):
    company_id: UUID
    is_live: bool
    go_live_at: datetime
    message_fa: str


class SupportTicketCreate(BaseModel):
    category: Literal["P1_CRITICAL", "P2_HIGH", "P3_NORMAL", "P4_QUESTION"]
    subject: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=10, max_length=4000)
    current_route: str | None = Field(default=None, max_length=255)
    error_digest: str | None = Field(default=None, max_length=128)
    safe_diagnostic_json: dict[str, Any] | None = None


class SupportTicketResponse(BaseModel):
    id: UUID
    company_id: UUID
    user_id: UUID
    category: str
    subject: str
    description: str
    current_route: str | None
    error_digest: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None


class ProductFeedbackCreate(BaseModel):
    category: Literal[
        "BUG",
        "UX_PROBLEM",
        "DATA_ISSUE",
        "MISSING_CONFIG",
        "FEATURE_REQUEST",
        "INTEGRATION",
        "REPORTING",
        "EDUCATION",
    ]
    problem_statement: str = Field(min_length=5, max_length=2000)
    context: str | None = Field(default=None, max_length=2000)
    impact: Literal["high", "medium", "low"] = "medium"
    workaround: str | None = Field(default=None, max_length=2000)
    requested_outcome: str | None = Field(default=None, max_length=2000)


class ProductFeedbackResponse(BaseModel):
    id: UUID
    company_id: UUID
    user_id: UUID
    category: str
    problem_statement: str
    context: str | None
    impact: str
    workaround: str | None
    requested_outcome: str | None
    created_at: datetime
