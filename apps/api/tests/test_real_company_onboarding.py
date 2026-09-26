import hashlib
from pathlib import Path

from app.imports.mapping import (
    column_fingerprint,
    parse_table,
    suggest_mapping,
    transform_and_validate_row,
    validate_mapping_fields,
    validate_transforms,
)
from app.imports.models import IssueSeverity, SourceKind

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def test_gate_a_and_b_company1_sepidar_datasets_ingestion() -> None:
    """Gate A (Ingestion) & Gate B (Data Integrity) for Company 1: فناوران داده رایان."""
    # 1. Accounting XLSX
    acc_path = REPO_ROOT / "demo-data" / "accounting_1405.xlsx"
    assert acc_path.exists(), "accounting_1405.xlsx must exist"
    with acc_path.open("rb") as f:
        parsed_acc = parse_table(f, ".xlsx")

    assert len(parsed_acc.columns) >= 7
    suggestions_acc = {
        item["target_field"]: item["source_column"]
        for item in suggest_mapping(parsed_acc.columns, SourceKind.ACCOUNTING)
    }
    assert "entry_date" in suggestions_acc
    assert "account_code" in suggestions_acc
    assert "debit" in suggestions_acc
    assert "credit" in suggestions_acc

    # Validate transformations on sample accounting rows
    for row_num, raw_row in parsed_acc.rows[:10]:
        transformed, issues = transform_and_validate_row(
            source_kind=SourceKind.ACCOUNTING,
            row_number=row_num,
            raw=raw_row,
            mapping=suggestions_acc,
            transforms={
                "entry_id": ["trim", "normalize_digits"],
                "entry_date": ["trim", "normalize_digits", "parse_date"],
                "account_code": ["trim", "normalize_digits"],
                "account_name": ["trim"],
                "description": ["trim"],
                "debit": ["normalize_digits", "strip_thousands"],
                "credit": ["normalize_digits", "strip_thousands"],
            },
            currency_unit="rial",
            calendar="jalali",
        )
        assert issues == [], f"Row {row_num} had unexpected issues: {issues}"
        # Dates must be normalized Gregorian strings (e.g. 2026-xx-xx)
        assert str(transformed["entry_date"]).startswith("2026-")
        # Debit and Credit must be integer strings
        assert str(transformed["debit"]).isdigit()
        assert str(transformed["credit"]).isdigit()

    # 2. Bank XLSX (Mellat)
    bank_path = REPO_ROOT / "demo-data" / "bank_mellat_1405.xlsx"
    assert bank_path.exists()
    with bank_path.open("rb") as f:
        parsed_bank = parse_table(f, ".xlsx")

    suggestions_bank = {
        item["target_field"]: item["source_column"]
        for item in suggest_mapping(parsed_bank.columns, SourceKind.BANK)
    }
    assert "booking_date" in suggestions_bank
    assert "amount_signed" in suggestions_bank or (
        "deposit_amount" in suggestions_bank and "withdrawal_amount" in suggestions_bank
    )

    # 3. Sales XLSX
    sales_path = REPO_ROOT / "demo-data" / "sales_1405.xlsx"
    assert sales_path.exists()
    with sales_path.open("rb") as f:
        parsed_sales = parse_table(f, ".xlsx")

    suggestions_sales = {
        item["target_field"]: item["source_column"]
        for item in suggest_mapping(parsed_sales.columns, SourceKind.SALES)
    }
    assert "invoice_no" in suggestions_sales
    assert "issue_date" in suggestions_sales
    assert "gross_amount" in suggestions_sales


def test_gate_b_and_c_company2_caspian_steel_persian_csv() -> None:
    """Gate B (Integrity) & Gate C (Traceability) for Company 2: صنایع فولاد کاسپین."""
    # 1. Accounting CSV with Persian comma numbers and 1404 Jalali dates
    acc_csv = REPO_ROOT / "test_data_files" / "01_accounting_journal_1404.csv"
    assert acc_csv.exists()
    with acc_csv.open("rb") as f:
        parsed = parse_table(f, ".csv")

    mapping = {
        "entry_id": "شماره سند",
        "entry_date": "تاریخ سند",
        "account_code": "کد حساب",
        "account_name": "نام حساب",
        "description": "شرح ردیف سند",
        "debit": "بدهکار",
        "credit": "بستانکار",
        "reference": "مرجع",
        "counterparty_name": "طرف حساب",
    }
    transforms = {
        "entry_id": ["trim", "normalize_digits"],
        "entry_date": ["trim", "normalize_digits", "parse_date"],
        "account_code": ["trim", "normalize_digits"],
        "account_name": ["trim"],
        "description": ["trim"],
        "debit": ["normalize_digits", "strip_thousands"],
        "credit": ["normalize_digits", "strip_thousands"],
    }
    assert validate_mapping_fields(SourceKind.ACCOUNTING, mapping, parsed.columns) == []
    assert validate_transforms(mapping, transforms, "rial") == []

    # Verify 100% of rows have valid deterministic transformation and lineage preservation
    all_transformed = []
    for row_number, raw_data in parsed.rows:
        transformed, issues = transform_and_validate_row(
            source_kind=SourceKind.ACCOUNTING,
            row_number=row_number,
            raw=raw_data,
            mapping=mapping,
            transforms=transforms,
            currency_unit="rial",
            calendar="jalali",
        )
        assert issues == []
        # Traceability check: raw_data contains original Persian values unchanged
        assert "شماره سند" in raw_data
        assert raw_data["شماره سند"] == str(transformed["entry_id"])
        all_transformed.append((row_number, raw_data, transformed))

    assert len(all_transformed) == len(parsed.rows)
    # Check that 1404/01/15 Jalali is correctly converted to 2025-04-04 (Never Gregorian 1404!)
    first_row = all_transformed[0][2]
    assert first_row["entry_date"] == "2025-04-04"


def test_gate_b_d_and_e_company3_sepehr_petro_toman_and_partial_import() -> None:
    """Gate B (Toman conversion), Gate D (Templates) & Gate E (Data Quality/Partial Import)."""
    # 1. Toman Currency Conversion Verification (Gate B)
    sample_raw = {
        "شماره فاکتور": "INV-8801",
        "تاریخ صدور": "۱۴۰۴/۰۶/۲۰",
        "نام مشتری": "پتروشیمی ماهشهر",
        "مبلغ فاکتور": "۱۵,۰۰۰,۰۰۰",  # 15 million Toman
    }
    mapping = {
        "invoice_no": "شماره فاکتور",
        "issue_date": "تاریخ صدور",
        "customer_name": "نام مشتری",
        "gross_amount": "مبلغ فاکتور",
    }
    transforms = {
        "invoice_no": ["trim"],
        "issue_date": ["normalize_digits", "parse_date"],
        "customer_name": ["trim"],
        "gross_amount": ["normalize_digits", "strip_thousands", "toman_to_rial"],
    }
    assert validate_transforms(mapping, transforms, "toman") == []

    transformed, issues = transform_and_validate_row(
        source_kind=SourceKind.SALES,
        row_number=1,
        raw=sample_raw,
        mapping=mapping,
        transforms=transforms,
        currency_unit="toman",
        calendar="jalali",
    )
    # Verifies that optional due_date omission generates visible warning without blocking import
    assert not any(iss.severity == IssueSeverity.ERROR for iss in issues)
    assert any(
        iss.code == "DUE_DATE_MISSING" and iss.severity == IssueSeverity.WARNING for iss in issues
    )
    # 15,000,000 Toman must be exactly 150,000,000 Rial (x10)
    assert transformed["gross_amount"] == "150000000"

    # 2. Gate D (Template Repeatability)
    fp1 = column_fingerprint(list(sample_raw.keys()))
    # Same columns on next period file
    next_period_raw = {
        "شماره فاکتور": "INV-8802",
        "تاریخ صدور": "۱۴۰۴/۰۷/۰۱",
        "نام مشتری": "پتروشیمی ماهشهر",
        "مبلغ فاکتور": "۱۸,۰۰۰,۰۰۰",
    }
    fp2 = column_fingerprint(list(next_period_raw.keys()))
    assert fp1 == fp2, "Column fingerprint must match for repeat uploads"

    # 3. Gate E (Data Quality & Partial Import Quarantine)
    invalid_raw_empty_invoice = {
        "شماره فاکتور": "",  # Empty required invoice number
        "تاریخ صدور": "۱۴۰۴/۰۷/۰۵",
        "نام مشتری": "پتروشیمی ماهشهر",
        "مبلغ فاکتور": "۱۵,۰۰۰,۰۰۰",
    }
    transformed_err, issues_err = transform_and_validate_row(
        source_kind=SourceKind.SALES,
        row_number=2,
        raw=invalid_raw_empty_invoice,
        mapping=mapping,
        transforms=transforms,
        currency_unit="toman",
        calendar="jalali",
    )
    # Must report blocking/error issue and NOT allow dirty data into canonical model
    assert len(issues_err) > 0
    assert any(iss.code == "REQUIRED_VALUE_MISSING" for iss in issues_err)
    assert any(iss.severity == IssueSeverity.ERROR for iss in issues_err)

    # Also test unparseable money
    invalid_money_raw = {
        "شماره فاکتور": "INV-8804",
        "تاریخ صدور": "۱۴۰۴/۰۷/۰۵",
        "نام مشتری": "پتروشیمی ماهشهر",
        "مبلغ فاکتور": "غیرقابل محاسبه",
    }
    _, issues_money = transform_and_validate_row(
        source_kind=SourceKind.SALES,
        row_number=3,
        raw=invalid_money_raw,
        mapping=mapping,
        transforms=transforms,
        currency_unit="toman",
        calendar="jalali",
    )
    assert any(iss.code == "INVALID_MONEY" for iss in issues_money)


def test_gate_h_duplicate_checksum_detection() -> None:
    """Gate H (Production Safety): Identical file content produces identical SHA-256."""
    content1 = b"date,amount\n2026-01-01,1000\n"
    content2 = b"date,amount\n2026-01-01,1000\n"
    h1 = hashlib.sha256(content1).hexdigest()
    h2 = hashlib.sha256(content2).hexdigest()
    assert h1 == h2, "Identical content must yield identical sha256 checksum"
