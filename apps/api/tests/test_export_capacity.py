import base64
import json
from copy import deepcopy
from io import BytesIO

from openpyxl import load_workbook

from didban.exports import xlsx_report


def test_xlsx_twenty_thousand_source_and_metric_evidence_rows_are_complete():
    identifiers = [f"source-row-{number:05}" for number in range(20000)]
    manifest = {
        "id": "manifest", "digest": "f"*64,
        "selection": {
            "row_ids": identifiers, "files": [{"id": "source", "sha256": "a"*64}],
            "allocations": [{"id": "allocation", "amount": "12.000001"}],
            "plans": [{"id": "plan", "due_date": "2026-09-20"}],
            "forecast_plans": [{"id": "plan", "due_date": "2026-10-12"}],
            "decisions": [{"id": "question", "answer": {"value": "2026-10-05"}}],
            "interpretation_ids": ["interpretation"],
        },
        "metrics": [{"metric_key": "revenue", "basis": "ledger", "scope": "company", "value": "123456789012345678901234567890.123456", "evidence_refs": identifiers, "coverage": {"explicit": True}}],
        "details": {"forecast": {"status": "estimated", "opening": "100", "closing": "80", "days": [{"date": "2026-10-01", "balance": "100"}], "events": [{"date": "2026-10-12", "amount": "20", "direction": "payment"}], "assumptions": [{"basis": "human_expected_date", "invoice_ref": "INV", "expected_date": "2026-10-05"}]}},
    }
    before = deepcopy(manifest)
    content = xlsx_report(manifest, {"id": "report", "version": 1}, "شرکت ظرفیت")
    book = load_workbook(BytesIO(content), read_only=True, data_only=False)
    try:
        source_ids = [row[0].value for row in book["ردیف‌های ورودی"].iter_rows(min_row=2)]
        assert source_ids == identifiers
        refs = [row[3].value for row in book["شواهد شاخص‌ها"].iter_rows(min_row=2)]
        assert refs == identifiers
        for title in ("منابع ورودی", "تخصیص‌های مبنا", "برنامه‌های مبنا", "برنامه‌های پیش‌بینی", "پاسخ‌ها و تصمیم‌ها", "نسخه‌های تفسیر", "روزهای پیش‌بینی", "رویدادهای پیش‌بینی", "فرض‌های پیش‌بینی"):
            assert title in book.sheetnames
            assert len(list(book[title].iter_rows())) >= 2
        rows = list(book["شاخص‌ها"].iter_rows(values_only=True))
        assert rows[1][rows[0].index("value")] == manifest["metrics"][0]["value"]
        assert rows[1][rows[0].index("evidence_count")] == "20000"
        assert rows[1][rows[0].index("coverage")] == '{"explicit": true}'
    finally:
        book.close()
    assert manifest == before


def test_xlsx_long_unicode_provenance_roundtrips_through_numbered_overflow_chunks():
    long_reason = "شرح تصمیم مالی؛ "*6000
    literal = "=SUM(1,2)"
    controls = "اصل\x01متن\x00دست‌نخورده"
    manifest = {"selection": {"decisions": [{"id": "Q", "reason": long_reason, "formula_like": literal, "raw_control": controls}], "coverage": {"receipt_dates": {f"invoice-{index}": "2026-10-05" for index in range(4000)}}}, "metrics": [], "details": {}}
    content = xlsx_report(manifest, {"id": "report"}, "شرکت")
    book = load_workbook(BytesIO(content), read_only=True, data_only=False)
    try:
        decisions = list(book["پاسخ‌ها و تصمیم‌ها"].iter_rows())
        headers = [cell.value for cell in decisions[0]]
        row = decisions[1]
        assert row[headers.index("formula_like")].value == literal
        assert row[headers.index("formula_like")].data_type == "s"
        continued = {}
        for reference, _sheet, _cell, part, parts, encoding, text in book["ادامه متن"].iter_rows(min_row=2, values_only=True):
            continued.setdefault(reference, []).append((int(part), int(parts), encoding, text))
        reconstructed = {}
        for reference, chunks in continued.items():
            chunks.sort()
            assert len(chunks) == chunks[0][1]
            value = "".join(chunk[3] for chunk in chunks)
            if chunks[0][2] == "base64-utf8":
                value = base64.b64decode(value).decode("utf-8")
            reconstructed[reference] = value
        assert long_reason in reconstructed.values()
        assert controls in reconstructed.values()
        assert json.dumps(manifest["selection"]["coverage"]["receipt_dates"], ensure_ascii=False, sort_keys=True) in reconstructed.values()
        for sheet in book:
            for values in sheet.iter_rows():
                for cell in values:
                    if cell.value is not None:
                        assert cell.data_type != "f"
                        assert len(str(cell.value).encode("utf-16-le")) // 2 <= 32767
    finally:
        book.close()
