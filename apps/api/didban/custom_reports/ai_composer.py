"""AI Report Composer for Didban-Mali custom reports.

Parses natural language requests in Persian to generate structured report block specifications.
"""

from __future__ import annotations

from typing import Any

from ..ingestion import normalized


def compose_report_block(prompt: str) -> dict[str, Any]:
    """Translates a Persian user query into a complete block specification."""
    text = normalized(prompt).lower()

    # 1. Cheques (چک‌ها)
    if any(k in text for k in ("چک", "صیاد", "واگذار", "برگشتی", "پاس شده", "وصول")):
        direction = (
            "payable"
            if any(k in text for k in ("پرداختی", "صادره", "پرداخت"))
            else ("receivable" if any(k in text for k in ("دریافتی", "دریافت")) else None)
        )
        filters = []
        if direction:
            filters.append({"field": "direction", "operator": "=", "value": direction})
        if "برگشتی" in text:
            filters.append({"field": "state", "operator": "=", "value": "rejected"})
        elif "پاس" in text or "وصول" in text:
            filters.append({"field": "state", "operator": "=", "value": "cleared"})
        elif "جریان" in text or "عادی" in text:
            filters.append({"field": "state", "operator": "=", "value": "normal"})

        viz = "data_table"
        group_by = None
        if "نمودار" in text or "چارت" in text:
            viz = "bar_chart"
            group_by = "bank_name" if "بانک" in text else "state"
        elif "شاخص" in text or "تعداد" in text or "مجموع" in text:
            viz = "metric_strip"

        return {
            "title": prompt.strip()[:60],
            "entity_type": "cheques",
            "visualization": viz,
            "filters": filters,
            "columns": ["number", "bank_name", "party_id", "amount", "due_date", "state"],
            "group_by": group_by or "bank_name",
            "aggregation": {"function": "sum", "field": "amount"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد چک‌ها", "unit": "فقره"},
                {"function": "sum", "field": "amount", "label_fa": "مجموع مبلغ چک‌ها", "unit": "ریال"},
            ],
            "explanation": "گزارش وضعیت و ریز چک‌های صیادی با فیلترهای استخراج‌شده از درخواست شما",
        }

    # 2. Bank movements (بانک و تراکنش‌ها)
    if any(k in text for k in ("بانک", "واریز", "برداشت", "تراکنش", "گردش حساب")):
        filters = []
        if "واریز" in text:
            filters.append({"field": "kind", "operator": "=", "value": "deposit"})
        elif "برداشت" in text:
            filters.append({"field": "kind", "operator": "=", "value": "withdrawal"})

        viz = "data_table"
        group_by = None
        if "نمودار" in text:
            viz = "line_chart"
            group_by = "date"
        elif "شاخص" in text:
            viz = "metric_strip"

        return {
            "title": prompt.strip()[:60],
            "entity_type": "bank_movements",
            "visualization": viz,
            "filters": filters,
            "columns": ["date", "account", "kind", "amount", "reference", "party_id", "balance"],
            "group_by": group_by or "kind",
            "aggregation": {"function": "sum", "field": "amount"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد تراکنش‌ها", "unit": "عدد"},
                {"function": "sum", "field": "amount", "label_fa": "مجموع مبالغ تراکنش", "unit": "ریال"},
            ],
            "explanation": "گزارش گردش حساب‌های بانکی و تراکنش‌ها بر اساس درخواست شما",
        }

    # 3. Invoices (فاکتورها)
    if any(k in text for k in ("فاکتور", "فروش", "خرید", "مشتری", "سررسید گذشته", "مطالبات فاکتور")):
        direction = "purchases" if "خرید" in text else ("sales" if "فروش" in text else None)
        filters = []
        if direction:
            filters.append({"field": "direction", "operator": "=", "value": direction})
        if "سررسید" in text and ("گذشته" in text or "معوق" in text):
            filters.append({"field": "status", "operator": "=", "value": "overdue"})
        elif "تسویه نشده" in text or "پرداخت نشده" in text:
            filters.append({"field": "status", "operator": "=", "value": "unpaid"})

        viz = "data_table"
        group_by = None
        if "نمودار" in text:
            viz = "bar_chart"
            group_by = "party_id" if "مشتری" in text or "طرف" in text else "status"
        elif "شاخص" in text or "kpi" in text:
            viz = "metric_strip"

        return {
            "title": prompt.strip()[:60],
            "entity_type": "invoices",
            "visualization": viz,
            "filters": filters,
            "columns": ["reference", "party_id", "date", "due_date", "total", "paid", "remaining", "status"],
            "group_by": group_by or "status",
            "aggregation": {"function": "sum", "field": "remaining" if "مانده" in text else "total"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد فاکتورها", "unit": "عدد"},
                {"function": "sum", "field": "total", "label_fa": "مجموع مبلغ فاکتورها", "unit": "ریال"},
                {"function": "sum", "field": "remaining", "label_fa": "مانده وصول‌نشده", "unit": "ریال"},
            ],
            "explanation": "گزارش فاکتورهای تجاری به همراه وضعیت تسویه و سررسید",
        }

    # 4. Parties (اشخاص و طرف‌حساب‌ها)
    if any(k in text for k in ("طرف حساب", "اشخاص", "بدهکاران", "بستانکاران", "مانده حساب")):
        filters = []
        if "بدهکار" in text:
            filters.append({"field": "status", "operator": "=", "value": "debtor"})
        elif "بستانکار" in text:
            filters.append({"field": "status", "operator": "=", "value": "creditor"})

        viz = "data_table"
        if "نمودار" in text:
            viz = "pie_chart"
        elif "شاخص" in text:
            viz = "metric_strip"

        return {
            "title": prompt.strip()[:60],
            "entity_type": "parties",
            "visualization": viz,
            "filters": filters,
            "columns": ["party_id", "balance", "status", "debit_sum", "credit_sum"],
            "group_by": "status",
            "aggregation": {"function": "sum", "field": "balance"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد طرف‌های حساب", "unit": "شخص"},
                {"function": "sum", "field": "debit_sum", "label_fa": "کل گردش بدهکار", "unit": "ریال"},
                {"function": "sum", "field": "credit_sum", "label_fa": "کل گردش بستانکار", "unit": "ریال"},
            ],
            "explanation": "گزارش مانده و گردش حساب اشخاص و طرف‌های تجاری",
        }

    # 5. Inventory & items (کالا و انبار)
    if any(k in text for k in ("انبار", "کالا", "کاردکس", "موجودی", "حواله", "رسید")):
        is_movements = any(k in text for k in ("کاردکس", "گردش", "ورود", "خروج", "رسید", "حواله"))
        entity = "inventory_movements" if is_movements else "inventory_items"
        return {
            "title": prompt.strip()[:60],
            "entity_type": entity,
            "visualization": "data_table",
            "filters": [],
            "columns": (
                ["date", "item_id", "warehouse_id", "kind", "quantity", "value_irr"]
                if is_movements
                else ["code", "name", "active"]
            ),
            "group_by": "kind" if is_movements else "active",
            "aggregation": {"function": "sum", "field": "quantity"}
            if is_movements
            else {"function": "count"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد اقلام", "unit": "قلم"},
            ],
            "explanation": "گزارش وضعیت اقلام و گردش کاردکس انبار",
        }

    # 6. Payroll (حقوق و دستمزد)
    if any(k in text for k in ("حقوق", "دستمزد", "پرسنل", "بیمه", "مالیات حقوق", "کارکرد")):
        filters = []
        if "بیمه" in text:
            filters.append({"field": "kind", "operator": "=", "value": "insurance"})
        elif "مالیات" in text:
            filters.append({"field": "kind", "operator": "=", "value": "tax"})
        elif "ناخالص" in text:
            filters.append({"field": "kind", "operator": "=", "value": "salary"})

        return {
            "title": prompt.strip()[:60],
            "entity_type": "personnel_records",
            "visualization": "data_table",
            "filters": filters,
            "columns": ["employee_id", "employee_name", "kind", "date", "amount"],
            "group_by": "kind",
            "aggregation": {"function": "sum", "field": "amount"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد رکوردهای حقوق", "unit": "مورد"},
                {"function": "sum", "field": "amount", "label_fa": "مجموع مبالغ", "unit": "ریال"},
            ],
            "explanation": "گزارش پرداختی‌ها، کسورات و بیمه پرسنل",
        }

    # 7. Dimensions (مراکز هزینه و پروژه‌ها)
    if any(k in text for k in ("مرکز هزینه", "پروژه", "دپارتمان", "بعد", "ابعاد")):
        return {
            "title": prompt.strip()[:60],
            "entity_type": "dimensions",
            "visualization": "data_table",
            "filters": [],
            "columns": ["code", "name", "kind", "active"],
            "group_by": "kind",
            "aggregation": {"function": "count"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد ابعاد تحلیلی", "unit": "مرکز"},
            ],
            "explanation": "گزارش مراکز هزینه و ابعاد تحلیلی سازمان",
        }

    # 8. Moadian (مؤدیان)
    if any(k in text for k in ("مودیان", "مؤدیان", "کارپوشه", "شماره مالیاتی")):
        return {
            "title": prompt.strip()[:60],
            "entity_type": "moadian_transmissions",
            "visualization": "data_table",
            "filters": [],
            "columns": ["created_at", "tax_id", "invoice_reference", "seller_tax_number", "uid"],
            "group_by": "seller_tax_number",
            "aggregation": {"function": "count"},
            "metrics": [
                {"function": "count", "label_fa": "تعداد ارسال‌ها به سامانه مؤدیان", "unit": "ارسال"},
            ],
            "explanation": "گزارش صورتحساب‌های ارسال‌شده به سامانه مؤدیان و کارپوشه",
        }

    # 9. Default: Journal lines / Ledger (دفتر روزنامه و اسناد حسابداری)
    return {
        "title": prompt.strip()[:60] if prompt.strip() else "گزارش اسناد حسابداری",
        "entity_type": "journal_lines",
        "visualization": "data_table",
        "filters": [],
        "columns": ["date", "entry_id", "account", "party_id", "debit", "credit", "entry_type", "reference"],
        "group_by": "account",
        "aggregation": {"function": "sum", "field": "debit"},
        "metrics": [
            {"function": "count", "label_fa": "تعداد ردیف‌های سند", "unit": "ردیف"},
            {"function": "sum", "field": "debit", "label_fa": "مجموع بدهکار", "unit": "ریال"},
            {"function": "sum", "field": "credit", "label_fa": "مجموع بستانکار", "unit": "ریال"},
        ],
        "explanation": "گزارش آرتیکل‌های اسناد حسابداری و دفتر روزنامه بر اساس کد حساب و طرف حساب",
    }
