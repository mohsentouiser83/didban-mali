from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import arabic_reshaper
import jdatetime
from bidi.algorithm import get_display
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

FONT_DIR = Path(__file__).parent / "assets" / "fonts"
FONT_FILES = {
    "IRANYekanX": "IRANYekanX-Regular.ttf",
    "IRANYekanX-Medium": "IRANYekanX-Medium.ttf",
    "IRANYekanX-Bold": "IRANYekanX-Bold.ttf",
    "IRANYekanX-ExtraBold": "IRANYekanX-ExtraBold.ttf",
}
PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
PRIORITY_LABELS = {
    "critical": "بحرانی",
    "high": "بالا",
    "medium": "متوسط",
    "low": "پایین",
}
WORKFLOW_LABELS = {
    "needs_review": "نیازمند بررسی",
    "confirmed": "تأییدشده",
    "dismissed": "ردشده",
    "follow_up": "در حال پیگیری",
    "resolved": "حل‌شده",
}
STATE_LABELS = {
    "critical_attention": "نیازمند اقدام فوری",
    "attention": "نیازمند توجه",
    "monitor": "نیازمند پایش",
    "stable": "باثبات",
    "limited_visibility": "دید محدود",
    "analysis_incomplete": "تحلیل ناکامل",
    "complete": "کامل",
    "limited": "محدود",
}
TEXT_COLOR = HexColor("#172033")
PARAGRAPH_COLOR = HexColor("#344054")


def _register_fonts() -> None:
    for name, filename in FONT_FILES.items():
        if name not in pdfmetrics.getRegisteredFontNames():
            path = FONT_DIR / filename
            if not path.is_file():
                raise FileNotFoundError(f"Required IRANYekanX font is missing: {path}")
            pdfmetrics.registerFont(TTFont(name, str(path)))


def _visual(text: str) -> str:
    return str(get_display(arabic_reshaper.reshape(text), base_dir="R"))


def _fa_digits(value: object) -> str:
    return str(value).translate(PERSIAN_DIGITS)


def _jalali(iso_date: str) -> str:
    year, month, day = (int(part) for part in iso_date[:10].split("-"))
    value = jdatetime.date.fromgregorian(day=day, month=month, year=year)
    return _fa_digits(value.strftime("%Y/%m/%d"))


def _irr(value: object | None) -> str:
    if value is None:
        return "ناموجود"
    return f"{_fa_digits(f'{int(str(value)):,}')} ریال"


def _percent(value: object | None) -> str:
    if value is None:
        return "ناموجود"
    return f"{_fa_digits(f'{float(str(value)) * 100:.1f}')}٪"


def _label(labels: dict[str, str], value: object) -> str:
    normalized = str(value)
    return labels.get(normalized, normalized)


class PersianPdf:
    def __init__(self, buffer: BytesIO, *, title: str, company_name: str) -> None:
        self.canvas = Canvas(buffer, pagesize=A4, pageCompression=1, pdfVersion=(1, 7))
        self.width, self.height = A4
        self.left = 20 * mm
        self.right = self.width - 20 * mm
        self.top = self.height - 20 * mm
        self.bottom = 20 * mm
        self.y = self.top
        self.page = 0
        self.title = title
        self.company_name = company_name
        self.canvas.setTitle(title)
        self.canvas.setAuthor("دیدبان مالی")
        self.canvas.setSubject("گزارش بررسی مالی مبتنی بر snapshot ساخت‌یافته")
        self.new_page()

    def _draw_rtl(
        self,
        text: str,
        *,
        x: float | None = None,
        y: float | None = None,
        font: str = "IRANYekanX",
        size: float = 9.5,
        color: Color = TEXT_COLOR,
    ) -> None:
        self.canvas.setFont(font, size)
        self.canvas.setFillColor(color)
        self.canvas.drawRightString(
            x if x is not None else self.right,
            y if y is not None else self.y,
            _visual(text),
        )

    def _width(self, text: str, font: str, size: float) -> float:
        return float(pdfmetrics.stringWidth(_visual(text), font, size))

    def _wrap(self, text: str, max_width: float, font: str, size: float) -> list[str]:
        lines: list[str] = []
        for paragraph in str(text).splitlines() or [""]:
            words = paragraph.split()
            if not words:
                lines.append("")
                continue
            current = words[0]
            for word in words[1:]:
                candidate = f"{current} {word}"
                if self._width(candidate, font, size) <= max_width:
                    current = candidate
                else:
                    lines.append(current)
                    current = word
            lines.append(current)
        return lines

    def _ensure(self, height: float) -> None:
        if self.y - height < self.bottom:
            self.new_page()

    def _footer(self) -> None:
        if self.page == 0:
            return
        y = 10 * mm
        self.canvas.setStrokeColor(HexColor("#D8DEE9"))
        self.canvas.line(self.left, y + 5 * mm, self.right, y + 5 * mm)
        self._draw_rtl(
            f"صفحه {_fa_digits(self.page)}",
            x=self.right,
            y=y,
            size=8,
            color=HexColor("#667085"),
        )
        self._draw_rtl(
            "دیدبان مالی - گزارش ثابت",
            x=self.left + 42 * mm,
            y=y,
            size=8,
            color=HexColor("#667085"),
        )

    def new_page(self) -> None:
        if self.page:
            self._footer()
            self.canvas.showPage()
        self.page += 1
        self.y = self.top
        self.canvas.setFillColor(HexColor("#F5F7FA"))
        self.canvas.roundRect(
            self.left, self.y - 15 * mm, self.right - self.left, 15 * mm, 3 * mm, fill=1, stroke=0
        )
        self._draw_rtl(
            self.company_name,
            y=self.y - 6 * mm,
            font="IRANYekanX-Bold",
            size=10,
            color=HexColor("#344054"),
        )
        self._draw_rtl(
            self.title,
            y=self.y - 11 * mm,
            font="IRANYekanX-Medium",
            size=8.5,
            color=HexColor("#667085"),
        )
        self.y -= 23 * mm

    def title_block(self, title: str, subtitle: str) -> None:
        self._ensure(38 * mm)
        self.canvas.setFillColor(HexColor("#155EEF"))
        self.canvas.roundRect(
            self.left, self.y - 30 * mm, self.right - self.left, 30 * mm, 4 * mm, fill=1, stroke=0
        )
        self._draw_rtl(
            title,
            y=self.y - 11 * mm,
            font="IRANYekanX-ExtraBold",
            size=19,
            color=white,
        )
        self._draw_rtl(subtitle, y=self.y - 21 * mm, size=10, color=white)
        self.y -= 38 * mm

    def section(self, title: str) -> None:
        self._ensure(30 * mm)
        self.y -= 3 * mm
        self.canvas.setFillColor(HexColor("#EAF0FF"))
        self.canvas.roundRect(
            self.left, self.y - 9 * mm, self.right - self.left, 9 * mm, 2 * mm, fill=1, stroke=0
        )
        self._draw_rtl(
            title,
            y=self.y - 6 * mm,
            font="IRANYekanX-Bold",
            size=11,
            color=HexColor("#1849A9"),
        )
        self.y -= 14 * mm

    def paragraph(
        self,
        text: str,
        *,
        font: str = "IRANYekanX",
        size: float = 9.2,
        color: Color = PARAGRAPH_COLOR,
        indent: float = 0,
    ) -> None:
        lines = self._wrap(text, self.right - self.left - indent, font, size)
        leading = size * 1.65
        self._ensure(max(leading * len(lines) + 3 * mm, 9 * mm))
        for line in lines:
            self._draw_rtl(line, x=self.right - indent, font=font, size=size, color=color)
            self.y -= leading
        self.y -= 2 * mm

    def key_value(self, label: str, value: str) -> None:
        self._ensure(8 * mm)
        self._draw_rtl(value, x=self.right - 45 * mm, size=9.2)
        self._draw_rtl(
            label,
            font="IRANYekanX-Medium",
            size=9,
            color=HexColor("#667085"),
        )
        self.y -= 7 * mm

    def card(self, title: str, meta: str, body: str | None = None) -> None:
        body_lines = self._wrap(body or "", self.right - self.left - 10 * mm, "IRANYekanX", 8.8)
        body_height = len(body_lines) * 14 if body else 0
        height = 16 * mm + body_height
        self._ensure(height + 4 * mm)
        top = self.y
        self.canvas.setFillColor(HexColor("#F8FAFC"))
        self.canvas.setStrokeColor(HexColor("#D0D5DD"))
        self.canvas.roundRect(
            self.left, top - height, self.right - self.left, height, 2.5 * mm, fill=1, stroke=1
        )
        self._draw_rtl(
            title, x=self.right - 5 * mm, y=top - 6 * mm, font="IRANYekanX-Bold", size=9.6
        )
        self._draw_rtl(
            meta, x=self.right - 5 * mm, y=top - 12 * mm, size=8, color=HexColor("#667085")
        )
        cursor_y = top - 18 * mm
        for line in body_lines:
            self._draw_rtl(
                line, x=self.right - 5 * mm, y=cursor_y, size=8.8, color=HexColor("#475467")
            )
            cursor_y -= 14
        self.y = top - height - 4 * mm

    def finish(self) -> None:
        self._footer()
        self.canvas.save()


def render_report_pdf(payload: dict[str, Any]) -> bytes:
    _register_fonts()
    company = dict(payload["company"])
    analysis = dict(payload["analysis"])
    title = str(payload["title_fa"])
    buffer = BytesIO()
    pdf = PersianPdf(buffer, title=title, company_name=str(company["legal_name"]))
    period = (
        f"دوره {_jalali(str(analysis['period_start']))} تا {_jalali(str(analysis['period_end']))}"
    )
    pdf.title_block(title, period)
    pdf.key_value("شرکت", str(company["legal_name"]))
    pdf.key_value("نسخه قواعد", str(analysis["rule_set_version"]))
    pdf.key_value("تاریخ تولید", _jalali(str(payload["generated_at"])))

    overall = dict(payload["overall_status"])
    pdf.section("وضعیت کلی")
    pdf.paragraph(str(overall["summary_fa"]), font="IRANYekanX-Medium", size=10)
    pdf.key_value(
        "وضعیت مالی",
        STATE_LABELS.get(str(overall["financial_state"]), str(overall["financial_state"])),
    )
    pdf.key_value(
        "کیفیت داده", STATE_LABELS.get(str(overall["data_quality"]), str(overall["data_quality"]))
    )
    for reason in overall.get("reasons_fa", []):
        pdf.paragraph(f"• {reason}", size=8.8, indent=3 * mm)

    pdf.section("مرور مالی")
    for metric in payload.get("financial_overview", []):
        metric = dict(metric)
        value = metric.get("value")
        formatted = _percent(value) if metric.get("unit") == "ratio" else _irr(value)
        if not metric.get("available"):
            formatted = f"ناموجود - {metric.get('unavailable_reason_fa') or 'داده کافی نیست'}"
        pdf.key_value(str(metric["label_fa"]), formatted)

    pdf.section("یافته‌های مهم")
    top_findings = list(payload.get("top_findings", []))
    if not top_findings:
        pdf.paragraph("یافته باز و قابل اقدامی برای این دوره وجود ندارد.")
    for finding in top_findings:
        finding = dict(finding)
        meta = " | ".join(
            [
                f"اولویت: {_label(PRIORITY_LABELS, finding['priority_band'])}",
                f"وضعیت: {_label(WORKFLOW_LABELS, finding['workflow_status'])}",
                f"مبلغ اثر: {_irr(finding.get('affected_amount_irr'))}",
            ]
        )
        pdf.card(str(finding["title_fa"]), meta, str(finding["summary_fa"]))

    pdf.section("محرک‌های اصلی")
    drivers = list(payload.get("main_drivers", []))
    if not drivers:
        pdf.paragraph("محرک روندی قابل اتکایی در این snapshot ثبت نشده است.")
    for driver in drivers:
        driver = dict(driver)
        pdf.key_value(str(driver["title_fa"]), _irr(driver.get("affected_amount_irr")))

    coverage = dict(payload["data_coverage"])
    pdf.section("پوشش داده")
    pdf.key_value("امتیاز پوشش", f"{_fa_digits(coverage['overall_score'])} از ۱۰۰")
    for reason in coverage.get("limitations_fa", []):
        pdf.paragraph(f"• {reason}", size=8.8, indent=3 * mm)
    if not coverage.get("limitations_fa"):
        pdf.paragraph("محدودیت پوشش ثبت نشده است.")

    pdf.section("یادداشت‌های مشاور")
    report_note = payload.get("advisor_note")
    if isinstance(report_note, dict) and report_note.get("body"):
        pdf.card("یادداشت گزارش", "ثبت‌شده هنگام تولید snapshot", str(report_note["body"]))
    notes = list(payload.get("advisor_notes", []))
    for note in notes:
        note = dict(note)
        pdf.card("یادداشت یافته", _jalali(str(note["created_at"])), str(note["body"]))
    if not report_note and not notes:
        pdf.paragraph("یادداشتی برای این گزارش ثبت نشده است.")

    review = dict(payload["review_status"])
    pdf.section("وضعیت بررسی")
    pdf.key_value("تعداد کل یافته‌ها", _fa_digits(review["total"]))
    for key, value in dict(review["by_workflow"]).items():
        pdf.key_value(WORKFLOW_LABELS.get(str(key), str(key)), _fa_digits(value))

    pdf.new_page()
    pdf.section("ضمیمه - همه یافته‌ها")
    all_findings = list(payload.get("all_findings", []))
    if not all_findings:
        pdf.paragraph("یافته‌ای در این snapshot ثبت نشده است.")
    for finding in all_findings:
        finding = dict(finding)
        meta = " | ".join(
            [
                f"اولویت: {_label(PRIORITY_LABELS, finding['priority_band'])}",
                f"وضعیت: {_label(WORKFLOW_LABELS, finding['workflow_status'])}",
                f"امتیاز: {_fa_digits(finding['priority_score'])}",
            ]
        )
        pdf.card(str(finding["title_fa"]), meta, str(finding["summary_fa"]))
    pdf.finish()
    return buffer.getvalue()
