from typing import Any
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.ai.models import AiInvocation
from app.analysis.models import AnalysisRun, AnalysisStatus
from app.companies.dependencies import CurrentCompanyAccess
from app.findings.models import EvidenceItem, Finding
from app.identity.dependencies import DbSession
from app.imports.models import DataSource, ImportBatch, ImportStatus, SourceKind
from app.readiness.schemas import CompanyReadinessResponse, JourneyStep, SourceReadiness
from app.reconciliation.models import ReconciliationRun, ReconciliationStatus
from app.reports.models import ReportSnapshot, ReportStatus
from app.reviews.models import FindingNote, ReviewDecision

router = APIRouter(prefix="/companies/{company_id}", tags=["readiness"])


async def _count(session: DbSession, model: Any, company_id: UUID, *conditions: Any) -> int:
    value = await session.scalar(
        select(func.count()).select_from(model).where(model.company_id == company_id, *conditions)
    )
    return int(value or 0)


@router.get("/readiness", response_model=CompanyReadinessResponse)
async def get_company_readiness(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> CompanyReadinessResponse:
    del access
    completed_import_statuses = (ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED)
    source_rows = (
        await session.execute(
            select(DataSource.kind, func.count(ImportBatch.id), func.max(ImportBatch.updated_at))
            .join(ImportBatch, ImportBatch.source_id == DataSource.id)
            .where(
                DataSource.company_id == company_id,
                ImportBatch.status.in_(completed_import_statuses),
            )
            .group_by(DataSource.kind)
        )
    ).all()
    source_map = {kind: (int(count), updated_at) for kind, count, updated_at in source_rows}
    sources = [
        SourceReadiness(
            kind=kind.value,
            state="ready" if source_map.get(kind, (0, None))[0] else "missing",
            completed_batches=source_map.get(kind, (0, None))[0],
            last_activity_at=source_map.get(kind, (0, None))[1],
        )
        for kind in (SourceKind.ACCOUNTING, SourceKind.BANK, SourceKind.SALES)
    ]

    full_analyses = await _count(
        session, AnalysisRun, company_id, AnalysisRun.status == AnalysisStatus.COMPLETED
    )
    limited_analyses = await _count(
        session, AnalysisRun, company_id, AnalysisRun.status == AnalysisStatus.COMPLETED_LIMITED
    )
    full_reconciliations = await _count(
        session,
        ReconciliationRun,
        company_id,
        ReconciliationRun.status == ReconciliationStatus.COMPLETED,
    )
    limited_reconciliations = await _count(
        session,
        ReconciliationRun,
        company_id,
        ReconciliationRun.status == ReconciliationStatus.COMPLETED_LIMITED,
    )
    finding_count = await _count(session, Finding, company_id)
    evidence_count = await _count(session, EvidenceItem, company_id)
    decision_count = await _count(session, ReviewDecision, company_id)
    note_count = await _count(session, FindingNote, company_id)
    report_count = await _count(
        session, ReportSnapshot, company_id, ReportSnapshot.status == ReportStatus.COMPLETED
    )
    ai_count = await _count(session, AiInvocation, company_id)

    available_source_count = sum(item.state == "ready" for item in sources)
    data_state = (
        "ready"
        if available_source_count == 3
        else "limited"
        if available_source_count
        else "missing"
    )
    analysis_state = "ready" if full_analyses else "limited" if limited_analyses else "missing"
    reconciliation_state = (
        "ready" if full_reconciliations else "limited" if limited_reconciliations else "missing"
    )
    findings_state = "ready" if finding_count and evidence_count else "missing"
    review_count = decision_count + note_count
    review_state = "ready" if review_count else "missing"
    dashboard_state = analysis_state
    report_state = "ready" if report_count else "missing"
    ai_state = "ready" if ai_count else "missing"

    base = f"/companies/{company_id}"
    journey = [
        JourneyStep(
            id="data",
            state=data_state,
            count=available_source_count,
            detail_fa=f"{available_source_count} منبع از ۳ منبع آماده است.",
            href=f"{base}/imports",
        ),
        JourneyStep(
            id="analysis",
            state=analysis_state,
            count=full_analyses + limited_analyses,
            detail_fa="محاسبات دوره‌ای با پوشش داده ثبت شده است."
            if full_analyses + limited_analyses
            else "هنوز اجرای تحلیل تکمیل نشده است.",
            href=f"{base}/analysis",
        ),
        JourneyStep(
            id="reconciliation",
            state=reconciliation_state,
            count=full_reconciliations + limited_reconciliations,
            detail_fa="تطبیق بانک و حسابداری قابل بازبینی است."
            if full_reconciliations + limited_reconciliations
            else "هنوز اجرای تطبیق تکمیل نشده است.",
            href=f"{base}/reconciliation",
        ),
        JourneyStep(
            id="findings",
            state=findings_state,
            count=finding_count,
            detail_fa=f"{finding_count} یافته با {evidence_count} قلم شاهد در دسترس است.",
            href=f"{base}/findings",
        ),
        JourneyStep(
            id="review",
            state=review_state,
            count=review_count,
            detail_fa=f"{decision_count} تصمیم و {note_count} یادداشت ممیزی‌پذیر ثبت شده است.",
            href=f"{base}/findings",
        ),
        JourneyStep(
            id="dashboard",
            state=dashboard_state,
            count=full_analyses + limited_analyses,
            detail_fa="داشبورد از آخرین snapshot تحلیل ساخته می‌شود.",
            href=f"{base}/overview",
        ),
        JourneyStep(
            id="report",
            state=report_state,
            count=report_count,
            detail_fa=f"{report_count} گزارش PDF تکمیل‌شده آماده دریافت است.",
            href=f"{base}/reports",
        ),
        JourneyStep(
            id="ai",
            state=ai_state,
            count=ai_count,
            detail_fa=f"{ai_count} درخواست کنترل‌شده با شکست امن ثبت شده است.",
            href=f"{base}/assistant",
        ),
    ]
    completed_steps = sum(step.state != "missing" for step in journey)
    ready_steps = sum(step.state == "ready" for step in journey)
    overall_state = (
        "ready"
        if completed_steps == len(journey)
        else "limited"
        if completed_steps >= 5
        else "missing"
    )
    return CompanyReadinessResponse(
        overall_state=overall_state,
        completed_steps=completed_steps,
        ready_steps=ready_steps,
        total_steps=len(journey),
        sources=sources,
        journey=journey,
        safeguards={
            "tenant_scoped": True,
            "human_review_required": True,
            "ai_fail_safe": True,
            "immutable_report_snapshot": True,
        },
    )
