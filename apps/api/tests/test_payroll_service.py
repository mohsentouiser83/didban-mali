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
    assert created["employee_code"] == "001"
    assert created["is_veteran_or_child"] is True

    # 2. External national IDs remain unique
    with pytest.raises(DomainError) as err:
        service.add_employee(db_session, company, user, emp_data)
    assert err.value.code == "duplicate_national_id"

    # 3. List employees
    listing = service.list_employees(db_session, company, user)
    assert listing["total"] == 1
    assert listing["items"][0]["employee_code"] == "001"

    # 4. Update employee
    updated = service.update_employee(
        db_session, company, user, created["id"], {"job_title": "مدیر مالی", "children_count": 3, "employee_code": "MANUAL"}
    )
    assert updated["job_title"] == "مدیر مالی"
    assert updated["children_count"] == 3
    assert updated["employee_code"] == created["employee_code"]


def test_http_employee_and_contract_patch_versions_and_null_clearing(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
manager = client_for("finance_manager")
viewer = client_for("viewer")

# Create employee
emp_res = command(manager, "POST", base + "/employees", {
    "first_name": "علی",
    "last_name": "رضایی",
    "national_id": "0011223344",
    "job_title": "حسابدار",
    "birth_date": "1990-01-01",
    "hire_date": "2024-01-01",
})
assert emp_res.status_code == 201, emp_res.text
emp = emp_res.json()
assert emp["version"] == 1

# Viewer cannot mutate
assert command(viewer, "PATCH", base + "/employees/" + emp["id"], {"job_title": "تست"}, version=1).status_code == 403

# PATCH with valid If-Match succeeds; omitted fields remain, null clears optional fields
patched = command(manager, "PATCH", base + "/employees/" + emp["id"], {
    "job_title": None,
    "birth_date": None,
}, version=1)
assert patched.status_code == 200, patched.text
p_emp = patched.json()
assert p_emp["version"] == 2
assert p_emp["job_title"] is None
assert p_emp["birth_date"] is None
assert p_emp["national_id"] == "0011223344"  # omitted field preserved

# Stale version returns 409
stale = command(manager, "PATCH", base + "/employees/" + emp["id"], {"job_title": "جدید"}, version=1)
assert stale.status_code == 409

# Null on required field rejected
bad_null = command(manager, "PATCH", base + "/employees/" + emp["id"], {"first_name": None}, version=2)
assert bad_null.status_code in (400, 422)

# Duplicate national_id on second employee PATCH rejected
emp2 = command(manager, "POST", base + "/employees", {"first_name": "رضا", "last_name": "سعیدی"}).json()
dup_res = command(manager, "PATCH", base + "/employees/" + emp2["id"], {"national_id": "0011223344"}, version=1)
assert dup_res.status_code == 409

# Contract CRUD and PATCH with version & null clearing
con_res = command(manager, "POST", base + "/contracts", {
    "employee_id": emp["id"],
    "contract_type": "full_time",
    "start_date": "2024-03-21",
    "end_date": "2025-03-20",
    "base_salary": "120000000",
    "notes": "یادداشت اولیه",
})
assert con_res.status_code == 201, con_res.text
con = con_res.json()
assert con["version"] == 1

con_patched = command(manager, "PATCH", base + "/contracts/" + con["id"], {
    "end_date": None,
    "notes": None,
    "base_salary": "130000000",
}, version=1)
assert con_patched.status_code == 200, con_patched.text
c_data = con_patched.json()
assert c_data["version"] == 2
assert c_data["end_date"] is None
assert c_data["notes"] is None
assert c_data["base_salary"] == "130000000"

# Stale contract version returns 409
assert command(manager, "PATCH", base + "/contracts/" + con["id"], {"base_salary": "140000000"}, version=1).status_code == 409

# End date before start date rejected
assert command(manager, "PATCH", base + "/contracts/" + con["id"], {"end_date": "2024-01-01"}, version=2).status_code == 422

# Deleting employee with contract deactivates instead of hard-deleting; deleting emp2 deletes
del1 = command(manager, "DELETE", base + "/employees/" + emp["id"], version=2)
assert del1.status_code == 200 and del1.json()["status"] == "deactivated"
del2 = command(manager, "DELETE", base + "/employees/" + emp2["id"], version=1)
assert del2.status_code == 200 and del2.json()["status"] == "deleted"
""",
    )


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
    assert contract["contract_number"] == "001"
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


def test_payroll_posting_preserves_the_reviewed_run(db_session, payroll_env):
    from didban.accounting_models import Account, Draft
    from didban.accounting_setup_models import CompanyAccountingSetup
    from didban.operation_service import catalogue
    from didban.posting_service import discard_draft, post_batch, preview

    company = payroll_env["company"]
    user = payroll_env["user"]
    period = payroll_env["period"]
    db_session.add(CompanyAccountingSetup(company_id=company, mode="primary"))
    roles = next(item for item in catalogue()["items"] if item["kind"] == "payroll")["roles"]
    accounts = {
        role["key"]: Account(company_id=company, code=str(index), name=role["label"])
        for index, role in enumerate(roles)
    }
    db_session.add_all(accounts.values())
    db_session.flush()
    account_ids = {role: account.id for role, account in accounts.items()}

    employee = service.add_employee(db_session, company, user, {
        "employee_code": "PAY-1", "first_name": "سارا", "last_name": "احمدی",
    })
    service.add_contract(db_session, company, user, {
        "employee_id": employee["id"], "contract_number": "PAY-CON-1",
        "contract_type": "full_time", "start_date": date(2024, 3, 20),
        "end_date": date(2024, 4, 19), "base_salary": "100000000",
    })
    data = {"period_id": period.id, "title": "حقوق", "year": 1403, "month": 1}
    with pytest.raises(DomainError, match="متناسب با دوره"):
        service.create_payroll_run(db_session, company, user, data | {"calculation_date": date(2025, 5, 1)})
    run = service.create_payroll_run(db_session, company, user, data | {"calculation_date": date(2024, 4, 20)})
    slip = service.get_payroll_run(db_session, company, run["id"])["slips"][0]
    with pytest.raises(DomainError) as invalid:
        with db_session.begin_nested():
            service.create_payroll_run(db_session, company, user, data | {
                "month": 2, "calculation_date": date(2024, 5, 20),
            })
    assert invalid.value.code == "payroll_contract_missing"

    prepared = service.create_payroll_operation_draft(
        db_session, company, user, run["id"], account_ids, expected_version=run["version"],
    )
    draft = db_session.get(Draft, prepared["operation"]["draft"]["id"])
    with pytest.raises(DomainError) as locked:
        service.update_slip_timesheet(db_session, company, user, run["id"], slip["id"], {"work_days": 25})
    assert locked.value.code == "payroll_draft_exists"
    discard_draft(db_session, company, user, draft.id, "دوباره بررسی شود", draft.version)
    service.update_slip_timesheet(db_session, company, user, run["id"], slip["id"], {"work_days": 25})
    edited = service.get_payroll_run(db_session, company, run["id"])
    prepared = service.create_payroll_operation_draft(
        db_session, company, user, run["id"], account_ids, expected_version=edited["version"],
    )
    draft_id = prepared["operation"]["draft"]["id"]
    review = preview(db_session, company, user, draft_id)
    assert review["snapshot"]["payroll"] == {"run_id": run["id"], "run_version": prepared["run"]["version"]}
    journal = post_batch(db_session, company, user, [{
        "draft_id": draft_id, "expected_version": review["expected_version"], "digest": review["digest"],
    }])["items"][0]
    posted = service.get_payroll_run(db_session, company, run["id"])
    assert posted["journal_id"] == journal["id"]
    assert posted["status"] == "posted"


def test_employee_and_contract_codes_use_patterns_without_input(db_session, payroll_env):
    from sqlalchemy import select

    from didban.numbering_models import NumberingSystem
    from didban.numbering_service import ensure_defaults

    company = payroll_env["company"]
    user = payroll_env["user"]
    ensure_defaults(db_session, company)
    for entity, prefix in (("personnel", "EMP-"), ("employee_contract", "CON-")):
        rule = db_session.scalar(select(NumberingSystem).where(
            NumberingSystem.company_id == company, NumberingSystem.entity_type == entity,
        ))
        rule.prefix = prefix
        rule.current_number = 12
        rule.padding = 4
    db_session.flush()
    employee = service.add_employee(db_session, company, user, {"first_name": "علی", "last_name": "احمدی"})
    assert employee["employee_code"] == "EMP-0012"
    contract = service.add_contract(db_session, company, user, {
        "employee_id": employee["id"], "start_date": date(2024, 3, 21),
    })
    assert contract["contract_number"] == "CON-0012"
    changed = service.update_contract(db_session, company, user, contract["id"], {
        "contract_number": "MANUAL", "notes": "اصلاح",
    })
    assert changed["contract_number"] == contract["contract_number"]
    assert changed["notes"] == "اصلاح"


def test_calculate_end_of_service_eydi_sanavat_leave():
    from decimal import Decimal

    from didban.payroll_engine import calculate_end_of_service

    base_salary = Decimal("100000000")  # 100,000,000 IRR
    hire_date = date(2023, 1, 1)
    calc_date = date(2024, 1, 1)  # exactly 366 days (leap year or ~1 year)

    res = calculate_end_of_service(
        base_salary=base_salary,
        hire_date=hire_date,
        calculation_date=calc_date,
        used_leave_days=Decimal("5"),
    )

    assert int(res["eydi_amount"]) > 0
    assert int(res["sanavat_amount"]) > 0
    assert Decimal(res["remaining_leave_days"]) == Decimal("25.0")
    assert int(res["leave_settlement_amount"]) > 0
    assert int(res["total_settlement"]) == (
        int(res["eydi_amount"]) + int(res["sanavat_amount"]) + int(res["leave_settlement_amount"])
    )


def test_honorarium_contract_payroll_statutory_rates(db_session, payroll_env):
    from didban.payroll_engine import calculate_slip

    emp = {"marital_status": "single", "children_count": 0}
    con = {
        "contract_type": "honorarium",
        "base_salary": "200000000",
        "is_insured": True,
        "is_taxable": True,
    }
    timesheet = {"work_days": 30}

    res = calculate_slip(emp, con, timesheet, days_in_month=30)
    # Gross: 200,000,000
    assert res["gross_pay"] == "200000000"
    # Tax: 10% flat under Note 1 to Art. 86 -> 20,000,000
    assert res["payroll_tax"] == "20000000"
    # Insurance: Employer 16.67% under Art. 38 -> 33,340,000; Employee 0
    assert res["employee_insurance"] == "0"
    assert res["employer_insurance"] == "33340000"
    assert res["applied_exemptions"]["honorarium_article_86_flat_tax"] == "10%"
    assert res["applied_exemptions"]["honorarium_article_38_insurance"] == "16.67%"


def test_settlement_and_diskettes_export(db_session, payroll_env):
    company = payroll_env["company"]
    user = payroll_env["user"]
    period = payroll_env["period"]

    emp = service.add_employee(db_session, company, user, {
        "employee_code": "EXP-1",
        "first_name": "سهراب",
        "last_name": "سپهری",
        "national_id": "0012345678",
        "hire_date": date(2023, 1, 1),
    })
    service.add_contract(db_session, company, user, {
        "employee_id": emp["id"],
        "contract_type": "full_time",
        "start_date": date(2023, 1, 1),
        "base_salary": "150000000",
    })

    # Test Settlement
    settlement = service.get_employee_settlement(db_session, company, user, emp["id"], calculation_date=date(2024, 1, 1))
    assert settlement["employee"]["id"] == emp["id"]
    assert int(settlement["settlement"]["eydi_amount"]) > 0
    assert int(settlement["settlement"]["sanavat_amount"]) > 0

    # Create run and verify workshop + insurance identity guards
    run = service.create_payroll_run(db_session, company, user, {
        "period_id": period.id,
        "title": "حقوق فروردین",
        "year": 1403,
        "month": 1,
        "calculation_date": date(2024, 4, 20),
    })

    with pytest.raises(DomainError) as missing_ws:
        service.export_insurance_disk(db_session, company, user, run["id"])
    assert missing_ws.value.code == "payroll_workshop_missing"

    service.add_workshop(db_session, company, user, {
        "workshop_code": "1234567890",
        "employer_name": "کارگاه نمونه",
    })
    with pytest.raises(DomainError) as missing_ins:
        service.export_insurance_disk(db_session, company, user, run["id"])
    assert missing_ins.value.code == "payroll_employee_identity_missing"

    service.update_employee(db_session, company, user, emp["id"], {"insurance_number": "9988776655"})

    insurance_disk = service.export_insurance_disk(db_session, company, user, run["id"])
    assert insurance_disk["workshop_code"] == "1234567890"
    assert insurance_disk["official_format_verified"] is False
    assert insurance_disk["output_scope"] == "internal_draft_only"
    assert "DSK_ID" in insurance_disk["dskkar00"]
    assert "DSK_ROW" in insurance_disk["dskwor00"]
    assert len(insurance_disk["rows"]) >= 1

    tax_disk = service.export_tax_disk(db_session, company, user, run["id"])
    assert tax_disk["official_format_verified"] is False
    assert tax_disk["output_scope"] == "internal_draft_only"
    assert "ROW,NATIONAL_ID" in tax_disk["tax_file"]
    assert len(tax_disk["rows"]) >= 1
    assert int(tax_disk["summary"]["total_gross_pay"]) > 0

