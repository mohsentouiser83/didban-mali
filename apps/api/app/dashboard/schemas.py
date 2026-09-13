from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, field_serializer

from app.analysis.models import AnalysisStatus
from app.findings.models import FindingCode, FindingWorkflowStatus, PriorityBand


class DashboardSnapshot(BaseModel):
    analysis_run_id: UUID
    period_start: date
    period_end: date
    analysis_status: AnalysisStatus
    rule_set_version: str
    completed_at: datetime
    comparison_analysis_run_id: UUID | None


class DashboardHealth(BaseModel):
    overall_state: Literal[
        "critical_attention",
        "attention",
        "monitor",
        "stable",
        "limited_visibility",
        "analysis_incomplete",
    ]
    financial_state: Literal["critical_attention", "attention", "monitor", "stable"]
    data_quality: Literal["complete", "limited"]
    highest_open_priority: PriorityBand | None
    summary_fa: str
    reasons_fa: list[str]


class DashboardMetric(BaseModel):
    metric_code: str
    label_fa: str
    available: bool
    unit: Literal["IRR", "ratio"]
    value: Decimal | None
    previous_value: Decimal | None
    change_value: Decimal | None
    change_ratio: Decimal | None
    trend: Literal["up", "down", "flat", "unavailable"]
    calculation: dict[str, Any]
    unavailable_reason_fa: str | None

    @field_serializer("value", "previous_value", "change_value", "change_ratio")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class DashboardFinding(BaseModel):
    id: UUID
    finding_code: FindingCode
    title_fa: str
    summary_fa: str
    priority_band: PriorityBand
    priority_score: Decimal
    priority_reasons: dict[str, Any]
    confidence_score: Decimal
    affected_amount_irr: Decimal | None
    affected_ratio: Decimal | None
    workflow_status: FindingWorkflowStatus

    @field_serializer("priority_score", "confidence_score", "affected_amount_irr", "affected_ratio")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class DashboardFindingSummary(BaseModel):
    total: int
    by_priority: dict[str, int]
    by_workflow: dict[str, int]
    top_limit: int
    all_findings_path: str


class DashboardDriver(BaseModel):
    finding_id: UUID
    finding_code: FindingCode
    title_fa: str
    direction: str | None
    affected_amount_irr: Decimal | None
    affected_ratio: Decimal | None
    priority_band: PriorityBand
    priority_score: Decimal

    @field_serializer("affected_amount_irr", "affected_ratio", "priority_score")
    def serialize_decimal(self, value: Decimal | None) -> str | None:
        return format(value, "f") if value is not None else None


class DashboardCoverage(BaseModel):
    overall_score: int
    scoring_method: Literal["simple_average_of_section_scores_v1"]
    sections: dict[str, Any]
    limitations_fa: list[str]
    finding_generation_status: str | None
    finding_generation_coverage: dict[str, Any]


class DashboardResponse(BaseModel):
    snapshot: DashboardSnapshot
    health: DashboardHealth
    metrics: list[DashboardMetric]
    top_findings: list[DashboardFinding]
    finding_summary: DashboardFindingSummary
    main_drivers: list[DashboardDriver]
    coverage: DashboardCoverage
