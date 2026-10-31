"""Render only trusted amounts from a selected immutable snapshot."""

from ..domain.money_format import grouped_amount

LABELS = {
    "revenue": "درآمد",
    "expense": "هزینه",
    "net_profit": "سود خالص",
    "profit_before_tax": "سود پیش از مالیات",
    "cash": "مانده نقد",
    "ar_ledger": "مطالبات دفتری",
    "ar_invoice": "مطالبات فاکتوری",
    "ap_trade_ledger": "بدهی تجاری دفتری",
    "ap_invoice": "بدهی فاکتوری",
    "debt_total_ledger": "کل بدهی‌های دفتری",
    "ar_difference": "اختلاف مطالبات دفتر و فاکتور",
    "ap_difference": "اختلاف بدهی تجاری دفتر و فاکتور",
}
REASONS = {
    "source_missing": "منبع لازم بارگذاری نشده است",
    "coverage_unknown": "پوشش دوره مشخص نیست",
    "coverage_incomplete": "داده تمام دوره را پوشش نمی‌دهد",
    "income_tax_unknown": "مالیات سود مشخص نیست",
    "cogs_unknown": "بهای تمام‌شده مشخص نیست",
    "ledger_opening_unknown": "مانده افتتاحیه دفتر مشخص نیست",
    "bank_anchor_unknown": "مانده مبنای بانک مشخص نیست",
    "bank_binding_unknown": "حساب بانک مشخص نیست",
    "settlement_coverage_unknown": "تاریخچه تسویه کامل نیست",
    "invoice_openings_unknown": "فاکتورهای باز ابتدای دوره مشخص نیست",
    "payment_dates_missing": "تاریخ تسویه‌ها مشخص نیست",
    "scope_not_comparable": "دامنه دفتر و فاکتورها قابل مقایسه نیست",
}
DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def render_answer(selection, context, company, manifest):
    if selection["intent"] == "unsupported_request":
        return (
            "این دستیار فقط داده‌های نسخه انتخاب‌شده را توضیح می‌دهد؛ تغییر اطلاعات از بخش مربوط انجام می‌شود.",
            [],
            None,
        )
    keys = selection["metric_keys"]
    if not keys:
        return "شاخص موردنظر را مشخص کنید.", [], None
    lines = []
    refs = []
    for key in keys:
        metric = context["metrics"].get(key)
        if metric is None:
            continue
        label = LABELS[key]
        if metric["value_irr"] is None:
            reason = "؛ ".join(
                dict.fromkeys(
                    REASONS.get(c, "شواهد این شاخص نیازمند بررسی است")
                    for c in metric["reason_codes"]
                )
            )
            lines.append(f"{label}: محاسبه نشده؛ {reason or 'داده کافی نیست'}.")
        else:
            line = f"{label}: {grouped_amount(metric['value_irr']).translate(DIGITS)} ریال."
            previous = metric.get("comparison")
            if previous and previous.get("value") is not None:
                line += f" دوره قبل: {grouped_amount(previous['value']).translate(DIGITS)} ریال."
            lines.append(line)
        refs.extend(metric["evidence_refs"])
    section = selection["next_section"]
    path = {
        "results": f"/companies/{company}/results/{manifest}",
        "uploads": f"/companies/{company}/uploads",
        "reconciliation": f"/companies/{company}/reconciliation",
        "settlements": f"/companies/{company}/settlements",
        "cashflow": f"/companies/{company}/cashflow",
    }
    return "\n".join(lines)[:4000], list(dict.fromkeys(refs)), path.get(section)
