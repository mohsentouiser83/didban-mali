"""IRANYekanX embedded, shaped Persian managerial PDF layout."""

from __future__ import annotations
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
from ..domain.reports import METRIC_LABELS, REASON_LABELS, SOURCE_LABELS, display_amount


def pdf_bytes(content: dict, font_root: Path) -> bytes:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )
    import arabic_reshaper
    import jdatetime
    from datetime import date
    from bidi.algorithm import get_display

    regular = font_root / "IRANYekanX-Regular.ttf"
    medium = font_root / "IRANYekanX-Medium.ttf"
    if not regular.is_file() or not medium.is_file():
        raise RuntimeError("report_font_missing")
    for name, path in [("ReportRegular", regular), ("ReportMedium", medium)]:
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(path)))
    digits = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

    def text(value):
        return get_display(arabic_reshaper.reshape(str(value).translate(digits)))

    body = ParagraphStyle(
        "fa",
        fontName="ReportRegular",
        fontSize=10,
        leading=18,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#20243F"),
    )
    heading = ParagraphStyle(
        "heading",
        parent=body,
        fontName="ReportMedium",
        fontSize=18,
        leading=27,
        spaceAfter=10,
    )

    def p(value, style=body):
        return Paragraph(escape(text(value)), style)

    technical = ParagraphStyle(
        "technical", parent=body, fontSize=8, alignment=TA_LEFT, leading=14
    )

    def identifier(value):
        return Paragraph(escape(str(value)), technical)

    def money(value):
        value = display_amount(value, content["manifest"].get("display_unit", "IRR"))
        sign = "−" if value.startswith("-") else ""
        whole, _, fraction = value.lstrip("-").partition(".")
        groups = []
        while whole:
            groups.insert(0, whole[-3:])
            whole = whole[:-3]
        return sign + "٬".join(groups) + ("٫" + fraction if fraction else "")

    out = BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title="گزارش مدیریتی دیدبان مالی",
        author="دیدبان مالی",
    )
    m = content["manifest"]
    report = content.get("_report", {})
    story = [
        p("گزارش مدیریتی", heading),
        p(m["company_name"]),
        p(
            m["period_name"]
            + " | تا "
            + jdatetime.date.fromgregorian(
                date=date.fromisoformat(m["as_of_date"])
            ).strftime("%Y/%m/%d")
        ),
        p("تولیدشده سامانه"),
        Spacer(1, 8 * mm),
    ]
    unit = "تومان" if m.get("display_unit") == "IRT" else "ریال"
    table = [[p("علت / وضعیت"), p("مقدار · " + unit), p("شاخص")]]
    for metric in content["metrics"]:
        state = {
            "available": "آماده",
            "limited": "محدود",
            "unavailable": "ناموجود",
            "estimated": "برآوردی",
        }[metric["status"]]
        reason = "؛ ".join(REASON_LABELS.get(r, r) for r in metric["reason_codes"])
        value = "ناموجود" if metric["value"] is None else money(metric["value"])
        table.append(
            [
                p(state + (" | " + reason if reason else "")),
                p(
                    value,
                    ParagraphStyle(
                        "amount",
                        parent=body,
                        fontSize=min(
                            10,
                            155
                            / max(
                                1,
                                pdfmetrics.stringWidth(
                                    text(value), "ReportRegular", 10
                                ),
                            )
                            * 10,
                        ),
                    ),
                ),
                p(METRIC_LABELS.get(metric["metric_key"], metric["metric_key"])),
            ]
        )
    grid = Table(
        table, colWidths=[60 * mm, 60 * mm, 50 * mm], repeatRows=1, hAlign="RIGHT"
    )
    grid.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEDFF")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E9ECF5")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E9ECF5")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story += [grid, Spacer(1, 7 * mm), p("مقایسه با دوره قبل", heading)]
    for metric in content["metrics"]:
        if metric["metric_key"] not in ("revenue", "expense", "net_profit"):
            continue
        comparison = metric.get("comparison") or {}
        delta = comparison.get("delta")
        change = "داده کافی نیست" if delta is None else money(delta) + " " + unit
        story.append(p(METRIC_LABELS[metric["metric_key"]] + ": " + change))
        for code in comparison.get("reason_codes", []):
            story.append(p(REASON_LABELS.get(code, code)))
    story += [Spacer(1, 7 * mm), p("تطبیق‌ها و پیش‌بینی", heading)]
    for run in content["reconciliation_runs"]:
        label = {
            "bank_ledger": "بانک و دفتر",
            "moadian_sales": "فروش مؤدیان",
            "moadian_purchases": "خرید مؤدیان",
        }.get(run["kind"], run["kind"])
        candidates = [c for c in content["candidates"] if c["run_id"] == run["id"]]
        missing = "؛ ".join(
            SOURCE_LABELS.get(v, v) for v in run.get("missing_source_kinds", [])
        )
        story.append(
            p(
                label
                + " | "
                + str(len(candidates))
                + " مورد"
                + (" | منبع کافی نیست: " + missing if missing else "")
            )
        )
    forecast = (content.get("forecast") or {}).get("content") or {}
    if forecast.get("days"):
        ending = forecast["days"][-1]["closing"]
        story.append(
            p(
                "مانده برآوردی پایان ۳۰ روز: "
                + ("ناموجود" if ending is None else money(ending) + " " + unit)
            )
        )
        for assumption in forecast.get("assumptions", []):
            story.append(p(assumption))
    else:
        story.append(p("پیش‌بینی آماده نیست."))
    story += [
        Spacer(1, 6 * mm),
        p(
            "مبالغ ناموجود صفر محسوب نشده‌اند. جزئیات و شواهد در خروجی Excel همان نسخه موجود است."
        ),
        p("نسخه گزارش: " + str(report.get("revision_number", "نمونه"))),
        p("شناسه گزارش"),
        identifier(report.get("id", "sample")),
        p("هش گزارش"),
        identifier(report.get("content_hash", "sample")),
        p("شناسه نسخه داده"),
        identifier(m["id"]),
        p("هش نسخه داده"),
        identifier(m["manifest_hash"]),
    ]

    def footer(canvas, document):
        canvas.setFont("ReportRegular", 8)
        canvas.drawRightString(
            A4[0] - 20 * mm,
            13 * mm,
            text("تولیدشده سامانه | صفحه " + str(document.page)),
        )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()
