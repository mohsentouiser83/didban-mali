"""Evidence-only managerial observations; no causal or savings claims."""

from decimal import Decimal
from datetime import date
from .settlements import exact_context

AXES = {
    "cash": ("نقدینگی", ("cash",)),
    "balances": ("مطالبات و بدهی‌ها", ("ar_ledger", "ap_trade_ledger")),
    "profit": ("درآمد، هزینه و سود", ("revenue", "expense", "net_profit")),
    "quality": ("کیفیت اطلاعات", ()),
    "payroll": ("حقوق‌ودستمزد", ()),
}
DEFAULT_SETTINGS = {
    "materiality_ratio": "0.10",
    "urgency_days": 7,
    "recurrence_count": 2,
}


@exact_context
def analyze(content, settings=None):
    settings = settings or DEFAULT_SETTINGS
    threshold = Decimal(settings["materiality_ratio"])
    if not Decimal("0") < threshold <= 1:
        raise ValueError("invalid_materiality_ratio")
    metrics = {m["metric_key"]: m for m in content.get("metrics", [])}
    scale = max(
        (
            abs(Decimal(m["value"]))
            for m in metrics.values()
            if m.get("value") is not None and m.get("status") == "available"
        ),
        default=Decimal(0),
    )
    result = []
    modules = (content.get("module_configuration") or {}).get("modules", {})
    module_for_axis = {
        "cash": "cash",
        "balances": "balances",
        "profit": "accounting",
        "payroll": "payroll",
    }
    for axis, (title, keys) in AXES.items():
        if modules.get(module_for_axis.get(axis)) is False:
            continue
        available = [
            metrics[k]
            for k in keys
            if k in metrics
            and metrics[k].get("value") is not None
            and metrics[k].get("status") == "available"
        ]
        missing = [
            k
            for k in keys
            if k not in metrics or metrics[k].get("status") != "available"
        ]
        payroll = content.get("payroll_analysis") or {}
        if axis == "payroll" and payroll.get("periods"):
            current = payroll["periods"][0]
            available = [
                {
                    "metric_key": "payroll_employer_cost",
                    "value": current["employer_cost"],
                    "status": "available",
                    "evidence_ids": current["run_ids"],
                }
            ]
            missing = (
                []
                if payroll.get("status") == "available"
                else ["payroll_comparison_scope_missing"]
            )
        evidence = [
            {
                "metric_key": m["metric_key"],
                "value": m["value"],
                "evidence_ids": m.get("evidence_ids", []),
                "source_refs": m.get("source_refs", []),
            }
            for m in available
        ]
        if axis == "quality":
            unavailable = [
                m["metric_key"]
                for m in metrics.values()
                if m.get("status") != "available"
            ]
            missing = unavailable
            title = "تکمیل اطلاعات شاخص‌ها" if unavailable else "کنترل پوشش اطلاعات"
        action = (
            "گردش و اسناد پشتیبان این ارقام را بررسی کنید."
            if available
            else "منابع لازم این حوزه را تکمیل کنید."
        )
        explanation = (
            "ارقام ثبت‌شده در همین نسخه گزارش؛ علت اقتصادی از این ارقام استنتاج نشده است."
            if available
            else "اطلاعات کافی برای تحلیل این حوزه موجود نیست."
        )
        if axis == "cash" and available:
            action = "برنامه دریافت و پرداخت را با مانده نقد مقایسه کنید؛ مانده به‌تنهایی کفایت نقد آینده را اثبات نمی‌کند."
        if axis == "balances" and available:
            action = "گردش اشخاص دارای مانده بزرگ‌تر را بررسی و پیگیری کنید؛ بدون موعد معتبر تأخیر قطعی نیست."
        if axis == "profit" and available:
            action = (
                "سهم حساب‌های درآمد، بهای تمام‌شده و هزینه را در نتیجه دوره بررسی کنید."
            )
        if axis == "quality":
            explanation = "وضعیت شاخص‌های همین نسخه بررسی شده است؛ کامل‌بودن کل اسناد از آن نتیجه نمی‌شود."
            action = (
                "منابع و علت ناموجودبودن شاخص‌های مشخص‌شده را بررسی کنید."
                if missing
                else "شواهد پوشش دوره را مرور کنید."
            )
        urgency = "unknown"
        due_evidence = []
        cutoff = (
            (content.get("report_scope") or {}).get("as_of_date")
            or (content.get("management") or {}).get("as_of_date")
            or (content.get("manifest") or {}).get("as_of_date")
        )
        if cutoff and axis in ("cash", "balances"):
            for invoice in ((content.get("settlement") or {}).get("content") or {}).get(
                "invoices", []
            ):
                if (
                    invoice.get("due_on")
                    and invoice.get("status") == "available"
                    and invoice.get("remaining_as_of") is not None
                    and Decimal(invoice["remaining_as_of"]) > 0
                ):
                    days = (
                        date.fromisoformat(invoice["due_on"])
                        - date.fromisoformat(str(cutoff))
                    ).days
                    due_evidence.append(
                        {
                            "invoice_id": invoice["invoice_id"],
                            "due_on": invoice["due_on"],
                            "remaining": invoice["remaining_as_of"],
                            "days_from_report": days,
                            "direction": invoice.get("direction"),
                        }
                    )
            if any(
                e["days_from_report"] <= settings.get("urgency_days", 7)
                for e in due_evidence
            ):
                urgency = "due_or_overdue"
        risk = None
        risk_amount = Decimal(0)
        if axis == "cash" and available:
            cash = Decimal(available[0]["value"])
            outgoing = sum(
                (
                    Decimal(e["remaining"])
                    for e in due_evidence
                    if e.get("direction") == "purchase"
                    and e["days_from_report"] <= settings.get("urgency_days", 7)
                ),
                Decimal(0),
            )
            if cash < 0:
                risk, risk_amount = "negative_cash", abs(cash)
                explanation = "مانده نقد ثبت‌شده منفی است."
                action = "مانده مبنا و گردش حساب‌های نقد را با دفتر تطبیق دهید."
            elif outgoing > cash:
                risk, risk_amount = "known_obligation_gap", outgoing - cash
                explanation = "تعهدات پرداخت شناخته‌شده در بازه نزدیک از مانده نقد بیشتر است؛ دریافت‌های آینده در این مقایسه منظور نشده‌اند."
                action = (
                    "زمان‌بندی تعهدات مشخص‌شده و دریافت‌های مورد انتظار را بررسی کنید."
                )
            else:
                explanation = (
                    "از مانده نقد موجود به‌تنهایی کسری آینده یا مسئله‌ای اثبات نشده است."
                )
                action = "برای بررسی کفایت نقد آینده، برنامه تعهدات و دریافت‌ها را تکمیل کنید."
        if axis == "balances":
            overdue = sum(
                (
                    Decimal(e["remaining"])
                    for e in due_evidence
                    if e["days_from_report"] < 0
                ),
                Decimal(0),
            )
            if overdue:
                risk, risk_amount = "overdue_balance", overdue
                explanation = (
                    "فاکتورهای دارای مانده مثبت و سررسید گذشته در این نسخه وجود دارند."
                )
                action = "پیگیری فاکتورهای سررسیدگذشته را بر اساس مبلغ و طرف حساب اولویت دهید."
            elif available:
                explanation = "مانده دفتری موجود است؛ از بزرگی مانده به‌تنهایی تأخیر یا مشکل وصول نتیجه نمی‌شود."
        if axis == "profit":
            net = metrics.get("net_profit", {})
            expense = metrics.get("expense", {})
            comparison = expense.get("comparison") or {}
            if (
                net.get("status") == "available"
                and net.get("value") is not None
                and Decimal(net["value"]) < 0
            ):
                risk, risk_amount = "net_loss", abs(Decimal(net["value"]))
                explanation = "سود خالص معتبر این دوره منفی است."
            elif (
                expense.get("status") == "available"
                and comparison.get("delta") is not None
                and not comparison.get("reason_codes")
                and Decimal(comparison["delta"]) > 0
            ):
                risk, risk_amount = (
                    "comparable_expense_increase",
                    Decimal(comparison["delta"]),
                )
                explanation = "هزینه نسبت به دوره قابل مقایسه افزایش یافته؛ علت اقتصادی از این تغییر اثبات نمی‌شود."
            elif available:
                explanation = "در ارقام معتبر این نسخه، زیان یا افزایش هزینه قابل مقایسه‌ای برای هشدار اثبات نشده است."
        if axis == "quality":
            for key in ("ar_difference", "ap_difference"):
                metric = metrics.get(key, {})
                if (
                    metric.get("status") == "available"
                    and metric.get("value") is not None
                    and Decimal(metric["value"]) != 0
                ):
                    risk = "comparable_difference"
                    risk_amount += abs(Decimal(metric["value"]))
                    evidence.append(
                        {
                            "metric_key": key,
                            "value": metric["value"],
                            "evidence_ids": metric.get("evidence_ids", []),
                        }
                    )
            if risk:
                explanation = "بین مانده‌های دارای دامنه قابل مقایسه اختلاف وجود دارد؛ اختلاف به‌تنهایی خطای اثبات‌شده نیست."
                action = "اسناد و تخصیص‌های دو مبنا را برای توضیح اختلاف بررسی کنید."
        if (
            axis == "payroll"
            and payroll.get("status") == "available"
            and len(payroll.get("periods", [])) >= 2
        ):
            difference = Decimal(payroll["periods"][0]["employer_cost"]) - Decimal(
                payroll["periods"][1]["employer_cost"]
            )
            if difference > 0:
                risk, risk_amount = "comparable_payroll_increase", difference
                explanation = "هزینه حقوق تأییدشده در دو دوره هم‌دامنه افزایش یافته است."
                action = "سهم حقوق پایه، کارکرد و مزایا را در تغییر هزینه بررسی کنید."
        condition = axis + ":" + (risk or "routine")
        prior_conditions = content.get("analysis_history", [])
        basis = (content.get("report_scope") or {}).get("metric_basis", "ledger")
        valid_history = [
            p
            for p in prior_conditions
            if p.get("axis", axis) == axis
            and (p.get("scope") or {}).get("as_of_date")
            and str(p["scope"]["as_of_date"]) < str(cutoff)
            and p["scope"].get("metric_basis") == basis
        ]
        repeats = len(
            {
                p["scope"]["as_of_date"]
                for p in valid_history
                if p.get("condition_key") == condition
            }
        )
        recurrence = str(repeats + 1) if risk and valid_history else "unknown"
        risk_ratio = (
            risk_amount / scale
            if scale
            else (Decimal(1) if risk_amount else Decimal(0))
        )
        high = bool(
            risk
            and (
                risk_ratio >= threshold
                or (
                    valid_history and repeats + 1 >= settings.get("recurrence_count", 2)
                )
            )
        )
        result.append(
            {
                "axis": axis,
                "scope": content.get("report_scope")
                or {
                    "starts_on": content.get("manifest", {}).get("starts_on"),
                    "as_of_date": cutoff,
                },
                "formula_version": "actionable-v2",
                "condition_key": condition,
                "due_evidence": due_evidence,
                "payroll_snapshot": {
                    **payroll,
                    "periods": [
                        {k: v for k, v in period.items() if k != "employee_scope"}
                        for period in payroll.get("periods", [])
                    ],
                }
                if axis == "payroll"
                else None,
                "title": title,
                "status": "available"
                if (available or evidence or (axis == "quality" and metrics))
                and not missing
                else "limited"
                if available or evidence
                else "unavailable",
                "explanation": explanation,
                "action": action,
                "limitations": missing
                or (
                    ["payroll_source_not_connected"]
                    if axis == "payroll" and not available
                    else []
                ),
                "evidence": evidence,
                "priority": "high" if high else "normal",
                "priority_components": {
                    "relative_size": str(risk_ratio),
                    "condition": risk or "no_adverse_condition",
                    "risk_amount": str(risk_amount),
                    "threshold": str(threshold),
                    "scale": str(scale),
                    "urgency": urgency,
                    "recurrence": recurrence,
                    "urgency_days": str(settings.get("urgency_days", 7)),
                    "recurrence_count": str(settings.get("recurrence_count", 2)),
                },
                "resolution": "not_evaluated",
            }
        )
    return result
