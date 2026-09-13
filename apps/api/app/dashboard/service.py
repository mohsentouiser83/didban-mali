from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisRun, AnalysisStatus, MetricCode, MetricObservation
from app.dashboard.logic import coverage_summary, dashboard_health, metric_change
from app.dashboard.schemas import (
    DashboardCoverage,
    DashboardDriver,
    DashboardFinding,
    DashboardFindingSummary,
    DashboardHealth,
    DashboardMetric,
    DashboardResponse,
    DashboardSnapshot,
)
from app.findings.models import (
    Finding,
    FindingCode,
    FindingGenerationRun,
    FindingRunStatus,
    FindingWorkflowStatus,
    PriorityBand,
)

FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}
FINAL_FINDINGS = {FindingRunStatus.COMPLETED, FindingRunStatus.COMPLETED_LIMITED}
TREND_CODES = {
    FindingCode.REVENUE_DROP,
    FindingCode.PROFIT_DROP,
    FindingCode.EXPENSE_INCREASE,
    FindingCode.RECEIVABLES_INCREASE,
}

METRIC_ORDER = [
    MetricCode.REVENUE_IRR.value,
    MetricCode.NET_PROFIT_IRR.value,
    MetricCode.NET_CASH_MOVEMENT_IRR.value,
    MetricCode.SALES_OUTSTANDING_IRR.value,
    "payables_irr",
    MetricCode.NET_MARGIN_RATIO.value,
    MetricCode.EXPENSES_IRR.value,
    MetricCode.TOTAL_ASSETS_IRR.value,
    MetricCode.TOTAL_LIABILITIES_IRR.value,
    MetricCode.TOTAL_EQUITY_IRR.value,
    MetricCode.SALES_INVOICED_IRR.value,
    MetricCode.SALES_COLLECTED_IRR.value,
]

METRIC_LABELS = {
    MetricCode.REVENUE_IRR.value: "درآمد",
    MetricCode.NET_PROFIT_IRR.value: "سود خالص",
    MetricCode.NET_CASH_MOVEMENT_IRR.value: "خالص جریان نقد",
    MetricCode.SALES_OUTSTANDING_IRR.value: "مطالبات فروش",
    "payables_irr": "حساب‌های پرداختنی",
    MetricCode.NET_MARGIN_RATIO.value: "حاشیه سود خالص",
    MetricCode.EXPENSES_IRR.value: "هزینه‌ها",
    MetricCode.TOTAL_ASSETS_IRR.value: "جمع دارایی‌ها",
    MetricCode.TOTAL_LIABILITIES_IRR.value: "جمع بدهی‌ها",
    MetricCode.TOTAL_EQUITY_IRR.value: "حقوق مالکانه",
    MetricCode.SALES_INVOICED_IRR.value: "فروش صورتحساب‌شده",
    MetricCode.SALES_COLLECTED_IRR.value: "فروش وصول‌شده",
}


async def resolve_analysis_run(
    session: AsyncSession,
    *,
    company_id: UUID,
    analysis_run_id: UUID | None,
    period_start: date | None,
    period_end: date | None,
) -> AnalysisRun | None:
    statement = select(AnalysisRun).where(
        AnalysisRun.company_id == company_id,
        AnalysisRun.status.in_(FINAL_ANALYSIS),
    )
    if analysis_run_id is not None:
        statement = statement.where(AnalysisRun.id == analysis_run_id)
    if period_start is not None and period_end is not None:
        statement = statement.where(
            AnalysisRun.period_start == period_start,
            AnalysisRun.period_end == period_end,
        )
    run: AnalysisRun | None = await session.scalar(
        statement.order_by(AnalysisRun.completed_at.desc(), AnalysisRun.id.desc()).limit(1)
    )
    return run


async def _previous_analysis(session: AsyncSession, current: AnalysisRun) -> AnalysisRun | None:
    duration_days = (current.period_end - current.period_start).days
    candidates = list(
        await session.scalars(
            select(AnalysisRun)
            .where(
                AnalysisRun.company_id == current.company_id,
                AnalysisRun.id != current.id,
                AnalysisRun.status.in_(FINAL_ANALYSIS),
                AnalysisRun.period_end < current.period_start,
            )
            .order_by(AnalysisRun.period_end.desc(), AnalysisRun.id.desc())
            .limit(12)
        )
    )
    return next(
        (
            item
            for item in candidates
            if (item.period_end - item.period_start).days == duration_days
        ),
        None,
    )


async def _metric_map(
    session: AsyncSession, run_ids: list[UUID]
) -> dict[tuple[UUID, str], MetricObservation]:
    rows = list(
        await session.scalars(
            select(MetricObservation).where(MetricObservation.analysis_run_id.in_(run_ids))
        )
    )
    return {(item.analysis_run_id, item.metric_code.value): item for item in rows}


def _value(metric: MetricObservation | None) -> Decimal | None:
    if metric is None:
        return None
    value = metric.value_irr if metric.value_irr is not None else metric.value_ratio
    return Decimal(value) if value is not None else None


def _unavailable_reason(code: str, coverage: dict[str, Any]) -> str:
    if code == "payables_irr":
        return "حساب‌های پرداختنی در مدل فعلی از سایر بدهی‌ها تفکیک نشده است."
    section_name = (
        "bank_cash_flow"
        if code == MetricCode.NET_CASH_MOVEMENT_IRR.value
        else (
            "sales"
            if code
            in {
                MetricCode.SALES_OUTSTANDING_IRR.value,
                MetricCode.SALES_INVOICED_IRR.value,
                MetricCode.SALES_COLLECTED_IRR.value,
            }
            else "accounting"
        )
    )
    section = coverage.get(section_name, {})
    if isinstance(section, dict):
        reasons = section.get("reasons", [])
        if isinstance(reasons, list) and reasons:
            return str(reasons[0])
    if code == MetricCode.NET_MARGIN_RATIO.value:
        return "حاشیه سود فقط زمانی محاسبه می‌شود که درآمد دوره مثبت باشد."
    return "این شاخص در snapshot انتخابی قابل محاسبه نیست."


def _dashboard_metrics(
    *,
    current: AnalysisRun,
    previous: AnalysisRun | None,
    metrics: dict[tuple[UUID, str], MetricObservation],
) -> list[DashboardMetric]:
    result: list[DashboardMetric] = []
    for code in METRIC_ORDER:
        item = metrics.get((current.id, code))
        previous_item = metrics.get((previous.id, code)) if previous is not None else None
        current_value = _value(item)
        previous_value = _value(previous_item)
        change, change_ratio, trend = metric_change(current_value, previous_value)
        unit = "ratio" if code == MetricCode.NET_MARGIN_RATIO.value else "IRR"
        result.append(
            DashboardMetric(
                metric_code=code,
                label_fa=METRIC_LABELS[code],
                available=item is not None,
                unit=unit,
                value=current_value,
                previous_value=previous_value,
                change_value=change,
                change_ratio=change_ratio,
                trend=trend,
                calculation=item.calculation_json if item is not None else {},
                unavailable_reason_fa=(
                    None if item is not None else _unavailable_reason(code, current.coverage_json)
                ),
            )
        )
    return result


def _finding_response(item: Finding) -> DashboardFinding:
    return DashboardFinding(
        id=item.id,
        finding_code=item.finding_code,
        title_fa=item.title_fa,
        summary_fa=item.summary_fa,
        priority_band=item.priority_band,
        priority_score=item.priority_score,
        priority_reasons=item.priority_explanation_json,
        confidence_score=item.confidence_score,
        affected_amount_irr=item.affected_amount_irr,
        affected_ratio=item.affected_ratio,
        workflow_status=item.workflow_status,
    )


async def build_dashboard(
    session: AsyncSession,
    *,
    company_id: UUID,
    analysis: AnalysisRun,
    top_limit: int,
) -> DashboardResponse:
    previous = await _previous_analysis(session, analysis)
    run_ids = [analysis.id] + ([previous.id] if previous is not None else [])
    metrics = await _metric_map(session, run_ids)
    finding_run = await session.scalar(
        select(FindingGenerationRun)
        .where(
            FindingGenerationRun.company_id == company_id,
            FindingGenerationRun.analysis_run_id == analysis.id,
            FindingGenerationRun.status.in_(FINAL_FINDINGS),
        )
        .order_by(FindingGenerationRun.completed_at.desc(), FindingGenerationRun.id.desc())
        .limit(1)
    )
    actionable_filter = Finding.workflow_status.in_(
        {
            FindingWorkflowStatus.NEEDS_REVIEW,
            FindingWorkflowStatus.CONFIRMED,
            FindingWorkflowStatus.FOLLOW_UP,
        }
    )
    priority_order = case(
        (Finding.priority_band == PriorityBand.CRITICAL, 4),
        (Finding.priority_band == PriorityBand.HIGH, 3),
        (Finding.priority_band == PriorityBand.MEDIUM, 2),
        else_=1,
    )
    top_findings = list(
        await session.scalars(
            select(Finding)
            .where(
                Finding.company_id == company_id,
                Finding.analysis_run_id == analysis.id,
                actionable_filter,
            )
            .order_by(priority_order.desc(), Finding.priority_score.desc(), Finding.id)
            .limit(top_limit)
        )
    )
    priority_counts = (
        await session.execute(
            select(Finding.priority_band, func.count(Finding.id))
            .where(Finding.company_id == company_id, Finding.analysis_run_id == analysis.id)
            .group_by(Finding.priority_band)
        )
    ).all()
    workflow_counts = (
        await session.execute(
            select(Finding.workflow_status, func.count(Finding.id))
            .where(Finding.company_id == company_id, Finding.analysis_run_id == analysis.id)
            .group_by(Finding.workflow_status)
        )
    ).all()
    drivers = list(
        await session.scalars(
            select(Finding)
            .where(
                Finding.company_id == company_id,
                Finding.analysis_run_id == analysis.id,
                Finding.finding_code.in_(TREND_CODES),
                actionable_filter,
            )
            .order_by(priority_order.desc(), Finding.priority_score.desc(), Finding.id)
            .limit(4)
        )
    )
    highest = top_findings[0].priority_band if top_findings else None
    finding_status = finding_run.status.value if finding_run is not None else None
    overall, financial, data_quality, summary, health_reasons = dashboard_health(
        analysis_status=analysis.status,
        finding_generation_status=finding_status,
        highest_priority=highest,
    )
    coverage_score, coverage_limitations = coverage_summary(analysis.coverage_json)
    finding_limitations: list[str] = []
    if finding_run is not None:
        for section in finding_run.coverage_json.values():
            if isinstance(section, dict) and section.get("reason"):
                finding_limitations.append(str(section["reason"]))
    limitations = list(dict.fromkeys(coverage_limitations + finding_limitations))
    priority_map = {band.value: 0 for band in PriorityBand}
    priority_map.update({band.value: count for band, count in priority_counts})
    workflow_map = {status.value: 0 for status in FindingWorkflowStatus}
    workflow_map.update({status.value: count for status, count in workflow_counts})
    total_findings = sum(priority_map.values())
    assert analysis.completed_at is not None
    return DashboardResponse(
        snapshot=DashboardSnapshot(
            analysis_run_id=analysis.id,
            period_start=analysis.period_start,
            period_end=analysis.period_end,
            analysis_status=analysis.status,
            rule_set_version=analysis.rule_set_version,
            completed_at=analysis.completed_at,
            comparison_analysis_run_id=previous.id if previous is not None else None,
        ),
        health=DashboardHealth(
            overall_state=overall,
            financial_state=financial,
            data_quality=data_quality,
            highest_open_priority=highest,
            summary_fa=summary,
            reasons_fa=health_reasons,
        ),
        metrics=_dashboard_metrics(current=analysis, previous=previous, metrics=metrics),
        top_findings=[_finding_response(item) for item in top_findings],
        finding_summary=DashboardFindingSummary(
            total=total_findings,
            by_priority=priority_map,
            by_workflow=workflow_map,
            top_limit=top_limit,
            all_findings_path=(
                f"/api/v1/companies/{company_id}/findings?analysis_run_id={analysis.id}"
            ),
        ),
        main_drivers=[
            DashboardDriver(
                finding_id=item.id,
                finding_code=item.finding_code,
                title_fa=item.title_fa,
                direction=(
                    str(item.calculation_json["direction"])
                    if item.calculation_json.get("direction")
                    else None
                ),
                affected_amount_irr=item.affected_amount_irr,
                affected_ratio=item.affected_ratio,
                priority_band=item.priority_band,
                priority_score=item.priority_score,
            )
            for item in drivers
        ],
        coverage=DashboardCoverage(
            overall_score=coverage_score,
            scoring_method="simple_average_of_section_scores_v1",
            sections=analysis.coverage_json,
            limitations_fa=limitations,
            finding_generation_status=finding_status,
            finding_generation_coverage=(
                finding_run.coverage_json if finding_run is not None else {}
            ),
        ),
    )
