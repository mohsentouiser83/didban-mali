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


def test_iranian_bank_statement_with_metadata_and_columns_maps_perfectly() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "صورتحساب"
    sheet.append(["مانده از قبل: 361,603 (ریال)", "", "", "", "", "", "", ""])
    sheet.append(["", "", "", "", "", "", "", ""])
    sheet.append([
        "جمع کل واریز: 15,000,000 (ریال)", "", "", "", "نام صاحب حساب: محسن تویسرکانی", "", "", ""
    ])
    sheet.append([
        "جمع کل برداشت: 8,729,000 (ریال)",
        "",
        "",
        "",
        "شماره شبا: IR550560611828005701924501",
        "",
        "",
        "",
    ])
    sheet.append([
        "ردیف",
        "تاریخ",
        "شماره سند",
        "شرح سند",
        "نوع تراکنش",
        "واریز (ریال)",
        "برداشت (ریال)",
        "مانده (ریال)",
    ])
    sheet.append([
        1,
        "1405/06/20 19:51:25",
        "14054933597169",
        "انتقال به سپرده بلو - شماره سپرده: 611828006401150402 بنام: امیرحسین خانی ولوجردی",
        "انتقال به سپرده",
        "0",
        "1,540,000",
        "6,632,603",
    ])
    sheet.append([
        2,
        "1405/06/09 11:02:00",
        "14054558840898",
        "انتقال از کارت شماره: 5022291540508601 بنام: محسن تویسرکانی",
        "دریافت از کارت",
        "15,000,000",
        "0",
        "15,361,603",
    ])
    payload = io.BytesIO()
    workbook.save(payload)
    payload.seek(0)

    parsed = parse_table(payload, ".xlsx")
    assert parsed.header_row == 5
    assert parsed.columns == [
        "ردیف",
        "تاریخ",
        "شماره سند",
        "شرح سند",
        "نوع تراکنش",
        "واریز (ریال)",
        "برداشت (ریال)",
        "مانده (ریال)",
    ]
    assert len(parsed.rows) == 2

    suggestions = {
        item["target_field"]: item["source_column"]
        for item in suggest_mapping(parsed.columns, SourceKind.BANK)
    }
    assert suggestions["booking_date"] == "تاریخ"
    assert suggestions["transaction_id"] == "شماره سند"
    assert suggestions["description"] == "شرح سند"
    assert suggestions["transaction_type"] == "نوع تراکنش"
    assert suggestions["deposit_amount"] == "واریز (ریال)"
    assert suggestions["withdrawal_amount"] == "برداشت (ریال)"
    assert suggestions["running_balance"] == "مانده (ریال)"
    assert suggestions["line_id"] == "ردیف"

    mapping = {
        "booking_date": "تاریخ",
        "transaction_id": "شماره سند",
        "description": "شرح سند",
        "transaction_type": "نوع تراکنش",
        "deposit_amount": "واریز (ریال)",
        "withdrawal_amount": "برداشت (ریال)",
        "running_balance": "مانده (ریال)",
        "line_id": "ردیف",
    }
    transforms = {
        "booking_date": ["normalize_digits", "parse_date"],
        "transaction_id": ["trim", "normalize_digits"],
        "description": ["trim"],
        "transaction_type": ["trim"],
        "deposit_amount": ["normalize_digits", "strip_thousands"],
        "withdrawal_amount": ["normalize_digits", "strip_thousands"],
        "running_balance": ["normalize_digits", "strip_thousands"],
        "line_id": ["normalize_digits"],
    }
    assert validate_mapping_fields(SourceKind.BANK, mapping, parsed.columns) == []
    assert validate_transforms(mapping, transforms, "rial") == []

    # Row 1: withdrawal (negative signed amount)
    transformed_1, issues_1 = transform_and_validate_row(
        source_kind=SourceKind.BANK,
        row_number=6,
        raw=parsed.rows[0][1],
        mapping=mapping,
        transforms=transforms,
        currency_unit="rial",
        calendar="jalali",
    )
    assert issues_1 == []
    assert transformed_1["booking_date"] == "2026-09-11"
    assert transformed_1["transaction_id"] == "14054933597169"
    assert transformed_1["transaction_type"] == "انتقال به سپرده"
    assert transformed_1["deposit_amount"] == "0"
    assert transformed_1["withdrawal_amount"] == "1540000"
    assert transformed_1["amount_signed"] == "-1540000"
    assert transformed_1["running_balance"] == "6632603"

    # Row 2: deposit (positive signed amount)
    transformed_2, issues_2 = transform_and_validate_row(
        source_kind=SourceKind.BANK,
        row_number=7,
        raw=parsed.rows[1][1],
        mapping=mapping,
        transforms=transforms,
        currency_unit="rial",
        calendar="jalali",
    )
    assert issues_2 == []
    assert transformed_2["booking_date"] == "2026-08-31"
    assert transformed_2["amount_signed"] == "15000000"
    assert transformed_2["running_balance"] == "15361603"


def test_iranian_bank_statement_with_merged_cells_and_sparse_headers() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "صورتحساب"

    # Metadata rows (rows 1-10)
    sheet.append(["نام صاحب حساب: محسن تویسرکانی", "", ""])
    sheet.append(["شماره شبا: IR550560611828005701924501", "", ""])
    sheet.append([])
    sheet.append(["صورتحساب از تاریخ 1405/06/01 تا 1405/06/28"])

    # Row 5: Table header with merged empty cells
    # Note right-to-left layout where cells are sparse
    sheet.append([
        "", "مانده (ریال)", "برداشت (ریال)", "واریز (ریال)", "",
        "نوع تراکنش", "", "شرح سند", "", "",
        "شماره سند", "", "تاریخ", "ردیف", ""
    ])

    # Row 6: Data row 1
    sheet.append([
        "", 6632603, 1540000, 0, "",
        "انتقال به سپرده", "", "انتقال به سپرده بلو", "", "",
        "14054933597169", "", "1405/06/20 19:51:23", 1, ""
    ])

    # Row 7: Data row 2
    sheet.append([
        "", 15361603, 0, 15000000, "",
        "دریافت از کارت", "", "انتقال از کارت", "", "",
        "14054558840898", "", "1405/06/09 11:02:06", 2, ""
    ])

    # Row 8: Footer metadata row
    sheet.append(["تاریخ صدور: 28 شهریور 1405 17:04", "", "", "", "", "", "", "صفحه 1 از 1"])

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    parsed = parse_table(buffer, ".xlsx")
    assert parsed.header_row == 5
    assert parsed.columns == [
        "مانده (ریال)",
        "برداشت (ریال)",
        "واریز (ریال)",
        "نوع تراکنش",
        "شرح سند",
        "شماره سند",
        "تاریخ",
        "ردیف",
    ]
    # Footer row should be filtered out
    assert len(parsed.rows) == 2

    suggestions = {
        item["target_field"]: item["source_column"]
        for item in suggest_mapping(parsed.columns, SourceKind.BANK)
    }
    assert suggestions["booking_date"] == "تاریخ"
    assert suggestions["transaction_id"] == "شماره سند"
    assert suggestions["description"] == "شرح سند"
    assert suggestions["transaction_type"] == "نوع تراکنش"
    assert suggestions["deposit_amount"] == "واریز (ریال)"
    assert suggestions["withdrawal_amount"] == "برداشت (ریال)"
    assert suggestions["running_balance"] == "مانده (ریال)"
    assert suggestions["line_id"] == "ردیف"


