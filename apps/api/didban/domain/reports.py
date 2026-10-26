"""Versioned report payload serialization and safe spreadsheet text."""

from __future__ import annotations
import hashlib
import json
from ..security import json_value

METRIC_LABELS = {
    "revenue": "درآمد",
    "expense": "هزینه",
    "profit_before_tax": "سود پیش از مالیات",
    "ar_difference": "اختلاف مطالبات دفتر و فاکتورها",
    "ap_difference": "اختلاف بدهی تجاری دفتر و فاکتورها",
    "net_profit": "سود خالص",
    "cash": "مانده نقد",
    "ar_ledger": "مطالبات دفتری",
    "ar_invoice": "مطالبات فاکتوری",
    "ap_trade_ledger": "بدهی تجاری دفتری",
    "ap_invoice": "بدهی فاکتوری",
    "debt_total_ledger": "کل بدهی‌های دفتری",
    "ar_comparable_difference": "اختلاف قابل مقایسه مطالبات",
    "ap_comparable_difference": "اختلاف قابل مقایسه بدهی",
}


def canonical(value) -> str:
    return json.dumps(
        json_value(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def digest(value) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def spreadsheet_text(value) -> str:
    """Untrusted source text must never become a spreadsheet formula."""
    text = "" if value is None else str(value)
    return (
        "'" + text if text.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")) else text
    )


def is_limited(content: dict) -> bool:
    return (
        any(m["status"] != "available" for m in content["metrics"])
        or any(r.get("missing_source_kinds") for r in content["reconciliation_runs"])
        or content.get("cashflow") is None
        or bool((content.get("cashflow") or {}).get("payload", {}).get("reason_codes"))
        or any(
            d.get("status") != "available"
            for d in (content.get("cashflow") or {}).get("payload", {}).get("days", [])
        )
        or content.get("settlement") is None
        or content.get("forecast") is None
        or content.get("forecast", {}).get("content", {}).get("status")
        in ("limited", "unavailable")
    )


REASON_LABELS = {
    "comparison_missing": "داده معتبر دوره قبل موجود نیست",
    "zero_denominator": "مبلغ دوره قبل صفر است؛ درصد تغییر محاسبه نشده",
    "sign_change": "تغییر نسبت به مقدار منفی؛ درصد تغییر نمایش داده نشده",
    "bank_source_accounts_ambiguous": "چند حساب در یک برگه بانک تفکیک نشده‌اند؛ مانده بانک محاسبه نشده",
    "source_missing": "منبع لازم بارگذاری نشده",
    "coverage_unknown": "پوشش دوره مشخص نیست",
    "coverage_incomplete": "داده تمام دوره را پوشش نمی‌دهد",
    "invalid_rows": "ردیف نامعتبر از محاسبه کنار گذاشته شده",
    "bank_anchor_unknown": "مانده مبنای بانک مشخص نیست",
    "bank_binding_unknown": "ارتباط بانک و دفتر مشخص نیست",
    "bank_cutoff_unknown": "پوشش بانک تا تاریخ گزارش مشخص نیست",
    "income_tax_unknown": "مالیات بر درآمد مشخص نیست",
    "cogs_unknown": "بهای تمام‌شده مشخص نیست",
    "journal_unbalanced": "دفتر تراز نیست",
    "ledger_opening_unknown": "مانده ابتدای دوره دفتر مشخص نیست",
    "account_role_unknown": "نقش حساب مشخص نیست",
    "incomparable_scopes": "دامنه دفتر و فاکتورها قابل مقایسه نیست",
}
SOURCE_LABELS = {
    "ledger": "دفتر حسابداری",
    "bank": "گردش بانک",
    "sales_invoices": "فاکتور فروش",
    "purchase_invoices": "فاکتور خرید",
    "moadian_sales": "صورتحساب فروش مؤدیان",
    "moadian_purchases": "صورتحساب خرید مؤدیان",
}


def display_amount(value: str | None, unit: str) -> str | None:
    if value is None or unit != "IRT":
        return value
    from decimal import Decimal, localcontext

    with localcontext() as context:
        context.prec = 96
        return format(Decimal(value) / Decimal(10), "f")
