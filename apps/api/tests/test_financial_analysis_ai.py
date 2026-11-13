"""Tests for AI-01, AI-02, AI-03, AI-04:

- Financial evidence query service (AI-01)
- Bounded analytical orchestration (AI-02)
- Deterministic facts and change decomposition (AI-03)
- Evidence-backed explanations and action suggestions (AI-04)
"""
from datetime import date

import pytest

from didban import models as m
from didban.accounting_models import Account
from didban.analytical_orchestrator import orchestrate_analysis
from didban.financial_decomposition_service import (
    analyze_cash_trajectory,
    analyze_receivables_risk,
    decompose_profit_drivers,
)
from didban.financial_evidence_service import execute_evidence_query
from didban.native_forecast_models import NativeForecastPlan, NativeForecastRun
from didban.native_invoice_models import NativeInvoice
from didban.native_reporting_models import NativeAccountRole, NativeStatementRun
from didban.posting_models import NativeJournal


@pytest.fixture
def test_setup(db_session):
    db = db_session
    user = m.User(id="u-ai", email="ai@example.com", name="AI Analyst", password_hash="test")
    db.add(user)

    company = m.Company(id="c-ai", name="شرکت آزمایشی تحلیل")
    db.add(company)
    db.add(m.Membership(company_id="c-ai", user_id="u-ai", role="finance_manager"))

    p1 = m.Period(id="p1", company_id="c-ai", name="دوره اول", start=date(2026, 1, 1), end=date(2026, 6, 30))
    p2 = m.Period(id="p2", company_id="c-ai", name="دوره دوم", start=date(2026, 7, 1), end=date(2026, 12, 30))
    db.add_all([p1, p2])

    acc_rev = Account(id="acc-rev", company_id="c-ai", code="401", name="درآمد فروش")
    acc_exp1 = Account(id="acc-exp1", company_id="c-ai", code="501", name="هزینه حقوق")
    acc_exp2 = Account(id="acc-exp2", company_id="c-ai", code="502", name="هزینه اجاره")
    db.add_all([acc_rev, acc_exp1, acc_exp2])

    db.add_all([
        NativeAccountRole(company_id="c-ai", account_id="acc-rev", role="revenue", actor_id="u-ai"),
        NativeAccountRole(company_id="c-ai", account_id="acc-exp1", role="expense", actor_id="u-ai"),
        NativeAccountRole(company_id="c-ai", account_id="acc-exp2", role="expense", actor_id="u-ai"),
    ])

    # Prior statement: Rev 1000, Exp 400, Profit 600
    stmt_prior = NativeStatementRun(
        id="stmt-p1",
        company_id="c-ai",
        actor_id="u-ai",
        digest="1" * 64,
        snapshot={
            "as_of": "2026-06-30",
            "period_id": "p1",
            "metrics": [
                {"metric_key": "revenue", "value": "1000", "status": "available", "reason_codes": []},
                {"metric_key": "expense", "value": "400", "status": "available", "reason_codes": []},
                {"metric_key": "profit_before_tax", "value": "600", "status": "available", "reason_codes": []},
                {"metric_key": "bank_balance", "value": "500", "status": "available", "reason_codes": []},
                {"metric_key": "trade_receivable_balance", "value": "300", "status": "available", "reason_codes": []},
                {"metric_key": "trade_payable_balance", "value": "200", "status": "available", "reason_codes": []},
            ],
        },
    )
    # Current statement: Rev 900, Exp 500, Profit 400 (Profit decreased by 200)
    stmt_curr = NativeStatementRun(
        id="stmt-p2",
        company_id="c-ai",
        actor_id="u-ai",
        digest="2" * 64,
        snapshot={
            "as_of": "2026-12-30",
            "period_id": "p2",
            "metrics": [
                {"metric_key": "revenue", "value": "900", "status": "available", "reason_codes": []},
                {"metric_key": "expense", "value": "500", "status": "available", "reason_codes": []},
                {"metric_key": "profit_before_tax", "value": "400", "status": "available", "reason_codes": []},
                {"metric_key": "bank_balance", "value": "450", "status": "available", "reason_codes": []},
                {"metric_key": "trade_receivable_balance", "value": "350", "status": "available", "reason_codes": []},
                {"metric_key": "trade_payable_balance", "value": "150", "status": "available", "reason_codes": []},
            ],
        },
    )
    db.add_all([stmt_prior, stmt_curr])

    # Journal in p2 with accounts
    j1 = NativeJournal(
        id="j-p2-1",
        company_id="c-ai",
        draft_id="d-p2-1",
        draft_version=1,
        period_id="p2",
        sequence=1,
        date=date(2026, 8, 1),
        digest="3" * 64,
        actor_id="u-ai",
        permission_provenance={},
        snapshot={
            "lines": [
                {"account_id": "acc-rev", "debit": "0", "credit": "900"},
                {"account_id": "acc-exp1", "debit": "300", "credit": "0"},
                {"account_id": "acc-exp2", "debit": "200", "credit": "0"},
            ]
        },
    )
    db.add(j1)

    # Invoices for receivables concentration
    inv1 = NativeInvoice(
        id="inv-1",
        company_id="c-ai",
        operation_id="op-1",
        direction="sale",
        source={"total_amount": "200", "due_date": "2026-10-01", "counterparty_name": "شرکت مشتری الف"},
        actor_id="u-ai",
    )
    inv2 = NativeInvoice(
        id="inv-2",
        company_id="c-ai",
        operation_id="op-2",
        direction="sale",
        source={"total_amount": "150", "due_date": "2026-12-01", "counterparty_name": "شرکت مشتری ب"},
        actor_id="u-ai",
    )
    db.add_all([inv1, inv2])

    # Forecast with deficit
    plan = NativeForecastPlan(
        id="f-plan-1",
        company_id="c-ai",
        native_statement_id="stmt-p2",
        actor_id="u-ai",
        source_digest="4" * 64,
        snapshot={},
        obligations_complete=True,
    )
    db.add(plan)
    f_run = NativeForecastRun(
        id="f-run-1",
        company_id="c-ai",
        plan_id="f-plan-1",
        native_statement_id="stmt-p2",
        actor_id="u-ai",
        digest="5" * 64,
        snapshot={
            "starting_balance": "450",
            "timeline": [
                {"date": "2027-01-05", "balance": "100"},
                {"date": "2027-01-10", "balance": "-50"},
                {"date": "2027-01-15", "balance": "-150"},
            ],
        },
    )
    db.add(f_run)

    db.flush()
    return user, company


def test_ai01_financial_evidence_queries(db_session, test_setup):
    db = db_session
    user, company = test_setup

    # Test statement summary
    summary = execute_evidence_query(db, company.id, user, "statement_summary")
    assert summary["status"] == "available"
    assert summary["facts"]["revenue"]["value"] == "900"
    assert summary["facts"]["expense"]["value"] == "500"

    # Test period comparison
    comp = execute_evidence_query(db, company.id, user, "period_comparison")
    assert comp["status"] == "available"
    deltas = comp["deltas"]
    assert deltas["revenue"]["delta"] == "-100"
    assert deltas["expense"]["delta"] == "100"
    assert deltas["profit_before_tax"]["delta"] == "-200"
    assert deltas["profit_before_tax"]["direction"] == "decrease"

    # Test income expense breakdown
    breakdown = execute_evidence_query(db, company.id, user, "income_expense_breakdown")
    assert breakdown["status"] == "available"
    assert breakdown["total_revenue"] == "900"
    assert breakdown["total_expense"] == "500"
    assert len(breakdown["expense_accounts"]) == 2
    assert breakdown["expense_accounts"][0]["account_id"] == "acc-exp1"
    assert breakdown["expense_accounts"][0]["amount"] == "300"

    # Test receivables concentration
    rec = execute_evidence_query(db, company.id, user, "receivables_concentration")
    assert rec["status"] == "available"
    assert rec["total_receivables"] == "350"
    assert len(rec["customers"]) == 2

    # Test cashflow forecast summary
    cash = execute_evidence_query(db, company.id, user, "cashflow_forecast_summary")
    assert cash["status"] == "available"
    assert cash["has_deficit"] is True
    assert cash["first_deficit_date"] == "2027-01-10"
    assert cash["min_projected_balance"] == "-150"


def test_ai03_deterministic_profit_decomposition(db_session, test_setup):
    db = db_session
    user, company = test_setup
    comp = execute_evidence_query(db, company.id, user, "period_comparison")
    breakdown = execute_evidence_query(db, company.id, user, "income_expense_breakdown")

    decomp = decompose_profit_drivers(comp, breakdown)
    assert decomp["status"] == "available"
    assert decomp["reconciled"] is True
    # delta_profit (-200) = delta_rev (-100) - delta_exp (100) = -200
    assert decomp["delta_profit"] == "-200"
    assert len(decomp["drivers"]) == 2


def test_ai03_receivables_risk_and_cash_trajectory(db_session, test_setup):
    db = db_session
    user, company = test_setup
    rec = execute_evidence_query(db, company.id, user, "receivables_concentration")
    risk = analyze_receivables_risk(rec)
    assert risk["status"] == "available"
    assert risk["total_receivables"] == "350"

    cash = execute_evidence_query(db, company.id, user, "cashflow_forecast_summary")
    trajectory = analyze_cash_trajectory(cash)
    assert trajectory["status"] == "available"
    assert trajectory["has_deficit"] is True
    assert trajectory["urgency"] == "critical"


def test_ai02_ai04_analytical_orchestration_and_explanations(db_session, test_setup):
    db = db_session
    user, company = test_setup

    # Test profit inquiry
    q1 = "چرا سود این دوره کاهش یافته است؟"
    res1 = orchestrate_analysis(db, company.id, user, q1)
    assert res1 is not None
    assert res1["mode"] == "analytical_explanation"
    assert res1["intent"] == "profit_analysis"
    assert "سود قبل از مالیات در مقایسه با دوره قبل" in res1["conclusion"]
    assert len(res1["observed_drivers"]) > 0
    assert len(res1["suggested_actions"]) > 0
    assert len(res1["evidence_refs"]) > 0

    # Test receivables inquiry
    q2 = "کدام مطالبات تجاری معوق شده و نیازمند پیگیری است؟"
    res2 = orchestrate_analysis(db, company.id, user, q2)
    assert res2 is not None
    assert res2["intent"] == "receivables_analysis"
    assert "مطالبات تجاری" in res2["conclusion"]
    assert len(res2["suggested_actions"]) > 0

    # Test cashflow inquiry
    q3 = "آیا در آینده با کسری نقدینگی روبرو می‌شویم؟"
    res3 = orchestrate_analysis(db, company.id, user, q3)
    assert res3 is not None
    assert res3["intent"] == "cashflow_analysis"
    assert "کسری نقدینگی" in res3["conclusion"]
    assert "2027-01-10" in res3["conclusion"]


def test_unsupported_or_greeting_returns_none_for_fallback(db_session, test_setup):
    db = db_session
    user, company = test_setup
    res = orchestrate_analysis(db, company.id, user, "سلام وقت بخیر")
    assert res is None


def test_assistant_api_route_end_to_end():
    from uuid import uuid4

    from fastapi.testclient import TestClient

    from didban.api import app
    from didban.config import settings
    from didban.db import transaction
    from didban.security import hasher

    c_id = f"c-api-{uuid4().hex[:8]}"
    u_id = f"u-api-{uuid4().hex[:8]}"
    email = f"ai-{uuid4().hex[:8]}@example.com"
    pwd = "Secret-password-123!"

    with transaction() as db:
        user = m.User(id=u_id, email=email, name="AI Tester", password_hash=hasher.hash(pwd))
        company = m.Company(id=c_id, name="شرکت تست ای پی آی")
        db.add_all([user, company])
        db.flush()
        db.add(m.Membership(company_id=c_id, user_id=u_id, role="finance_manager"))

        # Add statement
        stmt = NativeStatementRun(
            id=f"stmt-{uuid4().hex[:8]}",
            company_id=c_id,
            actor_id=u_id,
            digest="6" * 64,
            snapshot={
                "as_of": "2026-12-30",
                "metrics": [
                    {"metric_key": "revenue", "value": "1000", "status": "available", "reason_codes": []},
                    {"metric_key": "expense", "value": "600", "status": "available", "reason_codes": []},
                    {"metric_key": "profit_before_tax", "value": "400", "status": "available", "reason_codes": []},
                ],
            },
        )
        db.add(stmt)

    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200, login.text
    csrf = login.json()["csrf"]

    res = client.post(
        f"/api/v1/companies/{c_id}/assistant/questions",
        json={"question": "چرا سود این دوره کاهش یافته است؟"},
        headers={
            "X-CSRF-Token": csrf,
            "Idempotency-Key": f"key-{uuid4().hex[:8]}",
            "Origin": settings.web_origin,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["mode"] == "analytical_explanation"
    assert data["intent"] == "profit_analysis"
    assert (
        "سود قبل از مالیات" in data["answer"]
        or "تفکیک تغییرات سود" in data["answer"]
        or "اطلاعات برای تحلیل" in data["answer"]
    )


