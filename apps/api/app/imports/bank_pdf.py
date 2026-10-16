"""Text-based Eghtesad Novin statements; fail closed on missing rows or controls."""

import io
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import BinaryIO

import pdfplumber
from bidi.algorithm import get_display

from app.imports.mapping import ParsedTable, TableParseError

COLUMNS = [
    "شناسه تراکنش",
    "تاریخ تراکنش",
    "شرح تراکنش",
    "واریز",
    "برداشت",
    "مانده جاری",
    "مرجع",
    "شماره شبا",
    "شماره سپرده",
]


def logical(value: str | None) -> str:
    return (
        "\n".join(
            get_display(unicodedata.normalize("NFKC", line)) for line in (value or "").split("\n")
        )
        .replace("ي", "ی")
        .replace("ك", "ک")
    )


def money(value: str) -> Decimal:
    try:
        number = Decimal(value.replace(",", "").strip() or "0")
        if not number.is_finite() or number != number.to_integral_value():
            raise ValueError
        return number
    except (InvalidOperation, ValueError) as exc:
        raise TableParseError("مبلغ صورتحساب بانک خوانا نیست.") from exc


def parse_bank_pdf(stream: BinaryIO, *, limit: int | None = None) -> ParsedTable:
    try:
        with pdfplumber.open(io.BytesIO(stream.read())) as document:
            if not 1 <= len(document.pages) <= 200:
                raise TableParseError("تعداد صفحات صورتحساب مجاز نیست.")
            first = logical(document.pages[0].extract_text())
            if (
                "اقتصاد نوین" not in first
                or "صورتحساب سپرده" not in first
                or "ریال ایران" not in first
            ):
                raise TableParseError("فقط صورتحساب متنی ریالی اقتصاد نوین پشتیبانی می‌شود.")
            account = re.search(r"شماره سپرده\s*:\s*([\d.]+)", first)
            iban_match = re.search(r"IR(?:\s*\d){24}", first)
            opening = re.search(r"مانده ابتدای دوره\s*:\s*([\d,]+)", first)
            period = re.search(r"از تاریخ (\d{4}/\d{2}/\d{2}) تا تاریخ (\d{4}/\d{2}/\d{2})", first)
            if not all((account, iban_match, opening, period)):
                raise TableParseError("مشخصات یا مانده ابتدای صورتحساب خوانا نیست.")
            assert account and iban_match and opening and period
            iban = re.sub(r"\s", "", iban_match.group())
            previous = money(opening[1])
            total_in = total_out = Decimal(0)
            rows: list[tuple[int, dict[str, object]]] = []
            controls: list[tuple[int, dict[str, object]]] = []
            printed_totals = None
            for page_number, page in enumerate(document.pages, 1):
                text = logical(page.extract_text())
                page_account = re.search(r"شماره سپرده\s*:\s*([\d.]+)", text)
                page_iban = re.search(r"IR(?:\s*\d){24}", text)
                if (
                    not re.search(rf"صفحه:\s*{page_number} از {len(document.pages)}\b", text)
                    or not page_account
                    or page_account[1] != account[1]
                    or not page_iban
                    or re.sub(r"\s", "", page_iban.group()) != iban
                ):
                    raise TableParseError("صفحات صورتحساب پیوسته یا متعلق به یک حساب نیستند.")
                tables = page.extract_tables()
                if len(tables) != 1:
                    raise TableParseError("جدول تراکنش‌های صفحه خوانا نیست.")
                indices = None
                for raw in tables[0]:
                    cells = [logical(cell) for cell in raw]
                    if "بستانکار" in cells and "بدهکار" in cells:
                        labels = [
                            "ردیف",
                            "تاریخ و ساعت سند",
                            "شماره سند",
                            "شرح بند سند",
                            "بستانکار",
                            "بدهکار",
                            "مانده",
                            "شناسه مرجع",
                        ]
                        try:
                            indices = [cells.index(label) for label in labels]
                        except ValueError as exc:
                            raise TableParseError("ستون‌های صورتحساب بانک شناخته نشد.") from exc
                        continue
                    if indices is None:
                        continue
                    number, timestamp, doc_id, description, credit, debit, balance, reference = [
                        cells[i] for i in indices
                    ]
                    if not number:
                        if any("نقل از صفحه قبل" in c for c in cells):
                            if money(balance) != previous:
                                raise TableParseError("مانده انتقالی صفحات بانک مغایرت دارد.")
                        elif credit or debit:
                            if page_number != len(document.pages) or printed_totals is not None:
                                raise TableParseError("جمع صورتحساب در محل نامعتبر است.")
                            printed_totals = (money(credit), money(debit))
                            controls.append((page_number, {"deposit": credit, "withdrawal": debit}))
                        elif any(cells):
                            raise TableParseError("ردیف ناشناخته در جدول بانک؛ ورود متوقف شد.")
                        continue
                    if not number.isdecimal() or int(number) != len(rows) + 1 or printed_totals:
                        raise TableParseError("ترتیب ردیف‌های بانک ناقص یا تکراری است.")
                    date_match = re.search(r"\d{4}/\d{2}/\d{2}", timestamp)
                    if not date_match or not doc_id or not description or not balance:
                        raise TableParseError("تاریخ، شناسه یا شرح تراکنش خوانا نیست.")
                    deposit, withdrawal, current = money(credit), money(debit), money(balance)
                    if deposit < 0 or withdrawal < 0 or (deposit > 0) == (withdrawal > 0):
                        raise TableParseError("سمت بدهکار و بستانکار تراکنش معتبر نیست.")
                    if previous + deposit - withdrawal != current:
                        raise TableParseError(f"مانده ردیف {number} بانک مغایرت دارد.")
                    if not period[1] <= date_match[0] <= period[2]:
                        raise TableParseError("تاریخ تراکنش خارج از دوره صورتحساب است.")
                    values = [
                        f"{doc_id}:{number}",
                        date_match[0],
                        description,
                        str(deposit),
                        str(withdrawal),
                        str(current),
                        reference,
                        iban,
                        account[1],
                    ]
                    rows.append((int(number), dict(zip(COLUMNS, values, strict=True))))
                    previous = current
                    total_in += deposit
                    total_out += withdrawal
            closing = re.search(r"مانده انتهای دوره\s*:\s*([\d,]+)", text)
            if (
                not rows
                or printed_totals != (total_in, total_out)
                or not closing
                or money(closing[1]) != previous
            ):
                raise TableParseError("جمع گردش یا مانده پایان صورتحساب بانک مغایرت دارد.")
            return ParsedTable(
                sheets=["صورتحساب بانک"],
                selected_sheet="صورتحساب بانک",
                columns=COLUMNS,
                rows=rows if limit is None else rows[:limit],
                control_rows=controls,
            )
    except TableParseError:
        raise
    except Exception as exc:
        raise TableParseError("PDF بانک خوانا نیست؛ فایل متنی اصلی را وارد کنید.") from exc
    finally:
        stream.seek(0)
