from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit
from app.financial.models import SalesInvoice

ZERO = Decimal(0)


class DSOCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "dso"

    @property
    def metric_version(self) -> str:
        return "dso-v1"

    @property
    def title_fa(self) -> str:
        return "دوره وصول مطالبات (DSO)"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        # Determine period from policy
        days_window = ctx.policy.dso_period_days
        window_start = ctx.as_of_date - timedelta(days=days_window)

        # 1. AR at as_of_date
        open_ar = ctx.extra.get("open_receivables")
        if open_ar is None:
            # Query open receivables directly
            open_ar_sum = await ctx.session.scalar(
                select(
                    func.sum(
                        SalesInvoice.gross_amount_irr
                        - func.coalesce(SalesInvoice.paid_amount_irr, ZERO)
                    )
                ).where(
                    SalesInvoice.company_id == ctx.company_id,
                    SalesInvoice.issue_date <= ctx.as_of_date,
                    (
                        SalesInvoice.gross_amount_irr
                        - func.coalesce(SalesInvoice.paid_amount_irr, ZERO)
                    )
                    > ZERO,
                )
            )
            open_ar = Decimal(open_ar_sum or ZERO)

        # 2. Sales in period
        sales_in_period = await ctx.session.scalar(
            select(func.sum(SalesInvoice.gross_amount_irr)).where(
                SalesInvoice.company_id == ctx.company_id,
                SalesInvoice.issue_date >= window_start,
                SalesInvoice.issue_date <= ctx.as_of_date,
            )
        )
        total_sales = Decimal(sales_in_period or ZERO)

        if total_sales <= ZERO:
            return CalculatedMetricResult(
                metric_key=self.metric_key,
                metric_version=self.metric_version,
                status=MetricStatus.INSUFFICIENT_DATA,
                value_numeric=None,
                unit=MetricUnit.DAY,
                as_of_date=ctx.as_of_date,
                period_start=window_start,
                period_end=ctx.as_of_date,
                coverage_score=0,
                confidence=ConfidenceLevel.NONE,
                input_record_count=0,
                excluded_record_count=0,
                warnings=[
                    f"در بازه {days_window} روز گذشته هیچ فروش صورتحساب‌شده‌ای ثبت نشده است و مخرج کسر صفر است."
                ],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": "میانگین روزهایی که طول می‌کشد تا فاکتورهای فروش شرکت به وجه نقد تبدیل شوند.",
                    "formula_fa": f"(مطالبات باز / فروش دوره {days_window} روزه) × {days_window}",
                    "formula_version": self.metric_version,
                    "period_days": days_window,
                    "open_ar_irr": str(open_ar),
                    "sales_in_period_irr": "0",
                },
            )

        # DSO formula
        # If open_ar == 0, DSO is 0 days (all receivables collected)
        if open_ar <= ZERO:
            dso_val = Decimal(0)
            status = MetricStatus.AVAILABLE
            version = self.metric_version
            warnings = []
        else:
            dso_val = (open_ar / total_sales * Decimal(days_window)).quantize(Decimal("0.1"))
            # Check if strict or proxy
            is_proxy = (
                ctx.policy.dso_method == "sales_proxy" or True
            )  # In Phase 1 canonical, sales_invoice represents total invoiced sales
            if is_proxy:
                status = MetricStatus.APPROXIMATE
                version = "dso-sales-proxy-v1"
                warnings = [
                    "به دلیل نبود تفکیک صریح فروش نقد و نسیه در فایل فاکتورها، کل فروش صورتحساب‌شده به عنوان مبنای تقریب DSO در نظر گرفته شد."
                ]
            else:
                status = MetricStatus.AVAILABLE
                version = "dso-v1"
                warnings = []

        ctx.extra["dso_days"] = dso_val

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "شاخص سرعت نقدشوندگی مطالبات فروش؛ نشان‌دهنده میانگین روزهای انتظار از صدور تا وصول فاکتور.",
            "formula_fa": f"(مطالبات جاری / فروش {days_window} روزه) × {days_window}",
            "formula_version": version,
            "period_days": days_window,
            "open_ar_irr": str(open_ar),
            "sales_in_period_irr": str(total_sales),
            "reconciliation_notes": [
                f"مبنای محاسبه: بازه {days_window} روز منتهی به تاریخ مبنا ({window_start} تا {ctx.as_of_date})",
                f"فروش کل دوره: {total_sales:,} ریال | مطالبات باز: {open_ar:,} ریال",
            ],
        }

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=version,
            status=status,
            value_numeric=dso_val,
            unit=MetricUnit.DAY,
            as_of_date=ctx.as_of_date,
            period_start=window_start,
            period_end=ctx.as_of_date,
            coverage_score=95 if status == MetricStatus.APPROXIMATE else 100,
            confidence=ConfidenceLevel.HIGH
            if status == MetricStatus.AVAILABLE
            else ConfidenceLevel.MEDIUM,
            input_record_count=1,
            excluded_record_count=0,
            warnings=warnings,
            evidence_json=evidence,
            calculated_at=datetime.now(),
        )
