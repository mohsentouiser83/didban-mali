from datetime import UTC, datetime
from uuid import uuid4

from app.data.schemas import (
    ActionableHealthIssue,
    DataOverviewResponse,
    DataQualityResponse,
    RecordLineageResponse,
    SourceCardHealth,
)
from app.imports.models import SourceKind


def test_data_overview_response_schema_validation() -> None:
    company_id = uuid4()
    card = SourceCardHealth(
        source_kind=SourceKind.ACCOUNTING,
        source_title="حسابداری",
        status="ready",
        status_label="آماده",
        last_successful_import=datetime.now(UTC),
        accepted_records=1200,
        rejected_records=0,
        warnings_count=2,
        estimated_coverage_pct=100,
        freshness_days=0,
        freshness_label="به‌روز (امروز)",
        usable_for_calculations=True,
        primary_cta_label="مشاهده جزئیات",
        primary_cta_action="history",
        summary_notes=["۱۲۰۰ رکورد معتبر"],
    )

    issue = ActionableHealthIssue(
        id="test-issue",
        severity="warning",
        title="هشدار آزمایشی",
        description="توضیحات هشدار",
        action_label="بررسی",
        action_tab="quality",
    )

    overview = DataOverviewResponse(
        company_id=company_id,
        sources=[card],
        health_issues=[issue],
        total_accepted_records=1200,
        total_rejected_records=0,
        total_warnings=2,
        overall_health_score=100,
    )

    assert overview.company_id == company_id
    assert len(overview.sources) == 1
    assert overview.sources[0].status == "ready"
    assert overview.overall_health_score == 100


def test_data_quality_response_schema_validation() -> None:
    company_id = uuid4()
    quality = DataQualityResponse(
        company_id=company_id,
        total_records=100,
        accepted_records=95,
        warning_records=3,
        rejected_records=5,
        health_score_pct=95,
        groups=[],
        quarantined_rows=[],
    )

    assert quality.total_records == 100
    assert quality.accepted_records == 95
    assert quality.health_score_pct == 95


def test_record_lineage_response_schema_validation() -> None:
    company_id = uuid4()
    rec_id = uuid4()
    import_id = uuid4()
    file_id = uuid4()

    lineage = RecordLineageResponse(
        company_id=company_id,
        record_id=rec_id,
        entity_type="journal_entry",
        import_id=import_id,
        source_file_id=file_id,
        source_filename="sepidar_1404.xlsx",
        source_file_sha256="abc123sha256fake",
        source_row_number=14,
        sheet_name="دفتر کل",
        raw_values={"شماره سند": "100", "بدهکار": "2500000"},
        mapping_version=1,
        mapping_summary={"entry_id": "شماره سند", "debit": "بدهکار"},
        transforms_applied={"debit": ["normalize_digits", "strip_thousands"]},
        normalized_fields={"entry_date": "2026-03-21"},
        imported_at=datetime.now(UTC),
    )

    assert lineage.record_id == rec_id
    assert lineage.source_row_number == 14
    assert lineage.raw_values["شماره سند"] == "100"
