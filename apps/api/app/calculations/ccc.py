from datetime import datetime

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit


class CCCCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "ccc"

    @property
    def metric_version(self) -> str:
        return "ccc-v1"

    @property
    def title_fa(self) -> str:
        return "چرخه تبدیل وجه نقد (CCC)"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        dso = ctx.extra.get("dso_days")
        dpo = ctx.extra.get("dpo_days")

        # In Phase 1 canonical model, inventory (DIO) data is not yet ingested.
        # True CCC requires DIO: CCC = DIO + DSO - DPO.
        # Under no circumstance should DSO - DPO be labeled or returned as true CCC!
        gap = None
        if dso is not None and dpo is not None:
            gap = dso - dpo

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "چرخه تبدیل وجه نقد؛ مدت زمانی که طول می‌کشد منابع مالی صرف‌شده برای تامین و تولید، از طریق فروش وصول شوند.",
            "formula_fa": "DIO (دوره گردش موجودی) + DSO (دوره وصول) - DPO (دوره پرداخت)",
            "formula_version": self.metric_version,
            "dio_available": False,
            "dso_days": str(dso) if dso is not None else None,
            "dpo_days": str(dpo) if dpo is not None else None,
            "receivable_payable_gap_days": str(gap) if gap is not None else None,
            "receivable_payable_gap_title_fa": "فاصله وصول تا پرداخت (DSO - DPO)",
            "reconciliation_notes": [
                "به دلیل عدم ورود داده‌های انبار و موجودی کالا در این فاز، مقدار قطعی DIO در دسترس نیست و محاسبه CCC متوقف شده است.",
                f"شاخص جانبی «فاصله وصول تا پرداخت»: {gap if gap is not None else 'نامشخص'} روز",
            ],
        }

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=self.metric_version,
            status=MetricStatus.INSUFFICIENT_DATA,
            value_numeric=None,
            unit=MetricUnit.DAY,
            as_of_date=ctx.as_of_date,
            coverage_score=0,
            confidence=ConfidenceLevel.NONE,
            input_record_count=0,
            excluded_record_count=0,
            warnings=[
                "برای محاسبه چرخه تبدیل نقدینگی، داده موجودی کالا (DIO) کافی نیست. داده‌های ورودی فاز ۱ شامل دفاتر، بانک و فروش هستند."
            ],
            evidence_json=evidence,
            calculated_at=datetime.now(),
        )
