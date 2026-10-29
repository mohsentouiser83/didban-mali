"""Versioned report payload serialization and safe spreadsheet text."""

from __future__ import annotations
import hashlib
import json
from ..security import json_value

EXPORT_LAYOUT_VERSION = "report-actionable-v3"


def row_disposition(row: dict) -> str | None:
    """Exclusion is not a validation failure; preserve failures if both are present."""
    if row["state"] == "excluded_overlap" and not row["error_codes"]:
        return "excluded_overlap"
    if row["state"] != "valid" or row["error_codes"]:
        return "error"
    return None


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
    """Missing information limits active scope; deliberately disabled areas do not."""
    modules = (content.get("module_configuration") or {}).get("modules", {})

    def enabled(name: str) -> bool:
        return modules.get(name, True)

    management = content.get("management") or {}
    statements = management.get("statements") or {}
    if (
        enabled("accounting")
        and management
        and (
            any(line["status"] != "available" for line in statements.get("lines", []))
            or statements.get("balance_control", {}).get("status", "available")
            != "available"
        )
    ):
        return True
    if (
        enabled("cash")
        and management.get("cashflow_statement", {}).get("status", "available")
        != "available"
    ):
        return True
    for metric in content["metrics"]:
        key = metric["metric_key"]
        required = (
            ("cash",)
            if key == "cash"
            else ("invoices",)
            if key in ("ar_invoice", "ap_invoice")
            else ("balances", "invoices")
            if "difference" in key
            else ("balances",)
            if key.startswith(("ar_", "ap_", "debt_"))
            else ("accounting",)
        )
        if all(enabled(name) for name in required) and metric["status"] != "available":
            return True
    if any(
        r.get("missing_source_kinds")
        for r in content["reconciliation_runs"]
        if enabled("cash" if r.get("kind") == "bank_ledger" else "moadian")
    ):
        return True
    cash = content.get("cashflow")
    if enabled("cash") and (
        cash is None
        or bool(cash.get("payload", {}).get("reason_codes"))
        or any(
            d.get("status") != "available"
            for d in cash.get("payload", {}).get("days", [])
        )
    ):
        return True
    if (
        any(
            enabled(name)
            for name in ("balances", "invoices", "settlements", "forecast")
        )
        and content.get("settlement") is None
    ):
        return True
    forecast = content.get("forecast")
    return enabled("forecast") and (
        forecast is None
        or forecast.get("content", {}).get("status") in ("limited", "unavailable")
    )


REASON_LABELS = {
    "forecast_invalid_payment_rows": "بعضی ردیف‌های برنامه پرداخت نامعتبرند؛ فقط تعهدهای معتبر در پیش‌بینی آمده‌اند.",
    "forecast_invalid_history_rows": "بعضی سوابق وصول نامعتبرند؛ برآورد وصول فقط بر سابقه معتبر تکیه دارد.",
    "forecast_invalid_invoice_rows": "بعضی فاکتورها نامعتبرند؛ دریافت و پرداخت آینده کامل نیست.",
    "forecast_invalid_settlement_rows": "بعضی تسویه‌ها نامعتبرند؛ مانده تعهدهای وابسته قابل اتکا نیست.",
    "trial_balance_source_missing": "تراز آزمایشی بارگذاری نشده است.",
    "trial_balance_date_missing": "تراز آزمایشی در تاریخ گزارش موجود نیست.",
    "trial_balance_scope_mismatch": "گردش تراز با بازه گزارش یکسان نیست.",
    "trial_balance_closing_entries_unknown": "گردش پیش از اختتامیه مشخص نیست؛ سود دوره محاسبه نشد.",
    "trial_balance_level_unknown": "سطح جزئی حساب‌های تراز مشخص نیست.",
    "duplicate_trial_balance_account": "حساب تراز در همین بازه تکرار شده است.",
    "trial_balance_unbalanced": "جمع بدهکار و بستانکار تراز برابر نیست.",
    "trial_balance_rollforward_mismatch": "مانده ابتدا و گردش با مانده پایان تراز تطابق ندارد.",
    "cashflow_activity_missing": "طبقه بعضی گردش‌های نقد مشخص نیست؛ خالص فعالیت کامل نیست.",
    "cash_statement_bridge_mismatch": "گردش نقد با تغییر مانده دفتری تطابق ندارد.",
    "scope_not_comparable": "دامنه دفتر و فاکتورها قابل مقایسه نیست",
    "settlement_coverage_unknown": "تاریخچه تسویه کامل نیست",
    "invoice_openings_unknown": "فاکتورهای باز ابتدای دوره مشخص نیست",
    "payment_dates_missing": "تاریخ تسویه‌ها مشخص نیست",
    "cash_movement_coverage_unknown": "گردش بانک تمام بازه را پوشش نمی‌دهد",
    "cash_bridge_control_failed": "جمع گردش با تغییر مانده بانک تطابق ندارد",
    "template_accounts_unmapped": "بعضی حساب‌ها در قالب نگاشت نشده‌اند",
    "template_account_missing": "حساب تعیین‌شده در داده دفتر موجود نیست",
    "template_role_conflict": "سرفصل قالب با نقش حساب سازگار نیست",
    "template_section_missing": "بخش لازم در قالب تعریف نشده",
    "balance_sheet_unbalanced": "جمع دارایی با بدهی و حقوق مالکانه برابر نیست",
    "variance_control_failed": "اجزای تغییر سود با تغییر کل تطابق ندارند",
    "bank_source_missing": "گردش بانک برای این روز موجود نیست",
    "forecast_date_or_sources_missing": "پیش‌بینی متناسب با تاریخ گزارش موجود نیست",
    "transfer_scope_unknown": "انتقال داخلی از گردش خارجی تفکیک نشده",
    "aggregate_out_of_range": "جمع مبالغ خارج از محدوده مجاز است",
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
    "trial_balance": "تراز آزمایشی",
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
