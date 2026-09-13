from datetime import date
from decimal import Decimal

from app.analysis.calculations import LedgerLine, calculate_ledger_metrics
from app.analysis.models import MetricCode
from app.financial.models import AccountClass


def test_financial_metrics_equal_manual_expected_values() -> None:
    lines = [
        LedgerLine(date(2026, 8, 31), Decimal("100"), Decimal("0"), AccountClass.ASSET),
        LedgerLine(date(2026, 9, 5), Decimal("0"), Decimal("1000"), AccountClass.REVENUE),
        LedgerLine(date(2026, 9, 5), Decimal("1000"), Decimal("0"), AccountClass.ASSET),
        LedgerLine(date(2026, 9, 8), Decimal("250"), Decimal("0"), AccountClass.EXPENSE),
        LedgerLine(date(2026, 9, 8), Decimal("0"), Decimal("250"), AccountClass.LIABILITY),
        LedgerLine(date(2026, 9, 9), Decimal("30"), Decimal("0"), None),
    ]

    metrics, coverage = calculate_ledger_metrics(lines, date(2026, 9, 1), date(2026, 9, 30))

    assert metrics[MetricCode.REVENUE_IRR].value_irr == Decimal("1000")
    assert metrics[MetricCode.EXPENSES_IRR].value_irr == Decimal("250")
    assert metrics[MetricCode.NET_PROFIT_IRR].value_irr == Decimal("750")
    assert metrics[MetricCode.NET_MARGIN_RATIO].value_ratio == Decimal("0.750000")
    assert metrics[MetricCode.TOTAL_ASSETS_IRR].value_irr == Decimal("1100")
    assert metrics[MetricCode.TOTAL_LIABILITIES_IRR].value_irr == Decimal("250")
    assert metrics[MetricCode.TOTAL_EQUITY_IRR].value_irr == Decimal("0")
    assert coverage == {
        "available": True,
        "score": 80,
        "total_lines": 5,
        "classified_lines": 4,
        "unclassified_lines": 1,
        "reasons": ["1 آرتیکل حساب طبقه‌بندی‌نشده دارد"],
    }


def test_margin_is_omitted_when_revenue_is_not_positive() -> None:
    metrics, coverage = calculate_ledger_metrics([], date(2026, 9, 1), date(2026, 9, 30))

    assert MetricCode.NET_MARGIN_RATIO not in metrics
    assert coverage["available"] is False
    assert coverage["score"] == 0
