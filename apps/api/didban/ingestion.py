"""Bounded file adapters. Values are never executed or rounded silently."""

import csv
import io
import re
import socket
import struct
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, localcontext
from pathlib import Path
from zipfile import BadZipFile, ZipFile

import jdatetime
import olefile
import openpyxl
import xlrd
from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import iterparse as safe_xml_events

from .config import settings
from .errors import DomainError, require

DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
UNITS = {"irr": "IRR", "ریال": "IRR", "rial": "IRR", "toman": "TOMAN", "تومان": "TOMAN", "irt": "TOMAN"}
ALIASES = {
    "employee_id": ["employee_id", "کد پرسنلی"],
    "employee_name": ["employee_name", "نام کارمند"],
    "gross_pay": ["gross_pay", "حقوق ناخالص"],
    "net_pay": ["net_pay", "خالص پرداختی"],
    "payroll_tax": ["payroll_tax", "مالیات حقوق"],
    "employee_insurance": ["employee_insurance", "بیمه سهم کارمند"],
    "employer_insurance": ["employer_insurance", "بیمه سهم کارفرما"],
    "other_deductions": ["other_deductions", "سایر کسورات"],
    "date": ["date", "issued_on", "تاریخ", "تاریخ سند", "تاریخ تراکنش", "تاریخ فاکتور"],
    "amount": ["amount", "gross", "مبلغ", "مبلغ کل", "جمع کل"],
    "debit": ["debit", "بدهکار", "مبلغ بدهکار", "مبلغ بدهکار (ریال)"],
    "credit": ["credit", "بستانکار", "مبلغ بستانکار", "مبلغ بستانکار (ریال)"],
    "account": ["account", "کد حساب", "حساب", "bank_account", "bank account", "حساب بانکی", "شناسه حساب بانکی"],
    "bank_account": ["bank_account", "bank account", "حساب بانکی", "شناسه حساب بانکی"],
    "bank_reference": ["bank_reference", "bank reference", "bankreference", "شماره پیگیری", "شماره پیگیری بانک", "پیگیری بانکی", "مرجع بانکی"],
    "role": ["role", "نقش حساب"],
    "entry_id": ["entry_id", "شماره سند", "سند"],
    "entry_type": ["entry_type", "نوع سند"],
    "reference": ["reference", "شماره پیگیری", "مرجع", "شناسه تراکنش"],
    "balance": ["balance", "مانده", "موجودی"],
    "row_type": ["row_type", "نوع ردیف"],
    "currency": ["currency", "unit", "واحد", "واحد پول"],
    "invoice_id": ["invoice_id", "شماره فاکتور", "شناسه فاکتور"],
    "party_id": ["party_id", "کد طرف حساب", "طرف حساب", "شناسه مشتری"],
    "due_date": ["due_on", "due_date", "سررسید", "تاریخ سررسید"],
    "tax": ["vat", "tax", "مالیات", "ارزش افزوده"],
    "tax_id": ["tax_id", "شماره مالیاتی", "شناسه مالیاتی"],
    "direction": ["direction", "جهت"],
    "event_id": ["event_id", "شناسه وصول", "شناسه پرداخت"],
    "plan_id": ["plan_id", "شناسه برنامه"],
    "obligation_id": ["obligation_id", "شناسه تعهد"],
    "total_obligation": ["total_obligation", "کل تعهد"],
    "paid_as_of": ["paid_as_of", "پرداخت شده"],
    "confirmed": ["confirmed", "تأیید شده"],
    "kind": ["kind", "نوع صورتحساب"],
    "parent_reference": ["reference_tax_id", "شناسه مالیاتی مرجع"],
    "paid_on": ["paid_on", "تاریخ وصول"],
    "anchor_cutoff": ["anchor_cutoff", "برش مانده"],
}
REQUIRED = {
    "employees": ["employee_id", "employee_name", "date"],
    "payroll": ["employee_id", "employee_name", "date", "gross_pay", "net_pay", "payroll_tax", "employee_insurance", "employer_insurance", "other_deductions"],
    "ledger": ["date", "account", "debit", "credit"],
    "bank": ["date", "amount", "reference"],
    "sales": ["invoice_id", "party_id", "date", "amount"],
    "purchases": ["invoice_id", "party_id", "date", "amount"],
    "settlements": ["event_id", "invoice_id", "date", "amount", "direction"],
    "moadian_sales": ["tax_id", "invoice_id", "date", "amount", "kind"],
    "moadian_purchases": ["tax_id", "invoice_id", "date", "amount", "kind"],
    "plans": ["plan_id", "obligation_id", "date", "total_obligation", "paid_as_of", "confirmed"],
    "history": ["event_id", "invoice_id", "party_id", "due_date", "paid_on", "amount"],
}
FAMILY_LABELS = {
    "employees": "کارمندان",
    "payroll": "حقوق و دستمزد",
    "ledger": "دفتر حسابداری",
    "bank": "گردش بانک",
    "sales": "فاکتور فروش",
    "purchases": "فاکتور خرید",
    "settlements": "دریافت و پرداخت",
    "moadian_sales": "مؤدیان فروش",
    "moadian_purchases": "مؤدیان خرید",
    "plans": "برنامه پرداخت",
    "history": "سابقه وصول",
}


def normalized(text: str) -> str:
    return str(text).strip().replace("ي", "ی").replace("ك", "ک").replace("\u200c", " ").lower()


def money(value: str, unit: str) -> str:
    known = UNITS.get(normalized(unit))
    require(known is not None, "unsupported_currency", "فقط ریال و تومان پشتیبانی می‌شود.")
    cleaned = str(value).translate(DIGITS).strip().replace(",", "").replace("٬", "").replace("٫", ".")
    require(bool(re.fullmatch(r"[+-]?\d+(?:\.\d+)?", cleaned)), "invalid_amount", "مبلغ معتبر نیست.")
    try:
        with localcontext() as context:
            context.prec = 50
            amount = Decimal(cleaned)
            require(
                amount.is_finite() and abs(amount) < Decimal("1e32") and amount.as_tuple().exponent >= -6,
                "amount_precision",
                "دقت یا بزرگی مبلغ مجاز نیست.",
            )
            result = amount * (10 if known == "TOMAN" else 1)
            require(abs(result) < Decimal("1e32"), "amount_precision", "بزرگی مبلغ ریالی مجاز نیست.")
            return format(result, "f")
    except InvalidOperation as exc:
        raise DomainError("invalid_amount", "مبلغ معتبر نیست.") from exc


def parsed_date(value: str, calendar: str) -> date:
    value = str(value).translate(DIGITS).strip().split("T")[0].split(" ")[0].replace("/", "-")
    try:
        parts = [int(part) for part in value.split("-")]
        require(len(parts) == 3, "invalid_date", "تاریخ معتبر نیست.")
        require(calendar in ("gregorian", "jalali"), "unknown_calendar", "تقویم مشخص نیست.")
        return jdatetime.date(*parts).togregorian() if calendar == "jalali" else date(*parts)
    except (ValueError, TypeError, OverflowError) as exc:
        raise DomainError("invalid_date", "تاریخ معتبر نیست.") from exc


@dataclass
class Sheet:
    name: str
    headers: list[str]
    rows: list[tuple[int, dict[str, str]]]


def cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def make_sheet(name: str, values) -> Sheet:
    iterator = iter(values)
    try:
        headers = [cell(v) for v in next(iterator)]
    except StopIteration:
        raise DomainError("empty_file", "فایل خالی است.") from None
    require(
        0 < len(headers) <= 200 and len(set(headers)) == len(headers) and all(headers),
        "invalid_headers",
        "سرستون‌ها باید مشخص و یکتا باشند.",
    )
    rows = []
    for number, values_row in enumerate(iterator, 2):
        require(number <= settings.max_rows + 2, "row_limit", "حداکثر ۲۰ هزار ردیف در هر نوبت مجاز است.", 413)
        raw = [cell(v) for v in values_row]
        if not any(raw):
            continue
        require(len(raw) <= len(headers), "invalid_row_width", f"تعداد ستون‌های ردیف {number} معتبر نیست.")
        raw += [""] * (len(headers) - len(raw))
        rows.append((number, dict(zip(headers, raw, strict=True))))
    require(bool(rows), "empty_file", "فایل ردیف داده ندارد.")
    return Sheet(name, headers, rows)


def check_biff_values(stream: bytes) -> None:
    """Reject executable/cached formulas and Excel 4 macro sheets in legacy XLS."""
    offset = 0
    while offset + 4 <= len(stream):
        record, size = struct.unpack_from("<HH", stream, offset)
        offset += 4
        require(offset + size <= len(stream), "invalid_xls", "ساختار XLS معتبر نیست.", 415)
        payload = stream[offset : offset + size]
        require(
            record not in (0x0006, 0x0206, 0x0406, 0x01AE),
            "unsafe_workbook",
            "فرمول یا پیوند خارجی XLS مجاز نیست؛ مقدار ثابت بارگذاری کنید.",
            415,
        )
        if record == 0x0085 and len(payload) >= 6:
            require(payload[5] != 1, "unsafe_workbook", "ماکروی Excel مجاز نیست.", 415)
        offset += size


def inspect_xls(content: bytes) -> None:
    with olefile.OleFileIO(io.BytesIO(content)) as document:
        entries = document.listdir()
        require(
            not any(
                any("vba" in segment.lower() or segment.lower() == "macros" for segment in entry)
                for entry in entries
            ),
            "unsafe_workbook",
            "ماکروی Excel مجاز نیست.",
            415,
        )
        name = "Workbook" if document.exists("Workbook") else "Book"
        require(document.exists(name), "invalid_xls", "فایل XLS معتبر نیست.", 415)
        size = document.get_size(name)
        require(size <= settings.max_unpacked_bytes, "archive_limit", "حجم Excel بیش از حد مجاز است.", 413)
        check_biff_values(document.openstream(name).read())


def inspect_xlsx(archive: ZipFile) -> None:
    """Reject executable parts and hostile XML before opening workbook objects."""
    files = archive.infolist()
    names = [part.filename.replace("\\", "/").casefold() for part in files]
    used_extensions = {Path(name).suffix.removeprefix(".") for name in names}
    forbidden = ("vbaproject", "externallinks/", "xl/macrosheets/", "xl/dialogsheets/", "xl/embeddings/", "xl/activex/", "xl/ctrlprops/", "customui/")
    require(len(names) == len(set(names)) and not any(part.flag_bits & 1 for part in files), "unsafe_workbook", "Excel رمزدار یا دارای بخش تکراری مجاز نیست.", 415)
    require(not any(name.startswith("/") or "../" in name or any(marker in name for marker in forbidden) for name in names), "unsafe_workbook", "ماکرو، پیوند خارجی یا شیء اجرایی Excel مجاز نیست.", 415)
    for part in files:
        if not part.filename.casefold().endswith((".xml", ".rels")):
            continue
        with archive.open(part) as source:
            for _event, element in safe_xml_events(source, events=("end",), forbid_dtd=True, forbid_entities=True, forbid_external=True):
                content_type = element.attrib.get("ContentType", "").casefold()
                # Exporters may declare unused default types (including XLSB).
                # A declaration applies only when the archive contains that extension.
                if (
                    part.filename == "[Content_Types].xml"
                    and element.tag == "{http://schemas.openxmlformats.org/package/2006/content-types}Default"
                    and element.attrib.get("Extension", "").casefold() not in used_extensions
                ):
                    content_type = ""
                relationship_type = element.attrib.get("Type", "").casefold()
                require(not any(marker in content_type for marker in ("macroenabled", "macrosheet", "activex", "oleobject")) and not any(marker in relationship_type for marker in ("vbaproject", "macrosheet", "activex", "oleobject", "/control")), "unsafe_workbook", "ماکرو یا شیء اجرایی Excel مجاز نیست.", 415)
                element.clear()


def read_file(name: str, content: bytes) -> list[Sheet]:
    suffix = Path(name).suffix.lower()
    require(suffix in (".csv", ".xlsx", ".xls"), "unsupported_format", "فقط Excel و CSV مجاز است.", 415)
    require(
        0 < len(content) <= settings.max_file_bytes, "file_size_limit", "حداکثر حجم فایل ۲۰ مگابایت است.", 413
    )
    try:
        if suffix == ".csv":
            require(
                not content.startswith((b"MZ", b"PK", b"%PDF", b"\x7fELF")) and b"\0" not in content,
                "invalid_csv",
                "محتوای CSV معتبر نیست.",
                415,
            )
            try:
                data = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                data = content.decode("cp1256")
            try:
                dialect = csv.Sniffer().sniff(data[:8192], delimiters=",;\t|")
            except csv.Error:
                dialect = csv.excel
            sheets = [make_sheet("CSV", csv.reader(io.StringIO(data), dialect, strict=True))]
        elif suffix == ".xlsx":
            with ZipFile(io.BytesIO(content)) as archive:
                files = archive.infolist()
                require(
                    len(files) <= 1000 and sum(f.file_size for f in files) <= settings.max_unpacked_bytes,
                    "archive_limit",
                    "حجم بازشدهٔ Excel بیش از حد مجاز است.",
                    413,
                )
                inspect_xlsx(archive)
            book = openpyxl.load_workbook(
                io.BytesIO(content), read_only=True, data_only=False, keep_links=False
            )
            try:
                require(len(book.worksheets) <= 30, "sheet_limit", "تعداد شیت‌ها بیش از حد مجاز است.", 413)
                sheets = []
                for sheet in book.worksheets:
                    try:
                        sheets.append(make_sheet(sheet.title, sheet.iter_rows(values_only=True)))
                    except DomainError as error:
                        if error.code != "empty_file":
                            raise
            finally:
                book.close()
        else:
            require(
                content[:8] == bytes.fromhex("D0CF11E0A1B11AE1"), "invalid_xls", "فایل XLS معتبر نیست.", 415
            )
            inspect_xls(content)
            book = xlrd.open_workbook(file_contents=content, on_demand=True)
            try:
                require(book.nsheets <= 30, "sheet_limit", "تعداد شیت‌ها بیش از حد مجاز است.", 413)
                sheets = [
                    make_sheet(
                        sheet.name,
                        (
                            [
                                xlrd.xldate_as_datetime(sheet.cell_value(r, c), book.datemode)
                                if sheet.cell_type(r, c) == xlrd.XL_CELL_DATE
                                else sheet.cell_value(r, c)
                                for c in range(sheet.ncols)
                            ]
                            for r in range(sheet.nrows)
                        ),
                    )
                    for sheet in book.sheets()
                    if sheet.nrows > 1
                ]
            finally:
                book.release_resources()
        require(bool(sheets), "empty_file", "فایل داده ندارد.")
        require(
            sum(len(sheet.rows) for sheet in sheets) <= settings.max_rows,
            "row_limit",
            "حداکثر ۲۰ هزار ردیف در هر نوبت مجاز است.",
            413,
        )
        return sheets
    except DomainError:
        raise
    except (ValueError, KeyError, BadZipFile, csv.Error, UnicodeError, OSError, SyntaxError, DefusedXmlException, RuntimeError, NotImplementedError, xlrd.XLRDError) as exc:
        raise DomainError("invalid_file", "ساختار فایل معتبر نیست.", 415) from exc


def moadian_portal_mapping(headers: list[str]) -> tuple[str, dict[str, str]] | None:
    """Identify the rial-denominated portal export from its headers, not its filename."""
    columns = {normalized(header): header for header in headers}
    if len(columns) != len(headers):
        return None
    directions = {
        "moadian_sales": ("فروشنده", "خریدار"),
        "moadian_purchases": ("خریدار", "فروشنده"),
    }
    fields = {
        "tax_id": "شماره مالیاتی صورت‌حساب",
        "invoice_id": "شماره مالیاتی صورت‌حساب",
        "date": "تاریخ صدور صورت‌حساب",
        "amount": "مجموع صورت‌حساب",
        "tax": "مالیات بر ارزش افزوده",
        "kind": "موضوع صورت‌حساب",
        "portal_status": "وضعیت صورت‌حساب",
        "parent_reference": "شماره مالیاتی صورت‌حساب مرجع",
    }
    rial_header = "مجموع بهای کالا و خدمات صورت‌حساب بدون مالیات‌ها و عوارض (ریال)"
    if not all(normalized(header) in columns for header in (*fields.values(), rial_header)):
        return None
    matched = [
        (family, counterpart)
        for family, (role, counterpart) in directions.items()
        if f"نقش مودی (نقش {role})" in columns
    ]
    if len(matched) != 1:
        return None
    family, counterpart = matched[0]
    mapping = {field: columns[normalized(header)] for field, header in fields.items()}
    party_prefix = f"شناسه هویتی {counterpart}/"
    party_columns = [header for key, header in columns.items() if key.startswith(party_prefix)]
    if len(party_columns) == 1:
        mapping["party_id"] = party_columns[0]
    return family, mapping


def interpret(sheet: Sheet, filename: str) -> dict:
    mapping = {
        key: header
        for key, aliases in ALIASES.items()
        for header in sheet.headers
        if normalized(header) in aliases
    }
    if "account" not in mapping:
        for header in sheet.headers:
            if normalized(header) == "کد حساب کل":
                mapping["account"] = header
                break
    keys = set(mapping)
    label = normalized(sheet.name + " " + filename)
    family = "unknown"
    if {"employee_id", "gross_pay", "net_pay"} <= keys:
        family = "payroll"
    elif {"employee_id", "employee_name"} <= keys:
        family = "employees"
    elif set(REQUIRED["ledger"]) <= keys:
        family = "ledger"
    elif {"plan_id", "obligation_id", "total_obligation"} <= keys:
        family = "plans"
    elif {"paid_on", "due_date", "event_id"} <= keys:
        family = "history"
    elif {"event_id", "invoice_id", "direction"} <= keys:
        family = "settlements"
    elif {"kind", "tax_id", "invoice_id"} <= keys:
        family = (
            "moadian_purchases"
            if any(k in label for k in ("خرید", "purchase"))
            else "moadian_sales"
            if any(k in label for k in ("فروش", "sales"))
            else "unknown"
        )
    elif {"invoice_id", "party_id", "amount"} <= keys:
        family = (
            "purchases"
            if any(k in label for k in ("خرید", "purchase"))
            else "sales"
            if any(k in label for k in ("فروش", "sales"))
            else "unknown"
        )
    elif {"amount", "balance", "reference"} <= keys:
        family = "bank"
    portal = moadian_portal_mapping(sheet.headers)
    if portal:
        family, portal_fields = portal
        if "currency" in mapping:
            portal_fields["currency"] = mapping["currency"]
        mapping = portal_fields
    units = (
        {row[mapping["currency"]] for _, row in sheet.rows if row.get(mapping.get("currency", ""))}
        if "currency" in mapping
        else set()
    )
    recognized = {UNITS.get(normalized(u), "unsupported") for u in units}
    unit = (
        "unsupported"
        if "unsupported" in recognized
        else next(iter(recognized))
        if len(recognized) == 1
        else "per_row"
        if recognized
        else None
    )
    if "currency" in mapping and any(not row.get(mapping["currency"]) for _, row in sheet.rows):
        unit = None
    elif portal and "currency" not in mapping:
        unit = "IRR"
    elif family == "ledger" and "currency" not in mapping and all(
        normalized(mapping[field]).endswith("(ریال)") for field in ("debit", "credit")
    ):
        unit = "IRR"
    dates = [
        row.get(mapping.get("date", ""), row.get(mapping.get("paid_on", ""), "")) for _, row in sheet.rows
    ]
    years = {int(value.translate(DIGITS)[:4]) for value in dates if re.match(r"^[۰-۹0-9]{4}[-/]", value)}
    calendar = (
        "gregorian"
        if years and all(1700 <= y <= 2300 for y in years)
        else "jalali"
        if years and all(1200 <= y <= 1600 for y in years)
        else None
    )
    return {
        "family": family,
        "mapping": mapping,
        "unit": unit,
        "calendar": calendar,
        "evidence": {
            "headers": sheet.headers,
            "sample": [row for _, row in sheet.rows[:3]],
            "sheet": sheet.name,
            **({"source_format": "moadian_portal_v1"} if portal else {}),
        },
    }


def scan(content: bytes) -> str:
    if not settings.scanner_host:
        require(not settings.production, "scanner_unavailable", "اسکنر فایل در دسترس نیست.", 503)
        return "development_unscanned"
    try:
        with socket.create_connection(
            (settings.scanner_host, settings.scanner_port), timeout=20
        ) as connection:
            connection.sendall(b"zINSTREAM\0")
            for offset in range(0, len(content), 65536):
                chunk = content[offset : offset + 65536]
                connection.sendall(struct.pack(">I", len(chunk)) + chunk)
            connection.sendall(struct.pack(">I", 0))
            result = connection.recv(4096)
        require(b"FOUND" not in result, "unsafe_file", "فایل آلوده است.", 415)
        require(b"OK" in result, "scanner_unavailable", "اسکن فایل تکمیل نشد.", 503)
        return "clean"
    except OSError as exc:
        raise DomainError("scanner_unavailable", "اسکنر فایل در دسترس نیست.", 503) from exc
