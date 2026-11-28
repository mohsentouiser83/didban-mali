"""End-to-end tests for project and contract profitability reporting."""

from datetime import date
from uuid import uuid4

from didban import contract_service, payroll_service, petty_cash_service
from didban import models as m
from didban import project_profitability_service as prof_service
from didban.accounting_models import Account
from didban.commercial_models import CommercialCounterparty
from didban.dimensions_models import Dimension
from didban.treasury_models import TreasuryAccount


def test_project_profitability_combines_contracts_payroll_and_petty_cash(db_session):
    user = m.User(
        id=str(uuid4()),
        email="prof_admin@example.com",
        name="مدیر مالی",
        password_hash="fake",
    )
    company = m.Company(id=str(uuid4()), name="شرکت نرم‌افزاری آلفا", business_mode="service")
    member = m.Membership(
        id=str(uuid4()),
        user_id=user.id,
        company_id=company.id,
        role="finance_manager",
    )
    period = m.Period(
        id=str(uuid4()),
        company_id=company.id,
        name="سال مالی ۱۴۰۳",
        start=date(2024, 3, 20),
        end=date(2025, 3, 20),
    )
    cp = CommercialCounterparty(
        id=str(uuid4()),
        company_id=company.id,
        code="CUST-01",
        name="شرکت کارفرما",
        type="customer",
        entity_kind="legal_entity",
    )
    p1 = Dimension(id=str(uuid4()), company_id=company.id, kind="project", code="PRJ-A", name="پروژه A", active=True)
    p2 = Dimension(id=str(uuid4()), company_id=company.id, kind="project", code="PRJ-B", name="پروژه B", active=True)
    acc_petty = Account(id=str(uuid4()), company_id=company.id, code="1102", name="تنخواه", nature="debit")
    acc_exp = Account(id=str(uuid4()), company_id=company.id, code="6101", name="هزینه مستقیم", nature="debit")
    treasury_petty = TreasuryAccount(
        id=str(uuid4()),
        company_id=company.id,
        kind="petty_cash",
        name="تنخواه دفتر",
        account_id=acc_petty.id,
        petty_cash_limit_irr="200000000",
    )
    db_session.add_all([user, company, member, period, cp, p1, p2, acc_petty, acc_exp, treasury_petty])
    db_session.flush()

    # 1. Contract on PRJ-A: bill 500,000,000 IRR
    contract = contract_service.create_contract(
        db_session,
        company.id,
        user,
        {
            "contract_number": "C-101",
            "title": "قرارداد نرم‌افزار A",
            "counterparty_id": cp.id,
            "dimension_id": p1.id,
            "start_date": date(2024, 4, 1),
            "total_amount_irr": "500000000",
            "milestones": [{"sequence": 1, "title": "فاز اول", "amount_irr": "500000000"}],
        },
    )
    contract_service.bill_milestone(db_session, company.id, user, contract["id"], contract["milestones"][0]["id"], {})

    # 2. Payroll: 1 employee, 60% PRJ-A, 40% PRJ-B
    emp = payroll_service.add_employee(
        db_session, company.id, user, {"first_name": "علی", "last_name": "رضایی", "marital_status": "single"}
    )
    payroll_service.add_contract(
        db_session,
        company.id,
        user,
        {
            "employee_id": emp["id"],
            "contract_type": "full_time",
            "start_date": date(2024, 3, 20),
            "base_salary": "100000000",
            "is_insured": True,
            "is_taxable": True,
        },
    )
    run = payroll_service.create_payroll_run(
        db_session,
        company.id,
        user,
        {
            "period_id": period.id,
            "title": "فروردین ۱۴۰۳",
            "year": 1403,
            "month": 1,
            "calculation_date": date(2024, 4, 19),
        },
    )
    run_detail = payroll_service.get_payroll_run(db_session, company.id, run["id"])
    slip = run_detail["slips"][0]
    updated_slip = payroll_service.update_slip_timesheet(
        db_session,
        company.id,
        user,
        run["id"],
        slip["id"],
        {
            "project_allocations": [
                {"dimension_id": p1.id, "percentage": "60"},
                {"dimension_id": p2.id, "percentage": "40"},
            ]
        },
    )
    total_emp_cost = int(updated_slip["gross_pay"]) + int(updated_slip["employer_insurance"])

    # 3. Petty cash: 30,000,000 on PRJ-A, 10,000,000 overhead (no project)
    petty_cash_service.record_expense(
        db_session,
        company.id,
        user,
        {
            "treasury_account_id": treasury_petty.id,
            "period_id": period.id,
            "expense_account_id": acc_exp.id,
            "dimension_id": p1.id,
            "category": "cloud_server",
            "expense_date": date(2024, 4, 10),
            "title": "سرور پروژه A",
            "amount_irr": "30000000",
        },
    )
    petty_cash_service.record_expense(
        db_session,
        company.id,
        user,
        {
            "treasury_account_id": treasury_petty.id,
            "period_id": period.id,
            "expense_account_id": acc_exp.id,
            "category": "office_supplies",
            "expense_date": date(2024, 4, 12),
            "title": "ملزومات اداری دفتر",
            "amount_irr": "10000000",
        },
    )

    report = prof_service.get_project_profitability(db_session, company.id, period_id=period.id)
    by_code = {item["project_code"]: item for item in report["items"]}

    prj_a = by_code["PRJ-A"]
    prj_b = by_code["PRJ-B"]
    assert prj_a["invoiced_revenue_irr"] == "500000000"
    assert prj_a["petty_cash_cost_irr"] == "30000000"
    assert int(prj_a["payroll_cost_irr"]) + int(prj_b["payroll_cost_irr"]) == total_emp_cost
    assert int(prj_a["gross_profit_irr"]) == 500000000 - int(prj_a["payroll_cost_irr"]) - 30000000
    assert prj_a["profit_margin_pct"] is not None

    summary = report["summary"]
    assert summary["total_invoiced_revenue_irr"] == "500000000"
    assert summary["total_project_petty_cash_cost_irr"] == "30000000"
    assert summary["unallocated_petty_cash_cost_irr"] == "10000000"
    assert int(summary["estimated_operating_profit_irr"]) == 500000000 - total_emp_cost - 30000000 - 10000000
