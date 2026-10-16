import io
from datetime import date
from uuid import uuid4

from openpyxl import Workbook

from app.imports.mapping import parse_table, suggest_mapping, transform_and_validate_row
from app.imports.models import IssueSeverity, SourceKind
from app.moadian.engine import compare_invoices
from app.moadian.schemas import InvoiceSnapshot

TAX_ID = "A111DW04E8300004349008"


def invoice(**changes: object) -> InvoiceSnapshot:
    return InvoiceSnapshot.model_validate(
        {
            "row_id": uuid4(),
            "batch_id": uuid4(),
            "row_number": 2,
            "sheet": "Sheet1",
            "invoice_no": "INV-1",
            "tax_id": TAX_ID,
            "issue_date": date(2026, 10, 1),
            "party_name": "شرکت الف",
            "party_id": "14000000001",
            "gross_amount": "110000000",
            "tax_amount": "10000000",
            "subject": "اصلی",
            "status": "تایید شده",
            **changes,
        }
    )


def test_exact_match_and_money_precision() -> None:
    a = invoice(gross_amount="9007199254740993")
    b = invoice(gross_amount="9007199254740992")
    result = compare_invoices([a], [b])
    assert result[0].status == "difference"
    assert result[0].differences == ["مبلغ کل"]
    assert compare_invoices([a], [a.model_copy(update={"row_id": uuid4()})])[0].status == "matched"


def test_tax_date_and_counterparty_differences() -> None:
    result = compare_invoices(
        [invoice()], [invoice(tax_amount="0", party_id="14000000002", issue_date="2026-10-02")]
    )[0]
    assert set(result.differences) == {"مالیات", "تاریخ", "شناسه طرف معامله"}


def test_fallback_is_only_a_suggestion_and_never_overrides_different_tax_ids() -> None:
    assert compare_invoices([invoice(tax_id="")], [invoice()])[0].status == "suggested"
    assert {
        r.status for r in compare_invoices([invoice(tax_id="B111DW04E8300004349008")], [invoice()])
    } == {"internal_only", "portal_only"}


def test_duplicates_and_their_counterparts_require_review() -> None:
    result = compare_invoices([invoice(), invoice()], [invoice()])
    assert len(result) == 3
    assert all(r.status == "review" for r in result)


def test_corrections_and_referenced_originals_never_double_count() -> None:
    result = compare_invoices(
        [invoice()],
        [
            invoice(),
            invoice(
                tax_id="B111DW04E8300004349008",
                invoice_no="INV-2",
                subject="اصلاحی",
                reference_tax_id=TAX_ID,
            ),
        ],
    )
    assert all(r.status == "review" for r in result)


def test_missing_optional_tax_is_not_zero_or_a_complete_match() -> None:
    result = compare_invoices([invoice(tax_amount=None)], [invoice(tax_amount="0")])[0]
    assert result.status == "matched"
    assert result.limitations
    assert not result.differences


def test_rejected_or_unknown_status_requires_review() -> None:
    for status in ["رد شده", "باطل شده", "وضعیت جدید"]:
        assert all(
            r.status == "review" for r in compare_invoices([invoice()], [invoice(status=status)])
        )


def test_invoice_number_alone_does_not_match_other_vendors() -> None:
    assert {
        r.status for r in compare_invoices([invoice(tax_id="", party_id="other")], [invoice()])
    } == {"internal_only", "portal_only"}


def test_real_xlsx_headers_persian_digits_and_money_units() -> None:
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None
    headers = [
        "شماره مالیاتی صورتحساب",
        "تاریخ صدور",
        "طرف معامله",
        "مبلغ کل",
        "مالیات",
        "موضوع صورتحساب",
        "وضعیت",
    ]
    sheet.append(headers)
    sheet.append([TAX_ID, "۱۴۰۵/۰۷/۰۹", "شرکت الف", "۱۱٬۰۰۰٬۰۰۰", "۱٬۰۰۰٬۰۰۰", "اصلی", "تایید شده"])
    content = io.BytesIO()
    workbook.save(content)
    content.seek(0)
    parsed = parse_table(content, ".xlsx")
    mapping = {
        s["target_field"]: s["source_column"]
        for s in suggest_mapping(parsed.columns, SourceKind.MOADIAN_PURCHASES)
    }
    assert set(mapping) >= {"tax_id", "issue_date", "gross_amount", "subject", "status"}
    result, issues = transform_and_validate_row(
        source_kind=SourceKind.MOADIAN_PURCHASES,
        row_number=2,
        raw=parsed.rows[0][1],
        mapping=mapping,
        transforms={
            k: ["trim", "normalize_digits", "parse_date"]
            if k == "issue_date"
            else ["normalize_digits", "strip_thousands", "toman_to_rial"]
            if k in {"gross_amount", "tax_amount"}
            else ["trim"]
            for k in mapping
        },
        currency_unit="toman",
        calendar="jalali",
    )
    assert not [i for i in issues if i.severity == IssueSeverity.ERROR]
    assert result["gross_amount"] == "110000000"
    assert result["issue_date"] == "2026-10-01"


def test_empty_negative_or_invalid_invoice_values_are_rejected() -> None:
    for amount, tax_id in [("", TAX_ID), ("-1", TAX_ID), ("10", "123")]:
        _, issues = transform_and_validate_row(
            source_kind=SourceKind.MOADIAN_SALES,
            row_number=2,
            raw={
                "tax_id": tax_id,
                "issue_date": "2026-10-01",
                "gross_amount": amount,
                "subject": "اصلی",
                "status": "تایید شده",
            },
            mapping={k: k for k in ["tax_id", "issue_date", "gross_amount", "subject", "status"]},
            transforms={},
            currency_unit="rial",
            calendar="gregorian",
        )
        assert any(i.severity == IssueSeverity.ERROR for i in issues)


def test_portal_mapping_selects_the_correct_counterparty_for_each_direction() -> None:
    columns = ["نام فروشنده", "نام خریدار", "شماره اقتصادی فروشنده", "شماره اقتصادی خریدار"]
    for kind, expected in [
        (SourceKind.MOADIAN_SALES, "خریدار"),
        (SourceKind.MOADIAN_PURCHASES, "فروشنده"),
    ]:
        suggestions = {
            s["target_field"]: s["source_column"] for s in suggest_mapping(columns, kind)
        }
        assert suggestions["party_name"] == f"نام {expected}"
        assert suggestions["party_id"] == f"شماره اقتصادی {expected}"
