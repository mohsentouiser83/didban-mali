from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
