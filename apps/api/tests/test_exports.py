from copy import deepcopy
from io import BytesIO

from openpyxl import load_workbook
from pypdf import PdfReader

from didban.exports import localized, pdf_report, safe_csv, xlsx_report


def sample():
    return {
        "id": "result-test", "digest": "a" * 64, "period_id": "period-test",
        "period": {"start": "2026-09-01", "end": "2026-09-30"},
        "selection": {"rows": ["source-row-1"]},
        "metrics": [
            {"metric_key": "revenue", "label": "درآمد دفتر", "basis": "ledger", "value": "123456789012345678901234567890.123456", "unit": "IRR", "status": "available", "evidence_refs": ["source-row-1"]},
            {"metric_key": "cash", "label": "نقد", "basis": "bank", "value": None, "unit": "IRR", "status": "unavailable", "reason": "مانده مبنای بانک موجود نیست.", "reason_codes": ["bank_anchor_missing"], "evidence_refs": []},
        ],
        "details": {"invoices": [{"reference": "=HYPERLINK(\"bad\")", "amount": "100", "remaining": None}], "cash_movements": {"external_in": "100", "external_out": "0", "net": "100"}},
    }


def test_xlsx_preserves_exact_strings_null_and_formula_safety():
    manifest = sample()
    before = deepcopy(manifest)
    content = xlsx_report(manifest, {"id": "report", "title": "گزارش مالی", "version": 1}, "شرکت آزمون")
    book = load_workbook(BytesIO(content), data_only=False)
    metrics = book["شاخص‌ها"]
    headers = [cell.value for cell in metrics[1]]
    value_column = headers.index("value") + 1
    assert metrics.cell(2, value_column).value == manifest["metrics"][0]["value"]
    assert metrics.cell(2, value_column).data_type == "s"
    assert metrics.cell(3, value_column).value is None
    assert book["فاکتورها"].cell(2, 1).value.startswith("=HYPERLINK")
    assert book["فاکتورها"].cell(2, 1).data_type == "s"
    assert all(sheet.sheet_view.rightToLeft for sheet in book)
    assert manifest == before


def test_csv_does_not_execute_formula_cells():
    data = safe_csv(["name", "amount"], [{"name": "  =1+1", "amount": "-100"}, {"name": "\t@command", "amount": None}]).decode("utf-8-sig")
    assert "'  =1+1" in data
    assert "'-100" in data
    assert "'\t@command" in data


def test_pdf_is_a4_and_embeds_requested_persian_fonts():
    manifest = sample()
    before = deepcopy(manifest)
    content = pdf_report(manifest, {"id": "report", "title": "گزارش مالی شهریور", "version": 1}, "شرکت آزمون")
    reader = PdfReader(BytesIO(content))
    assert len(reader.pages) >= 1
    first = reader.pages[0]
    assert abs(float(first.mediabox.width) - 595.276) < 1
    assert abs(float(first.mediabox.height) - 841.89) < 1
    embedded = []
    for page in reader.pages:
        for font in page["/Resources"]["/Font"].get_object().values():
            value = font.get_object()
            descriptor = value.get("/FontDescriptor")
            if descriptor:
                embedded.append(descriptor.get_object().get("/FontFile2"))
    assert embedded and all(embedded)
    assert manifest == before


def test_localized_null_is_not_zero_and_decimal_is_not_rounded():
    assert localized(None, amount=True) == "ناموجود"
    assert localized("0", amount=True) == "۰"
    assert localized("123.400", amount=True) == "۱۲۳٫۴۰۰"


def test_bank_flow_labels_never_substitute_external_only_for_total():
    from didban.exports import bank_flow_summary
    assert bank_flow_summary({"external_in": "100", "internal_in": "40", "external_out": "50", "internal_out": "40", "net": "50"}) == {"total_in": "140", "total_out": "90", "net": "50"}
    assert bank_flow_summary({"external_in": "100", "external_out": "50", "net": "50"})["total_in"] is None
    assert bank_flow_summary({"total_in": "0", "total_out": None, "external_out": "50", "internal_out": "40"})["total_out"] is None
