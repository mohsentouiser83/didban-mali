from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ai.models import AiInvocationStatus, AiPurpose


class AiSettingsUpdate(BaseModel):
    enabled: bool
    explanations_enabled: bool
    semantic_matching_enabled: bool


class AiSettingsResponse(AiSettingsUpdate):
    global_enabled: bool
    provider_configured: bool
    data_region_configured: bool
    explanations_effective: bool
    semantic_matching_effective: bool
    revision_id: UUID | None
    updated_at: datetime | None


class SemanticCandidatesRequest(BaseModel):
    candidate_ids: list[UUID] = Field(min_length=1, max_length=20)

    @field_validator("candidate_ids")
    @classmethod
    def unique_candidates(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("شناسه نامزدها نباید تکراری باشد.")
        return value


class FindingExplanationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary_fa: str = Field(min_length=1, max_length=1200)
    why_it_matters_fa: str = Field(min_length=1, max_length=1200)
    caveats_fa: list[str] = Field(default_factory=list, max_length=5)
    referenced_evidence_ids: list[UUID]
    referenced_numbers: list[str]
    requires_human_review: Literal[True]


class RankedCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_id: UUID
    confidence: Decimal = Field(ge=0, le=1)
    reason_fa: str = Field(min_length=1, max_length=800)
    referenced_numbers: list[str]


class SemanticMatchingOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ranked_candidates: list[RankedCandidate]
    requires_human_review: Literal[True]


class AiInvocationResponse(BaseModel):
    id: UUID
    company_id: UUID
    purpose: AiPurpose
    status: AiInvocationStatus
    source_finding_id: UUID | None
    source_reconciliation_run_id: UUID | None
    provider: str
    model: str
    prompt_version: str
    output: dict[str, Any] | None
    latency_ms: int
    failure_code: str | None
    failure_message: str | None
    requires_human_review: bool = True
    created_at: datetime
    completed_at: datetime
