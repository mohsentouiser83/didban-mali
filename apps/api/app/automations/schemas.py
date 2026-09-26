from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    action_type: str = Field(..., description="daily_morning_cycle, reconcile_and_findings, assign_overdue_ar")
    is_enabled: bool = True
    schedule_cron: str = Field(default="0 7 * * *")
    config: dict[str, Any] = Field(default_factory=dict)


class AutomationRuleUpdate(BaseModel):
    name: str | None = None
    is_enabled: bool | None = None
    schedule_cron: str | None = None
    config: dict[str, Any] | None = None


class AutomationRuleResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    action_type: str
    is_enabled: bool
    schedule_cron: str
    config: dict[str, Any]
    last_run_at: datetime | None
    next_run_at: datetime | None
    last_status: str
    created_at: datetime
    updated_at: datetime


class AutomationRunResponse(BaseModel):
    id: UUID
    company_id: UUID
    rule_id: UUID
    trigger_type: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    duration_ms: int
    steps_executed: list[dict[str, Any]]
    error_message: str | None
    created_at: datetime
