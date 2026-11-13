"""Deterministic analytical facts and change decomposition service (AI-03).

Provides hand-calculated-exact financial decompositions:
- Profit change attribution to revenue and expense drivers
- Account-level contributor ranking that reconciles to reported deltas
- Receivables risk & overdue concentration analysis
- Cash shortfall timing and trajectory decomposition
"""
from __future__ import annotations

from typing import Any

from .finance import ZERO, amount, text_amount


def decompose_profit_drivers(
    comparison_data: dict[str, Any],
    breakdown_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Attribute profit changes to observed revenue/expense components.

    Reconciles: delta_profit == delta_revenue - delta_expense
    """
    deltas = comparison_data.get("deltas", {})
    rev_delta_info = deltas.get("revenue", {})
    exp_delta_info = deltas.get("expense", {})
    pbt_delta_info = deltas.get("profit_before_tax", {})

    if (
        rev_delta_info.get("status") != "available"
        or exp_delta_info.get("status") != "available"
        or pbt_delta_info.get("status") != "available"
    ):
        return {
            "status": "unavailable",
            "reason": "اطلاعات مقایسه‌ای یکی از دوره‌ها ناقص است و تفکیک تغییرات سود امکان‌پذیر نیست.",
            "drivers": [],
            "reconciled": False,
        }

    rev_delta = amount(rev_delta_info.get("delta", "0"))
    exp_delta = amount(exp_delta_info.get("delta", "0"))
    pbt_delta = amount(pbt_delta_info.get("delta", "0"))

    # Net profit change before tax = delta_revenue - delta_expense
    expected_pbt_delta = rev_delta - exp_delta
    reconciled = pbt_delta == expected_pbt_delta

    drivers = []
    # Revenue impact on profit
    if rev_delta != ZERO:
        drivers.append({
            "component": "revenue",
            "label": "تغییرات درآمد فروش و خدمات",
            "delta": text_amount(rev_delta),
            "profit_impact": text_amount(rev_delta),
            "impact_direction": "positive" if rev_delta > ZERO else "negative",
            "relative_share": round(float(abs(rev_delta) / (abs(rev_delta) + abs(exp_delta)) * 100), 1)
            if (abs(rev_delta) + abs(exp_delta)) > ZERO
            else 0.0,
        })

    # Expense impact on profit (expense increase reduces profit)
    if exp_delta != ZERO:
        expense_profit_impact = -exp_delta
        drivers.append({
            "component": "expense",
            "label": "تغییرات هزینه‌های عملیاتی و غیرعملیاتی",
            "delta": text_amount(exp_delta),
            "profit_impact": text_amount(expense_profit_impact),
            "impact_direction": "negative" if exp_delta > ZERO else "positive",
            "relative_share": round(float(abs(exp_delta) / (abs(rev_delta) + abs(exp_delta)) * 100), 1)
            if (abs(rev_delta) + abs(exp_delta)) > ZERO
            else 0.0,
        })

    # Sort drivers by absolute magnitude of profit impact
    drivers.sort(key=lambda d: abs(amount(d["profit_impact"])), reverse=True)

    # Top expense contributors from breakdown if available
    top_expenses = []
    if breakdown_data and breakdown_data.get("status") == "available":
        for item in breakdown_data.get("expense_accounts", [])[:5]:
            top_expenses.append({
                "account_title": item["account_title"],
                "account_code": item.get("account_code", ""),
                "amount": item["amount"],
                "share_percent": item["share_percent"],
            })

    return {
        "status": "available",
        "reconciled": reconciled,
        "delta_profit": text_amount(pbt_delta),
        "delta_revenue": text_amount(rev_delta),
        "delta_expense": text_amount(exp_delta),
        "profit_direction": pbt_delta_info.get("direction", "unchanged"),
        "percent_change": pbt_delta_info.get("percent_change"),
        "primary_driver": drivers[0]["component"] if drivers else None,
        "drivers": drivers,
        "top_expenses": top_expenses,
    }


def analyze_receivables_risk(receivables_data: dict[str, Any]) -> dict[str, Any]:
    """Analyze overdue ratio, concentration of top debtors, and exposure."""
    if receivables_data.get("status") != "available":
        return {
            "status": "unavailable",
            "reason": receivables_data.get("reason", "اطلاعات مطالبات در دسترس نیست."),
        }

    total = amount(receivables_data.get("total_receivables", "0"))
    overdue = amount(receivables_data.get("total_overdue", "0"))
    customers = receivables_data.get("customers", [])

    if total == ZERO:
        return {
            "status": "available",
            "total_receivables": "0",
            "overdue_receivables": "0",
            "overdue_ratio_percent": 0.0,
            "concentration_top3_percent": 0.0,
            "risk_level": "low",
            "top_debtors": [],
        }

    overdue_ratio = round(float((overdue / total) * 100), 1)

    # Top 3 concentration
    top_3_sum = sum((amount(c["outstanding_amount"]) for c in customers[:3]), ZERO)
    top_3_concentration = round(float((top_3_sum / total) * 100), 1)

    # Risk level evaluation based on objective rules
    if overdue_ratio > 40.0 or top_3_concentration > 70.0:
        risk_level = "high"
    elif overdue_ratio > 20.0 or top_3_concentration > 50.0:
        risk_level = "medium"
    else:
        risk_level = "low"

    return {
        "status": "available",
        "total_receivables": text_amount(total),
        "overdue_receivables": text_amount(overdue),
        "overdue_ratio_percent": overdue_ratio,
        "concentration_top3_percent": top_3_concentration,
        "risk_level": risk_level,
        "top_debtors": customers[:5],
    }


def analyze_cash_trajectory(cashflow_data: dict[str, Any]) -> dict[str, Any]:
    """Detect shortfall timing, minimum projected liquidity, and alert condition."""
    if cashflow_data.get("status") != "available":
        return {
            "status": "unavailable",
            "reason": cashflow_data.get("reason", "پیش‌بینی نقدینگی در دسترس نیست."),
        }

    has_deficit = cashflow_data.get("has_deficit", False)
    min_balance = cashflow_data.get("min_projected_balance")
    first_date = cashflow_data.get("first_deficit_date")

    return {
        "status": "available",
        "has_deficit": has_deficit,
        "first_deficit_date": first_date,
        "min_projected_balance": min_balance,
        "urgency": "critical" if has_deficit else "normal",
    }
