from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit
from app.financial.models import BankTransaction

ZERO = Decimal(0)


class CashMovementCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "net_cash_movement"

    @property
    def metric_version(self) -> str:
        return "cash-movement-v1"

    @property
    def title_fa(self) -> str:
        return "خالص تغییرات نقدینگی"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        # Fetch all bank transactions in the period
        transactions = list(
            (
                await ctx.session.scalars(
                    select(BankTransaction)
                    .where(
                        BankTransaction.company_id == ctx.company_id,
                        BankTransaction.booking_date >= ctx.period_start,
                        BankTransaction.booking_date <= ctx.period_end,
                    )
                    .order_by(BankTransaction.booking_date, BankTransaction.id)
                )
            ).all()
        )

        if not transactions:
            return CalculatedMetricResult(
                metric_key=self.metric_key,
                metric_version=self.metric_version,
                status=MetricStatus.INSUFFICIENT_DATA,
                value_numeric=None,
                unit=MetricUnit.IRR,
                as_of_date=ctx.as_of_date,
                period_start=ctx.period_start,
                period_end=ctx.period_end,
                coverage_score=0,
                confidence=ConfidenceLevel.NONE,
                input_record_count=0,
                excluded_record_count=0,
                warnings=["در دوره انتخابی هیچ تراکنش بانکی ثبت نشده است."],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": "تفاضل کل ورودی‌ها از خروجی‌های واقعی نقد در دوره انتخابی با کسر جابجایی بین‌حسابی.",
                    "formula_fa": "ورودی نقد خالص - خروجی نقد خالص",
                    "formula_version": self.metric_version,
                    "gross_inflows_irr": "0",
                    "gross_outflows_irr": "0",
                    "internal_transfers_irr": "0",
                },
            )

        # 1. Identify candidate internal transfers (same amount, opposite sign, different bank accounts, booking_date delta <= 1 day)
        outflows = [tx for tx in transactions if tx.amount_irr < 0]
        inflows = [tx for tx in transactions if tx.amount_irr > 0]

        matched_outflow_ids: set[str] = set()
        matched_inflow_ids: set[str] = set()
        internal_transfers: list[dict[str, Any]] = []

        for out_tx in outflows:
            out_amt = abs(Decimal(out_tx.amount_irr))
            for in_tx in inflows:
                if str(in_tx.id) in matched_inflow_ids:
                    continue
                if in_tx.bank_account_id == out_tx.bank_account_id:
                    continue
                in_amt = Decimal(in_tx.amount_irr)
                if in_amt == out_amt and abs((in_tx.booking_date - out_tx.booking_date).days) <= 1:
                    matched_outflow_ids.add(str(out_tx.id))
                    matched_inflow_ids.add(str(in_tx.id))
                    internal_transfers.append(
                        {
                            "outflow_tx_id": str(out_tx.id),
                            "inflow_tx_id": str(in_tx.id),
                            "amount_irr": str(in_amt),
                            "date": str(out_tx.booking_date),
                            "from_account_id": str(out_tx.bank_account_id),
                            "to_account_id": str(in_tx.bank_account_id),
                        }
                    )
                    break

        gross_inflows = sum((Decimal(tx.amount_irr) for tx in inflows), ZERO)
        gross_outflows = sum((abs(Decimal(tx.amount_irr)) for tx in outflows), ZERO)
        internal_transfer_total = sum((Decimal(t["amount_irr"]) for t in internal_transfers), ZERO)

        # Net external flows
        eligible_inflows = gross_inflows - internal_transfer_total
        eligible_outflows = gross_outflows - internal_transfer_total
        net_movement = eligible_inflows - eligible_outflows

        # Cache in context for burn rate and other calculators
        ctx.extra["eligible_inflows"] = eligible_inflows
        ctx.extra["eligible_outflows"] = eligible_outflows
        ctx.extra["net_cash_movement"] = net_movement
        ctx.extra["internal_transfer_tx_ids"] = set(matched_outflow_ids) | set(matched_inflow_ids)

        warnings = []
        if internal_transfers:
            warnings.append(
                f"تعداد {len(internal_transfers)} انتقال بین‌حسابی داخلی به ارزش {internal_transfer_total:,} ریال شناسایی و جهت جلوگیری از دوبارشماری از جریان نقد کسر شد."
            )

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "جریان نقد واقعی شرکت در دوره پس از حذف انتقال‌های داخلی بین حساب‌های متعلق به شرکت.",
            "formula_fa": "ورودی نقد واجد شرایط - خروجی نقد واجد شرایط",
            "formula_version": self.metric_version,
            "gross_inflows_irr": str(gross_inflows),
            "gross_outflows_irr": str(gross_outflows),
            "eligible_inflows_irr": str(eligible_inflows),
            "eligible_outflows_irr": str(eligible_outflows),
            "internal_transfers_count": len(internal_transfers),
            "internal_transfers_irr": str(internal_transfer_total),
            "total_transactions_count": len(transactions),
            "internal_transfers_detail": internal_transfers,
        }

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=self.metric_version,
            status=MetricStatus.AVAILABLE,
            value_numeric=net_movement,
            unit=MetricUnit.IRR,
            as_of_date=ctx.as_of_date,
            period_start=ctx.period_start,
            period_end=ctx.period_end,
            coverage_score=100,
            confidence=ConfidenceLevel.HIGH,
            input_record_count=len(transactions),
            excluded_record_count=len(matched_outflow_ids) + len(matched_inflow_ids),
            warnings=warnings,
            evidence_json=evidence,
            input_record_ids=[str(tx.id) for tx in transactions[:20]],
            calculated_at=datetime.now(),
        )
