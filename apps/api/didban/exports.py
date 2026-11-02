"""Immutable report exports: exact amounts, Persian shaping and no formula execution."""
from __future__ import annotations

import csv
import io
import json
import threading
from collections.abc import Iterable, Mapping, Sequence
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any

import arabic_reshaper
import jdatetime
from bidi.algorithm import get_display
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, SimpleDocTemplate, Spacer, Table, TableStyle

from .config import settings

FONT_REGULAR = "DidbanIRANYekanX"
FONT_MEDIUM = "DidbanIRANYekanXMedium"
FONT_BOLD = "DidbanIRANYekanXBold"
FONT_EXTRA_BOLD = "DidbanIRANYekanXExtraBold"
FONT_LOCK = threading.Lock()
DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
BRAND = colors.HexColor("#5556DE")
INK = colors.HexColor("#20243F")
MUTED = colors.HexColor("#68718A")
LINE = colors.HexColor("#E9ECF5")
SOFT = colors.HexColor("#EEEDFF")
STATUS_LABELS = {
    "available": "موجود",
    "limited": "محدود",
    "estimated": "برآوردی",
    "unavailable": "ناموجود",
    "matched": "مطابق",
    "amount_mismatch": "اختلاف مبلغ",
    "tax_mismatch": "اختلاف مالیات",
    "internal_only": "فقط در فاکتورها",
    "portal_only": "فقط در مؤدیان",
}
FIELD_LABELS = {
    "account": "حساب", "balance": "مانده", "status": "وضعیت", "reason": "محدودیت",
    "reference": "مرجع", "party_id": "طرف حساب", "direction": "جهت", "date": "تاریخ",
    "due_date": "سررسید", "amount": "مبلغ", "paid": "تسویه‌شده", "remaining": "مانده",
    "overdue": "سررسیدگذشته", "tax_id": "شناسه مالیاتی", "internal_amount": "مبلغ فاکتور",
    "portal_amount": "مبلغ مؤدیان", "difference": "اختلاف", "tax": "مالیات",
    "inflow": "ورودی", "outflow": "خروجی", "net": "خالص", "evidence_refs": "شواهد",
    "reason_codes": "علت‌ها", "id": "شناسه", "obligation_id": "شناسه تعهد",
    "label": "عنوان", "state": "وضعیت", "unit": "واحد", "scope": "دامنه",
    "basis": "مبنا", "formula_version": "نسخه فرمول", "as_of_date": "تاریخ مبنا",
    "external_in": "سایر واریزهای بانک", "external_out": "سایر برداشت‌های بانک",
    "total_in": "واریز بانک در دوره", "total_out": "برداشت بانک در دوره",
    "internal_in": "انتقال داخلی ورودی", "internal_out": "انتقال داخلی خروجی",
    "trade": "تجاری", "loan": "وام", "payroll": "حقوق", "other": "سایر",
}


def register_fonts() -> None:
    """Fail explicitly rather than silently substituting a Persian font."""
    with FONT_LOCK:
        registered = set(pdfmetrics.getRegisteredFontNames())
        for name, filename in (
            (FONT_REGULAR, "IRANYekanX-Regular.ttf"),
            (FONT_MEDIUM, "IRANYekanX-Medium.ttf"),
            (FONT_BOLD, "IRANYekanX-Bold.ttf"),
            (FONT_EXTRA_BOLD, "IRANYekanX-ExtraBold.ttf"),
        ):
            if name not in registered:
                path = settings.fonts / filename
                if not path.is_file():
                    raise FileNotFoundError(f"Required PDF font is missing: {filename}")
                pdfmetrics.registerFont(TTFont(name, str(path)))


def shaped(value: Any) -> str:
    return get_display(arabic_reshaper.reshape(str(value)))


def localized(value: Any, *, amount: bool = False) -> str:
    if value is None:
        return "ناموجود"
    if isinstance(value, bool):
        return "بله" if value else "خیر"
    if amount:
        try:
            exact = Decimal(str(value))
            if exact.is_finite():
                value = format(exact, ",f").replace(",", "٬").replace(".", "٫")
        except InvalidOperation:
            pass
    return str(value).translate(DIGITS)


class RTLText(Flowable):
    """Wrap logical words first, then shape each visual line independently."""

    def __init__(self, text: Any, size: float = 10, font: str = FONT_REGULAR,
                 color=INK, leading: float | None = None):
        super().__init__()
        self.logical_text = str(text).translate({code: "-" for code in (0x2010, 0x2011, 0x2012, 0x2013, 0x2014)})
        self.size = size
        self.font = font
        self.color = color
        self.leading = leading or size * 1.7
        self.lines: list[str] = []

    def _width(self, text: str) -> float:
        return pdfmetrics.stringWidth(shaped(text), self.font, self.size)

    def wrap(self, availWidth: float, availHeight: float) -> tuple[float, float]:
        self.width = max(availWidth, 1)
        self.lines = []
        for paragraph in self.logical_text.split("\n"):
            line = ""
            for word in paragraph.split():
                # Technical references and large exact values also remain inside the cell.
                pieces = [word]
                if self._width(word) > self.width:
                    pieces = []
                    piece = ""
                    for char in word:
                        if piece and self._width(piece + char) > self.width:
                            pieces.append(piece)
                            piece = char
                        else:
                            piece += char
                    if piece:
                        pieces.append(piece)
                for piece in pieces:
                    candidate = f"{line} {piece}".strip()
                    if line and self._width(candidate) > self.width:
                        self.lines.append(line)
                        line = piece
                    else:
                        line = candidate
            self.lines.append(line)
        self.height = max(len(self.lines), 1) * self.leading
        return self.width, self.height

    def split(self, availWidth: float, availHeight: float) -> list[Flowable]:
        self.wrap(availWidth, availHeight)
        count = int(availHeight // self.leading)
        if count < 1 or count >= len(self.lines):
            return []
        return [RTLText("\n".join(self.lines[:count]), self.size, self.font, self.color, self.leading),
                RTLText("\n".join(self.lines[count:]), self.size, self.font, self.color, self.leading)]

    def draw(self) -> None:
        self.canv.setFillColor(self.color)
        self.canv.setFont(self.font, self.size)
        for index, line in enumerate(self.lines):
            self.canv.drawRightString(self.width, self.height - (index + 1) * self.leading + self.size * 0.3, shaped(line))


def section_heading(text: str, size: float = 12) -> RTLText:
    heading = RTLText(text, size, FONT_MEDIUM)
    heading.keepWithNext = 1
    heading.spaceAfter = 3 * mm
    return heading


def _table(rows: list[list[Any]], widths: list[float]) -> Table:
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="RIGHT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, LINE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _metric_rows(metrics: Iterable[Mapping[str, Any]]) -> list[list[Any]]:
    rows = [[RTLText("وضعیت و محدودیت", 9, FONT_MEDIUM), RTLText("مبلغ (ریال)", 9, FONT_MEDIUM), RTLText("شاخص", 9, FONT_MEDIUM)]]
    for metric in metrics:
        state = STATUS_LABELS.get(str(metric.get("status")), "نامشخص")
        reason = metric.get("reason")
        if reason:
            state += "\n" + str(reason)
        rows.append([
            RTLText(state, 8.5, color=MUTED),
            RTLText(localized(metric.get("value"), amount=True), 10, FONT_MEDIUM),
            RTLText(metric.get("label") or metric.get("metric_key") or "شاخص", 10),
        ])
    return rows


def bank_flow_summary(values: Mapping[str, Any]) -> dict[str, Any]:
    """Legacy snapshots need both components before a total can be displayed."""
    summary = {"net": values.get("net")}
    for target, first, second in (("total_in", "external_in", "internal_in"), ("total_out", "external_out", "internal_out")):
        if target in values:
            summary[target] = values[target]
        elif values.get(first) is not None and values.get(second) is not None:
            try:
                with localcontext() as context:
                    context.prec = 50
                    summary[target] = format(Decimal(str(values[first])) + Decimal(str(values[second])), "f")
            except InvalidOperation:
                summary[target] = None
        else:
            summary[target] = None
    return {"total_in": summary["total_in"], "total_out": summary["total_out"], "net": summary["net"]}


def display_date(value: Any) -> str:
    try:
        parsed = date.fromisoformat(str(value)[:10])
        return jdatetime.date.fromgregorian(date=parsed).strftime("%Y/%m/%d").translate(DIGITS)
    except (TypeError, ValueError):
        return localized(value)


def forecast_sections(forecast: Mapping[str, Any], width: float) -> list[Flowable]:
    section: list[Flowable] = [Spacer(1, 7 * mm), section_heading("پیش‌بینی ۳۰روزه")]
    if forecast.get("reason"):
        section.append(RTLText(forecast["reason"], 10, color=MUTED))
    if forecast.get("status") not in ("estimated", "available"):
        return section
    section.append(RTLText("برآوردی", 9, color=BRAND))
    events = forecast.get("events") or []
    with localcontext() as context:
        context.prec = 50
        receipts = sum((Decimal(str(event["amount"])) for event in events if event.get("direction") == "receipt"), Decimal(0))
        payments = sum((Decimal(str(event["amount"])) for event in events if event.get("direction") == "payment"), Decimal(0))
    rows = [[RTLText("مبلغ (ریال)", 9, FONT_MEDIUM), RTLText("عنوان", 9, FONT_MEDIUM)]]
    for label, value in (("مانده آغاز", forecast.get("opening")), ("دریافت برآوردی", format(receipts, "f")), ("پرداخت برنامه‌ای", format(payments, "f")), ("مانده پایان ۳۰ روز", forecast.get("closing"))):
        rows.append([RTLText(localized(value, amount=True), 10, FONT_MEDIUM), RTLText(label, 10)])
    section.extend([Spacer(1, 3 * mm), _table(rows, [width * .45, width * .55])])
    if events:
        event_rows = [[RTLText("مبلغ (ریال)", 9, FONT_MEDIUM), RTLText("تعهد", 9, FONT_MEDIUM), RTLText("جهت", 9, FONT_MEDIUM), RTLText("تاریخ", 9, FONT_MEDIUM)]]
        for event in events[:12]:
            event_rows.append([RTLText(localized(event.get("amount"), amount=True), 9, FONT_MEDIUM), RTLText(event.get("obligation_id", ""), 8), RTLText("دریافت" if event.get("direction") == "receipt" else "پرداخت", 9), RTLText(display_date(event.get("date")), 9)])
        section.extend([Spacer(1, 4 * mm), _table(event_rows, [width * .29, width * .27, width * .18, width * .26])])
        if len(events) > 12:
            section.append(RTLText(f"{localized(12)} رویداد از {localized(len(events))}؛ فهرست کامل در Excel", 8, color=MUTED))
    assumptions = forecast.get("assumptions") or []
    if assumptions:
        section.extend([Spacer(1, 4 * mm), section_heading("مبنای برآورد", 10)])
        for assumption in assumptions[:10]:
            if isinstance(assumption, Mapping):
                reference = assumption.get("invoice_ref") or assumption.get("obligation_id") or ""
                if assumption.get("basis") == "amount_weighted_median_delay":
                    text = f"فاکتور {reference}: تأخیر {localized(assumption.get('delay_days'))} روز، {localized(assumption.get('history_event_count'))} وصول معتبر؛ {display_date(assumption.get('expected_date'))}"
                elif assumption.get("basis") == "human_expected_date":
                    text = f"فاکتور {reference}: زمان وصول ثبت‌شده {display_date(assumption.get('expected_date'))}"
                else:
                    text = f"تعهد {reference}: {display_date(assumption.get('expected_date'))}"
            else:
                text = str(assumption)
            section.append(RTLText(text, 8.5, color=MUTED))
        if len(assumptions) > 10:
            section.append(RTLText("مبنای همه برآوردها در خروجی Excel ثبت شده است.", 8, color=MUTED))
    return section


def pdf_report(manifest: Mapping[str, Any], report: Mapping[str, Any], company_name: str) -> bytes:
    register_fonts()
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm,
                            topMargin=20 * mm, bottomMargin=20 * mm,
                            title=str(report.get("title", "گزارش مالی")), author="دیدبان مالی", lang="fa-IR")
    width = A4[0] - 40 * mm
    story: list[Flowable] = [RTLText(report.get("title", "گزارش مالی"), 18, FONT_MEDIUM),
                             Spacer(1, 5 * mm), RTLText(company_name, 12, FONT_MEDIUM),
                             Spacer(1, 3 * mm), RTLText("تولیدشده سامانه", 9, color=BRAND)]
    period = manifest.get("period") or (manifest.get("selection") or {}).get("period", {})
    start = period.get("start") if isinstance(period, Mapping) else None
    end = period.get("end") if isinstance(period, Mapping) else None
    if start and end:
        story.extend([Spacer(1, 2 * mm), RTLText(f"دوره: {display_date(start)} تا {display_date(end)}", 9, color=MUTED)])
    approvals = report.get("approvals", [])
    approval_text = "تأیید مالی: ثبت نشده" if not approvals else f"تأیید مالی: {localized(len(approvals))} تأیید برای همین نسخه"
    story.extend([Spacer(1, 2 * mm), RTLText(approval_text, 9, color=MUTED), Spacer(1, 7 * mm)])
    metrics = manifest.get("metrics", [])
    story.append(_table(_metric_rows(metrics), [width * .38, width * .28, width * .34]))

    details = manifest.get("details") or {}
    for key, heading in (("cash_movements", "گردش نقد دوره"), ("debt_components", "اجزای بدهی دفتر")):
        values = details.get(key)
        if key == "cash_movements" and isinstance(values, Mapping):
            values = bank_flow_summary(values)
        if isinstance(values, Mapping) and values:
            rows = [[RTLText("مبلغ (ریال)", 9, FONT_MEDIUM), RTLText("عنوان", 9, FONT_MEDIUM)]]
            rows.extend([[RTLText(localized(value, amount=True), 10, FONT_MEDIUM), RTLText(FIELD_LABELS.get(str(label), str(label)), 10)] for label, value in values.items() if not isinstance(value, (list, dict))])
            story.extend([Spacer(1, 7 * mm), section_heading(heading), _table(rows, [width * .45, width * .55])])

    bank_balances = details.get("bank_balances")
    if isinstance(bank_balances, list) and bank_balances:
        rows = [[RTLText("مانده (ریال)", 9, FONT_MEDIUM), RTLText("حساب", 9, FONT_MEDIUM)]]
        for account in bank_balances[:30]:
            rows.append([RTLText(localized(account.get("balance"), amount=True), 10, FONT_MEDIUM), RTLText(account.get("account", ""), 9)])
        story.extend([Spacer(1, 7 * mm), section_heading("مانده حساب‌ها"), _table(rows, [width * .45, width * .55])])

    forecast = details.get("forecast")
    if isinstance(forecast, Mapping):
        story.extend(forecast_sections(forecast, width))

    # Preserve evidence references without copying raw financial rows into the narrative.
    refs = sorted({str(ref) for metric in metrics for ref in metric.get("evidence_refs", [])})
    if refs:
        story.extend([Spacer(1, 7 * mm), section_heading("شواهد محاسبه")])
        for ref in refs[:50]:
            story.append(RTLText(ref, 8, color=MUTED))
        if len(refs) > 50:
            story.append(RTLText("فهرست کامل شواهد در خروجی Excel آمده است.", 9, color=MUTED))
    version = localized(report.get("version", 1))
    identity = str(manifest.get("id", manifest.get("manifest_id", "")))
    story.extend([Spacer(1, 7 * mm), RTLText(f"نسخه گزارش: {version}", 8, color=MUTED)])
    if identity:
        story.append(RTLText(f"شناسه نتیجه: {identity}", 8, color=MUTED))
    if manifest.get("digest"):
        story.append(RTLText(f"SHA-256: {manifest['digest']}", 7, color=MUTED))

    def page_footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.line(20 * mm, 15.5 * mm, A4[0] - 20 * mm, 15.5 * mm)
        canvas.setFont(FONT_REGULAR, 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(A4[0] - 20 * mm, 11 * mm, shaped("دیدبان مالی"))
        canvas.drawString(20 * mm, 11 * mm, shaped(f"صفحه {localized(document.page)}"))
        canvas.restoreState()

    doc.build(story, onFirstPage=page_footer, onLaterPages=page_footer)
    return output.getvalue()


def _scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def safe_csv(headers: Sequence[str], rows: Iterable[Mapping[str, Any] | Sequence[Any]]) -> bytes:
    """UTF-8 CSV intended for spreadsheet opening; escape executable text prefixes."""
    output = io.StringIO(newline="")
    writer = csv.writer(output)

    def safe(value: Any) -> str:
        text = _scalar(value)
        if text.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
            return "'" + text
        return text

    writer.writerow([safe(header) for header in headers])
    for row in rows:
        values = [row.get(header) for header in headers] if isinstance(row, Mapping) else row
        writer.writerow([safe(value) for value in values])
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def _sheet(workbook: Workbook, title: str, headers: Sequence[str], rows: Iterable[Sequence[Any]], *, overflow: list[tuple] | None = None) -> None:
    """Stream literal cells and preserve every over-limit value in numbered chunks."""
    import base64
    from itertools import chain, islice

    from openpyxl.cell import WriteOnlyCell
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    from openpyxl.utils import get_column_letter

    own_overflow = overflow is None
    continued = [] if overflow is None else overflow
    sheet = workbook.create_sheet(title[:31])
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = "A2"
    iterator = iter(rows)
    first = list(islice(iterator, 100))
    maximum_columns = max([len(headers), *[len(row) for row in first]], default=1)
    for column in range(maximum_columns):
        sample = [_scalar(row[column]) for row in [headers, *first] if column < len(row)]
        sheet.column_dimensions[get_column_letter(column + 1)].width = min(48, max(18, max(map(len, sample), default=0) + 2))
    alignment = Alignment(horizontal="right", vertical="top", wrap_text=True)
    fonts = {False: Font(name="IRANYekanX", size=11, color="20243F"), True: Font(name="IRANYekanX", size=11, bold=True, color="20243F")}
    fill = PatternFill("solid", fgColor="EEEDFF")
    number = 0
    for number, values in enumerate(chain([headers], first, iterator), 1):
        cells = []
        for column, value in enumerate(values, 1):
            literal = _scalar(value)
            illegal = ILLEGAL_CHARACTERS_RE.search(literal) is not None
            # Excel counts UTF-16 units. The conservative bound also covers emoji.
            utf16_units = len(literal.encode("utf-16-le", errors="surrogatepass")) // 2
            if utf16_units > 32767 or illegal:
                reference = f"{sheet.title}!{get_column_letter(column)}{number}"
                encoding = "base64-utf8" if illegal else "text"
                preserved = base64.b64encode(literal.encode("utf-8")).decode("ascii") if illegal else literal
                chunks = [preserved[start:start + 16000] for start in range(0, len(preserved), 16000)]
                continued.extend((reference, sheet.title, f"{get_column_letter(column)}{number}", part, len(chunks), encoding, chunk) for part, chunk in enumerate(chunks, 1))
                literal = "متن کامل در برگه ادامه متن: " + reference
            target = WriteOnlyCell(sheet) if workbook.write_only else sheet.cell(number, column)
            target.value = literal
            target.data_type = "s"
            target.alignment = alignment
            target.font = fonts[number == 1]
            if number == 1:
                target.fill = fill
            cells.append(target)
        if workbook.write_only:
            sheet.append(cells)
    sheet.auto_filter.ref = f"A1:{get_column_letter(maximum_columns)}{max(number, 1)}"
    if own_overflow and continued:
        _sheet(workbook, "ادامه متن", ["reference", "sheet", "cell", "part", "parts", "encoding", "text"], continued, overflow=[])


def _records_sheet(workbook: Workbook, title: str, values: Any, overflow: list[tuple]) -> None:
    """Normalize row records, key/value maps and scalar lists without flattening loss."""
    if isinstance(values, Mapping):
        _sheet(workbook, title, ["field", "value"], values.items(), overflow=overflow)
    elif isinstance(values, list):
        if all(isinstance(row, Mapping) for row in values):
            headers = list(dict.fromkeys(str(field) for row in values for field in row)) or ["id"]
            _sheet(workbook, title, headers, ([row.get(field) for field in headers] for row in values), overflow=overflow)
        else:
            _sheet(workbook, title, ["value"], ([row] for row in values), overflow=overflow)


def xlsx_report(manifest: Mapping[str, Any], report: Mapping[str, Any], company_name: str) -> bytes:
    # Streaming keeps source-row/evidence manifests usable at the 20k-row target.
    book = Workbook(write_only=True)
    overflow: list[tuple] = []
    selection = manifest.get("selection") or {}
    metadata = [
        ("شرکت", company_name), ("گزارش", report.get("title")), ("نسخه", report.get("version", 1)),
        ("شناسه گزارش", report.get("id")), ("شناسه نتیجه", manifest.get("id", manifest.get("manifest_id"))),
        ("SHA-256", manifest.get("digest")),
    ]
    metadata.extend(("manifest." + key, value) for key, value in manifest.items() if key not in {"id", "manifest_id", "digest", "selection", "metrics", "details"})
    metadata.extend(("report." + key, value) for key, value in report.items() if key not in {"id", "title", "version", "approvals"})
    selection_sections = {
        "row_ids": "ردیف‌های ورودی", "files": "منابع ورودی", "excluded_files": "منابع کنارگذاشته",
        "allocations": "تخصیص‌های مبنا", "plans": "برنامه‌های مبنا", "forecast_plans": "برنامه‌های پیش‌بینی",
        "decisions": "پاسخ‌ها و تصمیم‌ها", "interpretation_ids": "نسخه‌های تفسیر", "coverage": "پوشش منابع", "period": "دوره مبنا",
    }
    metadata.extend((key, value) for key, value in selection.items() if not isinstance(value, (list, dict)))
    _sheet(book, "مشخصات", ["عنوان", "مقدار"], metadata, overflow=overflow)
    _records_sheet(book, "تأییدهای گزارش", report.get("approvals", []), overflow)
    for key, title in selection_sections.items():
        if key in selection:
            _records_sheet(book, title, selection[key], overflow)
    remaining_selection = {key: value for key, value in selection.items() if key not in selection_sections and isinstance(value, (list, dict))}
    if remaining_selection:
        _records_sheet(book, "سایر انتخاب‌های مبنا", remaining_selection, overflow)
    metrics = manifest.get("metrics", [])
    metric_headers = ["metric_key", "label", "basis", "scope", "value", "unit", "status", "reason", "reason_codes", "action", "as_of_date", "period_id", "formula_version", "comparison", "evidence_count"]
    metric_headers = list(dict.fromkeys([*metric_headers, *[key for metric in metrics for key in metric if key != "evidence_refs"]]))
    _sheet(book, "شاخص‌ها", metric_headers, ([len(metric.get("evidence_refs", [])) if key == "evidence_count" else metric.get(key) for key in metric_headers] for metric in metrics), overflow=overflow)
    _sheet(book, "شواهد شاخص‌ها", ["metric_key", "basis", "scope", "source_row_id"], ([metric.get("metric_key"), metric.get("basis"), metric.get("scope"), reference] for metric in metrics for reference in metric.get("evidence_refs", [])), overflow=overflow)
    details = manifest.get("details") or {}
    sections = {
        "bank_balances": "مانده بانک", "daily_cash": "گردش روزانه", "bank_transactions": "تراکنش‌های بانک",
        "invoices": "فاکتورها", "cash_movements": "حرکت نقد", "debt_components": "اجزای بدهی",
        "opposite_debt_balances": "مانده خلاف ماهیت بدهی", "receivable_credit_balances": "بستانکاری دریافتنی",
        "ledger_parties": "مانده اشخاص دفتر", "ledger_controls": "کنترل‌های دفتر", "invoice_credits": "اعتبار فاکتورها",
    }
    for key, title in sections.items():
        if key in details:
            value = details[key]
            if isinstance(value, (Mapping, list)):
                _records_sheet(book, title, value, overflow)
            else:
                _sheet(book, title, ["value"], [[value]], overflow=overflow)
    forecast = details.get("forecast") or {}
    if isinstance(forecast, Mapping):
        _records_sheet(book, "پیش‌بینی", {key: value for key, value in forecast.items() if key not in ("days", "events", "assumptions")}, overflow)
        for key, title in (("days", "روزهای پیش‌بینی"), ("events", "رویدادهای پیش‌بینی"), ("assumptions", "فرض‌های پیش‌بینی")):
            if key in forecast:
                _records_sheet(book, title, forecast[key], overflow)
    moadian = details.get("moadian") or {}
    if isinstance(moadian, Mapping):
        for direction, title in (("sales", "مؤدیان فروش"), ("purchases", "مؤدیان خرید")):
            if direction in moadian:
                _records_sheet(book, title, moadian[direction], overflow)
    other_details = {key: value for key, value in details.items() if key not in sections and key not in ("forecast", "moadian")}
    if other_details:
        _records_sheet(book, "سایر جزئیات", other_details, overflow)
    if overflow:
        _sheet(book, "ادامه متن", ["reference", "sheet", "cell", "part", "parts", "encoding", "text"], overflow, overflow=[])
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()
