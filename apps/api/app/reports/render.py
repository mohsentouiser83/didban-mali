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

    def table(
        self,
        headers: list[str],
        rows: list[list[str]],
        col_widths: list[float],
        *,
        header_bg: Color | None = None,
        header_font: str = "IRANYekanX-Bold",
        header_size: float = 8.5,
        row_font: str = "IRANYekanX",
        row_size: float = 8.0,
        header_height: float = 7.5 * mm,
        row_height: float = 6.8 * mm,
    ) -> None:
        total_width = self.right - self.left
        scale = total_width / sum(col_widths)
        w = [cw * scale for cw in col_widths]
        total_height = header_height + len(rows) * row_height
        self._ensure(min(total_height + 4 * mm, 60 * mm))

        h_top = self.y
        self.canvas.setFillColor(header_bg or HexColor("#F2F4F7"))
        self.canvas.setStrokeColor(HexColor("#D0D5DD"))
        self.canvas.rect(
            self.left, h_top - header_height, total_width, header_height, fill=1, stroke=1
        )

        x_cursor = self.right
        for idx, (head_text, col_w) in enumerate(zip(headers, w, strict=True)):
            self._draw_rtl(
                head_text,
                x=x_cursor - 2.5 * mm,
                y=h_top - 5.2 * mm,
                font=header_font,
                size=header_size,
                color=HexColor("#344054"),
            )
            if idx > 0:
                self.canvas.setStrokeColor(HexColor("#D0D5DD"))
                self.canvas.line(x_cursor, h_top, x_cursor, h_top - header_height)
            x_cursor -= col_w

        self.y -= header_height

        for r_idx, row in enumerate(rows):
            if self.y - row_height < self.bottom:
                self.new_page()
            r_top = self.y
            bg = HexColor("#FFFFFF") if r_idx % 2 == 0 else HexColor("#F9FAFB")
            self.canvas.setFillColor(bg)
            self.canvas.setStrokeColor(HexColor("#E4E7EC"))
            self.canvas.rect(
                self.left, r_top - row_height, total_width, row_height, fill=1, stroke=1
            )

            x_cursor = self.right
            for c_idx, (val, col_w) in enumerate(zip(row, w, strict=True)):
                self._draw_rtl(
                    val,
                    x=x_cursor - 2.5 * mm,
                    y=r_top - 4.8 * mm,
                    font=row_font,
                    size=row_size,
                    color=HexColor("#1D2939"),
                )
                if c_idx > 0:
                    self.canvas.setStrokeColor(HexColor("#E4E7EC"))
                    self.canvas.line(x_cursor, r_top, x_cursor, r_top - row_height)
                x_cursor -= col_w

            self.y -= row_height

        self.y -= 4 * mm

    def alert_card(
        self,
        title: str,
        severity: str,
        summary: str,
        current_val: str | None,
        threshold_val: str | None,
        unit: str,
        suggested_action: str | None,
    ) -> None:
        is_crit = severity == "critical"
        border_color = HexColor("#FDA29B") if is_crit else HexColor("#FEDF89")
        bg_color = HexColor("#FEF3F2") if is_crit else HexColor("#FFFAEB")
        badge_text = "بحرانی" if is_crit else "هشدار"
        badge_color = HexColor("#B42318") if is_crit else HexColor("#B54708")

        summary_lines = self._wrap(summary, self.right - self.left - 10 * mm, "IRANYekanX", 8.8)
        action_lines = (
            self._wrap(
                f"اقدام پیشنهادی: {suggested_action}",
                self.right - self.left - 10 * mm,
                "IRANYekanX-Medium",
                8.5,
            )
            if suggested_action
            else []
        )

        height = (
            16 * mm
            + len(summary_lines) * 13
            + (len(action_lines) * 13 + 3 * mm if action_lines else 0)
            + (7 * mm if current_val and threshold_val else 0)
        )
        self._ensure(height + 4 * mm)
        top = self.y

        self.canvas.setFillColor(bg_color)
        self.canvas.setStrokeColor(border_color)
        self.canvas.roundRect(
            self.left, top - height, self.right - self.left, height, 2.5 * mm, fill=1, stroke=1
        )

        self._draw_rtl(
            f"[{badge_text}]  {title}",
            x=self.right - 5 * mm,
            y=top - 6 * mm,
            font="IRANYekanX-Bold",
            size=9.6,
            color=badge_color,
        )

        cursor_y = top - 12 * mm
        for line in summary_lines:
            self._draw_rtl(
                line, x=self.right - 5 * mm, y=cursor_y, size=8.8, color=HexColor("#344054")
            )
            cursor_y -= 13

        if current_val and threshold_val:
            comp_text = f"مقدار فعلی: {current_val} {unit}  |  آستانه مجاز: {threshold_val} {unit}"
            self._draw_rtl(
                comp_text,
                x=self.right - 5 * mm,
                y=cursor_y - 2 * mm,
                font="IRANYekanX-Medium",
                size=8.2,
                color=HexColor("#475467"),
            )
            cursor_y -= 7 * mm

        if action_lines:
            cursor_y -= 2 * mm
            for line in action_lines:
                self._draw_rtl(
                    line,
                    x=self.right - 5 * mm,
                    y=cursor_y,
                    font="IRANYekanX-Medium",
                    size=8.5,
                    color=badge_color,
                )
                cursor_y -= 13

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

    # Section: Early Warning Alerts (if present)
    alerts = list(payload.get("early_warning_alerts") or [])
    if alerts:
        pdf.section("هشدارهای زودهنگام و مخاطرات فوری")
        pdf.paragraph(
            "هشدارهای فعال زیر بر مبنای پایش خودکار شاخص‌های نقدینگی و اعتباری کشف شده‌اند:",
            size=9,
        )
        for al in alerts:
            al_dict = dict(al)
            c_val = al_dict.get("current_value")
            t_val = al_dict.get("threshold_value")
            pdf.alert_card(
                title=str(al_dict.get("title_fa") or ""),
                severity=str(al_dict.get("severity") or "warning"),
                summary=str(al_dict.get("summary_fa") or ""),
                current_val=_fa_digits(c_val) if c_val is not None else None,
                threshold_val=_fa_digits(t_val) if t_val is not None else None,
                unit=str(al_dict.get("metric_unit") or ""),
                suggested_action=al_dict.get("suggested_action_fa"),
            )

    pdf.section("مرور مالی")
    for metric in payload.get("financial_overview", []):
        metric = dict(metric)
        value = metric.get("value")
        formatted = _percent(value) if metric.get("unit") == "ratio" else _irr(value)
        if not metric.get("available"):
            formatted = f"ناموجود - {metric.get('unavailable_reason_fa') or 'داده کافی نیست'}"
        pdf.key_value(str(metric["label_fa"]), formatted)

    # Section: Receivables Intelligence (if present)
    rec = payload.get("receivables_intelligence")
    if rec and isinstance(rec, dict):
        pdf.section("هوشمندی مطالبات و تحلیل سنی وصول")
        pdf.key_value("کل مطالبات تجاری", _irr(rec.get("total_receivables_irr")))
        pdf.key_value("نسبت مطالبات معوق", _percent(rec.get("overdue_ratio")))
        pdf.key_value("دوره وصول مطالبات (DSO)", f"{_fa_digits(rec.get('dso_days') or 0)} روز")

        buckets = list(rec.get("buckets") or [])
        if buckets:
            b_headers = ["بازه سنی مطالبات", "مبلغ (ریال)", "سهم از کل", "تعداد فاکتور"]
            b_rows = []
            for b in buckets:
                b_dict = dict(b)
                b_rows.append(
                    [
                        str(b_dict.get("label_fa") or ""),
                        _irr(b_dict.get("amount_irr")),
                        _percent(float(b_dict.get("share_percentage") or 0) / 100),
                        f"{_fa_digits(b_dict.get('invoice_count') or 0)} فاکتور",
                    ]
                )
            pdf.table(b_headers, b_rows, [45 * mm, 55 * mm, 35 * mm, 35 * mm])

    # Section: Payables & Working Capital (if present)
    pay = payload.get("payables_intelligence")
    if pay and isinstance(pay, dict):
        pdf.section("بستانکاران، دوره پرداخت و سرمایه در گردش")
        pdf.key_value("کل بدهی به بستانکاران", _irr(pay.get("total_payables_irr")))
        pdf.key_value("دوره پرداخت بدهی‌ها (DPO)", f"{_fa_digits(pay.get('dpo_days') or 0)} روز")
        pdf.key_value("چرخه تبدیل وجه نقد (CCC)", f"{_fa_digits(pay.get('ccc_days') or 0)} روز")
        pdf.key_value("نسبت تعهدات معوق", _percent(pay.get("overdue_ratio")))

        p_buckets = list(pay.get("buckets") or [])
        if p_buckets:
            p_headers = ["بازه سنی پرداختنی‌ها", "مبلغ (ریال)", "سهم از کل", "تعداد تامین‌کننده"]
            p_rows = []
            for pb in p_buckets:
                pb_dict = dict(pb)
                p_rows.append(
                    [
                        str(pb_dict.get("label_fa") or ""),
                        _irr(pb_dict.get("amount_irr")),
                        _percent(float(pb_dict.get("share_percentage") or 0) / 100),
                        f"{_fa_digits(pb_dict.get('vendor_count') or 0)} تامین‌کننده",
                    ]
                )
            pdf.table(p_headers, p_rows, [45 * mm, 55 * mm, 35 * mm, 35 * mm])

    # Section: Cash Runway & 13-Week Forecast (if present)
    cash = payload.get("cashflow_runway")
    if cash and isinstance(cash, dict):
        pdf.section("تاب‌آوری نقدینگی و پیش‌بینی ۱۳ هفته‌ای خزانه")
        c_sum = dict(cash.get("summary") or {})
        pdf.key_value("موجودی نقد و بانک فعلی", _irr(c_sum.get("current_cash_irr")))
        pdf.key_value("نرخ سوخت ماهانه نقد (Burn Rate)", _irr(c_sum.get("monthly_burn_rate_irr")))
        pdf.key_value(
            "روزهای تاب‌آوری نقد (Runway)", f"{_fa_digits(c_sum.get('runway_days') or 0)} روز"
        )
        pdf.key_value("بافر امنیتی نقدینگی", _irr(c_sum.get("safety_buffer_irr")))

        weeks = list(cash.get("weeks") or [])
        if weeks:
            pdf.paragraph("مسیر جریان نقدینگی پیش‌بینی‌شده برای ۱۳ هفته آینده:")
            w_headers = [
                "هفته",
                "تاریخ شروع",
                "پیش‌بینی ورودی",
                "پیش‌بینی خروجی",
                "مانده پایان هفته",
            ]
            w_rows = []
            for w in weeks[:13]:
                w_dict = dict(w)
                w_rows.append(
                    [
                        f"هفته {_fa_digits(w_dict.get('week_number'))}",
                        _jalali(str(w_dict.get("start_date"))),
                        _irr(w_dict.get("projected_inflows_irr")),
                        _irr(w_dict.get("projected_outflows_irr")),
                        _irr(w_dict.get("projected_closing_cash_irr")),
                    ]
                )
            pdf.table(w_headers, w_rows, [25 * mm, 32 * mm, 38 * mm, 38 * mm, 37 * mm])

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
