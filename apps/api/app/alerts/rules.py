from decimal import Decimal

from app.alerts.models import AlertCategory, AlertCode, AlertSeverity


def evaluate_runway_alert(runway_days: int) -> dict[str, object] | None:
    if runway_days <= 15:
        return {
            "code": AlertCode.RUNWAY_CRITICAL,
            "category": AlertCategory.LIQUIDITY,
            "severity": AlertSeverity.CRITICAL,
            "title_fa": "بحران نقدینگی: تاب‌آوری نقد کمتر از ۱۵ روز",
            "summary_fa": (
                f"موجودی نقد و بانک شرکت بر مبنای نرخ سوخت ماهانه تنها برای {runway_days} روز "
                "کفایت می‌کند. در صورت عدم تزریق نقدینگی یا تسریع در وصول مطالبات، "
                "احتمال توقف پرداخت‌های جاری در کمتر از ۳ هفته وجود دارد."
            ),
            "metric_key": "runway_days",
            "current_value": Decimal(runway_days),
            "threshold_value": Decimal(15),
            "metric_unit": "روز",
            "suggested_action_fa": (
                "۱. برگزاری جلسه اضطراری کمیته نقدینگی. "
                "۲. پیگیری ضرب‌الاجلی وصول مطالبات بزرگ. "
                "۳. توقف خریدهای غیرضروری سرمایه‌ای."
            ),
            "target_route": "/cashflow",
        }
    if runway_days <= 30:
        return {
            "code": AlertCode.RUNWAY_WARNING,
            "category": AlertCategory.LIQUIDITY,
            "severity": AlertSeverity.WARNING,
            "title_fa": "هشدار نقدینگی: تاب‌آوری نقد زیر ۳۰ روز",
            "summary_fa": (
                f"تاب‌آوری نقدینگی شرکت به {runway_days} روز کاهش یافته است که "
                "از حداقل بافر امنیتی ۳۰ روز کمتر است."
            ),
            "metric_key": "runway_days",
            "current_value": Decimal(runway_days),
            "threshold_value": Decimal(30),
            "metric_unit": "روز",
            "suggested_action_fa": (
                "بازنگری در زمان‌بندی پرداخت چک‌های ماه جاری و تمرکز تیم فروش بر وصول فاکتورها."
            ),
            "target_route": "/cashflow",
        }
    return None


def evaluate_cash_gap_alert(ccc_days: int) -> dict[str, object] | None:
    if ccc_days > 45:
        return {
            "code": AlertCode.CASH_GAP_HIGH,
            "category": AlertCategory.LIQUIDITY,
            "severity": AlertSeverity.WARNING,
            "title_fa": "شکاف سنگین سرمایه در گردش (CCC بالای ۴۵ روز)",
            "summary_fa": (
                f"چرخه تبدیل وجه نقد (CCC) برابر {ccc_days} روز است؛ فاصله میان دوره وصول مطالبات "
                "و تسویه بدهی‌ها باعث قفل شدن بخش زیادی از نقدینگی در عملیات جاری شرکت شده است."
            ),
            "metric_key": "ccc_days",
            "current_value": Decimal(ccc_days),
            "threshold_value": Decimal(45),
            "metric_unit": "روز",
            "suggested_action_fa": (
                "تعدیل سیاست‌های اعتباری فروش و کوتاه کردن مهلت تسویه مشتریان جدید."
            ),
            "target_route": "/payables",
        }
    return None


def evaluate_debtor_concentration_alert(
    customer_name: str, share_percentage: float, balance_irr: Decimal
) -> dict[str, object] | None:
    if share_percentage >= 35.0:
        severity = AlertSeverity.CRITICAL if share_percentage >= 50.0 else AlertSeverity.WARNING
        return {
            "code": AlertCode.DEBTOR_CONCENTRATION,
            "category": AlertCategory.CREDIT_RISK,
            "severity": severity,
            "title_fa": f"ریسک تمرکز مطالبات: مشتری {customer_name}",
            "summary_fa": (
                f"مشتری «{customer_name}» با مانده بدهی {balance_irr:,} ریال، به تنهایی "
                f"{share_percentage:.1f}٪ از کل مطالبات شرکت را تشکیل می‌دهد. هرگونه تعلل یا "
                "ناتوانی در وصول این مشتری، شرکت را با کمبود نقدینگی شدید روبرو خواهد کرد."
            ),
            "metric_key": "customer_share_ratio",
            "current_value": Decimal(str(round(share_percentage, 2))),
            "threshold_value": Decimal("35.0"),
            "metric_unit": "درصد",
            "suggested_action_fa": (
                "بررسی وثایق و تضامین معتبر، تعیین سقف اعتباری سخت‌گیرانه و تنوع‌بخشی به مشتریان."
            ),
            "target_route": "/receivables",
        }
    return None


def evaluate_overdue_receivables_alert(
    ratio_90_plus: float, amount_90_plus_irr: Decimal
) -> dict[str, object] | None:
    if ratio_90_plus >= 0.20:
        return {
            "code": AlertCode.OVERDUE_RECEIVABLES_SURGE,
            "category": AlertCategory.CREDIT_RISK,
            "severity": AlertSeverity.CRITICAL,
            "title_fa": "انباشت مطالبات سوخت‌شده و معوق بالای ۹۰ روز",
            "summary_fa": (
                f"بیش از {ratio_90_plus * 100:.1f}٪ از کل مطالبات شرکت "
                f"(معادل {amount_90_plus_irr:,} ریال) در بازه سنی بالای ۹۰ روز معوق مانده است."
            ),
            "metric_key": "overdue_90_plus_ratio",
            "current_value": Decimal(str(round(ratio_90_plus * 100, 2))),
            "threshold_value": Decimal("20.0"),
            "metric_unit": "درصد",
            "suggested_action_fa": (
                "ارسال اظهارنامه رسمی، پیگیری حقوقی و توقف سفارش‌های اعتباری جدید."
            ),
            "target_route": "/receivables",
        }
    return None


def evaluate_customer_credit_alert(
    customer_count: int, total_exposure_irr: Decimal
) -> dict[str, object] | None:
    if customer_count > 0:
        return {
            "code": AlertCode.CUSTOMER_CREDIT_ALERT,
            "category": AlertCategory.CREDIT_RISK,
            "severity": AlertSeverity.CRITICAL,
            "title_fa": f"ریسک بالای اعتباری {customer_count} مشتری عمده",
            "summary_fa": (
                f"تعداد {customer_count} مشتری با مجموع مانده {total_exposure_irr:,} ریال "
                "دارای امتیاز ریسک بالای ۷۰ (بحرانی) هستند."
            ),
            "metric_key": "high_risk_customers_count",
            "current_value": Decimal(customer_count),
            "threshold_value": Decimal(1),
            "metric_unit": "مشتری",
            "suggested_action_fa": (
                "بررسی فوری سبد سنی، مسدودسازی موقت خط اعتباری و توافق بر سر تسویه اقساطی."
            ),
            "target_route": "/receivables",
        }
    return None


def evaluate_supplier_stoppage_alert(
    vendor_count: int, overdue_irr: Decimal
) -> dict[str, object] | None:
    if vendor_count > 0:
        return {
            "code": AlertCode.SUPPLIER_STOPPAGE_RISK,
            "category": AlertCategory.SUPPLY_CHAIN,
            "severity": AlertSeverity.CRITICAL,
            "title_fa": "ریسک توقف تامین: بدهی معوق بالای ۶۰ روز به تامین‌کننده",
            "summary_fa": (
                f"بدهی معوق بالای ۶۰ روز به {vendor_count} تامین‌کننده به مبلغ {overdue_irr:,} "
                "ریال، ریسک توقف زنجیره تامین یا عدم تحویل مواد اولیه را به همراه دارد."
            ),
            "metric_key": "stoppage_risk_vendor_count",
            "current_value": Decimal(vendor_count),
            "threshold_value": Decimal(1),
            "metric_unit": "تامین‌کننده",
            "suggested_action_fa": (
                "مذاکره خزانه‌داری با تامین‌کننده و پرداخت اولویت‌دار بخشی از مانده بدهی."
            ),
            "target_route": "/payables",
        }
    return None


def evaluate_payables_overdue_alert(
    overdue_ratio: float, overdue_amount_irr: Decimal
) -> dict[str, object] | None:
    if overdue_ratio >= 0.30:
        return {
            "code": AlertCode.PAYABLES_OVERDUE_SURGE,
            "category": AlertCategory.SUPPLY_CHAIN,
            "severity": AlertSeverity.WARNING,
            "title_fa": "انباشت تعهدات معوق به بستانکاران تجاری",
            "summary_fa": (
                f"نسبت بدهی‌های معوق به کل بستانکاران به {overdue_ratio * 100:.1f}٪ "
                f"(معادل {overdue_amount_irr:,} ریال) رسیده است."
            ),
            "metric_key": "payables_overdue_ratio",
            "current_value": Decimal(str(round(overdue_ratio * 100, 2))),
            "threshold_value": Decimal("30.0"),
            "metric_unit": "درصد",
            "suggested_action_fa": (
                "زمان‌بندی مجدد تعهدات پرداخت و هماهنگی با خزانه‌داری جهت انطباق با ورود وجه نقد."
            ),
            "target_route": "/payables",
        }
    return None
