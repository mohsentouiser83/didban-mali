"""Project native invoice rows for reporting."""

from copy import deepcopy
from decimal import Decimal, localcontext

from .money_type import aggregate_money

REASONS = {
    "native_invoice_source_reversed": "سند مرجع برگشت شده؛ مانده قابل محاسبه نیست.",
    "native_invoice_source_changed": "شواهد سند مرجع تغییر کرده؛ مانده قابل محاسبه نیست.",
    "native_invoice_allocation_source_invalid": "سند دریافت یا پرداخت تخصیص‌یافته معتبر نیست؛ مانده قابل محاسبه نیست.",
    "native_invoice_role_conflict": "نقش صریح حساب با نوع عملیات سازگار نیست.",
    "native_invoice_terms_missing": "شرایط فاکتور در این تاریخ موجود نیست.",
    "native_invoice_future_source": "تاریخ سند مرجع پس از تاریخ گزارش است.",
}


def invoice_rows(payload: dict) -> list[dict]:
    """Project the given payload, preserving nulls and exact decimal strings."""
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
