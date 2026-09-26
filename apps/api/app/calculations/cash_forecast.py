from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

import jdatetime
from sqlalchemy import select

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit
from app.financial.models import SalesInvoice

ZERO = Decimal(0)


class CashForecastCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "cash_forecast_13w"

    @property
    def metric_version(self) -> str:
        return "forecast-13w-v1"

    @property
    def title_fa(self) -> str:
        return "پیش‌بینی جریان نقد ۱۳ هفته‌ای"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        # Starting cash
        starting_cash = ctx.extra.get("cash_position")
        if starting_cash is None:
            starting_cash = ZERO

        # Invoices for inflow projection
        invoices = list(
            (
                await ctx.session.scalars(
                    select(SalesInvoice).where(
                        SalesInvoice.company_id == ctx.company_id,
                        SalesInvoice.issue_date <= ctx.as_of_date,
                    )
                )
            ).all()
        )

        open_invoices_count = 0
        scheduled_invoices_count = 0
        overdue_unscheduled_count = 0
        overdue_unscheduled_irr = ZERO
        missing_due_date_count = 0
        missing_due_date_irr = ZERO

        weekly_inflows: dict[int, Decimal] = {w: ZERO for w in range(1, 14)}
        weekly_outflows: dict[int, Decimal] = {w: ZERO for w in range(1, 14)}

        # Weekly baseline burn if positive
        monthly_burn = ctx.extra.get("monthly_burn_rate") or ZERO
        weekly_base_outflow = (
            (monthly_burn / Decimal("4.333")).quantize(Decimal("1"))
            if monthly_burn > ZERO
            else ZERO
        )

        for w in range(1, 14):
            weekly_outflows[w] = weekly_base_outflow

        # Map invoices to weeks
        for inv in invoices:
            paid = inv.paid_amount_irr if inv.paid_amount_irr is not None else ZERO
            outstanding = Decimal(inv.gross_amount_irr) - Decimal(paid)
            if outstanding <= ZERO:
                continue

            open_invoices_count += 1

            if inv.due_date is None:
                missing_due_date_count += 1
                missing_due_date_irr += outstanding
                continue

            due = inv.due_date
            if due < ctx.as_of_date:
                # Overdue invoice! Do NOT place into Week 1 automatically!
                # Report as unscheduled collection.
                overdue_unscheduled_count += 1
                overdue_unscheduled_irr += outstanding
                continue

            # Future invoice with valid due_date
            diff_days = (due - ctx.as_of_date).days
            target_week = (diff_days // 7) + 1

            if 1 <= target_week <= 13:
                weekly_inflows[target_week] += outstanding
                scheduled_invoices_count += 1

        # Build 13 weekly buckets
        weeks_detail: list[dict[str, Any]] = []
        running_cash = starting_cash
        first_deficit_week: int | None = None
        lowest_cash = starting_cash

        for w in range(1, 14):
            w_start = ctx.as_of_date + timedelta(days=(w - 1) * 7)
            w_end = ctx.as_of_date + timedelta(days=w * 7 - 1)

            inflow = weekly_inflows[w]
            outflow = weekly_outflows[w]
            net_change = inflow - outflow
            closing = running_cash + net_change

            if closing < lowest_cash:
                lowest_cash = closing

            is_def = closing < ZERO
            def_amt = abs(closing) if is_def else ZERO
            if is_def and first_deficit_week is None:
                first_deficit_week = w

            jalali_start = jdatetime.date.fromgregorian(date=w_start).strftime("%Y/%m/%d")
            jalali_end = jdatetime.date.fromgregorian(date=w_end).strftime("%Y/%m/%d")
            jalali_range = f"{jalali_start} تا {jalali_end}"

            weeks_detail.append(
                {
                    "week_number": w,
                    "label_fa": f"هفته {w}",
                    "jalali_range": jalali_range,
                    "start_date": str(w_start),
                    "end_date": str(w_end),
                    "opening_cash_irr": str(running_cash),
                    "expected_inflow_irr": str(inflow),
                    "expected_outflow_irr": str(outflow),
                    "net_movement_irr": str(net_change),
                    "closing_cash_irr": str(closing),
                    "is_deficit": is_def,
                    "deficit_amount_irr": str(def_amt),
                }
            )
            running_cash = closing

        # Coverage calculation
        total_open_irr = (
            sum((Decimal(w["expected_inflow_irr"]) for w in weeks_detail), ZERO)
            + overdue_unscheduled_irr
            + missing_due_date_irr
        )
        scheduled_inflow_irr = sum((Decimal(w["expected_inflow_irr"]) for w in weeks_detail), ZERO)

        inflow_cov = (
            round(100 * float(scheduled_inflow_irr / total_open_irr))
            if total_open_irr > ZERO
            else 100
        )
        outflow_cov = 85 if monthly_burn > ZERO else 50

        warnings = []
        if first_deficit_week is not None:
            warnings.append(
                f"بر اساس تعهدات قطعی فعلی، نقدینگی شرکت در هفته {first_deficit_week} با کسری مواجه خواهد شد."
            )
        if overdue_unscheduled_count > 0:
            warnings.append(
                f"مبلغ {overdue_unscheduled_irr:,} ریال مربوط به {overdue_unscheduled_count} فاکتور معوق به دلیل نبود تاریخ وصول مشخص، از جریان قطعی هفتگی تفکیک گردید."
            )
        if missing_due_date_count > 0:
            warnings.append(
                f"تعداد {missing_due_date_count} فاکتور فاقد تاریخ سررسید از جدول زمان‌بندی حذف و در پوشش محدود ثبت شدند."
            )

        status = (
            MetricStatus.AVAILABLE_WITH_WARNING
            if (overdue_unscheduled_count > 0 or missing_due_date_count > 0)
            else MetricStatus.AVAILABLE
        )

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "پیش‌بینی جریان نقدینگی ۱۳ هفته آینده صرفاً بر اساس سررسیدهای قطعی فاکتورها، تعهدات باز و نرخ مصرف مستمر.",
            "formula_fa": "موجودی ابتدای هفته + ورودی‌های قطعی سررسیدشده - خروجی‌های قطعی",
            "formula_version": self.metric_version,
            "starting_cash_irr": str(starting_cash),
            "lowest_projected_cash_irr": str(lowest_cash),
            "first_deficit_week": first_deficit_week,
            "inflow_coverage_percentage": inflow_cov,
            "outflow_coverage_percentage": outflow_cov,
            "overdue_unscheduled_count": overdue_unscheduled_count,
            "overdue_unscheduled_irr": str(overdue_unscheduled_irr),
            "missing_due_date_count": missing_due_date_count,
            "missing_due_date_irr": str(missing_due_date_irr),
            "weeks": weeks_detail,
            "reconciliation_notes": [
                f"اولین هفته کسری احتمالی: {f'هفته {first_deficit_week}' if first_deficit_week else 'بدون کسری'}",
                f"پوشش ورودی‌ها: {inflow_cov}٪ | پوشش خروجی‌ها: {outflow_cov}٪",
            ],
        }

        # Cache in context for dashboard
        ctx.extra["first_deficit_week"] = first_deficit_week
        ctx.extra["lowest_projected_cash_irr"] = lowest_cash
        ctx.extra["forecast_weeks"] = weeks_detail

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=self.metric_version,
            status=status,
            value_numeric=lowest_cash,
            unit=MetricUnit.IRR,
            as_of_date=ctx.as_of_date,
            period_start=ctx.as_of_date,
            period_end=ctx.as_of_date + timedelta(days=90),
            coverage_score=min(inflow_cov, outflow_cov),
            confidence=ConfidenceLevel.HIGH
            if status == MetricStatus.AVAILABLE
            else ConfidenceLevel.MEDIUM,
            input_record_count=scheduled_invoices_count,
            excluded_record_count=overdue_unscheduled_count + missing_due_date_count,
            warnings=warnings,
            evidence_json=evidence,
            calculated_at=datetime.now(),
        )
