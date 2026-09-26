from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit
from app.financial.models import BankTransaction

ZERO = Decimal(0)


class BurnRateCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "net_cash_burn"

    @property
    def metric_version(self) -> str:
        return "burn-rate-v1"

    @property
    def title_fa(self) -> str:
        return "نرخ خالص مصرف نقد (Burn Rate)"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        trailing_days = ctx.policy.burn_trailing_days
        window_start = ctx.as_of_date - timedelta(days=trailing_days)

        # Fetch bank transactions in trailing window
        txs = list(
            (
                await ctx.session.scalars(
                    select(BankTransaction).where(
                        BankTransaction.company_id == ctx.company_id,
                        BankTransaction.booking_date >= window_start,
                        BankTransaction.booking_date <= ctx.as_of_date,
                    )
                )
            ).all()
        )

        if not txs:
            ctx.extra["monthly_burn_rate"] = ZERO
            return CalculatedMetricResult(
                metric_key=self.metric_key,
                metric_version=self.metric_version,
                status=MetricStatus.INSUFFICIENT_DATA,
                value_numeric=None,
                unit=MetricUnit.IRR,
                as_of_date=ctx.as_of_date,
                period_start=window_start,
                period_end=ctx.as_of_date,
                coverage_score=0,
                confidence=ConfidenceLevel.NONE,
                warnings=["در بازه انتخابی تراکنش بانکی برای سنجش مصرف نقد وجود ندارد."],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": "میانگین مصرف ماهانه ذخایر نقدینگی شرکت ناشی از فزونی خروجی‌ها بر ورودی‌ها.",
                    "formula_fa": "(خروجی‌های واجد شرایط - ورودی‌های واجد شرایط) / (تعداد روزها / ۳۰)",
                    "formula_version": self.metric_version,
                },
            )

        # Internal transfer filtering
        outflows = [tx for tx in txs if tx.amount_irr < 0]
        inflows = [tx for tx in txs if tx.amount_irr > 0]
        matched_inflow_ids: set[str] = set()
        internal_transfer_sum = ZERO

        for out_tx in outflows:
            out_amt = abs(Decimal(out_tx.amount_irr))
            for in_tx in inflows:
                if str(in_tx.id) in matched_inflow_ids:
                    continue
                if in_tx.bank_account_id == out_tx.bank_account_id:
                    continue
                in_amt = Decimal(in_tx.amount_irr)
                if in_amt == out_amt and abs((in_tx.booking_date - out_tx.booking_date).days) <= 1:
                    matched_inflow_ids.add(str(in_tx.id))
                    internal_transfer_sum += in_amt
                    break

        gross_inflows = sum((Decimal(tx.amount_irr) for tx in inflows), ZERO)
        gross_outflows = sum((abs(Decimal(tx.amount_irr)) for tx in outflows), ZERO)
        net_inflows = gross_inflows - internal_transfer_sum
        net_outflows = gross_outflows - internal_transfer_sum

        net_burn_total = net_outflows - net_inflows
        months = Decimal(trailing_days) / Decimal(30)

        # If net cash movement is positive (inflows >= outflows), no net burn!
        if net_burn_total <= ZERO:
            ctx.extra["monthly_burn_rate"] = ZERO
            return CalculatedMetricResult(
                metric_key=self.metric_key,
                metric_version=self.metric_version,
                status=MetricStatus.NOT_APPLICABLE,
                value_numeric=None,
                unit=MetricUnit.IRR,
                as_of_date=ctx.as_of_date,
                period_start=window_start,
                period_end=ctx.as_of_date,
                coverage_score=100,
                confidence=ConfidenceLevel.HIGH,
                warnings=[
                    "در دوره انتخابی مصرف خالص نقدینگی وجود نداشته است (ورودی نقد بیش از خروجی بوده است)."
                ],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": "میانگین مصرف خالص نقدینگی در ماه؛ زمانی که ورودی‌ها بیشتر باشند، مصرف نقد منفی نبوده و غیرقابل‌اعمال تلقی می‌شود.",
                    "formula_fa": f"(خروجی خالص - ورودی خالص) / {months} ماه",
                    "formula_version": self.metric_version,
                    "trailing_days": trailing_days,
                    "net_inflows_irr": str(net_inflows),
                    "net_outflows_irr": str(net_outflows),
                    "is_positive_cashflow": True,
                },
            )

        monthly_burn = (net_burn_total / months).quantize(Decimal("1"))
        ctx.extra["monthly_burn_rate"] = monthly_burn

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "میانگین کسری نقد ماهانه ناشی از برتری خروجی‌های نقدی بر ورودی‌ها طی بازه انتخابی.",
            "formula_fa": f"({net_outflows:,} - {net_inflows:,}) / {months:.1f} ماه",
            "formula_version": self.metric_version,
            "trailing_days": trailing_days,
            "net_inflows_irr": str(net_inflows),
            "net_outflows_irr": str(net_outflows),
            "total_period_burn_irr": str(net_burn_total),
            "monthly_burn_irr": str(monthly_burn),
            "is_positive_cashflow": False,
        }

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=self.metric_version,
            status=MetricStatus.AVAILABLE,
            value_numeric=monthly_burn,
            unit=MetricUnit.IRR,
            as_of_date=ctx.as_of_date,
            period_start=window_start,
            period_end=ctx.as_of_date,
            coverage_score=100,
            confidence=ConfidenceLevel.HIGH,
            input_record_count=len(txs),
            excluded_record_count=len(matched_inflow_ids) * 2,
            warnings=[],
            evidence_json=evidence,
            calculated_at=datetime.now(),
        )
