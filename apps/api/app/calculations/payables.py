from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit
from app.financial.models import (
    AccountClass,
    AccountClassification,
    Counterparty,
    JournalEntry,
    JournalLine,
)

ZERO = Decimal(0)

AGING_BUCKET_KEYS = [
    ("not_due", "جاری / سررسید نشده"),
    ("1_30", "۱ تا ۳۰ روز معوق"),
    ("31_60", "۳۱ تا ۶۰ روز معوق"),
    ("61_90", "۶۱ تا ۹۰ روز معوق"),
    ("90_plus", "بیش از ۹۰ روز معوق"),
    ("due_date_missing", "فاقد تاریخ سررسید"),
]


class PayablesCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "open_payables"

    @property
    def metric_version(self) -> str:
        return "payables-v1"

    @property
    def title_fa(self) -> str:
        return "بدهی‌های تجاری و تعهدات پرداخت"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        # Fetch liability journal lines with linked counterparty (supplier)
        query = (
            select(JournalLine, JournalEntry, Counterparty)
            .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
            .join(Counterparty, JournalLine.counterparty_id == Counterparty.id)
            .join(
                AccountClassification,
                (AccountClassification.account_id == JournalLine.account_id)
                & (AccountClassification.account_class == AccountClass.LIABILITY),
            )
            .where(
                JournalLine.company_id == ctx.company_id,
                JournalEntry.entry_date <= ctx.as_of_date,
            )
            .order_by(JournalEntry.entry_date.desc(), JournalLine.id)
        )
        results = (await ctx.session.execute(query)).all()

        if not results:
            ctx.extra["open_payables"] = ZERO
            ctx.extra["open_payables_list"] = []
            return CalculatedMetricResult(
                metric_key=self.metric_key,
                metric_version=self.metric_version,
                status=MetricStatus.INSUFFICIENT_DATA,
                value_numeric=None,
                unit=MetricUnit.IRR,
                as_of_date=ctx.as_of_date,
                coverage_score=0,
                confidence=ConfidenceLevel.NONE,
                input_record_count=0,
                excluded_record_count=0,
                warnings=[
                    "در سرفصل‌های بدهی‌های تجاری، داده قابل اتکا برای تفکیک تعهدات تامین‌کنندگان ثبت نشده است."
                ],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": "مجموع تعهدات تسویه‌نشده به تامین‌کنندگان بر مبنای اسناد استاندارد بدهی تجاری.",
                    "formula_fa": "مجموع مانده بستانکاری به تفکیک تامین‌کنندگان معتبر",
                    "formula_version": self.metric_version,
                    "total_open_irr": "0",
                    "total_overdue_irr": "0",
                    "aging_buckets": [],
                    "supplier_concentration": [],
                },
            )

        # Net balance per supplier/invoice_ref
        supplier_totals: dict[UUID, dict[str, Any]] = {}
        items_list: list[dict[str, Any]] = []
        bucket_sums: dict[str, Decimal] = {k: ZERO for k, _ in AGING_BUCKET_KEYS}
        bucket_counts: dict[str, int] = {k: 0 for k, _ in AGING_BUCKET_KEYS}
        input_record_ids: list[str] = []
        total_open = ZERO
        total_overdue = ZERO
        missing_due_date_count = 0

        for line, entry, cp in results:
            net_amt = Decimal(line.credit_irr) - Decimal(line.debit_irr)
            if net_amt <= ZERO:
                continue

            total_open += net_amt
            input_record_ids.append(str(line.id))

            # Check if there is explicit due date (e.g. from invoice_ref or note)
            # Never fabricate 45 days! If not explicit, assign to due_date_missing
            bucket = "due_date_missing"
            missing_due_date_count += 1

            bucket_sums[bucket] += net_amt
            bucket_counts[bucket] += 1

            cid = cp.id
            if cid not in supplier_totals:
                supplier_totals[cid] = {
                    "supplier_id": str(cid),
                    "name": cp.name,
                    "total_outstanding": ZERO,
                    "overdue_amount": ZERO,
                    "item_count": 0,
                }
            supplier_totals[cid]["total_outstanding"] += net_amt
            supplier_totals[cid]["item_count"] += 1

            items_list.append(
                {
                    "line_id": str(line.id),
                    "supplier_name": cp.name,
                    "entry_date": str(entry.entry_date),
                    "amount_irr": str(net_amt),
                    "reference": line.invoice_ref or entry.reference,
                    "bucket": bucket,
                }
            )

        sum_of_buckets = sum(bucket_sums.values(), ZERO)
        reconciled = sum_of_buckets == total_open

        aging_breakdown = []
        for k, label in AGING_BUCKET_KEYS:
            amt = bucket_sums[k]
            pct = (
                float((amt / total_open * 100).quantize(Decimal("0.1")))
                if total_open > ZERO
                else 0.0
            )
            aging_breakdown.append(
                {
                    "bucket_key": k,
                    "label_fa": label,
                    "amount_irr": str(amt),
                    "count": bucket_counts[k],
                    "percentage": pct,
                }
            )

        # Supplier concentration: Top 5
        sorted_suppliers = sorted(
            supplier_totals.values(), key=lambda s: s["total_outstanding"], reverse=True
        )[:5]
        top_5_concentration = []
        top_5_sum = ZERO
        for ss in sorted_suppliers:
            amt = ss["total_outstanding"]
            top_5_sum += amt
            pct = (
                float((amt / total_open * 100).quantize(Decimal("0.1")))
                if total_open > ZERO
                else 0.0
            )
            top_5_concentration.append(
                {
                    "supplier_id": ss["supplier_id"],
                    "name": ss["name"],
                    "outstanding_irr": str(amt),
                    "item_count": ss["item_count"],
                    "share_percentage": pct,
                }
            )

        top_5_share = (
            float((top_5_sum / total_open * 100).quantize(Decimal("0.1")))
            if total_open > ZERO
            else 0.0
        )

        warnings = []
        if missing_due_date_count > 0:
            warnings.append(
                f"تعداد {missing_due_date_count} سند بدهی تجاری فاقد تاریخ سررسید صریح هستند و "
                "بدون حدس‌زدن روزهای فرضی در باکت «فاقد تاریخ سررسید» درج شدند."
            )

        # Cache in context for downstream DPO and forecast calculators
        ctx.extra["open_payables"] = total_open
        ctx.extra["open_payables_list"] = items_list

        reconciliation_status = "تأییدشده و منطبق" if reconciled else "عدم انطباق"
        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": (
                "مجموع بدهی‌های جاری تجاری به تامین‌کنندگان کالا و خدمات بر مبنای اسناد قطعی."
            ),
            "formula_fa": "مجموع مانده‌های بستانکاری طبقه‌بندی‌شده تامین‌کنندگان",
            "formula_version": self.metric_version,
            "total_open_irr": str(total_open),
            "total_overdue_irr": str(total_overdue),
            "aging_buckets": aging_breakdown,
            "supplier_concentration": top_5_concentration,
            "top_5_share_percentage": top_5_share,
            "reconciliation_notes": [
                f"تراز باکت‌های سنی با کل بدهی‌ها: {reconciliation_status}",
                f"تمرکز ۵ تامین‌کننده عمده: {top_5_share}٪ از کل تعهدات",
            ],
        }

        status = (
            MetricStatus.AVAILABLE_WITH_WARNING
            if missing_due_date_count > 0
            else MetricStatus.AVAILABLE
        )

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=self.metric_version,
            status=status,
            value_numeric=total_open,
            unit=MetricUnit.IRR,
            as_of_date=ctx.as_of_date,
            coverage_score=80 if missing_due_date_count > 0 else 100,
            confidence=ConfidenceLevel.HIGH,
            input_record_count=len(items_list),
            excluded_record_count=0,
            warnings=warnings,
            evidence_json=evidence,
            input_record_ids=input_record_ids[:30],
            calculated_at=datetime.now(),
        )
