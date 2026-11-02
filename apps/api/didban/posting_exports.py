"""Exports exclusively from immutable native-book report runs."""

import io

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer

from .exports import (
    FONT_MEDIUM,
    MUTED,
    RTLText,
    _records_sheet,
    _sheet,
    _table,
    display_date,
    localized,
    register_fonts,
)


def pdf_run(run: dict) -> bytes:
    register_fonts()
    snapshot = run["snapshot"]
    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=snapshot["title"],
        lang="fa-IR",
    )
    story = [
        RTLText(snapshot["title"], 18, FONT_MEDIUM),
        Spacer(1, 4 * mm),
        RTLText(snapshot["company_name"], 12, FONT_MEDIUM),
        RTLText("مبالغ: ریال؛ فقط گردش دورهٔ دفتر اصلی دیدبان", 9, color=MUTED),
        RTLText("شامل دفتر واردشده یا ماندهٔ افتتاحیهٔ حدسی نیست؛ تأیید گزارش ثبت نشده است.", 9, color=MUTED),
        RTLText("تا تاریخ: " + display_date(snapshot["as_of"]), 9),
        Spacer(1, 5 * mm),
    ]
    columns = [
        ("balance", "مانده گردش"),
        ("credit", "بستانکار"),
        ("debit", "بدهکار"),
        ("party_id", "طرف حساب"),
        ("name", "حساب"),
        ("code", "کد"),
    ]
    rows = [[RTLText(label, 9, FONT_MEDIUM) for _key, label in columns]]
    rows.extend(
        [
            [
                RTLText(localized(row.get(key), amount=key in ("balance", "debit", "credit")), 8)
                for key, _label in columns
            ]
            for row in snapshot["items"]
        ]
    )
    if snapshot["items"]:
        weights = [2, 2, 2, 1, 1, 0.8]
        story.append(_table(rows, [(A4[0] - 40 * mm) * weight / sum(weights) for weight in weights]))
    else:
        story.append(RTLText("سند نهایی در این دوره ثبت نشده است.", 10))
    story.extend(
        [
            Spacer(1, 5 * mm),
            RTLText("جمع بدهکار: " + localized(snapshot["total_debit"], amount=True), 10),
            RTLText("جمع بستانکار: " + localized(snapshot["total_credit"], amount=True), 10),
            RTLText("شناسه نسخه ثابت: " + run["id"], 8, color=MUTED),
        ]
    )
    doc.build(story)
    return out.getvalue()


def xlsx_run(run: dict) -> bytes:
    snapshot = run["snapshot"]
    book = Workbook()
    book.remove(book.active)
    overflow = []
    _records_sheet(
        book,
        "مشخصات",
        {
            "run_id": run["id"],
            "digest": run["digest"],
            "company": snapshot["company_name"],
            "basis": "native_book",
            "scope": "period_movements",
            "period_id": snapshot["period_id"],
            "as_of": snapshot["as_of"],
            "includes_imported_ledger": False,
            "opening_balance_inferred": False,
            "report_approved": False,
            "total_debit": snapshot["total_debit"],
            "total_credit": snapshot["total_credit"],
        },
        overflow,
    )
    _records_sheet(book, "گردش دفتر اصلی", snapshot["items"], overflow)
    _records_sheet(book, "اسناد مبنا", snapshot["journal_ids"], overflow)
    if overflow:
        _sheet(
            book,
            "ادامه متن",
            ["reference", "sheet", "cell", "part", "parts", "encoding", "text"],
            overflow,
            overflow=[],
        )
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()
