from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select

from app.calculations.base import (
    CalculatedMetricResult,
    CalculationContext,
    MetricCalculatorInterface,
)
from app.calculations.models import ConfidenceLevel, MetricStatus, MetricUnit
from app.financial.models import BankAccount, BankTransaction

ZERO = Decimal(0)


class CashPositionCalculator(MetricCalculatorInterface):
    @property
    def metric_key(self) -> str:
        return "cash_position"

    @property
    def metric_version(self) -> str:
        return "cash-position-v1"

    @property
    def title_fa(self) -> str:
        return "نقدینگی فعلی"

    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        # 1. Fetch all bank accounts for the company
        accounts = list(
            (
                await ctx.session.scalars(
                    select(BankAccount)
                    .where(BankAccount.company_id == ctx.company_id)
                    .order_by(BankAccount.label)
                )
            ).all()
        )

        if not accounts:
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
                warnings=["هیچ حساب بانکی فعالی در سامانه ثبت نشده است."],
                evidence_json={
                    "title_fa": self.title_fa,
                    "definition_fa": "مجموع مانده‌های قابل اتکای حساب‌های بانکی شرکت در تاریخ مبنا.",
                    "formula_fa": "مجموع (آخرین مانده دفتری/جاری هر حساب بانکی)",
                    "formula_version": self.metric_version,
                    "accounts_count": 0,
                    "usable_accounts_count": 0,
                    "breakdown": [],
                },
                input_record_ids=[],
            )

        total_cash = ZERO
        usable_accounts = 0
        breakdown: list[dict[str, Any]] = []
        input_record_ids: list[str] = []
        warnings: list[str] = []

        for acc in accounts:
            # Check if excluded by policy
            if str(acc.id) in ctx.policy.excluded_internal_transfer_accounts:
                continue

            # Find latest transaction with running_balance_irr on or before as_of_date
            latest_tx = (
                await ctx.session.scalars(
                    select(BankTransaction)
                    .where(
                        BankTransaction.company_id == ctx.company_id,
                        BankTransaction.bank_account_id == acc.id,
                        BankTransaction.booking_date <= ctx.as_of_date,
                        BankTransaction.running_balance_irr.isnot(None),
                    )
                    .order_by(BankTransaction.booking_date.desc(), BankTransaction.id.desc())
                    .limit(1)
                )
            ).first()

            if latest_tx and latest_tx.running_balance_irr is not None:
                bal = Decimal(latest_tx.running_balance_irr)
                total_cash += bal
                usable_accounts += 1
                input_record_ids.append(str(latest_tx.id))
                breakdown.append(
                    {
                        "bank_account_id": str(acc.id),
                        "bank_name": acc.bank_name,
                        "label": acc.label,
                        "account_last4": acc.account_last4,
                        "balance_irr": str(bal),
                        "balance_date": str(latest_tx.booking_date),
                        "method": "running_balance",
                    }
                )
            else:
                # Fallback: sum of all transactions on or before as_of_date
                tx_sum = await ctx.session.scalar(
                    select(func.sum(BankTransaction.amount_irr)).where(
                        BankTransaction.company_id == ctx.company_id,
                        BankTransaction.bank_account_id == acc.id,
                        BankTransaction.booking_date <= ctx.as_of_date,
                    )
                )
                if tx_sum is not None:
                    bal = Decimal(tx_sum)
                    total_cash += bal
                    usable_accounts += 1
                    breakdown.append(
                        {
                            "bank_account_id": str(acc.id),
                            "bank_name": acc.bank_name,
                            "label": acc.label,
                            "account_last4": acc.account_last4,
                            "balance_irr": str(bal),
                            "balance_date": str(ctx.as_of_date),
                            "method": "transaction_net_sum",
                        }
                    )
                else:
                    warnings.append(
                        f"حساب {acc.bank_name} ({acc.label}) فاقد تراکنش یا مانده دفتری معتبر در تاریخ مبنا است."
                    )
                    breakdown.append(
                        {
                            "bank_account_id": str(acc.id),
                            "bank_name": acc.bank_name,
                            "label": acc.label,
                            "account_last4": acc.account_last4,
                            "balance_irr": None,
                            "balance_date": None,
                            "method": "unavailable",
                        }
                    )

        total_accounts = len(accounts)
        coverage_score = round(100 * usable_accounts / total_accounts) if total_accounts > 0 else 0

        if usable_accounts == 0:
            status = MetricStatus.INSUFFICIENT_DATA
            confidence = ConfidenceLevel.NONE
            val = None
        elif usable_accounts < total_accounts:
            status = MetricStatus.AVAILABLE_WITH_WARNING
            confidence = ConfidenceLevel.MEDIUM
            val = total_cash
        else:
            status = MetricStatus.AVAILABLE
            confidence = ConfidenceLevel.HIGH
            val = total_cash

        evidence = {
            "title_fa": self.title_fa,
            "definition_fa": "مجموع مانده‌های در دسترس حساب‌های بانکی شرکت بر اساس داده‌های استانداردشده کانونیکال.",
            "formula_fa": "مجموع مانده حساب‌های بانکی دارای داده در تاریخ مبنا",
            "formula_version": self.metric_version,
            "accounts_count": total_accounts,
            "usable_accounts_count": usable_accounts,
            "breakdown": breakdown,
            "reconciliation_notes": [
                f"پوشش {usable_accounts} از {total_accounts} حساب بانکی فعال ({coverage_score}٪)"
            ],
        }

        # Cache in context for downstream calculators (e.g. runway, forecast)
        ctx.extra["cash_position"] = val
        ctx.extra["cash_position_usable"] = status in (
            MetricStatus.AVAILABLE,
            MetricStatus.AVAILABLE_WITH_WARNING,
        )

        return CalculatedMetricResult(
            metric_key=self.metric_key,
            metric_version=self.metric_version,
            status=status,
            value_numeric=val,
            unit=MetricUnit.IRR,
            as_of_date=ctx.as_of_date,
            coverage_score=coverage_score,
            confidence=confidence,
            input_record_count=usable_accounts,
            excluded_record_count=total_accounts - usable_accounts,
            warnings=warnings,
            evidence_json=evidence,
            input_record_ids=input_record_ids,
            calculated_at=datetime.now(),
        )
