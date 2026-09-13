from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.findings.evidence import (
    ManifestContext,
    MetricContext,
    SourceContext,
    coverage_evidence,
    metric_comparison_evidence,
    reconciliation_source_evidence,
)
from app.findings.models import (
    AssertionStatus,
    Finding,
    FindingCategory,
    FindingCode,
    FindingKind,
    FindingSeverity,
    FindingWorkflowStatus,
    PriorityBand,
)
from app.findings.priority import PriorityConfig, calculate_priority
from app.findings.schemas import PriorityConfigRequest


def uid(value: int) -> UUID:
    return UUID(int=value)


def test_all_catalog_findings_receive_explainable_four_factor_priority() -> None:
    for code in FindingCode:
        result = calculate_priority(
            finding_code=code,
            confidence_score=Decimal("88"),
            affected_amount_irr=Decimal("20000000"),
            revenue_irr=Decimal("100000000"),
            config=PriorityConfig(),
        )
        factors = result.explanation["factors"]
        assert isinstance(factors, dict)
        assert set(factors) == {"impact", "materiality", "confidence", "urgency"}
        weighted = sum(Decimal(item["weighted_score"]) for item in factors.values())
        assert weighted == result.score
        assert result.explanation["revenue_ratio"] == "0.2"
        assert result.band in set(PriorityBand)


def test_low_confidence_cannot_become_critical() -> None:
    result = calculate_priority(
        finding_code=FindingCode.AMOUNT_MISMATCH,
        confidence_score=Decimal("50"),
        affected_amount_irr=Decimal("1000000000"),
        revenue_irr=Decimal("1000000000"),
        config=PriorityConfig(
            impact_weight=Decimal("1"),
            materiality_weight=Decimal("0"),
            confidence_weight=Decimal("0"),
            urgency_weight=Decimal("0"),
        ),
    )

    assert result.score == Decimal("90.00")
    assert result.band == PriorityBand.HIGH
    assert result.explanation["critical_capped_for_low_confidence"] is True
    assert "uncertainty_fa" in result.explanation


def test_priority_configuration_rejects_invalid_weights_and_bands() -> None:
    with pytest.raises(ValidationError):
        PriorityConfigRequest(impact_weight=Decimal("0.50"))
    with pytest.raises(ValidationError):
        PriorityConfigRequest(critical_threshold=Decimal("60"), high_threshold=Decimal("60"))


def test_reconciliation_evidence_preserves_source_lineage_and_snapshot() -> None:
    finding = Finding(
        id=uid(1),
        company_id=uid(2),
        analysis_run_id=uid(3),
        generation_run_id=uid(4),
        reconciliation_match_id=uid(5),
        fingerprint="a" * 64,
        finding_code=FindingCode.AMOUNT_MISMATCH,
        kind=FindingKind.DISCREPANCY,
        category=FindingCategory.RECONCILIATION,
        title_fa="مغایرت مبلغ",
        summary_fa="مغایرت مشاهده شد",
        assertion_status=AssertionStatus.DETERMINISTIC,
        severity=FindingSeverity.HIGH,
        priority_band=PriorityBand.HIGH,
        priority_score=Decimal("70"),
        priority_explanation_json={},
        priority_model_version="priority-v1:test",
        priority_config_json={},
        confidence_score=Decimal("100"),
        confidence_basis_json={},
        affected_amount_irr=Decimal("1000"),
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        reason_code="REFERENCE_AMOUNT_MISMATCH",
        reason_parameters_json={},
        calculation_json={},
        rule_version="finding-rules-v1:test",
        workflow_status=FindingWorkflowStatus.NEEDS_REVIEW,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    row_id = uid(10)
    context = SourceContext(
        source_row_id=row_id,
        source_file_id=uid(11),
        import_batch_id=uid(12),
        sheet="بانک",
        row_number=8,
        raw={"مبلغ": "۱٬۰۰۰"},
        original_name="گردش.csv",
        sha256="b" * 64,
    )

    items = reconciliation_source_evidence(
        finding,
        {
            "bank": {
                "transaction_id": str(uid(20)),
                "source_row_id": str(row_id),
                "amount_irr": "1000",
            }
        },
        {row_id: context},
    )

    assert len(items) == 1
    assert items[0].source_row_id == row_id
    assert items[0].source_file_id == uid(11)
    assert items[0].field_snapshot == {
        "normalized": {"transaction_id": str(uid(20)), "amount_irr": "1000"},
        "raw": {"مبلغ": "۱٬۰۰۰"},
        "source_location": {"sheet": "بانک", "row_number": 8},
        "source_file": {"original_name": "گردش.csv", "sha256": "b" * 64},
    }


def test_trend_evidence_links_both_metrics_and_snapshot_files() -> None:
    finding = Finding(
        reason_code="REVENUE_DROP_THRESHOLD",
        rule_version="finding-rules-v1:test",
    )
    current = MetricContext(
        id=uid(30),
        analysis_run_id=uid(31),
        metric_code="revenue_irr",
        value_irr=Decimal("8000000"),
        calculation={"source": "journal_lines"},
    )
    previous = MetricContext(
        id=uid(32),
        analysis_run_id=uid(33),
        metric_code="revenue_irr",
        value_irr=Decimal("10000000"),
        calculation={"source": "journal_lines"},
    )
    comparison = metric_comparison_evidence(finding, current, previous)
    coverage = coverage_evidence(
        finding,
        [
            ManifestContext(
                import_batch_id=uid(40),
                source_file_id=uid(41),
                original_name="دفتر.csv",
                sha256="c" * 64,
            )
        ],
    )

    assert [item.field_snapshot["position"] for item in comparison] == [
        "current",
        "previous",
    ]
    assert {item.source_entity_id for item in comparison} == {uid(30), uid(32)}
    assert coverage[0].source_entity_id == uid(40)
    assert coverage[0].source_file_id == uid(41)
