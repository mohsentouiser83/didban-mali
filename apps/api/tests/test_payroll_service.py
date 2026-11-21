"""Integration tests for payroll master data, contracts, calculations and operation drafts."""

from datetime import date
from uuid import uuid4

import pytest

from didban import models as m
from didban import payroll_service as service
from didban.errors import DomainError


@pytest.fixture
def payroll_env(db_session):
    user = m.User(
        id=str(uuid4()),
        email="payroll_admin@example.com",
        name="مدیر حقوق و دستمزد",
        password_hash="fake",
    )
    company = m.Company(id=str(uuid4()), name="شرکت دیدبان آزمایشی")
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
    db_session.add_all([user, company, member, period])
    db_session.flush()
    return {"user": user, "company": company.id, "period": period}


def test_employee_crud_and_exemptions(db_session, payroll_env):
    company = payroll_env["company"]
    user = payroll_env["user"]

    # 1. Add employee with special conditions (Veteran Art. 56)
    emp_data = {
        "employee_code": "EMP-101",
        "first_name": "علی",
        "last_name": "احمدی",
        "identity_type": "national_id",
        "national_id": "0012345678",
        "phone": "09120000000",
        "iban": "IR120000000000000000000001",
        "bank_name": "بانک ملت",
        "marital_status": "married",
        "children_count": 2,
        "is_veteran_or_child": True,
    }
    created = service.add_employee(db_session, company, user, emp_data)
    assert created["id"] is not None
    assert created["employee_code"] == "EMP-101"
    assert created["is_veteran_or_child"] is True

    # 2. Duplicate code rejected
    with pytest.raises(DomainError) as err:
        service.add_employee(db_session, company, user, emp_data)
    assert err.value.code == "duplicate_employee_code"

    # 3. List employees
    listing = service.list_employees(db_session, company, user)
    assert listing["total"] == 1
    assert listing["items"][0]["employee_code"] == "EMP-101"

    # 4. Update employee
    updated = service.update_employee(
        db_session, company, user, created["id"], {"job_title": "مدیر مالی", "children_count": 3}
    )
    assert updated["job_title"] == "مدیر مالی"
    assert updated["children_count"] == 3


def test_contract_crud(db_session, payroll_env):
    company = payroll_env["company"]
    user = payroll_env["user"]

    # Add employee first
    emp = service.add_employee(
        db_session,
        company,
        user,
        {
            "employee_code": "EMP-102",
            "first_name": "سارا",
            "last_name": "محمدی",
        },
    )

    # Add contract
    con_data = {
        "employee_id": emp["id"],
        "contract_number": "CON-2024-001",
        "contract_type": "full_time",
        "start_date": date(2024, 3, 21),
        "base_salary": "150000000",  # 15M Toman
        "housing_allowance": "9000000",
        "grocery_allowance": "14000000",
        "marital_allowance": "0",
        "is_insured": True,
        "is_taxable": True,
    }
    contract = service.add_contract(db_session, company, user, con_data)
    assert contract["id"] is not None
    assert contract["contract_number"] == "CON-2024-001"
    assert contract["base_salary"] == "150000000"

    # List contracts
    c_list = service.list_contracts(db_session, company, user, employee_id=emp["id"])
    assert c_list["total"] == 1
    assert c_list["items"][0]["employee_name"] == "سارا محمدی"


def test_payroll_run_and_slips_flow(db_session, payroll_env):
    company = payroll_env["company"]
    user = payroll_env["user"]
    period = payroll_env["period"]

    # 1. Add standard employee with contract
    emp1 = service.add_employee(
        db_session,
        company,
        user,
        {
            "employee_code": "EMP-201",
            "first_name": "حسن",
            "last_name": "رضایی",
            "marital_status": "single",
            "children_count": 0,
        },
    )
    service.add_contract(
        db_session,
        company,
        user,
        {
            "employee_id": emp1["id"],
            "contract_number": "CON-201",
            "contract_type": "full_time",
            "start_date": date(2024, 3, 21),
            "base_salary": "100000000",
            "housing_allowance": "9000000",
            "grocery_allowance": "14000000",
            "is_insured": True,
            "is_taxable": True,
        },
    )

    # 2. Add veteran employee (exempt from tax and employee insurance)
    emp2 = service.add_employee(
        db_session,
        company,
        user,
        {
            "employee_code": "EMP-202",
            "first_name": "محمد",
            "last_name": "ایثارگر",
            "is_veteran_or_child": True,
        },
    )
    service.add_contract(
        db_session,
        company,
        user,
        {
            "employee_id": emp2["id"],
            "contract_number": "CON-202",
            "contract_type": "full_time",
            "start_date": date(2024, 3, 21),
            "base_salary": "200000000",
            "housing_allowance": "9000000",
            "grocery_allowance": "14000000",
            "is_insured": True,
            "is_taxable": True,
        },
    )

    # 3. Create payroll run for Farvardin 1403 (Month 1, 31 days)
    run_data = {
        "period_id": period.id,
        "title": "لیست حقوق فروردین ۱۴۰۳",
        "year": 1403,
        "month": 1,
        "calculation_date": date(2024, 4, 20),
    }
    run = service.create_payroll_run(db_session, company, user, run_data)
    assert run["id"] is not None
    assert run["status"] == "calculated"
    assert int(run["total_gross"]) > 0
    assert int(run["total_net"]) > 0

    # 4. Inspect slips
    details = service.get_payroll_run(db_session, company, run["id"])
    assert len(details["slips"]) == 2

    slip_emp2 = next(s for s in details["slips"] if s["employee_id"] == emp2["id"])
    assert slip_emp2["applied_exemptions"]["art_56_veteran_tax_exempt"] is True
    assert slip_emp2["applied_exemptions"]["veteran_employee_insurance_exempt"] is True
    assert slip_emp2["payroll_tax"] == "0"
    assert slip_emp2["employee_insurance"] == "0"

    # 5. Update timesheet for emp1 (add overtime and loan deduction)
    slip_emp1 = next(s for s in details["slips"] if s["employee_id"] == emp1["id"])
    updated_slip = service.update_slip_timesheet(
        db_session,
        company,
        user,
        run["id"],
        slip_emp1["id"],
        {"overtime_hours": 10, "loan_installment": "5000000"},
    )
    assert int(updated_slip["overtime_pay"]) > 0
    assert updated_slip["loan_installment"] == "5000000"

    # 6. Verify run totals updated
    updated_run = service.get_payroll_run(db_session, company, run["id"])
    assert int(updated_run["total_net"]) > 0
