"""Exact frozen native invoice projection and shared Persian report exports."""

from copy import deepcopy
from decimal import Decimal, localcontext

from .money_type import aggregate_money
from .report_builder_exports import pdf_run as render_pdf
from .report_builder_exports import xlsx_run as render_xlsx

REASONS = {
    "native_invoice_source_reversed": "سند مرجع برگشت شده؛ مانده قابل محاسبه نیست.",
    "native_invoice_source_changed": "شواهد سند مرجع تغییر کرده؛ مانده قابل محاسبه نیست.",
    "native_invoice_allocation_source_invalid": "سند دریافت یا پرداخت تخصیص‌یافته معتبر نیست؛ مانده قابل محاسبه نیست.",
    "native_invoice_role_conflict": "نقش صریح حساب با نوع عملیات سازگار نیست.",
    "native_invoice_terms_missing": "شرایط فاکتور در این تاریخ موجود نیست.",
    "native_invoice_future_source": "تاریخ سند مرجع پس از تاریخ گزارش است.",
}


def invoice_rows(payload: dict) -> list[dict]:
    """Project only the saved payload; null and exact decimal strings stay distinct."""
    rows = []
    for item in payload["items"]:
        terms = item.get("terms") or {}
        source = item["source"]
        amount = item["amount"]
        remaining = item["remaining"]
        with localcontext() as context:
            context.prec = 80
            paid = aggregate_money(Decimal(amount) - Decimal(remaining)) if remaining is not None else None
        due = terms.get("due_date")
        overdue = (
            (due < payload["as_of"] and Decimal(remaining) > 0)
            if due is not None and remaining is not None
            else None
        )
        evidence = [
            f"native-journal:{source['journal_id']}",
            f"journal-digest:{source['journal_digest']}",
            f"operation:{source['operation_id']}",
        ]
        evidence.extend("native-allocation:" + row["id"] for row in item.get("allocations", []))
        evidence.extend("native-journal:" + row["journal_id"] for row in item.get("allocations", []))
        evidence.extend("native-invoice-terms:" + row["id"] for row in item.get("terms_history", []))
        evidence.extend(
            "native-invoice-source-revision:" + row["id"] for row in item.get("source_history", [])
        )
        rows.append(
            {
                "id": item["id"],
                "reference": item["reference"],
                "party_id": item["party_id"],
                "date": item["date"],
                "due_date": due,
                "expected_date": terms.get("expected_date"),
                "amount": amount,
                "paid": paid,
                "remaining": remaining,
                "unit": "IRR",
                "original_unit": item.get("original_unit", source["unit"]),
                "direction": "sales" if item["direction"] == "sale" else "purchases",
                "status": item["status"],
                "reason": REASONS.get(
                    item.get("reason"), "شواهد مانده معتبر نیست." if item.get("reason") else None
                ),
                "reason_codes": [item["reason"]] if item.get("reason") else [],
                "overdue": overdue,
                "evidence_refs": sorted(set(evidence)),
                "source": deepcopy(source),
                "original_source": deepcopy(item.get("original_source", source)),
                "terms": deepcopy(terms),
                "terms_history": deepcopy(item.get("terms_history", [])),
                "source_history": deepcopy(item.get("source_history", [])),
                "allocations": deepcopy(item.get("allocations", [])),
            }
        )
    return rows


def builder_snapshot(snapshot_row: dict, company_name: str) -> dict:
    payload = snapshot_row["payload"]
    rows = invoice_rows(payload)
    limitations = ["فاکتورهای بومی دیدبان؛ از ماندهٔ دفتر و فاکتورهای واردشده جداست."]
    for row in rows:
        reference = row["reference"]
        source = row["source"]
        limitations.append(
            f"فاکتور {reference}؛ سند مرجع: {source['journal_id']}؛ نسخه تأییدشده: {source['approved_draft_version']}."
        )
        if row["due_date"] is None:
            limitations.append(f"فاکتور {reference}: سررسید نامشخص است.")
        for term in row["terms_history"]:
            limitations.append(
                f"شرایط فاکتور {reference}؛ نسخه {term['version']}؛ تاریخ اعمال {term['effective_date']}؛ سررسید {term.get('due_date') or 'نامشخص'}؛ انتظار {term.get('expected_date') or ('نامشخص' if term.get('expected_unknown') else 'درخواست برآورد')}؛ دلیل {term['reason']}."
            )
        for revision in row["source_history"]:
            limitations.append(
                f"منبع جایگزین فاکتور {reference}؛ پذیرش {revision['effective_date']}؛ مبلغ {revision['source']['amount']} ریال؛ دلیل {revision['reason']}."
            )
        for allocation in row["allocations"]:
            state = (
                "برگشت‌شده"
                if allocation["reversed"]
                else "معتبر"
                if allocation["status"] == "available"
                else "نامعتبر"
            )
            limitations.append(
                f"تخصیص فاکتور {reference}؛ تاریخ سند {allocation['date']}؛ مبلغ {allocation['amount']} ریال؛ {state}؛ شناسه {allocation['id']}."
                + (f" دلیل برگشت: {allocation['reversal']['reason']}." if allocation.get("reversal") else "")
            )
    columns = [
        {"key": key, "label": label}
        for key, label in [
            ("reference", "فاکتور"),
            ("party_id", "طرف حساب"),
            ("amount", "مبلغ فاکتور"),
            ("paid", "تسویه‌شده"),
            ("remaining", "مانده"),
            ("status", "وضعیت"),
        ]
    ]
    return {
        "title": "گزارش ثابت فاکتورهای بومی",
        "company_name": company_name,
        "source": "native_invoice",
        "manifest_id": None,
        "native_invoice_snapshot_id": snapshot_row["id"],
        "source_digest": snapshot_row["digest"],
        "as_of": payload["as_of"],
        "period": {"start": None, "end": None},
        "spec": {
            "source": "native_invoice",
            "kind": "invoices",
            "basis": "invoice",
            "filters": {
                "direction": {"sale": "sales", "purchase": "purchases"}.get(payload.get("direction"), "all"),
                "party_id": "",
                "overdue_only": False,
            },
        },
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "unit": "IRR",
        "limitations": limitations,
        "evidence_refs": sorted(
            {
                "native-invoice-snapshot:" + snapshot_row["id"],
                *(ref for row in rows for ref in row["evidence_refs"]),
            }
        ),
    }


def frozen_run(snapshot_row: dict, company_name: str) -> dict:
    return {
        "id": snapshot_row["id"],
        "digest": snapshot_row["digest"],
        "definition_version": 1,
        "snapshot": builder_snapshot(snapshot_row, company_name),
    }


def pdf_snapshot(snapshot_row: dict, company_name: str) -> bytes:
    return render_pdf(frozen_run(snapshot_row, company_name))


def xlsx_snapshot(snapshot_row: dict, company_name: str) -> bytes:
    return render_xlsx(frozen_run(snapshot_row, company_name))
