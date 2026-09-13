from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ReadinessState = Literal["ready", "limited", "missing"]


class SourceReadiness(BaseModel):
    kind: Literal["accounting", "bank", "sales"]
    state: ReadinessState
    completed_batches: int
    last_activity_at: datetime | None


class JourneyStep(BaseModel):
    id: str
    state: ReadinessState
    count: int
    detail_fa: str
    href: str


class CompanyReadinessResponse(BaseModel):
    schema_version: Literal["company-readiness-v1"] = "company-readiness-v1"
    overall_state: ReadinessState
    completed_steps: int
    ready_steps: int
    total_steps: int
    sources: list[SourceReadiness]
    journey: list[JourneyStep]
    safeguards: dict[str, bool]
