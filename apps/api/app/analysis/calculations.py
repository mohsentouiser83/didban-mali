from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.analysis.models import MetricCode
from app.financial.models import AccountClass

ZERO = Decimal(0)


@dataclass(frozen=True)
class LedgerLine:
    entry_date: date
    debit_irr: Decimal
    credit_irr: Decimal
    account_class: AccountClass | None


@dataclass(frozen=True)
class CalculatedMetric:
    value_irr: Decimal | None
    value_ratio: Decimal | None
    calculation: dict[str, object]


def _money(value: Decimal, formula: str, line_count: int) -> CalculatedMetric:
    return CalculatedMetric(
        value_irr=value,
        value_ratio=None,
        calculation={"formula": formula, "line_count": line_count, "unit": "IRR"},
    )


def calculate_ledger_metrics(
    lines: list[LedgerLine], period_start: date, period_end: date
) -> tuple[dict[MetricCode, CalculatedMetric], dict[str, object]]:
    period_lines = [line for line in lines if period_start <= line.entry_date <= period_end]
    classified_period = [line for line in period_lines if line.account_class is not None]
    classified_closing = [line for line in lines if line.account_class is not None]

    revenue_lines = [
        line for line in classified_period if line.account_class == AccountClass.REVENUE
    ]
    expense_lines = [
        line for line in classified_period if line.account_class == AccountClass.EXPENSE
    ]
    revenue = sum((line.credit_irr - line.debit_irr for line in revenue_lines), ZERO)
    expenses = sum((line.debit_irr - line.credit_irr for line in expense_lines), ZERO)
    net_profit = revenue - expenses

    def closing_balance(account_class: AccountClass) -> tuple[Decimal, int]:
        selected = [line for line in classified_closing if line.account_class == account_class]
        if account_class == AccountClass.ASSET:
            value = sum((line.debit_irr - line.credit_irr for line in selected), ZERO)
        else:
            value = sum((line.credit_irr - line.debit_irr for line in selected), ZERO)
        return value, len(selected)

    assets, asset_count = closing_balance(AccountClass.ASSET)
    liabilities, liability_count = closing_balance(AccountClass.LIABILITY)
    equity, equity_count = closing_balance(AccountClass.EQUITY)
    metrics = {
        MetricCode.REVENUE_IRR: _money(
            revenue, "sum(revenue.credit_irr - revenue.debit_irr)", len(revenue_lines)
        ),
        MetricCode.EXPENSES_IRR: _money(
            expenses, "sum(expense.debit_irr - expense.credit_irr)", len(expense_lines)
        ),
        MetricCode.NET_PROFIT_IRR: _money(
            net_profit, "revenue_irr - expenses_irr", len(classified_period)
        ),
        MetricCode.TOTAL_ASSETS_IRR: _money(
            assets, "sum(asset.debit_irr - asset.credit_irr) through period_end", asset_count
        ),
        MetricCode.TOTAL_LIABILITIES_IRR: _money(
            liabilities,
            "sum(liability.credit_irr - liability.debit_irr) through period_end",
            liability_count,
        ),
        MetricCode.TOTAL_EQUITY_IRR: _money(
            equity, "sum(equity.credit_irr - equity.debit_irr) through period_end", equity_count
        ),
    }
    if revenue > 0:
        metrics[MetricCode.NET_MARGIN_RATIO] = CalculatedMetric(
            value_irr=None,
            value_ratio=(net_profit / revenue).quantize(Decimal("0.000001")),
            calculation={
                "formula": "net_profit_irr / revenue_irr",
                "numerator_irr": str(net_profit),
                "denominator_irr": str(revenue),
            },
        )

    total = len(period_lines)
    classified = len(classified_period)
    coverage = {
        "available": total > 0,
        "score": round(100 * classified / total) if total else 0,
        "total_lines": total,
        "classified_lines": classified,
        "unclassified_lines": total - classified,
        "reasons": (
            []
            if total > 0 and classified == total
            else (
                ["در دوره انتخابی آرتیکل حسابداری وجود ندارد"]
                if not total
                else [f"{total - classified} آرتیکل حساب طبقه‌بندی‌نشده دارد"]
            )
        ),
    }
    return metrics, coverage
