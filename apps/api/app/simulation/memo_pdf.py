from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
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

from app.simulation.schemas import (
    DecisionMemoExportRequest,
    SimulationParametersRequest,
    SimulationResultResponse,
)

FONT_DIR = Path(__file__).resolve().parent.parent / "reports" / "assets" / "fonts"
FONT_FILES = {
    "IRANYekanX": "IRANYekanX-Regular.ttf",
    "IRANYekanX-Medium": "IRANYekanX-Medium.ttf",
    "IRANYekanX-Bold": "IRANYekanX-Bold.ttf",
    "IRANYekanX-ExtraBold": "IRANYekanX-ExtraBold.ttf",
}
PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
DEFAULT_TEXT_COLOR = HexColor("#172033")


def _register_fonts() -> None:
    for name, filename in FONT_FILES.items():
        if name not in pdfmetrics.getRegisteredFontNames():
            path = FONT_DIR / filename
            if not path.is_file():
                raise FileNotFoundError(f"Required font {name} missing at {path}")
            pdfmetrics.registerFont(TTFont(name, str(path)))


def _visual(text: str) -> str:
    return str(get_display(arabic_reshaper.reshape(text), base_dir="R"))


def _fa(val: object) -> str:
    return str(val).translate(PERSIAN_DIGITS)


def _irr(val: Decimal | int | float | str | None) -> str:
    if val is None:
        return "۰ ریال"
    num = int(Decimal(str(val)))
    return f"{_fa(f'{num:,}')} ریال"


def _today_jalali() -> str:
    now = datetime.now(UTC)
    jd = jdatetime.date.fromgregorian(date=now.date())
    return _fa(jd.strftime("%Y/%m/%d"))


class DecisionMemoPdf:
    def __init__(self, buffer: BytesIO, *, company_name: str, memo_subject: str) -> None:
        self.canvas = Canvas(buffer, pagesize=A4, pageCompression=1, pdfVersion=(1, 7))
        self.width, self.height = A4
        self.left = 18 * mm
        self.right = self.width - 18 * mm
        self.top = self.height - 18 * mm
        self.bottom = 18 * mm
        self.y = self.top
        self.page = 0
        self.company_name = company_name
        self.memo_subject = memo_subject
        self.canvas.setTitle("یادداشت تصمیم‌گیری مالی - دیدبان مالی")
        self.canvas.setAuthor("دیدبان مالی")
        self.new_page()

    def _draw_rtl(
        self,
        text: str,
        *,
        x: float | None = None,
        y: float | None = None,
        font: str = "IRANYekanX",
        size: float = 9.0,
        color: Color = DEFAULT_TEXT_COLOR,
    ) -> None:
        self.canvas.setFont(font, size)
        self.canvas.setFillColor(color)
        self.canvas.drawRightString(
            x if x is not None else self.right,
            y if y is not None else self.y,
            _visual(text),
        )

    def _wrap(self, text: str, max_width: float, font: str, size: float) -> list[str]:
        lines: list[str] = []
        for paragraph in str(text).splitlines() or [""]:
            words = paragraph.split()
            if not words:
                lines.append("")
                continue
            curr = words[0]
            for w in words[1:]:
                cand = f"{curr} {w}"
                if float(pdfmetrics.stringWidth(_visual(cand), font, size)) <= max_width:
                    curr = cand
                else:
                    lines.append(curr)
                    curr = w
            lines.append(curr)
        return lines

    def _ensure(self, height: float) -> None:
        if self.y - height < self.bottom:
            self.new_page()

    def _footer(self) -> None:
        if self.page == 0:
            return
        fy = 10 * mm
        self.canvas.setStrokeColor(HexColor("#D8DEE9"))
        self.canvas.line(self.left, fy + 4 * mm, self.right, fy + 4 * mm)
        self._draw_rtl(
            f"صفحه {_fa(self.page)}",
            x=self.right,
            y=fy,
            size=7.5,
            color=HexColor("#667085"),
        )
        self._draw_rtl(
            "دیدبان مالی - سند محرمانه تصمیم‌گیری هیئت‌مدیره",
            x=self.left + 50 * mm,
            y=fy,
            size=7.5,
            color=HexColor("#667085"),
        )

    def new_page(self) -> None:
        if self.page:
            self._footer()
            self.canvas.showPage()
        self.page += 1
        self.y = self.top

        # Top decorative line
        self.canvas.setFillColor(HexColor("#0F172A"))
        self.canvas.rect(
            self.left, self.y - 2 * mm, self.right - self.left, 2 * mm, fill=1, stroke=0
        )
        self.y -= 7 * mm

        # Running header on page 2+
        if self.page > 1:
            self._draw_rtl(
                f"{self.company_name} | {self.memo_subject}",
                y=self.y,
                font="IRANYekanX-Medium",
                size=8,
                color=HexColor("#64748B"),
            )
            self.y -= 7 * mm

    def memo_header(self, req: DecisionMemoExportRequest) -> None:
        total_w = self.right - self.left
        h = 24 * mm
        self.canvas.setFillColor(HexColor("#F8FAFC"))
        self.canvas.setStrokeColor(HexColor("#CBD5E1"))
        self.canvas.roundRect(self.left, self.y - h, total_w, h, 3 * mm, fill=1, stroke=1)

        # Title
        self._draw_rtl(
            "یادداشت تصمیم‌گیری مالی (CFO Decision Memorandum)",
            x=self.right - 5 * mm,
            y=self.y - 7 * mm,
            font="IRANYekanX-ExtraBold",
            size=13,
            color=HexColor("#0F172A"),
        )

        # Subhead metadata
        col_w = total_w / 2
        # Right column
        self._draw_rtl(
            f"شرکت: {self.company_name}",
            x=self.right - 5 * mm,
            y=self.y - 14 * mm,
            font="IRANYekanX-Bold",
            size=8.5,
            color=HexColor("#334155"),
        )
        self._draw_rtl(
            f"موضوع: {req.memo_subject}",
            x=self.right - 5 * mm,
            y=self.y - 19 * mm,
            size=8,
            color=HexColor("#475569"),
        )

        # Left column
        left_anchor = self.left + col_w - 5 * mm
        self._draw_rtl(
            f"مخاطب: {req.prepared_for}",
            x=left_anchor,
            y=self.y - 14 * mm,
            font="IRANYekanX-Medium",
            size=8.5,
            color=HexColor("#334155"),
        )
        self._draw_rtl(
            f"تاریخ گزارش: {_today_jalali()}",
            x=left_anchor,
            y=self.y - 19 * mm,
            size=8,
            color=HexColor("#64748B"),
        )

        self.y -= h + 6 * mm

    def section_heading(self, title: str) -> None:
        self._ensure(16 * mm)
        self.canvas.setFillColor(HexColor("#E2E8F0"))
        self.canvas.roundRect(
            self.left, self.y - 7 * mm, self.right - self.left, 7 * mm, 1.5 * mm, fill=1, stroke=0
        )
        self._draw_rtl(
            title,
            x=self.right - 3 * mm,
            y=self.y - 5 * mm,
            font="IRANYekanX-Bold",
            size=9.5,
            color=HexColor("#0F172A"),
        )
        self.y -= 11 * mm

    def verdict_box(self, verdict: str, warnings: list[str], is_positive: bool) -> None:
        w_lines = []
        for w in warnings:
            w_lines.extend(
                self._wrap(f"• {w}", self.right - self.left - 10 * mm, "IRANYekanX-Medium", 8)
            )

        v_lines = self._wrap(verdict, self.right - self.left - 10 * mm, "IRANYekanX", 8.8)
        tot_h = (len(v_lines) * 4.5 * mm) + (len(w_lines) * 4.2 * mm) + 14 * mm
        self._ensure(tot_h)

        bg = HexColor("#F0FDF4") if is_positive else HexColor("#FEF2F2")
        border = HexColor("#86EFAC") if is_positive else HexColor("#FECACA")
        title_col = HexColor("#166534") if is_positive else HexColor("#991B1B")

        self.canvas.setFillColor(bg)
        self.canvas.setStrokeColor(border)
        self.canvas.roundRect(
            self.left, self.y - tot_h, self.right - self.left, tot_h, 3 * mm, fill=1, stroke=1
        )

        # Title
        title_text = "خلاصه ارزیابی و توصیه خزانه‌داری:"
        self._draw_rtl(
            title_text,
            x=self.right - 5 * mm,
            y=self.y - 6 * mm,
            font="IRANYekanX-Bold",
            size=9.5,
            color=title_col,
        )

        cur_y = self.y - 12 * mm
        for line in v_lines:
            self._draw_rtl(
                line, x=self.right - 5 * mm, y=cur_y, size=8.8, color=HexColor("#1E293B")
            )
            cur_y -= 4.5 * mm

        for line in w_lines:
            self._draw_rtl(
                line,
                x=self.right - 5 * mm,
                y=cur_y,
                font="IRANYekanX-Medium",
                size=8.2,
                color=HexColor("#B91C1C"),
            )
            cur_y -= 4.2 * mm

        self.y -= tot_h + 5 * mm

    def comparative_table(self, rows: list[list[str]]) -> None:
        headers = [
            "شاخص کلیدی مالی",
            "وضعیت مبنا (Baseline)",
            "سناریوی پیشنهادی",
            "انحراف (Delta)",
            "ارزیابی استراتژیک",
        ]
        col_widths = [45 * mm, 32 * mm, 32 * mm, 28 * mm, 37 * mm]
        total_w = sum(col_widths)
        scale = (self.right - self.left) / total_w
        widths = [w * scale for w in col_widths]

        header_h = 7.5 * mm
        row_h = 6.8 * mm
        needed = header_h + len(rows) * row_h + 6 * mm
        self._ensure(needed)

        # Draw Header
        self.canvas.setFillColor(HexColor("#1E293B"))
        self.canvas.rect(
            self.left, self.y - header_h, self.right - self.left, header_h, fill=1, stroke=0
        )

        cx = self.right
        for h_text, w in zip(headers, widths, strict=True):
            self._draw_rtl(
                h_text,
                x=cx - 2 * mm,
                y=self.y - 5 * mm,
                font="IRANYekanX-Bold",
                size=8.2,
                color=white,
            )
            cx -= w

        self.y -= header_h

        # Draw Rows
        for r_idx, r in enumerate(rows):
            bg = HexColor("#F8FAFC") if r_idx % 2 == 1 else white
            self.canvas.setFillColor(bg)
            self.canvas.setStrokeColor(HexColor("#E2E8F0"))
            self.canvas.rect(
                self.left, self.y - row_h, self.right - self.left, row_h, fill=1, stroke=1
            )

            cx = self.right
            for c_idx, (cell, w) in enumerate(zip(r, widths, strict=True)):
                font_name = "IRANYekanX-Bold" if c_idx == 0 else "IRANYekanX"
                color = HexColor("#0F172A")
                if c_idx == 3 and ("+" in cell or "-" in cell):
                    color = (
                        HexColor("#166534")
                        if ("+" in cell and "روز" in cell) or ("-" in cell and "CCC" in r[0])
                        else HexColor("#991B1B")
                    )

                self._draw_rtl(
                    cell,
                    x=cx - 2 * mm,
                    y=self.y - 4.8 * mm,
                    font=font_name,
                    size=7.8,
                    color=color,
                )
                cx -= w
            self.y -= row_h

        self.y -= 5 * mm

    def trajectory_table(self, weeks: list[dict[str, Any]]) -> None:
        headers = [
            "هفته",
            "تاریخ",
            "مانده نقد مبنا",
            "ورودی شبیه‌سازی",
            "خروجی شبیه‌سازی",
            "مانده شبیه‌سازی",
            "وضعیت",
        ]
        col_widths = [16 * mm, 26 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm, 20 * mm]
        scale = (self.right - self.left) / sum(col_widths)
        widths = [w * scale for w in col_widths]

        header_h = 7.0 * mm
        row_h = 6.2 * mm
        needed = header_h + min(len(weeks), 6) * row_h + 4 * mm
        self._ensure(needed)

        self.canvas.setFillColor(HexColor("#F1F5F9"))
        self.canvas.setStrokeColor(HexColor("#CBD5E1"))
        self.canvas.rect(
            self.left, self.y - header_h, self.right - self.left, header_h, fill=1, stroke=1
        )

        cx = self.right
        for h_text, w in zip(headers, widths, strict=True):
            self._draw_rtl(
                h_text,
                x=cx - 2 * mm,
                y=self.y - 4.8 * mm,
                font="IRANYekanX-Bold",
                size=7.8,
                color=HexColor("#334155"),
            )
            cx -= w

        self.y -= header_h

        for r_idx, w_data in enumerate(weeks):
            self._ensure(row_h + 2 * mm)
            bg = HexColor("#F8FAFC") if r_idx % 2 == 1 else white
            self.canvas.setFillColor(bg)
            self.canvas.setStrokeColor(HexColor("#E2E8F0"))
            self.canvas.rect(
                self.left, self.y - row_h, self.right - self.left, row_h, fill=1, stroke=1
            )

            cx = self.right
            cells = [
                f"هفته {_fa(w_data['week'])}",
                _fa(w_data["date"]),
                _irr(w_data["base_close"]),
                _irr(w_data["sim_in"]),
                _irr(w_data["sim_out"]),
                _irr(w_data["sim_close"]),
                "کسری نقد" if w_data.get("is_deficit") else "امن",
            ]

            for c_idx, (cell, w) in enumerate(zip(cells, widths, strict=True)):
                color = (
                    HexColor("#991B1B")
                    if (c_idx == 6 and cell == "کسری نقد")
                    else HexColor("#1E293B")
                )
                self._draw_rtl(
                    cell,
                    x=cx - 2 * mm,
                    y=self.y - 4.4 * mm,
                    font="IRANYekanX-Medium" if c_idx == 0 else "IRANYekanX",
                    size=7.5,
                    color=color,
                )
                cx -= w
            self.y -= row_h

        self.y -= 5 * mm

    def sign_off_block(self, advisor_notes: str | None) -> None:
        h = 36 * mm
        self._ensure(h)

        if advisor_notes:
            self._draw_rtl(
                f"توضیحات و ملاحظات تکمیلی: {advisor_notes}",
                font="IRANYekanX",
                size=8.2,
                color=HexColor("#475569"),
            )
            self.y -= 8 * mm

        box_w = (self.right - self.left - 10 * mm) / 3
        titles = ["امضای مدیر مالی و تهیه‌کننده", "تایید مدیرعامل", "مصوبه هیئت مدیره"]

        cur_x = self.right
        for t in titles:
            self.canvas.setFillColor(HexColor("#F8FAFC"))
            self.canvas.setStrokeColor(HexColor("#CBD5E1"))
            self.canvas.roundRect(
                cur_x - box_w, self.y - 25 * mm, box_w, 25 * mm, 2 * mm, fill=1, stroke=1
            )
            self._draw_rtl(
                t,
                x=cur_x - 3 * mm,
                y=self.y - 6 * mm,
                font="IRANYekanX-Bold",
                size=8.2,
                color=HexColor("#334155"),
            )
            self._draw_rtl(
                "امضا / تاریخ:",
                x=cur_x - 3 * mm,
                y=self.y - 21 * mm,
                size=7.5,
                color=HexColor("#94A3B8"),
            )
            cur_x -= box_w + 5 * mm

        self.y -= 30 * mm

    def save(self) -> None:
        self._footer()
        self.canvas.save()


def render_decision_memo_pdf(
    *,
    company_name: str,
    req: DecisionMemoExportRequest,
    params: SimulationParametersRequest,
    res: SimulationResultResponse,
) -> bytes:
    _register_fonts()
    buf = BytesIO()
    doc = DecisionMemoPdf(buf, company_name=company_name, memo_subject=req.memo_subject)

    # 1. Official Memo Header
    doc.memo_header(req)

    # 2. Executive Verdict Box
    is_positive = Decimal(str(res.runway_days_delta.delta_value)) >= 0
    doc.verdict_box(res.executive_verdict_fa, res.risk_warnings_fa, is_positive)

    # 3. Decision Levers Applied Summary
    doc.section_heading("۱. مفروضات و اهرم‌های تصمیم‌گیری سناریو")
    levers_text = (
        f"تغییر دوره وصول مطالبات (DSO): {_fa(params.dso_change_days)} روز | "
        f"تخفیف نقدی تسویه زودرس: {_fa(params.early_settlement_discount_pct)}٪ "
        f"(پذیرش: {_fa(params.discount_adoption_rate_pct)}٪) | "
        f"استخدام جدید: {_fa(params.new_hires_count)} نفر | "
        f"تغییر مهلت پرداخت تامین‌کنندگان (DPO): {_fa(params.dpo_change_days)} روز | "
        f"سوخت فرضی طلب: {_fa(params.shock_default_pct)}٪"
    )
    doc._draw_rtl(levers_text, size=8.2, color=HexColor("#334155"))
    doc.y -= 6 * mm

    # 4. Comparative Matrix Table
    doc.section_heading("۲. ماتریس اثرات مالی تصمیم بر تاب‌آوری و سودآوری")
    diff_runway = int(Decimal(str(res.runway_days_delta.delta_value)))
    diff_burn = Decimal(str(res.monthly_burn_rate_delta.delta_value))
    diff_ccc = int(Decimal(str(res.cash_conversion_cycle_delta.delta_value)))

    rows = [
        [
            "تاب‌آوری نقدینگی (Runway)",
            f"{_fa(int(Decimal(str(res.runway_days_delta.baseline_value))))} روز",
            f"{_fa(int(Decimal(str(res.runway_days_delta.simulated_value))))} روز",
            f"{'+' if diff_runway >= 0 else ''}{_fa(diff_runway)} روز",
            "بهبود بقای نقد" if diff_runway >= 0 else "افت ذخیره نقد",
        ],
        [
            "نرخ سوخت ماهانه (Burn Rate)",
            _irr(res.monthly_burn_rate_delta.baseline_value),
            _irr(res.monthly_burn_rate_delta.simulated_value),
            f"{'+' if diff_burn >= 0 else ''}{_irr(diff_burn)}",
            "کنترل هزینه‌ها" if diff_burn <= 0 else "افزایش تعهدات ماهانه",
        ],
        [
            "چرخه تبدیل نقد (CCC)",
            f"{_fa(int(Decimal(str(res.cash_conversion_cycle_delta.baseline_value))))} روز",
            f"{_fa(int(Decimal(str(res.cash_conversion_cycle_delta.simulated_value))))} روز",
            f"{'+' if diff_ccc >= 0 else ''}{_fa(diff_ccc)} روز",
            "کاهش خواب سرمایه" if diff_ccc <= 0 else "افزایش حبس وجه نقد",
        ],
        [
            "نقدینگی آزادشده خزانه",
            "۰ ریال",
            _irr(res.liquidity_released_irr),
            _irr(res.liquidity_released_irr),
            "تزریق مستقیم به نقدینگی",
        ],
        [
            "اثر سالانه بر سود خالص",
            "مبنا",
            _irr(res.net_annual_profit_impact_irr),
            _irr(res.net_annual_profit_impact_irr),
            "حفظ سودآوری"
            if res.net_annual_profit_impact_irr >= Decimal(0)
            else "هزینه تسریع/توسعه",
        ],
    ]
    doc.comparative_table(rows)

    # 5. 13-Week Trajectory Highlights (Week 1, 4, 8, 13)
    doc.section_heading("۳. خلاصه ایستگاه‌های زمانی جریان نقد خزانه (۱۳ هفته)")
    sample_weeks = [w for w in res.weeks if w.week_number in [1, 4, 8, 13]] or res.weeks[:4]

    w_rows = [
        {
            "week": w.week_number,
            "date": f"{w.start_date} ~ {w.end_date}",
            "base_close": w.baseline_closing_cash_irr,
            "sim_in": w.simulated_inflows_irr,
            "sim_out": w.simulated_outflows_irr,
            "sim_close": w.simulated_closing_cash_irr,
            "is_deficit": w.is_simulated_deficit,
        }
        for w in sample_weeks
    ]
    doc.trajectory_table(w_rows)

    # 6. Sign-off Block
    doc.section_heading("۴. فرآیند تصمیم‌گیری و اخذ مصوبه")
    doc.sign_off_block(req.advisor_notes)

    doc.save()
    return buf.getvalue()
