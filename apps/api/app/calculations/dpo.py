from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit
from app.financial.models import (
    AccountClass,
    AccountClassification,
    BankTransaction,
    JournalEntry,
    JournalLine,
)

ZERO = Decimal(0)


class DPOCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "dpo"

    @property
    def metric_version(self) -> str:
        return "dpo-v1"

    @property
    def title_fa(self) -> str:
        return "دوره پرداخت بدهی‌ها (DPO)"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        days_window = 90
        window_start = ctx.as_of_date - timedelta(days=days_window)

        open_ap = ctx.extra.get("open_payables")
        if open_ap is None:
            open_ap = ZERO

        # Try to find COGS / purchases from expense ledger
        expense_sum = await ctx.session.scalar(
            select(func.sum(JournalLine.debit_irr - JournalLine.credit_irr))
            .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
            .join(
                AccountClassification,
                (AccountClassification.account_id == JournalLine.account_id)
                & (AccountClassification.account_class == AccountClass.EXPENSE),
            )
            .where(
                JournalLine.company_id == ctx.company_id,
                JournalEntry.entry_date >= window_start,
                JournalEntry.entry_date <= ctx.as_of_date,
            )
        )

        cogs = Decimal(expense_sum or ZERO)
        is_proxy = False
        denominator_source = "دفاتر حسابداری (سرفصل‌های هزینه/بهای تمام‌شده)"

        if cogs <= ZERO:
            # Fallback to bank outflows in window (excluding internal transfers)
            transfer_ids = ctx.extra.get("internal_transfer_tx_ids", set())
            outflows_query = select(BankTransaction.id, BankTransaction.amount_irr).where(
                BankTransaction.company_id == ctx.company_id,
                BankTransaction.booking_date >= window_start,
                BankTransaction.booking_date <= ctx.as_of_date,
                BankTransaction.amount_irr < 0,
            )
            outflow_rows = (await ctx.session.execute(outflows_query)).all()
            eligible_outflow_sum = sum(
                (
                    abs(Decimal(r.amount_irr))
                    for r in outflow_rows
                    if r.id not in transfer_ids and str(r.id) not in transfer_ids
                ),
                ZERO,
            )
            if eligible_outflow_sum > 0:
                cogs = eligible_outflow_sum
                is_proxy = True
                denominator_source = "مجموع خروجی‌های بانکی غیرانتقالی دوره (تقریب)"

        if cogs <= ZERO or open_ap <= ZERO:
            if open_ap <= ZERO:
                # If there are no payables at all, DPO is 0
                return CalculatedMetricResult(
                    metric_key=self.metric_key,
                    metric_version=self.metric_version,
                    status=MetricStatus.AVAILABLE,
                    value_numeric=Decimal(0),
                    unit=MetricUnit.DAY,
                    as_of_date=ctx.as_of_date,
                    period_start=window_start,
                    period_end=ctx.as_of_date,
                    coverage_score=100,
                    confidence=ConfidenceLevel.HIGH,
                    warnings=[],
                    evidence_json={
                        "title_fa": self.title_fa,
                        "definition_fa": "میانگین روزهایی که طول می‌کشد تا شرکت بدهی‌های تجاری خود به تامین‌کنندگان را تسویه کند.",
                        "formula_fa": f"(بدهی‌های تجاری / بهای تمام‌شده یا خروجی‌های {days_window} روزه) × {days_window}",
                        "formula_version": self.metric_version,
                        "open_ap_irr": "0",
                        "purchases_or_cogs_irr": str(cogs),
                    },
                )

            # Open payables exist, but denominator is missing
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
                    f"برای محاسبه DPO داده‌های معتبر خرید یا بهای تمام‌شده (یا خروجی بانکی) در بازه {days_window} روز گذشته وجود ندارد."
                ],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": "دوره بازپرداخت بدهی‌های تجاری؛ نیازمند داده معتبر مخرج (خرید یا خروجی تسویه تامین‌کنندگان).",
                    "formula_fa": f"(بدهی‌های تجاری / خرید یا بهای تمام‌شده) × {days_window}",
                    "formula_version": self.metric_version,
                    "open_ap_irr": str(open_ap),
                    "purchases_or_cogs_irr": "0",
                },
            )

        dpo_val = (open_ap / cogs * Decimal(days_window)).quantize(Decimal("0.1"))
        version = "dpo-outflows-proxy-v1" if is_proxy else self.metric_version
        status = MetricStatus.APPROXIMATE if is_proxy else MetricStatus.AVAILABLE
        warnings = (
            [
                f"به دلیل نبود سرفصل‌های تفکیک‌شده بهای تمام‌شده (COGS)، از {denominator_source} به عنوان تقریب استفاده شد."
            ]
            if is_proxy
            else []
        )

        ctx.extra["dpo_days"] = dpo_val

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "میانگین تعداد روزهایی که شرکت برای پرداخت تعهدات به تامین‌کنندگان زمان صرف می‌کند.",
            "formula_fa": f"(بدهی تجاری / {denominator_source}) × {days_window}",
            "formula_version": version,
            "period_days": days_window,
            "open_ap_irr": str(open_ap),
            "purchases_or_cogs_irr": str(cogs),
            "reconciliation_notes": [
                f"منبع مخرج کسر: {denominator_source}",
                f"بدهی تجاری: {open_ap:,} ریال | مصارف یا خروجی دوره: {cogs:,} ریال",
            ],
        }

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=version,
            status=status,
            value_numeric=dpo_val,
            unit=MetricUnit.DAY,
            as_of_date=ctx.as_of_date,
            period_start=window_start,
            period_end=ctx.as_of_date,
            coverage_score=90 if is_proxy else 100,
            confidence=ConfidenceLevel.MEDIUM if is_proxy else ConfidenceLevel.HIGH,
            input_record_count=1,
            excluded_record_count=0,
            warnings=warnings,
            evidence_json=evidence,
            calculated_at=datetime.now(),
        )
