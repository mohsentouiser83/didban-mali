from datetime import UTC, datetime
from uuid import uuid4

from app.data.schemas import RecordLineageResponse


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
