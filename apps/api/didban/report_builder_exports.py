"""Exports of frozen builder runs using the existing exact/Persian infrastructure."""

import io

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer

from .exports import FONT_MEDIUM, MUTED, RTLText, _table, display_date, localized, register_fonts, xlsx_report

BASIS_LABELS = {
    "ledger": "دفتر",
    "bank": "بانک",
    "invoice": "فاکتور",
    "comparable_difference": "اختلاف قابل مقایسه",
}
STATUS_LABELS = {"available": "موجود", "limited": "محدود", "estimated": "برآوردی", "unavailable": "ناموجود"}


def cell_value(row: dict, key: str) -> str:
    value = row.get(key)
    if key == "reference" and value is not None:
        return str(value)
    if key == "status":
        return STATUS_LABELS.get(str(value), "نامشخص")
    if key == "unit":
        return "ریال" if value == "IRR" else str(value or "")
    if key in ("date", "due_date") and value:
        return display_date(value)
    return localized(value, amount=key in ("value", "amount", "paid", "remaining"))


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
        RTLText(
            "مبنای گزارش: "
            + (
                "فاکتور خدمات دفتر دیدبان"
                if snapshot.get("source") == "native_invoice"
                else "دفتر اصلی دیدبان"
                if snapshot.get("source") == "native_statement"
                else BASIS_LABELS[snapshot["spec"]["basis"]]
            ),
            10,
        ),
        RTLText("مبالغ: ریال؛ تأیید مالی ثبت نشده", 9, color=MUTED),
    ]
    period = snapshot["period"]
    if period.get("start") and period.get("end"):
        story.append(RTLText(f"دوره: {display_date(period['start'])} تا {display_date(period['end'])}", 9))
    if snapshot.get("as_of"):
        story.append(RTLText("تا تاریخ: " + display_date(snapshot["as_of"]), 9))
    if snapshot["spec"]["kind"] == "invoices":
        filters = snapshot["spec"]["filters"]
        direction = {"all": "همه", "sales": "فروش", "purchases": "خرید"}[filters["direction"]]
        story.append(
            RTLText(
                f"جهت: {direction}؛ طرف حساب: {filters['party_id'] or 'همه'}؛ فقط سررسیدگذشته: {'بله' if filters['overdue_only'] else 'خیر'}",
                9,
            )
        )
    story.append(Spacer(1, 5 * mm))
    columns = list(reversed(snapshot["columns"]))
    rows = [[RTLText(column["label"], 9, FONT_MEDIUM) for column in columns]]
    rows.extend(
        [[RTLText(cell_value(row, column["key"]), 8) for column in columns] for row in snapshot["rows"]]
    )
    if snapshot["rows"]:
        width = A4[0] - 40 * mm
        weights = [
            1.5 if column["key"] in ("value", "amount", "paid", "remaining") else 1 for column in columns
        ]
        story.append(_table(rows, [width * weight / sum(weights) for weight in weights]))
    else:
        story.append(RTLText("نتیجه‌ای برای این فیلترها نیست.", 10))
    for limit in snapshot["limitations"]:
        story.append(RTLText(limit, 9, color=MUTED))
    for row in snapshot["rows"]:
        if row.get("reason"):
            story.append(
                RTLText(f"{row.get('label') or row.get('reference')}: {row['reason']}", 9, color=MUTED)
            )
    story.extend(
        [
            Spacer(1, 5 * mm),
            RTLText(
                "نسخه نتیجه: "
                + "\u202a"
                + (
                    snapshot.get("native_invoice_snapshot_id")
                    or snapshot.get("native_statement_id")
                    or snapshot.get("manifest_id")
                )
                + "\u202c",
                8,
                color=MUTED,
            ),
            RTLText("شناسه اجرای ثابت: \u202a" + run["id"] + "\u202c", 8, color=MUTED),
        ]
    )
    if snapshot["evidence_refs"]:
        story.append(RTLText("شواهد محاسبه", 10, FONT_MEDIUM))
        for ref in snapshot["evidence_refs"][:50]:
            story.append(RTLText("\u202a" + ref + "\u202c", 8, color=MUTED))
        if len(snapshot["evidence_refs"]) > 50:
            story.append(RTLText("فهرست کامل شواهد در خروجی Excel است.", 9))
    doc.build(story)
    return out.getvalue()


def xlsx_run(run: dict) -> bytes:
    snapshot = run["snapshot"]
    is_metrics = snapshot["spec"]["kind"] == "metrics"
    # Preserve all status/reason/evidence fields in addition to the selected presentation.
    manifest = {
        "id": (
            snapshot.get("native_invoice_snapshot_id")
            or snapshot.get("native_statement_id")
            or snapshot.get("manifest_id")
        ),
        "digest": run["digest"],
        "selection": {"period": snapshot["period"], "report_definition": snapshot["spec"]},
        "metrics": snapshot["rows"] if is_metrics else [],
        "details": {
            "selected_columns": snapshot["columns"],
            "limitations": snapshot["limitations"],
            "report_rows": [
                {column["key"]: row.get(column["key"]) for column in snapshot["columns"]}
                for row in snapshot["rows"]
            ],
            "report_evidence": snapshot["evidence_refs"],
            "source": snapshot.get("source", "imported_manifest"),
            "as_of": snapshot.get("as_of"),
            "source_digest": snapshot.get("source_digest"),
        },
    }
    if not is_metrics:
        manifest["details"]["invoices"] = snapshot["rows"]
    return xlsx_report(
        manifest,
        {"id": run["id"], "title": snapshot["title"], "version": run["definition_version"], "approvals": []},
        snapshot["company_name"],
    )
