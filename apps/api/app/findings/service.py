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
from app.financial.models import BankTransaction
from app.findings.engine import (
    FindingConfig,
    ReconciliationSignal,
    reconciliation_findings,
    trend_findings,
)
from app.findings.evidence import (
    EvidenceDraft,
    ManifestContext,
    MetricContext,
    SourceContext,
    coverage_evidence,
    metric_comparison_evidence,
    reconciliation_source_evidence,
    rule_and_calculation_evidence,
)
from app.findings.models import (
    EvidenceItem,
    Finding,
    FindingGenerationRun,
    FindingRunStatus,
    FindingWorkflowStatus,
)
from app.findings.priority import PriorityConfig, calculate_priority
from app.imports.models import ImportBatch, SourceFile, SourceRow
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


async def _metric_contexts(
    session: AsyncSession, run_ids: list[UUID]
) -> dict[tuple[UUID, str], MetricContext]:
    if not run_ids:
        return {}
    rows = list(
        await session.scalars(
            select(MetricObservation).where(
                MetricObservation.analysis_run_id.in_(run_ids),
                MetricObservation.value_irr.is_not(None),
            )
        )
    )
    return {
        (item.analysis_run_id, item.metric_code.value): MetricContext(
            id=item.id,
            analysis_run_id=item.analysis_run_id,
            metric_code=item.metric_code.value,
            value_irr=Decimal(item.value_irr),
            calculation=item.calculation_json,
        )
        for item in rows
        if item.value_irr is not None
    }


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
    bank_ids = {item.bank_transaction_id for item in rows if item.bank_transaction_id is not None}
    bank_amount_rows = (
        await session.execute(
            select(BankTransaction.id, BankTransaction.amount_irr).where(
                BankTransaction.id.in_(bank_ids)
            )
        )
    ).all()
    bank_amounts: dict[UUID, Decimal] = {
        bank_id: Decimal(amount) for bank_id, amount in bank_amount_rows
    }
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
            reference_amount_irr=(
                Decimal(bank_amounts[item.bank_transaction_id])
                if item.bank_transaction_id in bank_amounts
                else None
            ),
        )
        for item in rows
    ]


def _rule_version(run: FindingGenerationRun) -> str:
    rule_config = {
        "trend_ratio": run.config_json["trend_ratio"],
        "minimum_amount_irr": run.config_json["minimum_amount_irr"],
    }
    encoded = json.dumps(rule_config, sort_keys=True, separators=(",", ":")).encode()
    return f"{run.config_version}:{hashlib.sha256(encoded).hexdigest()[:12]}"


def _priority_config(run: FindingGenerationRun) -> tuple[str, PriorityConfig]:
    raw = run.config_json.get("priority", {})
    config = PriorityConfig(
        impact_weight=Decimal(str(raw.get("impact_weight", "0.40"))),
        materiality_weight=Decimal(str(raw.get("materiality_weight", "0.25"))),
        confidence_weight=Decimal(str(raw.get("confidence_weight", "0.20"))),
        urgency_weight=Decimal(str(raw.get("urgency_weight", "0.15"))),
        critical_threshold=Decimal(str(raw.get("critical_threshold", "80"))),
        high_threshold=Decimal(str(raw.get("high_threshold", "60"))),
        medium_threshold=Decimal(str(raw.get("medium_threshold", "35"))),
        materiality_amount_irr=Decimal(str(raw.get("materiality_amount_irr", "100000000"))),
        revenue_ratio_full_score=Decimal(str(raw.get("revenue_ratio_full_score", "0.20"))),
        critical_minimum_confidence=Decimal(str(raw.get("critical_minimum_confidence", "70"))),
    )
    encoded = json.dumps(config.as_dict(), sort_keys=True, separators=(",", ":")).encode()
    model = str(raw.get("model_version", "priority-v1"))
    return f"{model}:{hashlib.sha256(encoded).hexdigest()[:12]}", config


async def _source_contexts(
    session: AsyncSession, source_row_ids: set[UUID]
) -> dict[UUID, SourceContext]:
    if not source_row_ids:
        return {}
    rows = (
        await session.execute(
            select(SourceRow, ImportBatch.file_id, SourceFile.original_name, SourceFile.sha256)
            .join(ImportBatch, ImportBatch.id == SourceRow.import_batch_id)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .where(SourceRow.id.in_(source_row_ids))
        )
    ).all()
    return {
        row.id: SourceContext(
            source_row_id=row.id,
            source_file_id=file_id,
            import_batch_id=row.import_batch_id,
            sheet=row.sheet,
            row_number=row.row_number,
            raw=row.raw_json,
            original_name=original_name,
            sha256=sha256,
        )
        for row, file_id, original_name, sha256 in rows
    }


async def _manifest_contexts(session: AsyncSession, analysis: AnalysisRun) -> list[ManifestContext]:
    batch_ids = [UUID(item) for item in analysis.input_manifest_json.get("import_batch_ids", [])]
    if not batch_ids:
        return []
    rows = (
        await session.execute(
            select(ImportBatch.id, SourceFile.id, SourceFile.original_name, SourceFile.sha256)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .where(
                ImportBatch.company_id == analysis.company_id,
                ImportBatch.id.in_(batch_ids),
            )
            .order_by(ImportBatch.id)
        )
    ).all()
    return [
        ManifestContext(
            import_batch_id=row[0],
            source_file_id=row[1],
            original_name=row[2],
            sha256=row[3],
        )
        for row in rows
    ]


def _source_row_ids(evidence: dict[str, object]) -> set[UUID]:
    values: list[object] = [evidence.get("source_row_id")]
    for key in ("bank", "accounting"):
        child = evidence.get(key)
        if isinstance(child, dict):
            values.append(child.get("source_row_id"))
    result: set[UUID] = set()
    for value in values:
        if value:
            try:
                result.add(UUID(str(value)))
            except ValueError:
                continue
    return result


async def _build_evidence_values(
    session: AsyncSession,
    *,
    findings: list[Finding],
    analysis: AnalysisRun,
    previous: AnalysisRun | None,
    now: datetime,
) -> list[dict[str, object]]:
    match_ids = {
        item.reconciliation_match_id
        for item in findings
        if item.reconciliation_match_id is not None
    }
    matches = (
        list(
            await session.scalars(
                select(ReconciliationMatch).where(
                    ReconciliationMatch.company_id == analysis.company_id,
                    ReconciliationMatch.id.in_(match_ids),
                )
            )
        )
        if match_ids
        else []
    )
    matches_by_id = {item.id: item for item in matches}
    row_ids: set[UUID] = set()
    for item in matches:
        row_ids.update(_source_row_ids(item.evidence_json))
    source_contexts = await _source_contexts(session, row_ids)
    run_ids = [analysis.id] + ([previous.id] if previous is not None else [])
    metrics = await _metric_contexts(session, run_ids)
    manifest = await _manifest_contexts(session, analysis)

    values: list[dict[str, object]] = []
    for finding in findings:
        drafts: list[EvidenceDraft] = rule_and_calculation_evidence(finding)
        if finding.reconciliation_match_id is not None:
            match = matches_by_id.get(finding.reconciliation_match_id)
            if match is not None:
                drafts.extend(
                    reconciliation_source_evidence(finding, match.evidence_json, source_contexts)
                )
        else:
            metric_code = str(finding.reason_parameters_json.get("metric_code", ""))
            drafts.extend(
                metric_comparison_evidence(
                    finding,
                    metrics.get((analysis.id, metric_code)),
                    metrics.get((previous.id, metric_code)) if previous is not None else None,
                )
            )
            drafts.extend(coverage_evidence(finding, manifest))
        for ordinal, draft in enumerate(drafts, start=1):
            values.append(
                {
                    "id": uuid7(),
                    "company_id": finding.company_id,
                    "finding_id": finding.id,
                    "ordinal": ordinal,
                    "evidence_type": draft.evidence_type,
                    "claim_code": draft.claim_code,
                    "source_entity_type": draft.source_entity_type,
                    "source_entity_id": draft.source_entity_id,
                    "source_row_id": draft.source_row_id,
                    "source_file_id": draft.source_file_id,
                    "field_snapshot_json": draft.field_snapshot or {},
                    "calculation_json": draft.calculation or {},
                    "rule_code": draft.rule_code,
                    "rule_version": finding.rule_version,
                    "created_at": now,
                }
            )
    return values


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
    current_metrics = await _metrics(session, analysis.id)
    previous = await _previous_analysis(session, analysis)
    if previous is not None:
        previous_metrics = await _metrics(session, previous.id)
        candidates.extend(trend_findings(current_metrics, previous_metrics, previous.id, config))

    rule_version = _rule_version(run)
    priority_model_version, priority_config = _priority_config(run)
    revenue_irr = current_metrics.get(MetricCode.REVENUE_IRR)
    now = datetime.now(UTC)
    prepared = [
        (
            candidate,
            candidate.fingerprint(analysis.id, rule_version),
            calculate_priority(
                finding_code=candidate.finding_code,
                confidence_score=candidate.confidence_score,
                affected_amount_irr=candidate.affected_amount_irr,
                revenue_irr=revenue_irr,
                config=priority_config,
            ),
        )
        for candidate in candidates
    ]
    values = [
        {
            "id": uuid7(),
            "company_id": company_id,
            "analysis_run_id": analysis.id,
            "generation_run_id": run.id,
            "reconciliation_match_id": candidate.reconciliation_match_id,
            "fingerprint": fingerprint,
            "finding_code": candidate.finding_code,
            "kind": candidate.kind,
            "category": candidate.category,
            "title_fa": candidate.title_fa,
            "summary_fa": candidate.summary_fa,
            "assertion_status": candidate.assertion_status,
            "severity": candidate.severity,
            "priority_band": priority.band,
            "priority_score": priority.score,
            "priority_explanation_json": priority.explanation,
            "priority_model_version": priority_model_version,
            "priority_config_json": priority_config.as_dict(),
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
        for candidate, fingerprint, priority in prepared
    ]
    if values:
        await session.execute(
            insert(Finding)
            .values(values)
            .on_conflict_do_nothing(constraint="uq_finding_run_fingerprint")
        )
    fingerprints = [fingerprint for _, fingerprint, _ in prepared]
    persisted_findings = (
        list(
            await session.scalars(
                select(Finding).where(
                    Finding.company_id == company_id,
                    Finding.analysis_run_id == analysis.id,
                    Finding.fingerprint.in_(fingerprints),
                )
            )
        )
        if fingerprints
        else []
    )
    evidence_values = await _build_evidence_values(
        session,
        findings=persisted_findings,
        analysis=analysis,
        previous=previous,
        now=now,
    )
    if evidence_values:
        await session.execute(
            insert(EvidenceItem)
            .values(evidence_values)
            .on_conflict_do_nothing(constraint="uq_evidence_finding_ordinal")
        )
    code_counts = Counter(candidate.finding_code.value for candidate in candidates)
    counts: dict[str, object] = {
        "total": len(candidates),
        "by_code": dict(sorted(code_counts.items())),
        "catalog_size": 8,
        "evidence_items": len(evidence_values),
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
            "priority_model_version": priority_model_version,
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
