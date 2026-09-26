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
from app.financial.models import Counterparty, SalesInvoice

ZERO = Decimal(0)

AGING_BUCKET_KEYS = [
    ("not_due", "جاری / سررسید نشده"),
    ("1_30", "۱ تا ۳۰ روز معوق"),
    ("31_60", "۳۱ تا ۶۰ روز معوق"),
    ("61_90", "۶۱ تا ۹۰ روز معوق"),
    ("90_plus", "بیش از ۹۰ روز معوق"),
    ("due_date_missing", "فاقد تاریخ سررسید"),
]


class ReceivablesCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "open_receivables"

    @property
    def metric_version(self) -> str:
        return "receivables-v1"

    @property
    def title_fa(self) -> str:
        return "مطالبات تجاری باز"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        # Fetch all sales invoices for the company
        query = (
            select(SalesInvoice, Counterparty)
            .join(Counterparty, SalesInvoice.counterparty_id == Counterparty.id)
            .where(
                SalesInvoice.company_id == ctx.company_id,
                SalesInvoice.issue_date <= ctx.as_of_date,
            )
            .order_by(SalesInvoice.issue_date.desc(), SalesInvoice.id)
        )
        results = (await ctx.session.execute(query)).all()

        if not results:
            ctx.extra["open_receivables"] = ZERO
            ctx.extra["invoices_for_dso"] = []
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
                warnings=["در سامانه هیچ فاکتور فروش ثبت‌شده‌ای در تاریخ مبنا وجود ندارد."],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": (
                        "مجموع مانده پرداخت‌نشده فاکتورهای فروش معتبر صادره تا تاریخ مبنا."
                    ),
                    "formula_fa": "مجموع (مبلغ کل فاکتور - مبالغ وصول‌شده)",
                    "formula_version": self.metric_version,
                    "open_invoices_count": 0,
                    "total_open_irr": "0",
                    "total_overdue_irr": "0",
                    "aging_buckets": [],
                    "customer_concentration": [],
                },
            )

        total_open = ZERO
        total_overdue = ZERO
        bucket_sums: dict[str, Decimal] = {k: ZERO for k, _ in AGING_BUCKET_KEYS}
        bucket_counts: dict[str, int] = {k: 0 for k, _ in AGING_BUCKET_KEYS}

        customer_totals: dict[UUID, dict[str, Any]] = {}
        input_record_ids: list[str] = []
        open_invoices_list: list[dict[str, Any]] = []
        missing_due_date_count = 0

        for inv, cp in results:
            paid = inv.paid_amount_irr if inv.paid_amount_irr is not None else ZERO
            outstanding = Decimal(inv.gross_amount_irr) - Decimal(paid)

            if outstanding <= ZERO:
                continue

            total_open += outstanding
            input_record_ids.append(str(inv.id))

            # Determine bucket
            if inv.due_date is None:
                bucket = "due_date_missing"
                delay = 0
                missing_due_date_count += 1
            else:
                delay = (ctx.as_of_date - inv.due_date).days
                if delay <= 0:
                    bucket = "not_due"
                elif delay <= 30:
                    bucket = "1_30"
                    total_overdue += outstanding
                elif delay <= 60:
                    bucket = "31_60"
                    total_overdue += outstanding
                elif delay <= 90:
                    bucket = "61_90"
                    total_overdue += outstanding
                else:
                    bucket = "90_plus"
                    total_overdue += outstanding

            bucket_sums[bucket] += outstanding
            bucket_counts[bucket] += 1

            cid = cp.id
            if cid not in customer_totals:
                customer_totals[cid] = {
                    "customer_id": str(cid),
                    "name": cp.name,
                    "total_outstanding": ZERO,
                    "overdue_amount": ZERO,
                    "invoice_count": 0,
                }
            customer_totals[cid]["total_outstanding"] += outstanding
            customer_totals[cid]["invoice_count"] += 1
            if bucket in ("1_30", "31_60", "61_90", "90_plus"):
                customer_totals[cid]["overdue_amount"] += outstanding

            open_invoices_list.append(
                {
                    "invoice_id": str(inv.id),
                    "invoice_no": inv.invoice_no,
                    "customer_name": cp.name,
                    "issue_date": str(inv.issue_date),
                    "due_date": str(inv.due_date) if inv.due_date else None,
                    "gross_amount_irr": str(inv.gross_amount_irr),
                    "paid_amount_irr": str(paid),
                    "outstanding_irr": str(outstanding),
                    "days_overdue": delay if inv.due_date else None,
                    "bucket": bucket,
                }
            )

        # Strict reconciliation check: sum of buckets == total_open
        sum_of_buckets = sum(bucket_sums.values(), ZERO)
        reconciled = sum_of_buckets == total_open

        # Aging buckets breakdown
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

        # Customer concentration: Top 5
        sorted_customers = sorted(
            customer_totals.values(), key=lambda c: c["total_outstanding"], reverse=True
        )[:5]
        top_5_concentration = []
        top_5_sum = ZERO
        for sc in sorted_customers:
            amt = sc["total_outstanding"]
            top_5_sum += amt
            pct = (
                float((amt / total_open * 100).quantize(Decimal("0.1")))
                if total_open > ZERO
                else 0.0
            )
            top_5_concentration.append(
                {
                    "customer_id": sc["customer_id"],
                    "name": sc["name"],
                    "outstanding_irr": str(amt),
                    "overdue_irr": str(sc["overdue_amount"]),
                    "invoice_count": sc["invoice_count"],
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
                f"تعداد {missing_due_date_count} فاکتور باز فاقد تاریخ سررسید در سامانه شناسایی شد "
                "و در باکت «فاقد تاریخ سررسید» تفکیک گردید."
            )
        if not reconciled:
            warnings.append(
                "هشدار عدم انطباق ریاضی: مجموع باکت‌های سنی با سرجمع کل مطالبات باز تطبیق ندارد."
            )

        # Cache in context for downstream DSO and forecast calculators
        ctx.extra["open_receivables"] = total_open
        ctx.extra["overdue_receivables"] = total_overdue
        ctx.extra["open_invoices_list"] = open_invoices_list
        ctx.extra["missing_due_date_invoices_count"] = missing_due_date_count

        reconciliation_status = "تأییدشده و منطبق" if reconciled else "عدم انطباق"
        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "مجموع مطالبات تجاری باز شرکت به تفکیک دوره‌های سررسید و مشتریان عمده.",
            "formula_fa": "مجموع مبالغ مانده تسویه‌نشده فاکتورهای فروش معتبر",
            "formula_version": self.metric_version,
            "open_invoices_count": len(open_invoices_list),
            "total_open_irr": str(total_open),
            "total_overdue_irr": str(total_overdue),
            "overdue_percentage": (
                float((total_overdue / total_open * 100).quantize(Decimal("0.1")))
                if total_open > ZERO
                else 0.0
            ),
            "aging_buckets": aging_breakdown,
            "customer_concentration": top_5_concentration,
            "top_5_share_percentage": top_5_share,
            "reconciliation_notes": [
                f"تراز باکت‌های سنی با کل مطالبات: {reconciliation_status}",
                f"تمرکز ۵ مشتری برتر: {top_5_share}٪ از کل مطالبات",
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
            coverage_score=100
            if missing_due_date_count == 0
            else max(50, 100 - (missing_due_date_count * 5)),
            confidence=ConfidenceLevel.HIGH,
            input_record_count=len(open_invoices_list),
            excluded_record_count=len(results) - len(open_invoices_list),
            warnings=warnings,
            evidence_json=evidence,
            input_record_ids=input_record_ids[:30],
            calculated_at=datetime.now(),
        )
