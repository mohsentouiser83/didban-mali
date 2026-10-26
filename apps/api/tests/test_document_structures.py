import io
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from openpyxl import Workbook
from pydantic import ValidationError

from app.imports.completeness import assess_coverage
from app.imports.mapping import (
    parse_table,
    suggest_mapping,
    transform_and_validate_row,
    validate_mapping_fields,
)
from app.imports.models import IssueSeverity, SourceKind
from app.imports.structure import (
    InputScope,
    SourceLayout,
    effective_raw,
    inherited_rows,
    select_rows,
    unknown_filter_rows,
    validate_layout,
)
from app.moadian.chains import attach_related_documents
from app.moadian.datasets import aggregate_invoice_rows, merge_overlapping_snapshots
from app.moadian.engine import compare_invoices
from app.moadian.schemas import ComparisonDecisionRequest, InvoiceSnapshot


def invoice(**updates):
    return InvoiceSnapshot(
        row_id=updates.pop("row_id", uuid4()),
        batch_id=updates.pop("batch_id", uuid4()),
        row_number=2,
        sheet="source",
        invoice_no="1",
        tax_id=updates.pop("tax_id", "A" * 22),
        issue_date=date(2026, 10, 1),
        party_name="نمونه",
        gross_amount=updates.pop("gross_amount", "110"),
        tax_amount=updates.pop("tax_amount", "10"),
        subject=updates.pop("subject", "اصلی"),
        status="تایید شده",
        **updates,
    )


def batch(scope=None, rejected=0, unclassified=0):
    return SimpleNamespace(
        id=uuid4(),
        rejected_count=rejected,
        coverage_json={
            "input_scope": scope or {},
            "row_selection": {"unclassified": unclassified},
        },
    )


def test_grouped_xlsx_headers_are_combined_without_losing_blank_parent_columns():
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["document", "", "amount", ""])
    sheet.append(["date", "number", "debit", "credit"])
    sheet.append(["2026-10-01", "42", "100", "0"])
    stream = io.BytesIO()
    workbook.save(stream)
    parsed = parse_table(stream, ".xlsx", header_rows=2)
    assert parsed.columns == ["document / date", "number", "amount / debit", "credit"]
    assert parsed.rows[0][0] == 3
    mapped = {
        s["target_field"]: s["source_column"]
        for s in suggest_mapping(parsed.columns, SourceKind.ACCOUNTING)
    }
    assert mapped["entry_date"] == "document / date"
    assert mapped["debit"] == "amount / debit"


def test_multiline_csv_headers_preserve_original_data_row_numbers():
    parsed = parse_table(
        io.BytesIO(b"document,amount\ndate,debit\n2026-10-01,100\n"), ".csv", header_rows=2
    )
    assert parsed.columns == ["document / date", "amount / debit"]
    assert parsed.rows[0] == (3, {"document / date": "2026-10-01", "amount / debit": "100"})


def test_explicit_inheritance_preserves_original_cells_and_never_copies_amounts():
    rows = [(2, {"date": "2026-10-01", "amount": 100}), (3, {"date": "", "amount": 200})]
    prepared = list(inherited_rows(rows, ["date"]))
    assert prepared[1][1]["date"] == ""
    assert effective_raw(prepared[1][1], {"inherited_values": prepared[1][2]}) == {
        "date": "2026-10-01",
        "amount": 200,
    }
    assert validate_layout(
        SourceLayout(fill_down_columns=["amount"]), {"gross_amount": "amount"}, ["amount"]
    )
    assert not validate_layout(
        SourceLayout(fill_down_columns=["date"]), {"issue_date": "date"}, ["date"]
    )


def test_account_filter_cannot_silently_claim_blank_account_rows_are_complete():
    rows = [
        (2, {"account": "۱۲۳", "amount": "1"}),
        (3, {"account": "", "amount": "2"}),
        (4, {"account": "456", "amount": "3"}),
    ]
    layout = SourceLayout(row_filter_column="account", row_filter_value="123")
    selected, excluded = select_rows(rows, layout)
    assert len(selected) == 1 and excluded == 2 and unknown_filter_rows(rows, layout) == 1
    layout.fill_down_columns = ["account"]
    selected, excluded = select_rows(rows, layout)
    assert [number for number, _ in selected] == [2, 3]
    assert selected[1][1]["account"] == ""
    assert excluded == 1 and unknown_filter_rows(rows, layout) == 0


@pytest.mark.parametrize(
    ("kind", "direction", "signed"),
    [
        (SourceKind.ACCOUNTING, "credit", "-100"),
        (SourceKind.ACCOUNTING, "بدهکار", "100"),
        (SourceKind.BANK, "credit", "100"),
        (SourceKind.BANK, "بدهکار", "-100"),
        (SourceKind.BANK, "برداشت", "-100"),
    ],
)
def test_amount_and_direction_are_explicit_in_the_correct_source_perspective(
    kind, direction, signed
):
    raw = {
        "date": "2026-10-01",
        "amount": "100",
        "direction": direction,
        "code": "7",
        "name": "نمونه",
    }
    mapping = {
        "entry_date" if kind == SourceKind.ACCOUNTING else "booking_date": "date",
        "amount_signed": "amount",
        "amount_direction": "direction",
    }
    if kind == SourceKind.ACCOUNTING:
        mapping.update(account_code="code", account_name="name")
    assert not validate_mapping_fields(kind, mapping, list(raw))
    result, issues = transform_and_validate_row(
        source_kind=kind,
        row_number=2,
        raw=raw,
        mapping=mapping,
        transforms={},
        currency_unit="rial",
        calendar="gregorian",
    )
    assert not any(issue.severity == IssueSeverity.ERROR for issue in issues)
    assert result["amount_signed"] == signed
    if kind == SourceKind.ACCOUNTING:
        assert int(result["debit"]) - int(result["credit"]) == int(signed)


def test_minimal_invoice_data_needs_neither_due_date_nor_receipt_history():
    raw = {"invoice_no": "42", "issue_date": "2026-10-01", "gross_amount": "100"}
    assert not validate_mapping_fields(SourceKind.SALES, {key: key for key in raw}, list(raw))
    _, issues = transform_and_validate_row(
        source_kind=SourceKind.SALES,
        row_number=2,
        raw=raw,
        mapping={key: key for key in raw},
        transforms={},
        currency_unit="rial",
        calendar="gregorian",
    )
    assert issues == []


def test_invoice_line_totals_sum_exactly_and_repeated_totals_do_not_sum():
    first = invoice(gross_amount="9007199254740993", tax_amount="1")
    second = first.model_copy(update={"row_id": uuid4(), "gross_amount": "2", "tax_amount": "1"})
    total = aggregate_invoice_rows([first, second], "line_totals")[0]
    assert total.gross_amount == "9007199254740995" and total.tax_amount == "2"
    assert len(total.source_rows) == 2
    repeated = aggregate_invoice_rows(
        [first, first.model_copy(update={"row_id": uuid4()})], "repeated_totals"
    )[0]
    assert repeated.gross_amount == first.gross_amount


def test_conflicting_repeated_totals_are_reviewed_instead_of_choosing_an_amount():
    first = invoice()
    combined = aggregate_invoice_rows(
        [first, first.model_copy(update={"row_id": uuid4(), "gross_amount": "120"})],
        "repeated_totals",
    )
    assert combined[0].import_limitations
    assert all(item.status == "review" for item in compare_invoices(combined, [invoice()]))


def test_identical_cross_file_snapshots_preserve_both_sources_and_internal_duplicates_remain():
    first = invoice()
    second = first.model_copy(update={"row_id": uuid4(), "batch_id": uuid4()})
    merged, copies = merge_overlapping_snapshots([first, second])
    assert copies == 1 and len(merged) == 1 and len(merged[0].source_rows) == 2
    duplicate = second.model_copy(update={"batch_id": first.batch_id})
    merged, copies = merge_overlapping_snapshots([first, duplicate])
    assert copies == 0 and len(merged) == 2


def test_conflicting_exports_do_not_silently_replace_earlier_values():
    first = invoice()
    second = first.model_copy(
        update={"row_id": uuid4(), "batch_id": uuid4(), "gross_amount": "120"}
    )
    merged, copies = merge_overlapping_snapshots([first, second])
    assert not copies and all(row.import_limitations for row in merged)


def test_period_coverage_checks_gaps_rejected_rows_and_unclassified_filter_rows():
    start, end = date(2026, 10, 1), date(2026, 10, 31)
    left = batch({"completeness": "complete", "start_date": "2026-10-01", "end_date": "2026-10-10"})
    right = batch(
        {"completeness": "complete", "start_date": "2026-10-12", "end_date": "2026-10-31"}
    )
    assert not assess_coverage([left, right], start, end)["complete"]
    right.coverage_json["input_scope"]["start_date"] = "2026-10-11"
    assert assess_coverage([left, right], start, end)["complete"]
    right.rejected_count = 1
    assert not assess_coverage([left, right], start, end, confirmed=True)["complete"]
    assert not assess_coverage([batch(unclassified=1)], start, end, confirmed=True)["complete"]
    assert not assess_coverage([], start, end, confirmed=True)["complete"]


def test_missing_scope_never_means_complete_and_complete_scope_requires_dates():
    assert not assess_coverage([batch()], date(2026, 1, 1), date(2026, 1, 2))["complete"]
    with pytest.raises(ValidationError):
        InputScope(completeness="complete")
    assert assess_coverage(
        [batch({"completeness": "complete", "start_date": "9999-12-30", "end_date": "9999-12-31"})],
        date(9999, 12, 30),
        date(9999, 12, 31),
    )["complete"]


def test_related_correction_evidence_is_kept_even_outside_the_report_period():
    original = invoice()
    correction = invoice(tax_id="B" * 22, subject="اصلاحی", reference_tax_id=original.tax_id)
    result = compare_invoices([original], [correction])
    attach_related_documents(result, [original, correction])
    assert all(item.status == "review" for item in result)
    assert any(item.related_documents for item in result)


def test_review_notes_cannot_be_whitespace_only():
    with pytest.raises(ValidationError):
        ComparisonDecisionRequest(decision="resolved", note="   ")


def pdf_table(pages=1):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import PageBreak, SimpleDocTemplate, Table, TableStyle

    font = Path(__file__).resolve().parents[3] / "apps/web/public/fonts/IRANYekanX-Regular.ttf"
    pdfmetrics.registerFont(TTFont("StructureTest", str(font)))
    stream = io.BytesIO()
    doc = SimpleDocTemplate(
        stream,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    story = []
    for number in range(pages):
        if number:
            story.append(PageBreak())
        table = Table(
            [["Date", "Amount"], ["2026-10-01", str(number + 100)]], colWidths=[100 * mm, 50 * mm]
        )
        table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "StructureTest"),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ]
            )
        )
        story.append(table)
    doc.build(story)
    stream.seek(0)
    return stream


def test_generic_text_pdf_tables_are_not_tied_to_a_bank_vendor():
    parsed = parse_table(pdf_table(2), ".pdf")
    assert parsed.columns == ["Date", "Amount"]
    assert [number for number, _ in parsed.rows] == [2, 3]
    assert [row["Amount"] for _, row in parsed.rows] == ["100", "101"]


def test_scanned_or_empty_text_pdf_has_an_actionable_error():
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen.canvas import Canvas

    from app.imports.mapping import TableParseError

    stream = io.BytesIO()
    canvas = Canvas(stream, pagesize=A4)
    canvas.showPage()
    canvas.save()
    with pytest.raises(TableParseError, match="اسکن"):
        parse_table(stream, ".pdf")


@pytest.mark.parametrize(
    "raw,expected",
    [("(1,250)", "-1250"), ("۱٬۲۵۰−", "-1250"), ("−۱۲۵۰", "-1250"), ("1.250,00", "1250")],
)
def test_explicit_numeric_formats_and_negative_representations(raw, expected):
    from decimal import Decimal

    item, issues = transform_and_validate_row(
        source_kind=SourceKind.BANK,
        row_number=2,
        raw={"date": "2026-10-01", "amount": raw},
        mapping={"booking_date": "date", "amount_signed": "amount"},
        transforms={"amount_signed": ["dot_thousands"]} if raw == "1.250,00" else {},
        currency_unit="rial",
        calendar="gregorian",
    )
    assert not any(
        issue.severity in {IssueSeverity.ERROR, IssueSeverity.BLOCKING} for issue in issues
    )
    assert Decimal(str(item["amount_signed"])) == Decimal(expected)


def test_malformed_pdf_is_an_actionable_import_error():
    from app.imports.mapping import TableParseError

    with pytest.raises(TableParseError, match="PDF"):
        parse_table(io.BytesIO(b"not a pdf"), ".pdf")


def test_invoice_identity_normalizes_persian_digits_for_overlapping_exports():
    a = invoice(tax_id="A" + "1" * 21)
    b = invoice(tax_id="A" + "۱" * 21)
    merged, copies = merge_overlapping_snapshots([a, b])
    assert len(merged) == 1
    assert copies == 1


@pytest.mark.parametrize(
    "mapping,raw",
    [
        ({"amount_signed": "amount"}, {"amount": ""}),
        ({"deposit_amount": "in", "withdrawal_amount": "out"}, {"in": None, "out": "-"}),
    ],
)
def test_missing_bank_amount_is_rejected_instead_of_assumed_zero(mapping, raw):
    _, issues = transform_and_validate_row(
        source_kind=SourceKind.BANK,
        row_number=2,
        raw={"date": "2026-10-01", **raw},
        mapping={"booking_date": "date", **mapping},
        transforms={},
        currency_unit="rial",
        calendar="gregorian",
    )
    assert any(
        issue.code == "MOVEMENT_AMOUNT_MISSING" and issue.severity == IssueSeverity.ERROR
        for issue in issues
    )


def test_invoice_lines_without_tax_id_or_party_are_never_silently_combined():
    a = invoice(tax_id="").model_copy(update={"party_name": "", "party_id": ""})
    b = invoice(tax_id="").model_copy(update={"party_name": "", "party_id": ""})
    rows = aggregate_invoice_rows([a, b], "line_totals")
    assert len(rows) == 2
    assert all(item.import_limitations for item in rows)
    assert all(item.gross_amount == "110" for item in rows)
