import hashlib
import json
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.analysis.models import AnalysisRun, AnalysisStatus, MetricCode, MetricObservation
from app.audit.service import record_audit_event
from app.findings.engine import (
    FindingConfig,
    ReconciliationSignal,
    reconciliation_findings,
    trend_findings,
)
from app.findings.models import (
    Finding,
    FindingGenerationRun,
    FindingRunStatus,
    FindingWorkflowStatus,
)
from app.reconciliation.models import (
    ReconciliationMatch,
    ReconciliationRun,
    ReconciliationStatus,
)

FINAL_ANALYSIS = {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}
FINAL_RECONCILIATION = {
    ReconciliationStatus.COMPLETED,
    ReconciliationStatus.COMPLETED_LIMITED,
}


async def _metrics(session: AsyncSession, analysis_run_id: UUID) -> dict[MetricCode, Decimal]:
    rows = (
        await session.execute(
            select(MetricObservation.metric_code, MetricObservation.value_irr).where(
                MetricObservation.analysis_run_id == analysis_run_id,
                MetricObservation.value_irr.is_not(None),
            )
        )
    ).all()
    return {code: Decimal(value) for code, value in rows if value is not None}


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


async def _reconciliation_signals(
    session: AsyncSession, reconciliation_run_id: UUID
) -> list[ReconciliationSignal]:
    rows = list(
        await session.scalars(
            select(ReconciliationMatch)
            .where(ReconciliationMatch.run_id == reconciliation_run_id)
            .order_by(ReconciliationMatch.id)
        )
    )
    return [
        ReconciliationSignal(
            id=item.id,
            bank_transaction_id=item.bank_transaction_id,
            journal_entry_id=item.journal_entry_id,
            status=item.status,
            score=Decimal(item.score),
            amount_difference_irr=(
                Decimal(item.amount_difference_irr)
                if item.amount_difference_irr is not None
                else None
            ),
            date_difference_days=item.date_difference_days,
            rule_code=item.rule_code,
        )
        for item in rows
    ]


def _rule_version(run: FindingGenerationRun) -> str:
    encoded = json.dumps(run.config_json, sort_keys=True, separators=(",", ":")).encode()
    return f"{run.config_version}:{hashlib.sha256(encoded).hexdigest()[:12]}"


async def execute_finding_generation(
    session: AsyncSession, *, run_id: UUID, company_id: UUID, actor_id: UUID
) -> dict[str, object]:
    run = await session.scalar(
        select(FindingGenerationRun)
        .where(
            FindingGenerationRun.id == run_id,
            FindingGenerationRun.company_id == company_id,
        )
        .with_for_update()
    )
    if run is None:
        raise ValueError("Finding generation run is not accessible")
    if run.status in {FindingRunStatus.COMPLETED, FindingRunStatus.COMPLETED_LIMITED}:
        return {"status": run.status.value, "finding_generation_run_id": str(run.id)}
    if run.status not in {FindingRunStatus.QUEUED, FindingRunStatus.PROCESSING}:
        raise ValueError("Finding generation run is not ready")
    analysis = await session.scalar(
        select(AnalysisRun).where(
            AnalysisRun.id == run.analysis_run_id,
            AnalysisRun.company_id == company_id,
            AnalysisRun.status.in_(FINAL_ANALYSIS),
        )
    )
    if analysis is None:
        raise ValueError("Analysis snapshot is not ready")
    reconciliation: ReconciliationRun | None = None
    if run.reconciliation_run_id is not None:
        reconciliation = await session.scalar(
            select(ReconciliationRun).where(
                ReconciliationRun.id == run.reconciliation_run_id,
                ReconciliationRun.company_id == company_id,
                ReconciliationRun.analysis_run_id == analysis.id,
                ReconciliationRun.status.in_(FINAL_RECONCILIATION),
            )
        )
        if reconciliation is None:
            raise ValueError("Reconciliation snapshot is not ready")

    run.status = FindingRunStatus.PROCESSING
    run.started_at = run.started_at or datetime.now(UTC)
    config = FindingConfig(
        trend_ratio=Decimal(str(run.config_json["trend_ratio"])),
        minimum_amount_irr=Decimal(str(run.config_json["minimum_amount_irr"])),
    )
    candidates = []
    if reconciliation is not None:
        signals = await _reconciliation_signals(session, reconciliation.id)
        candidates.extend(reconciliation_findings(signals))
    previous = await _previous_analysis(session, analysis)
    if previous is not None:
        current_metrics = await _metrics(session, analysis.id)
        previous_metrics = await _metrics(session, previous.id)
        candidates.extend(trend_findings(current_metrics, previous_metrics, previous.id, config))

    rule_version = _rule_version(run)
    now = datetime.now(UTC)
    values = [
        {
            "id": uuid7(),
            "company_id": company_id,
            "analysis_run_id": analysis.id,
            "generation_run_id": run.id,
            "reconciliation_match_id": candidate.reconciliation_match_id,
            "fingerprint": candidate.fingerprint(analysis.id, rule_version),
            "finding_code": candidate.finding_code,
            "kind": candidate.kind,
            "category": candidate.category,
            "title_fa": candidate.title_fa,
            "summary_fa": candidate.summary_fa,
            "assertion_status": candidate.assertion_status,
            "severity": candidate.severity,
            "confidence_score": candidate.confidence_score,
            "confidence_basis_json": candidate.confidence_basis,
            "affected_amount_irr": candidate.affected_amount_irr,
            "affected_ratio": candidate.affected_ratio,
            "period_start": analysis.period_start,
            "period_end": analysis.period_end,
            "reason_code": candidate.reason_code,
            "reason_parameters_json": candidate.reason_parameters,
            "calculation_json": candidate.calculation,
            "rule_version": rule_version,
            "workflow_status": FindingWorkflowStatus.NEEDS_REVIEW,
            "created_at": now,
            "updated_at": now,
        }
        for candidate in candidates
    ]
    if values:
        await session.execute(
            insert(Finding)
            .values(values)
            .on_conflict_do_nothing(constraint="uq_finding_run_fingerprint")
        )
    code_counts = Counter(candidate.finding_code.value for candidate in candidates)
    counts: dict[str, object] = {
        "total": len(candidates),
        "by_code": dict(sorted(code_counts.items())),
        "catalog_size": 8,
    }
    coverage: dict[str, object] = {
        "reconciliation_findings": {
            "available": reconciliation is not None,
            "reason": (
                None
                if reconciliation is not None
                else "اجرای تطبیق برای این snapshot ارائه نشده است"
            ),
        },
        "financial_trends": {
            "available": previous is not None,
            "comparison_analysis_run_id": str(previous.id) if previous else None,
            "reason": (None if previous else "دوره قبلی هم‌طول و تکمیل‌شده پیدا نشد"),
        },
    }
    run.counts_json = counts
    run.coverage_json = coverage
    run.status = (
        FindingRunStatus.COMPLETED
        if reconciliation is not None and previous is not None
        else FindingRunStatus.COMPLETED_LIMITED
    )
    run.completed_at = now
    run.failure_code = None
    run.failure_message = None
    record_audit_event(
        session,
        action="findings.generated",
        entity_type="finding_generation_run",
        actor_id=actor_id,
        entity_id=run.id,
        company_id=company_id,
        metadata={
            "analysis_run_id": str(analysis.id),
            "reconciliation_run_id": (
                str(reconciliation.id) if reconciliation is not None else None
            ),
            "rule_version": rule_version,
            **counts,
        },
    )
    await session.commit()
    return {
        "status": run.status.value,
        "finding_generation_run_id": str(run.id),
        "counts": counts,
        "coverage": coverage,
    }
