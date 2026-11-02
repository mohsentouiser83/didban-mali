"""Fixed native forecast exports preserve source status, assumptions and evidence."""

from .exports import pdf_report, xlsx_report
from .native_forecast_scope import projection


def export_run(run: dict, company_name: str, output_format: str) -> bytes:
    snapshot = run["snapshot"] | projection(run["snapshot"])
    labels = {
        "receipt_date_unknown": "زمان وصول نامعلوم است.",
        "payment_date_unknown": "زمان پرداخت نامعلوم است.",
        "future_obligations_not_declared_complete": "پوشش کامل تعهدهای آینده تأیید نشده است.",
        "native_invoice_balance_unavailable": "ماندهٔ برخی فاکتورها نامعلوم است.",
        "manual_plan_invoice_link_unknown": "ارتباط برنامه پرداخت با فاکتور نامعلوم است.",
    }
    reason = "؛ ".join(
        labels.get(code, "بخشی از مبنای پیش‌بینی کامل نیست.") for code in snapshot["reason_codes"]
    )
    metric_labels = [("closing", "ماندهٔ کامل پایان افق"), ("minimum", "کمترین ماندهٔ کامل پیش‌بینی")]
    if snapshot["status"] == "limited":
        metric_labels += [
            ("known_dated_closing", "مانده با جریان‌های تاریخ‌دار معلوم"),
            ("known_dated_minimum", "کمترین مانده با جریان‌های تاریخ‌دار معلوم"),
        ]
    manifest = {
        "id": run["id"],
        "digest": run["digest"],
        "selection": {"period": {"start": snapshot["start"], "end": snapshot["end"]}, "row_ids": []},
        "metrics": [
            {
                "metric_key": "native_forecast_" + key,
                "label": label,
                "value": snapshot[key],
                "status": "unavailable" if snapshot[key] is None else snapshot["status"],
                "basis": "native_forecast",
                "scope": "known_dated_flows" if key.startswith("known_dated_") else "company",
                "unit": "IRR",
                "reason": reason or None,
                "evidence_refs": [
                    "native-forecast:" + run["id"],
                    "native-statement:" + run["native_statement_id"],
                ],
            }
            for key, label in metric_labels
        ],
        "details": {
            "forecast": {
                **snapshot,
                "reason": reason or None,
                "events": [
                    row for row in snapshot["events"] if snapshot["start"] <= row["date"] <= snapshot["end"]
                ],
            },
            "native_forecast_digest": run["digest"],
            "cash_statement_id": run["native_statement_id"],
        },
    }
    report = {"id": run["id"], "title": "پیش‌بینی ۳۰روزه دفتر اصلی", "version": 1, "approvals": []}
    return (
        pdf_report(manifest, report, company_name)
        if output_format == "pdf"
        else xlsx_report(manifest, report, company_name)
    )
