from datetime import datetime
from decimal import Decimal

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit

ZERO = Decimal(0)


class RunwayCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "runway"

    @property
    def metric_version(self) -> str:
        return "runway-v1"

    @property
    def title_fa(self) -> str:
        return "تاب‌آوری نقدینگی (Runway)"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        cash = ctx.extra.get("cash_position")
        burn = ctx.extra.get("monthly_burn_rate")

        if cash is None:
            return CalculatedMetricResult(
                metric_key=self.metric_key,
                metric_version=self.metric_version,
                status=MetricStatus.INSUFFICIENT_DATA,
                value_numeric=None,
                unit=MetricUnit.MONTH,
                as_of_date=ctx.as_of_date,
                coverage_score=0,
                confidence=ConfidenceLevel.NONE,
                warnings=["داده‌های نقدینگی فعلی شرکت برای محاسبه تاب‌آوری کافی نیست."],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": (
                        "مدت زمانی (به ماه یا روز) که شرکت با سرعت مصرف فعلی "
                        "می‌تواند به فعالیت ادامه دهد."
                    ),
                    "formula_fa": "نقدینگی در دسترس / میانگین مصرف خالص ماهانه",
                    "formula_version": self.metric_version,
                },
            )

        if burn is None or burn <= ZERO:
            # Business has positive cashflow; burn is zero or negative!
            # Prompt rule: Do not display infinity (∞).
            return CalculatedMetricResult(
                metric_key=self.metric_key,
                metric_version=self.metric_version,
                status=MetricStatus.NOT_APPLICABLE,
                value_numeric=None,
                unit=MetricUnit.MONTH,
                as_of_date=ctx.as_of_date,
                coverage_score=100,
                confidence=ConfidenceLevel.HIGH,
                warnings=["در حال حاضر مصرف خالص نقدینگی مثبت نیست و جریان نقد شرکت خودکفا است."],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": (
                        "تاب‌آوری نقدینگی بر اساس نسبت موجودی به نرخ مصرف نقدی؛ در وضعیت خودکفا "
                        "یا سودآور، شاخص نامحدود نبوده بلکه غیرقابل‌اعمال تلقی می‌شود."
                    ),
                    "formula_fa": "نقدینگی در دسترس / میانگین مصرف ماهانه",
                    "formula_version": self.metric_version,
                    "available_cash_irr": str(cash),
                    "monthly_burn_irr": "0",
                    "is_sustainable": True,
                    "explanation_fa": (
                        "شرکت در بازه انتخابی مازاد نقد داشته و وابسته به مصرف ذخایر نقدی نیست."
                    ),
                },
            )

        # Burn is positive, compute runway
        months = (cash / burn).quantize(Decimal("0.1"))
        days = int(months * 30)

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": (
                "مدت زمانی که ذخایر نقدی شرکت با نرخ کنونی مصرف نقد پاسخگوی هزینه‌ها خواهد بود."
            ),
            "formula_fa": f"نقدینگی ({cash:,}) / مصرف ماهانه ({burn:,})",
            "formula_version": self.metric_version,
            "available_cash_irr": str(cash),
            "monthly_burn_irr": str(burn),
            "runway_months": float(months),
            "runway_days": days,
            "is_sustainable": False,
            "reconciliation_notes": [
                f"ذخیره نقدینگی: {cash:,} ریال | مصرف ماهانه: {burn:,} ریال",
                f"تاب‌آوری تخمینی: {months} ماه (معادل {days} روز)",
            ],
        }

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=self.metric_version,
            status=MetricStatus.AVAILABLE,
            value_numeric=months,
            unit=MetricUnit.MONTH,
            as_of_date=ctx.as_of_date,
            coverage_score=100,
            confidence=ConfidenceLevel.HIGH,
            warnings=[],
            evidence_json=evidence,
            calculated_at=datetime.now(),
        )
