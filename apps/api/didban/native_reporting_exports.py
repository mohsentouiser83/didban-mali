"""Persian statement exports read only the immutable native snapshot."""

import io
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

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
from .native_reporting_reasons import REASONS


def pdf_run(run: dict) -> bytes:
    register_fonts()
    snapshot = run["snapshot"]
    approvals = run.get("approvals", [])
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
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
        RTLText(
            "دوره: "
            + display_date(snapshot["period"]["start"])
            + " تا "
            + display_date(snapshot["period"]["end"]),
            9,
        ),
        RTLText("تا تاریخ: " + display_date(snapshot["as_of"]), 9),
        RTLText("مبالغ: ریال؛ فقط اسناد نهایی دفتر اصلی دیدبان", 9, color=MUTED),
        RTLText(
            "مالیات قانونی محاسبه نشده است."
            if approvals
            else "مالیات قانونی محاسبه نشده و تأیید گزارش ثبت نشده است.",
            9,
            color=MUTED,
        ),
        Spacer(1, 5 * mm),
    ]
    width = A4[0] - 40 * mm
    rows = [
        [RTLText("محدودیت", 9, FONT_MEDIUM), RTLText("مبلغ", 9, FONT_MEDIUM), RTLText("شاخص", 9, FONT_MEDIUM)]
    ]
    for metric in snapshot["metrics"]:
        reason = "؛ ".join(REASONS.get(code, "اطلاعات مبنا کامل نیست.") for code in metric["reason_codes"])
        rows.append(
            [
                RTLText(reason or "-", 8),
                RTLText(localized(metric["value"], amount=True), 8),
                RTLText(metric["label"], 9),
            ]
        )
    story.append(_table(rows, [width * 0.38, width * 0.29, width * 0.33]))
    story.extend(
        [Spacer(1, 5 * mm), RTLText("گردش حساب‌ها؛ ماندهٔ گردش جای ماندهٔ تاریخی نیست.", 10, FONT_MEDIUM)]
    )
    for approval in approvals:
        stamp = approval["created_at"]
        if not isinstance(stamp, datetime):
            stamp = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        local = stamp.astimezone(ZoneInfo("Asia/Tehran"))
        source = (
            "مدیر مالی"
            if approval["permission_provenance"]["source"] == "role:finance_manager"
            else "مجوز صریح تأیید گزارش"
        )
        story.append(
            RTLText(
                f"تأیید: {approval['actor_name']}؛ {display_date(local)} ساعت {localized(local.strftime('%H:%M'))} تهران؛ {source}",
                9,
            )
        )
    balance_rows = [
        [
            RTLText(label, 9, FONT_MEDIUM)
            for label in ("مانده گردش", "بستانکار", "بدهکار", "طرف حساب", "حساب", "کد")
        ]
    ]
    for item in snapshot["items"]:
        balance_rows.append(
            [
                RTLText(localized(item.get(key), amount=key in ("period_movement", "credit", "debit")), 8)
                for key in ("period_movement", "credit", "debit", "party_id", "name", "code")
            ]
        )
    if snapshot["items"]:
        weights = [2, 2, 2, 1, 1, 0.8]
        story.append(_table(balance_rows, [width * weight / sum(weights) for weight in weights]))
    else:
        story.append(RTLText("سند نهایی در این دوره موجود نیست.", 10))
    story.extend(
        [
            Spacer(1, 5 * mm),
            RTLText("شناسه نسخه ثابت: " + run["id"], 8, color=MUTED),
            RTLText("تعداد اسناد مبنا: " + localized(len(snapshot["journal_ids"])), 8, color=MUTED),
        ]
    )
    doc.build(story)
    return output.getvalue()


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
            "period_id": snapshot["period_id"],
            "as_of": snapshot["as_of"],
            "period_start": snapshot["period"]["start"],
            "period_end": snapshot["period"]["end"],
            "basis": "native_book",
            "includes_imported_ledger": False,
            "opening_balance_inferred": False,
            "tax_calculated": False,
            "report_approved": bool(run.get("approvals")),
        },
        overflow,
    )
    _records_sheet(book, "شاخص‌ها", snapshot["metrics"], overflow)
    _records_sheet(book, "گردش حساب‌ها", snapshot["items"], overflow)
    _records_sheet(book, "نقش حساب‌ها", snapshot["role_assignments"], overflow)
    _records_sheet(book, "مبنای افتتاحیه", snapshot["opening_evidence"], overflow)
    _records_sheet(book, "اسناد مبنا", snapshot["journal_ids"], overflow)
    _records_sheet(book, "اسناد سود و زیان", snapshot["profit_journal_ids"], overflow)
    _records_sheet(book, "اسناد گردش دوره", snapshot["movement_journal_ids"], overflow)
    _records_sheet(book, "مانده خلاف ماهیت", snapshot.get("opposite_balances", []), overflow)
    _records_sheet(book, "تأییدهای گزارش", run.get("approvals", []), overflow)
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
