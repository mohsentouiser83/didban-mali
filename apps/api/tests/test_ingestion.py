import io
import struct
from decimal import Decimal
from zipfile import ZIP_DEFLATED, ZipFile

import openpyxl
import pytest

from didban.errors import DomainError
from didban.ingestion import Sheet, check_biff_values, interpret, money, parsed_date, read_file


def test_exact_toman_no_float_or_silent_canonical_overflow():
    assert money("۱۲۳٫۴", "تومان") == "1234.0"
    for value, unit in [
        ("NaN", "IRR"),
        ("1e3", "IRR"),
        ("1.1234567", "IRR"),
        ("10000000000000000000000000000000", "TOMAN"),
        ("1", "USD"),
        ("1", "unknown"),
    ]:
        with pytest.raises(DomainError):
            money(value, unit)
    assert Decimal(money("9999999999999999999999999999999.123456", "IRR")) == Decimal(
        "9999999999999999999999999999999.123456"
    )


def test_dates_reject_invalid_and_convert_jalali():
    assert parsed_date("۱۴۰۵/۰۱/۰۱", "jalali").isoformat() == "2026-03-21"
    with pytest.raises(DomainError):
        parsed_date("2026-02-30", "gregorian")


def test_missing_xlsx_dimension_does_not_drop_fixture_sheet():
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    sheets = read_file(
        "ledger.xlsx", (root / "docs/validation/rebuild-v1/inputs/baseline/ledger.xlsx").read_bytes()
    )
    assert sheets[0].name == "دفتر" and len(sheets[0].rows) > 20


def test_xlsx_formulas_preserved_for_financial_validation_not_cached():
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(["date", "amount", "reference"])
    sheet.append(["2026-01-01", "=1+2", "r"])
    output = io.BytesIO()
    book.save(output)
    result = read_file("bank.xlsx", output.getvalue())
    assert result[0].rows[0][1]["amount"] == "=1+2"


def test_macro_and_foreign_currency_never_become_rial():
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("xl/vbaProject.bin", b"not actually executable")
    with pytest.raises(DomainError, match="ماکرو"):
        read_file("unsafe.xlsx", output.getvalue())
    proposal = interpret(
        Sheet(
            "CSV",
            ["currency", "date", "amount", "balance", "reference"],
            [
                (
                    2,
                    {
                        "currency": "USD",
                        "date": "2026-01-01",
                        "amount": "10",
                        "balance": "100",
                        "reference": "ref",
                    },
                )
            ],
        ),
        "bank.csv",
    )
    assert proposal["unit"] == "unsupported"


def test_mixed_known_units_keep_per_row_conversion_and_missing_unit_is_question():
    headers = ["currency", "date", "amount", "balance", "reference"]
    rows = [
        (2, dict(zip(headers, ["IRR", "2026-01-01", "10", "100", "a"], strict=True))),
        (3, dict(zip(headers, ["TOMAN", "2026-01-02", "10", "200", "b"], strict=True))),
    ]
    assert interpret(Sheet("CSV", headers, rows), "bank.csv")["unit"] == "per_row"
    rows.append((4, dict(zip(headers, ["", "2026-01-03", "10", "300", "c"], strict=True))))
    assert interpret(Sheet("CSV", headers, rows), "bank.csv")["unit"] is None


def test_legacy_xls_formula_and_macro_records_are_rejected():
    for record, payload in [(0x0006, b"formula"), (0x0085, b"\x00" * 5 + b"\x01"), (0x01AE, b"external")]:
        with pytest.raises(DomainError):
            check_biff_values(struct.pack("<HH", record, len(payload)) + payload)
    check_biff_values(struct.pack("<HH", 0x0203, 3) + b"123")


def test_disguised_binary_and_duplicate_headers_rejected():
    for content in [b"MZ,evil\n1,2", b"a,a\n1,2", b"a,b\n1,2,3"]:
        with pytest.raises(DomainError):
            read_file("bank.csv", content)
