from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.findings.models import EvidenceType, Finding


@dataclass(frozen=True)
class SourceContext:
    source_row_id: UUID
    source_file_id: UUID
    import_batch_id: UUID
    sheet: str
    row_number: int
    raw: dict[str, Any]
    original_name: str
    sha256: str


@dataclass(frozen=True)
class MetricContext:
    id: UUID
    analysis_run_id: UUID
    metric_code: str
    value_irr: Decimal
    calculation: dict[str, Any]


@dataclass(frozen=True)
class ManifestContext:
    import_batch_id: UUID
    source_file_id: UUID
    original_name: str
    sha256: str


@dataclass(frozen=True)
class EvidenceDraft:
    evidence_type: EvidenceType
    claim_code: str
    source_entity_type: str | None = None
    source_entity_id: UUID | None = None
    source_row_id: UUID | None = None
    source_file_id: UUID | None = None
    field_snapshot: dict[str, Any] | None = None
    calculation: dict[str, Any] | None = None
    rule_code: str | None = None


def _uuid(value: object) -> UUID | None:
    try:
        return UUID(str(value)) if value else None
    except (TypeError, ValueError):
        return None


def rule_and_calculation_evidence(finding: Finding) -> list[EvidenceDraft]:
    return [
        EvidenceDraft(
            evidence_type=EvidenceType.RULE,
            claim_code=finding.reason_code,
            field_snapshot={
                "finding_code": finding.finding_code.value,
                "assertion_status": finding.assertion_status.value,
                "confidence_score": str(finding.confidence_score),
                "reason_parameters": finding.reason_parameters_json,
            },
            rule_code=finding.reason_code,
        ),
        EvidenceDraft(
            evidence_type=EvidenceType.CALCULATION,
            claim_code=finding.reason_code,
            calculation=finding.calculation_json,
            rule_code=finding.reason_code,
        ),
    ]


def reconciliation_source_evidence(
    finding: Finding,
    match_evidence: dict[str, Any],
    source_contexts: dict[UUID, SourceContext],
) -> list[EvidenceDraft]:
    payloads: list[tuple[str, dict[str, Any]]] = []
    for key in ("bank", "accounting"):
        value = match_evidence.get(key)
        if isinstance(value, dict):
            payloads.append((key, value))
    if not payloads:
        payloads.append(("record", match_evidence))

    drafts: list[EvidenceDraft] = []
    for side, payload in payloads:
        row_id = _uuid(payload.get("source_row_id"))
        context = source_contexts.get(row_id) if row_id is not None else None
        entity_type = (
            "bank_transaction"
            if side == "bank" or payload.get("bank_transaction_id")
            else "journal_entry"
        )
        entity_id = _uuid(
            payload.get("transaction_id")
            or payload.get("bank_transaction_id")
            or payload.get("journal_entry_id")
        )
        normalized = {key: value for key, value in payload.items() if key != "source_row_id"}
        snapshot: dict[str, Any] = {"normalized": normalized}
        if context is not None:
            snapshot.update(
                {
                    "raw": context.raw,
                    "source_location": {
                        "sheet": context.sheet,
                        "row_number": context.row_number,
                    },
                    "source_file": {
                        "original_name": context.original_name,
                        "sha256": context.sha256,
                    },
                }
            )
        drafts.append(
            EvidenceDraft(
                evidence_type=EvidenceType.SOURCE_RECORD,
                claim_code=finding.reason_code,
                source_entity_type=entity_type,
                source_entity_id=entity_id,
                source_row_id=row_id,
                source_file_id=context.source_file_id if context is not None else None,
                field_snapshot=snapshot,
                rule_code=finding.reason_code,
            )
        )
    return drafts


def metric_comparison_evidence(
    finding: Finding,
    current: MetricContext | None,
    previous: MetricContext | None,
) -> list[EvidenceDraft]:
    drafts: list[EvidenceDraft] = []
    for label, metric in (("current", current), ("previous", previous)):
        if metric is None:
            continue
        drafts.append(
            EvidenceDraft(
                evidence_type=EvidenceType.COMPARISON,
                claim_code=finding.reason_code,
                source_entity_type="metric_observation",
                source_entity_id=metric.id,
                field_snapshot={
                    "position": label,
                    "analysis_run_id": str(metric.analysis_run_id),
                    "metric_code": metric.metric_code,
                    "value_irr": str(metric.value_irr),
                },
                calculation=metric.calculation,
                rule_code=finding.reason_code,
            )
        )
    return drafts


def coverage_evidence(finding: Finding, contexts: list[ManifestContext]) -> list[EvidenceDraft]:
    return [
        EvidenceDraft(
            evidence_type=EvidenceType.COVERAGE,
            claim_code=finding.reason_code,
            source_entity_type="import_batch",
            source_entity_id=context.import_batch_id,
            source_file_id=context.source_file_id,
            field_snapshot={
                "original_name": context.original_name,
                "sha256": context.sha256,
                "scope": "input_manifest",
            },
            rule_code=finding.reason_code,
        )
        for context in contexts
    ]
