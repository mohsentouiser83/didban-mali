import io

from openpyxl import Workbook

from app.imports.mapping import (
    column_fingerprint,
    parse_table,
    suggest_mapping,
    transform_and_validate_row,
    validate_mapping_fields,
    validate_transforms,
)
from app.imports.models import IssueSeverity, SourceKind


def test_persian_accounting_csv_is_explicitly_transformed_without_changing_raw() -> None:
    content = (
        "شماره سند,تاریخ سند,کد حساب,نام حساب,شرح,بدهکار,بستانکار\n"
        '۱,۱۴۰۵/۰۶/۲۱,۱۱۰۱,بانک,فروش,۰,"۲۵۰,۰۰۰"\n'
    ).encode()
    parsed = parse_table(io.BytesIO(content), ".csv")
    suggestions = {
        item["target_field"]: item["source_column"]
        for item in suggest_mapping(parsed.columns, SourceKind.ACCOUNTING)
    }
    assert suggestions["entry_date"] == "تاریخ سند"
    assert suggestions["credit"] == "بستانکار"

    mapping = {
        "entry_id": "شماره سند",
        "entry_date": "تاریخ سند",
        "account_code": "کد حساب",
        "account_name": "نام حساب",
        "description": "شرح",
        "debit": "بدهکار",
        "credit": "بستانکار",
    }
    transforms = {
        "entry_id": ["trim", "normalize_digits"],
        "entry_date": ["trim", "normalize_digits", "parse_date"],
        "account_code": ["trim", "normalize_digits"],
        "account_name": ["trim"],
        "description": ["trim"],
        "debit": ["normalize_digits", "strip_thousands", "toman_to_rial"],
        "credit": ["normalize_digits", "strip_thousands", "toman_to_rial"],
    }
    assert validate_mapping_fields(SourceKind.ACCOUNTING, mapping, parsed.columns) == []
    assert validate_transforms(mapping, transforms, "toman") == []
    row_number, raw = parsed.rows[0]
    transformed, issues = transform_and_validate_row(
        source_kind=SourceKind.ACCOUNTING,
        row_number=row_number,
        raw=raw,
        mapping=mapping,
        transforms=transforms,
        currency_unit="toman",
        calendar="jalali",
    )
    assert raw["تاریخ سند"] == "۱۴۰۵/۰۶/۲۱"
    assert raw["بستانکار"] == "۲۵۰,۰۰۰"
    assert transformed["entry_date"] == "2026-09-12"
    assert transformed["credit"] == "2500000"
    assert issues == []


def test_english_bank_semicolon_csv_supports_deposit_and_withdrawal() -> None:
    content = b"Booking Date;Description;Deposit;Withdrawal\n2026-09-12;Fee;0;1,250\n"
    parsed = parse_table(io.BytesIO(content), ".csv")
    mapping = {
        "booking_date": "Booking Date",
        "description": "Description",
        "deposit_amount": "Deposit",
        "withdrawal_amount": "Withdrawal",
    }
    transforms = {
        "booking_date": ["normalize_digits", "parse_date"],
        "description": ["trim"],
        "deposit_amount": ["normalize_digits", "strip_thousands"],
        "withdrawal_amount": ["normalize_digits", "strip_thousands"],
    }
    assert validate_mapping_fields(SourceKind.BANK, mapping, parsed.columns) == []
    transformed, issues = transform_and_validate_row(
        source_kind=SourceKind.BANK,
        row_number=2,
        raw=parsed.rows[0][1],
        mapping=mapping,
        transforms=transforms,
        currency_unit="rial",
        calendar="gregorian",
    )
    assert transformed["amount_signed"] == "-1250"
    assert issues == []


def test_sales_xlsx_formula_is_reported_and_raw_formula_is_preserved() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "فروش"
    sheet.append(["Invoice No", "Issue Date", "Customer", "Gross Amount"])
    sheet.append(["INV-1", "2026-09-12", "مشتری", "=100+20"])
    payload = io.BytesIO()
    workbook.save(payload)
    payload.seek(0)
    parsed = parse_table(payload, ".xlsx", sheet_name="فروش")
    mapping = {
        "invoice_no": "Invoice No",
        "issue_date": "Issue Date",
        "customer_name": "Customer",
        "gross_amount": "Gross Amount",
    }
    transforms = {
        "invoice_no": ["trim"],
        "issue_date": ["normalize_digits", "parse_date"],
        "customer_name": ["trim"],
        "gross_amount": ["normalize_digits", "strip_thousands"],
    }
    transformed, issues = transform_and_validate_row(
        source_kind=SourceKind.SALES,
        row_number=2,
        raw=parsed.rows[0][1],
        mapping=mapping,
        transforms=transforms,
        currency_unit="rial",
        calendar="gregorian",
    )
    assert parsed.rows[0][1]["Gross Amount"] == "=100+20"
    assert "gross_amount" not in transformed
    assert any(
        issue.code == "FORMULA_NOT_ALLOWED" and issue.severity == IssueSeverity.ERROR
        for issue in issues
    )


def test_mapping_rejects_cross_source_fields_and_implicit_toman_conversion() -> None:
    mapping = {
        "entry_date": "تاریخ",
        "account_code": "کد",
        "account_name": "نام",
        "description": "شرح",
        "debit": "بد",
        "credit": "بس",
        "invoice_no": "فاکتور",
    }
    columns = list(mapping.values())
    errors = validate_mapping_fields(SourceKind.ACCOUNTING, mapping, columns)
    assert any("فیلدهای مقصد ناشناخته" in error for error in errors)
    transform_errors = validate_transforms(mapping, {}, "toman")
    assert any("تبدیل تومان به ریال" in error for error in transform_errors)
    assert column_fingerprint(columns) == column_fingerprint(columns.copy())
