"""Bounded analytical orchestration service (AI-02).

Coordinates read-only evidence retrieval plans, deterministic change decompositions,
and structured evidence-backed explanations. Enforces step limits, tenant boundaries,
and snapshot consistency.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from . import models as m
from .analytical_explanations import (
    explain_cash_trajectory,
    explain_profit_change,
    explain_receivables_risk,
)
from .financial_decomposition_service import (
    analyze_cash_trajectory,
    analyze_receivables_risk,
    decompose_profit_drivers,
)
from .financial_evidence_service import execute_evidence_query
from .ingestion import normalized
from .security import membership

MAX_ORCHESTRATION_STEPS = 3

INTENT_KEYWORDS = {
    "profit_analysis": [
        "چرا سود", "علت کاهش سود", "کاهش سود", "افزایش سود",
        "تغییر سود", "تحلیل سود", "علت سود",
    ],
    "receivables_analysis": [
        "کدام مطالبات", "مطالبات معوق", "سررسید گذشته",
        "پیگیری مطالبات", "تحلیل مطالبات", "بدهکاران برتر",
        "فاکتورهای پرداخت نشده",
    ],
    "cashflow_analysis": [
        "کسری نقدینگی", "کمبود نقدینگی", "پول کم", "آینده نقدینگی",
        "پیش‌بینی نقد", "کمبود پول", "کسری پول", "کسری نقد",
    ],
}


def detect_analytical_intent(question: str) -> str | None:
    text = normalized(question)
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return intent
    return None


def orchestrate_analysis(
    db: Session,
    company_id: str,
    user: m.User,
    question: str,
    manifest: dict[str, Any] | None = None,
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Execute a bounded read-only analytical plan for supported questions."""
    membership(db, company_id, user)
    intent = detect_analytical_intent(question)
    if not intent:
        return None

    step_count = 0
    collected_facts: dict[str, Any] = {}
    evidence_refs: list[str] = []

    if intent == "profit_analysis":
        # Step 1: Period comparison
        step_count += 1
        comparison = execute_evidence_query(db, company_id, user, "period_comparison")
        evidence_refs.extend(comparison.get("evidence_refs", []))
        collected_facts["period_comparison"] = comparison

        # Step 2: Income / expense breakdown
        step_count += 1
        breakdown = execute_evidence_query(db, company_id, user, "income_expense_breakdown")
        evidence_refs.extend(breakdown.get("evidence_refs", []))
        collected_facts["income_expense_breakdown"] = breakdown

        decomp = decompose_profit_drivers(comparison, breakdown)
        explanation = explain_profit_change(decomp, list(dict.fromkeys(evidence_refs)))

        facts_list = []
        if decomp.get("status") == "available":
            facts_list = [
                {"metric_key": "profit_before_tax", "value": decomp.get("delta_profit"), "label": "تغییر سود قبل از مالیات", "evidence_refs": evidence_refs[:4]},
                {"metric_key": "revenue", "value": decomp.get("delta_revenue"), "label": "تغییر درآمد", "evidence_refs": evidence_refs[:4]},
                {"metric_key": "expense", "value": decomp.get("delta_expense"), "label": "تغییر هزینه", "evidence_refs": evidence_refs[:4]},
            ]

        return {
            "mode": "analytical_explanation",
            "intent": intent,
            "state": "complete" if decomp.get("status") == "available" else "limited",
            "answer": explanation["answer"],
            "conclusion": explanation.get("conclusion"),
            "observed_drivers": explanation.get("observed_drivers", []),
            "suggested_actions": explanation.get("suggested_actions", []),
            "evidence_refs": explanation.get("evidence_links", []),
            "facts": facts_list,
            "analytical_facts": collected_facts,
            "steps_executed": step_count,
            "limitations": explanation.get("limitations", []),
        }

    if intent == "receivables_analysis":
        step_count += 1
        receivables_data = execute_evidence_query(db, company_id, user, "receivables_concentration")
        evidence_refs.extend(receivables_data.get("evidence_refs", []))
        collected_facts["receivables_concentration"] = receivables_data

        risk_analysis = analyze_receivables_risk(receivables_data)
        explanation = explain_receivables_risk(risk_analysis, list(dict.fromkeys(evidence_refs)))

        facts_list = []
        if risk_analysis.get("status") == "available":
            facts_list = [
                {"metric_key": "trade_receivable_balance", "value": risk_analysis.get("total_receivables"), "label": "کل مطالبات", "evidence_refs": evidence_refs[:4]},
                {"metric_key": "overdue_receivables", "value": risk_analysis.get("overdue_receivables"), "label": "مطالبات معوق", "evidence_refs": evidence_refs[:4]},
            ]

        return {
            "mode": "analytical_explanation",
            "intent": intent,
            "state": "complete" if risk_analysis.get("status") == "available" else "limited",
            "answer": explanation["answer"],
            "conclusion": explanation.get("conclusion"),
            "observed_drivers": explanation.get("observed_drivers", []),
            "suggested_actions": explanation.get("suggested_actions", []),
            "evidence_refs": explanation.get("evidence_links", []),
            "facts": facts_list,
            "analytical_facts": collected_facts,
            "steps_executed": step_count,
            "limitations": explanation.get("limitations", []),
        }

    if intent == "cashflow_analysis":
        step_count += 1
        cashflow_data = execute_evidence_query(db, company_id, user, "cashflow_forecast_summary")
        evidence_refs.extend(cashflow_data.get("evidence_refs", []))
        collected_facts["cashflow_forecast_summary"] = cashflow_data

        trajectory = analyze_cash_trajectory(cashflow_data)
        explanation = explain_cash_trajectory(trajectory, list(dict.fromkeys(evidence_refs)))

        facts_list = []
        if trajectory.get("status") == "available":
            facts_list = [
                {"metric_key": "min_projected_balance", "value": trajectory.get("min_projected_balance"), "label": "حداقل موجودی پیش‌بینی‌شده", "evidence_refs": evidence_refs[:4]},
            ]

        return {
            "mode": "analytical_explanation",
            "intent": intent,
            "state": "complete" if trajectory.get("status") == "available" else "limited",
            "answer": explanation["answer"],
            "conclusion": explanation.get("conclusion"),
            "observed_drivers": explanation.get("observed_drivers", []),
            "suggested_actions": explanation.get("suggested_actions", []),
            "evidence_refs": explanation.get("evidence_links", []),
            "facts": facts_list,
            "analytical_facts": collected_facts,
            "steps_executed": step_count,
            "limitations": explanation.get("limitations", []),
        }

    return None
