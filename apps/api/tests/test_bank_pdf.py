"""Public synthetic statements exercise structural controls, never private fixtures."""

import io
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pypdf import PdfWriter

from app.imports.bank_pdf import parse_bank_pdf
from app.imports.mapping import TableParseError, parse_table
from app.imports.validation import _inspect_pdf

HEADER = [
    "ردیف",
    "تاریخ و ساعت سند",
    "شماره سند",
    "شرح بند سند",
    "بستانکار",
    "بدهکار",
    "مانده",
    "شناسه مرجع",
]
TEXT = """اقتصاد نوین صورتحساب سپرده ریال ایران
شماره سپرده : 123.2.456.1
شبا : IR000000000000000000010001
از تاریخ 1403/01/01 تا تاریخ 1403/12/30
مانده ابتدای دوره: 100
صفحه: 1 از 1
مانده انتهای دوره: 109
"""
ROWS = [
    HEADER,
    ["1", "09:00:00\n1403/01/02", "55", "دریافت", "10", "", "110", ""],
    ["2", "09:00:00\n1403/01/02", "55", "کارمزد", "", "1", "109", ""],
    ["", "", "", "", "10", "1", "", ""],
]


class Document:
    def __init__(self, rows, text=TEXT):
        self.pages = [SimpleNamespace(extract_text=lambda: text, extract_tables=lambda: [rows])]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass


def setup(monkeypatch, rows, text=TEXT):
    monkeypatch.setattr("app.imports.bank_pdf.logical", lambda v: v or "")
    monkeypatch.setattr("app.imports.bank_pdf.pdfplumber.open", lambda _: Document(rows, text))


def test_bank_pdf_same_document_fee_is_not_dropped_and_controls_not_transactions(monkeypatch):
    setup(monkeypatch, deepcopy(ROWS))
    parsed = parse_table(io.BytesIO(b"test"), ".pdf")
    assert len(parsed.rows) == 2
    assert parsed.rows[0][1]["شناسه تراکنش"] == "55:1"
    assert parsed.rows[1][1]["شناسه تراکنش"] == "55:2"
    assert len(parsed.control_rows) == 1


@pytest.mark.parametrize(
    "mutate",
    [
        lambda rows: rows[1].__setitem__(6, "111"),
        lambda rows: rows[2].__setitem__(0, "3"),
        lambda rows: rows[3].__setitem__(4, "11"),
        lambda rows: rows.pop(2),
        lambda rows: rows[2].__setitem__(4, "2"),
        lambda rows: rows[1].__setitem__(1, "1402/01/01"),
    ],
)
def test_preview_validates_entire_statement_even_when_limited(monkeypatch, mutate):
    rows = deepcopy(ROWS)
    mutate(rows)
    setup(monkeypatch, rows)
    with pytest.raises(TableParseError):
        parse_bank_pdf(io.BytesIO(b"test"), limit=1)


def test_unreadable_and_wrong_closing_fail_closed(monkeypatch):
    for text in ("", TEXT.replace("109", "108")):
        setup(monkeypatch, deepcopy(ROWS), text)
        with pytest.raises(TableParseError):
            parse_bank_pdf(io.BytesIO(b"test"))


def test_pdf_upload_rejects_encryption_and_active_content():
    for mode in ("encrypted", "javascript"):
        writer = PdfWriter()
        writer.add_blank_page(width=595, height=842)
        if mode == "encrypted":
            writer.encrypt("secret")
        else:
            writer.add_js("app.alert('test')")
        stream = io.BytesIO()
        writer.write(stream)
        stream.seek(0)
        with pytest.raises(HTTPException):
            _inspect_pdf(stream)
