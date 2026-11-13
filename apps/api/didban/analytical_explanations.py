"""Evidence-backed explanations and grounded action suggestions (AI-04).

Produces structured Persian explanations from deterministic financial decompositions.
Strictly ensures all figures derive from verified facts; never hallucinates amounts or
claims to execute unauthorized financial actions.
"""
from __future__ import annotations

from typing import Any


def format_currency_fa(val_str: str | None) -> str:
    if val_str is None:
        return "نامشخص"
    try:
        val = int(val_str)
        return f"{val:,} ریال"
    except Exception:
        return f"{val_str} ریال"


def explain_profit_change(
    profit_decomposition: dict[str, Any],
    evidence_refs: list[str],
) -> dict[str, Any]:
    if profit_decomposition.get("status") != "available":
        return {
            "answer": profit_decomposition.get("reason", "اطلاعات برای تحلیل تغییرات سود کافی نیست."),
            "conclusion": None,
            "observed_drivers": [],
            "suggested_actions": ["ثبت و تکمیل گزارش مالی دوره‌های قبل برای ایجاد مبنای مقایسه"],
            "evidence_links": evidence_refs,
            "limitations": [profit_decomposition.get("reason", "کمبود داده")],
        }

    direction = profit_decomposition.get("profit_direction")
    delta_profit = profit_decomposition.get("delta_profit", "0")
    pct = profit_decomposition.get("percent_change")
    pct_str = f" ({abs(pct)}٪)" if pct is not None else ""

    if direction == "decrease":
        conclusion = f"سود قبل از مالیات در مقایسه با دوره قبل به میزان {format_currency_fa(abs(int(delta_profit)))}{pct_str} کاهش یافته است."
    elif direction == "increase":
        conclusion = f"سود قبل از مالیات در مقایسه با دوره قبل به میزان {format_currency_fa(int(delta_profit))}{pct_str} افزایش یافته است."
    else:
        conclusion = "سود قبل از مالیات نسبت به دوره قبل تغییری نداشته است."

    observed_drivers = []
    for driver in profit_decomposition.get("drivers", []):
        impact_fa = "کاهش سود" if driver["impact_direction"] == "negative" else "افزایش سود"
        observed_drivers.append({
            "label": driver["label"],
            "delta": format_currency_fa(driver["delta"]),
            "profit_impact": f"{format_currency_fa(abs(int(driver['profit_impact'])))} ({impact_fa})",
            "share": f"{driver['relative_share']}٪ از وزن تغییرات",
        })

    suggested_actions = [
        "بررسی جزئیات ردیف‌های اسناد حسابداری مربوط به سرفصل‌های هزینه‌ای افزایشی",
        "مقایسه دوره‌ای مراکز هزینه و پروژه‌ها در بخش ابعاد مالی",
    ]
    if profit_decomposition.get("top_expenses"):
        top_exp_title = profit_decomposition["top_expenses"][0]["account_title"]
        suggested_actions.insert(0, f"بررسی و مدیریت سرفصل هزینه «{top_exp_title}» که بیشترین سهم را در هزینه‌ها دارد")

    # Compose structured answer text
    lines = [conclusion, "", "عوامل اصلی ثبت‌شده:"]
    for d in observed_drivers:
        lines.append(f"• {d['label']}: تغییر به میزان {d['delta']} که منجر به {d['profit_impact']} شده است.")
    if profit_decomposition.get("top_expenses"):
        lines.append("")
        lines.append("بزرگترین سرفصل‌های هزینه این دوره:")
        for te in profit_decomposition["top_expenses"][:3]:
            lines.append(f"• {te['account_title']}: {format_currency_fa(te['amount'])} ({te['share_percent']}٪ از کل هزینه‌ها)")

    lines.append("")
    lines.append("اقدامات پیشنهادی:")
    for a in suggested_actions:
        lines.append(f"1. {a}")

    return {
        "answer": "\n".join(lines),
        "conclusion": conclusion,
        "observed_drivers": observed_drivers,
        "suggested_actions": suggested_actions,
        "evidence_links": evidence_refs,
        "limitations": [],
    }


def explain_receivables_risk(
    receivables_risk: dict[str, Any],
    evidence_refs: list[str],
) -> dict[str, Any]:
    if receivables_risk.get("status") != "available":
        return {
            "answer": receivables_risk.get("reason", "اطلاعات مطالبات در دسترس نیست."),
            "conclusion": None,
            "observed_drivers": [],
            "suggested_actions": ["بارگذاری و ثبت فاکتورهای فروش و تخصیص دریافت‌ها"],
            "evidence_links": evidence_refs,
            "limitations": [receivables_risk.get("reason", "عدم وجود فاکتور")],
        }

    total = receivables_risk.get("total_receivables", "0")
    overdue = receivables_risk.get("overdue_receivables", "0")
    overdue_ratio = receivables_risk.get("overdue_ratio_percent", 0.0)
    concentration = receivables_risk.get("concentration_top3_percent", 0.0)
    top_debtors = receivables_risk.get("top_debtors", [])

    conclusion = f"مجموع مطالبات تجاری باز {format_currency_fa(total)} است که از این مبلغ، {format_currency_fa(overdue)} ({overdue_ratio}٪) سررسیدگذشته است."

    observed_drivers = [
        {"metric": "نسبت مطالبات معوق", "value": f"{overdue_ratio}٪"},
        {"metric": "تمرکز ۳ بدهکار برتر", "value": f"{concentration}٪ از کل مطالبات"},
    ]

    suggested_actions = [
        "پیگیری و ارسال یادآوری وصول برای مشتریان دارای مانده سررسیدگذشته در بخش فاکتورها",
        "ثبت دریافت‌های بانکی و اتصال آن‌ها به فاکتورهای باز مربوطه",
        "تعیین یا اصلاح تاریخ‌های سررسید در شرایط فاکتورها",
    ]

    lines = [conclusion, ""]
    if top_debtors:
        lines.append("مهم‌ترین بدهکاران نیازمند توجه:")
        for debtor in top_debtors[:3]:
            od_text = f" (شامل {format_currency_fa(debtor['overdue_amount'])} معوق)" if debtor.get("overdue_amount") != "0" else ""
            lines.append(f"• {debtor['counterparty_name']}: مانده کل {format_currency_fa(debtor['outstanding_amount'])}{od_text}")
        lines.append("")

    lines.append("اقدامات پیشنهادی:")
    for a in suggested_actions:
        lines.append(f"• {a}")

    return {
        "answer": "\n".join(lines),
        "conclusion": conclusion,
        "observed_drivers": observed_drivers,
        "suggested_actions": suggested_actions,
        "evidence_links": evidence_refs,
        "limitations": [],
    }


def explain_cash_trajectory(
    cash_trajectory: dict[str, Any],
    evidence_refs: list[str],
) -> dict[str, Any]:
    if cash_trajectory.get("status") != "available":
        return {
            "answer": cash_trajectory.get("reason", "پیش‌بینی نقدینگی در دسترس نیست."),
            "conclusion": None,
            "observed_drivers": [],
            "suggested_actions": ["اجرای پیش‌بینی نقدینگی ۳۰ روزه"],
            "evidence_links": evidence_refs,
            "limitations": [cash_trajectory.get("reason", "عدم وجود پیش‌بینی")],
        }

    has_deficit = cash_trajectory.get("has_deficit", False)
    min_bal = cash_trajectory.get("min_projected_balance")
    first_date = cash_trajectory.get("first_deficit_date")

    if has_deficit:
        conclusion = f"بر اساس پیش‌بینی ۳۰ روزه، شرکت در تاریخ {first_date} با کسری نقدینگی مواجه خواهد شد. کمترین موجودی پیش‌بینی‌شده {format_currency_fa(min_bal)} است."
        suggested_actions = [
            "تسریع در وصول مطالبات معوق با اولویت مشتریان برتر",
            "مذاکره جهت تعویق زمان پرداخت‌های غیرضروری در برنامه پرداخت",
            "تعریف و آزمودن یک سناریوی جدید در بخش سناریوهای نقدینگی",
        ]
    else:
        conclusion = f"بر اساس پیش‌بینی نقدینگی، کسری موجودی در افق ۳۰ روزه مشاهده نمی‌شود. حداقل موجودی برآوردشده {format_currency_fa(min_bal)} است."
        suggested_actions = [
            "به‌روزرسانی منظم فاکتورها و دریافت/پرداخت‌ها جهت حفظ دقت پیش‌بینی",
        ]

    lines = [conclusion, "", "اقدامات پیشنهادی:"]
    for a in suggested_actions:
        lines.append(f"• {a}")

    return {
        "answer": "\n".join(lines),
        "conclusion": conclusion,
        "observed_drivers": [{"metric": "کسری نقدینگی", "value": "دارد" if has_deficit else "ندارد"}],
        "suggested_actions": suggested_actions,
        "evidence_links": evidence_refs,
        "limitations": [],
    }
