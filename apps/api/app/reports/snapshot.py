from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.service import evaluate_and_sync_alerts
from app.analysis.models import AnalysisRun
from app.cashflow.service import get_cashflow_forecast, get_cashflow_summary
from app.companies.models import Company
from app.dashboard.service import build_dashboard
from app.findings.models import Finding, PriorityBand
from app.payables.service import get_payables_summary
from app.receivables.service import get_receivables_summary
from app.reviews.models import FindingNote, ReviewDecision


def _decimal(value: Decimal | None) -> str | None:
    return format(value, "f") if value is not None else None


async def build_report_payload(
    session: AsyncSession,
    *,
    company_id: UUID,
    analysis: AnalysisRun,
    title_fa: str,
    advisor_note: str | None,
    created_by: UUID,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    company = await session.scalar(select(Company).where(Company.id == company_id))
    if company is None:
        raise ValueError("Company not found")
    dashboard = await build_dashboard(
        session, company_id=company_id, analysis=analysis, top_limit=5
    )
    priority_order = case(
        (Finding.priority_band == PriorityBand.CRITICAL, 4),
        (Finding.priority_band == PriorityBand.HIGH, 3),
        (Finding.priority_band == PriorityBand.MEDIUM, 2),
        else_=1,
    )
    findings = list(
        await session.scalars(
            select(Finding)
            .where(
                Finding.company_id == company_id,
                Finding.analysis_run_id == analysis.id,
            )
            .order_by(priority_order.desc(), Finding.priority_score.desc(), Finding.id)
        )
    )
    finding_ids = [item.id for item in findings]
    notes: list[FindingNote] = []
    decisions: list[ReviewDecision] = []
    if finding_ids:
        notes = list(
            await session.scalars(
                select(FindingNote)
                .where(
                    FindingNote.company_id == company_id,
                    FindingNote.finding_id.in_(finding_ids),
                )
                .order_by(FindingNote.id)
            )
        )
        decisions = list(
            await session.scalars(
                select(ReviewDecision)
                .where(
                    ReviewDecision.company_id == company_id,
                    ReviewDecision.finding_id.in_(finding_ids),
                )
                .order_by(ReviewDecision.id)
            )
        )
    notes_by_finding: dict[UUID, list[dict[str, Any]]] = {}
    for note in notes:
        notes_by_finding.setdefault(note.finding_id, []).append(
            {
                "id": str(note.id),
                "body": note.body,
                "actor_id": str(note.actor_id),
                "supersedes_id": str(note.supersedes_id) if note.supersedes_id else None,
                "created_at": note.created_at.isoformat(),
            }
        )
    latest_decision: dict[UUID, ReviewDecision] = {}
    decision_notes: list[dict[str, Any]] = []
    for decision in decisions:
        latest_decision[decision.finding_id] = decision
        if decision.note:
            decision_notes.append(
                {
                    "finding_id": str(decision.finding_id),
                    "body": decision.note,
                    "actor_id": str(decision.actor_id),
                    "source": "decision",
                    "created_at": decision.created_at.isoformat(),
                }
            )
    top_ids = {item.id for item in dashboard.top_findings}
    finding_payload: list[dict[str, Any]] = []
    for finding in findings:
        latest = latest_decision.get(finding.id)
        finding_payload.append(
            {
                "id": str(finding.id),
                "finding_code": finding.finding_code.value,
                "title_fa": finding.title_fa,
                "summary_fa": finding.summary_fa,
                "priority_band": finding.priority_band.value,
                "priority_score": _decimal(finding.priority_score),
                "confidence_score": _decimal(finding.confidence_score),
                "affected_amount_irr": _decimal(finding.affected_amount_irr),
                "affected_ratio": _decimal(finding.affected_ratio),
                "workflow_status": finding.workflow_status.value,
                "is_top_finding": finding.id in top_ids,
                "latest_decision": (
                    {
                        "decision": latest.decision.value,
                        "actor_id": str(latest.actor_id),
                        "created_at": latest.created_at.isoformat(),
                    }
                    if latest is not None
                    else None
                ),
                "notes": notes_by_finding.get(finding.id, []),
            }
        )
    advisor_notes = decision_notes + [
        {
            "finding_id": str(note.finding_id),
            "body": note.body,
            "actor_id": str(note.actor_id),
            "source": "finding_note",
            "created_at": note.created_at.isoformat(),
        }
        for note in notes
    ]
    advisor_notes.sort(key=lambda item: str(item["created_at"]))

    # Fetch Treasury, Working Capital & Early Warning data
    receivables_data: dict[str, Any] | None = None
    payables_data: dict[str, Any] | None = None
    cashflow_data: dict[str, Any] | None = None
    alerts_data: list[dict[str, Any]] = []

    try:
        rec_summary = await get_receivables_summary(session, company_id=company_id)
        receivables_data = rec_summary.model_dump(mode="json")
    except Exception:
        pass

    try:
        pay_summary = await get_payables_summary(session, company_id=company_id)
        payables_data = pay_summary.model_dump(mode="json")
    except Exception:
        pass

    try:
        cf_summary = await get_cashflow_summary(session, company_id=company_id)
        cf_forecast = await get_cashflow_forecast(session, company_id=company_id)
        cashflow_data = {
            "summary": cf_summary.model_dump(mode="json"),
            "weeks": [w.model_dump(mode="json") for w in cf_forecast.weeks],
        }
    except Exception:
        pass

    try:
        alerts = await evaluate_and_sync_alerts(session, company_id=company_id)
        alerts_data = [a.model_dump(mode="json") for a in alerts]
    except Exception:
        pass

    return {
        "schema_version": "report-snapshot-v1",
        "generated_at": (generated_at or datetime.now(UTC)).isoformat(),
        "title_fa": title_fa,
        "company": {
            "id": str(company.id),
            "legal_name": company.legal_name,
            "currency": company.currency,
        },
        "analysis": {
            "id": str(analysis.id),
            "period_start": analysis.period_start.isoformat(),
            "period_end": analysis.period_end.isoformat(),
            "status": analysis.status.value,
            "rule_set_version": analysis.rule_set_version,
            "completed_at": analysis.completed_at.isoformat() if analysis.completed_at else None,
        },
        "overall_status": dashboard.health.model_dump(mode="json"),
        "financial_overview": [item.model_dump(mode="json") for item in dashboard.metrics],
        "top_findings": [item.model_dump(mode="json") for item in dashboard.top_findings],
        "main_drivers": [item.model_dump(mode="json") for item in dashboard.main_drivers],
        "data_coverage": dashboard.coverage.model_dump(mode="json"),
        "advisor_note": (
            {"body": advisor_note, "actor_id": str(created_by)}
            if advisor_note is not None
            else None
        ),
        "advisor_notes": advisor_notes,
        "review_status": dashboard.finding_summary.model_dump(mode="json"),
        "all_findings": finding_payload,
        "receivables_intelligence": receivables_data,
        "payables_intelligence": payables_data,
        "cashflow_runway": cashflow_data,
        "early_warning_alerts": alerts_data,
    }
