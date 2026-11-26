"""Service layer for employee master data, employment contracts, and periodic payroll runs."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import jdatetime
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Draft
from .accounting_service import capabilities
from .errors import require
from .money_type import canonical_money
from .numbering_service import allocate_number
from .operation_models import OperationDraft
from .payroll_engine import calculate_end_of_service, calculate_slip, d
from .payroll_models import (
    CompanyPayrollWorkshop,
    Employee,
    EmployeeContract,
    PayrollRun,
    PayrollSlip,
)
from .period_lock_service import require_open_period
from .posting_models import NativeJournal
from .security import require_payroll_access
from .services import check_version, get_entity
from .workflow import audit


def serialize_employee(emp: Employee) -> dict[str, Any]:
    return {
        "id": emp.id,
        "company_id": emp.company_id,
        "employee_code": emp.employee_code,
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "full_name": f"{emp.first_name} {emp.last_name}".strip(),
        "identity_type": emp.identity_type,
        "national_id": emp.national_id,
        "father_name": emp.father_name,
        "birth_date": str(emp.birth_date) if emp.birth_date else None,
        "hire_date": str(emp.hire_date) if emp.hire_date else None,
        "insurance_number": emp.insurance_number,
        "phone": emp.phone,
        "iban": emp.iban,
        "bank_name": emp.bank_name,
        "account_number": emp.account_number,
        "job_title": emp.job_title,
        "department": emp.department,
        "marital_status": emp.marital_status,
        "children_count": emp.children_count,
        "active": emp.active,
        "is_veteran_or_child": emp.is_veteran_or_child,
        "is_foreign_national": emp.is_foreign_national,
        "is_science_park_staff": emp.is_science_park_staff,
        "has_disability_charge": emp.has_disability_charge,
        "is_underdeveloped_region": emp.is_underdeveloped_region,
        "is_retired": emp.is_retired,
        "version": emp.version,
    }


def serialize_workshop(row: CompanyPayrollWorkshop) -> dict[str, Any]:
    return {
        "id": row.id,
        "company_id": row.company_id,
        "workshop_code": row.workshop_code,
        "employer_name": row.employer_name,
        "tamin_branch_code": row.tamin_branch_code,
        "tamin_branch_name": row.tamin_branch_name,
        "tax_office_code": row.tax_office_code,
        "address": row.address,
        "active": row.active,
        "version": row.version,
    }


def serialize_contract(con: EmployeeContract) -> dict[str, Any]:
    return {
        "id": con.id,
        "company_id": con.company_id,
        "employee_id": con.employee_id,
        "contract_number": con.contract_number,
        "contract_type": con.contract_type,
        "start_date": str(con.start_date),
        "end_date": str(con.end_date) if con.end_date else None,
        "status": con.status,
        "base_salary": con.base_salary,
        "daily_rate": con.daily_rate,
        "housing_allowance": con.housing_allowance,
        "grocery_allowance": con.grocery_allowance,
        "marital_allowance": con.marital_allowance,
        "child_allowance": con.child_allowance,
        "tenure_allowance": con.tenure_allowance,
        "custom_fixed_allowances": con.custom_fixed_allowances,
        "is_insured": con.is_insured,
        "is_taxable": con.is_taxable,
        "workshop_id": con.workshop_id,
        "work_location": con.work_location,
        "work_description": con.work_description,
        "weekly_hours": con.weekly_hours or "44",
        "conclusion_date": str(con.conclusion_date) if con.conclusion_date else None,
        "amendment_of_contract_id": con.amendment_of_contract_id,
        "notes": con.notes,
        "version": con.version,
    }


def serialize_run(run: PayrollRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "company_id": run.company_id,
        "period_id": run.period_id,
        "title": run.title,
        "year": run.year,
        "month": run.month,
        "calculation_date": str(run.calculation_date),
        "status": run.status,
        "total_gross": run.total_gross,
        "total_employee_insurance": run.total_employee_insurance,
        "total_employer_insurance": run.total_employer_insurance,
        "total_tax": run.total_tax,
        "total_other_deductions": run.total_other_deductions,
        "total_net": run.total_net,
        "journal_id": run.journal_id,
        "created_by_user_id": run.created_by_user_id,
        "rate_table_year": 1403,
        "rate_status": "verified_1403" if run.year == 1403 else "unverified_period_rates",
        "version": run.version,
    }


def serialize_slip(slip: PayrollSlip, emp: Employee | None = None) -> dict[str, Any]:
    data = {
        "id": slip.id,
        "company_id": slip.company_id,
        "payroll_run_id": slip.payroll_run_id,
        "employee_id": slip.employee_id,
        "contract_id": slip.contract_id,
        "work_days": slip.work_days,
        "work_hours": slip.work_hours,
        "overtime_hours": slip.overtime_hours,
        "absence_days": slip.absence_days,
        "paid_leave_days": slip.paid_leave_days,
        "unpaid_leave_days": slip.unpaid_leave_days,
        "advance_payment": slip.advance_payment,
        "loan_installment": slip.loan_installment,
        "other_deductions": slip.other_deductions,
        "bonus_amount": slip.bonus_amount,
        "base_pay": slip.base_pay,
        "housing_pay": slip.housing_pay,
        "grocery_pay": slip.grocery_pay,
        "marital_pay": slip.marital_pay,
        "child_pay": slip.child_pay,
        "tenure_pay": slip.tenure_pay,
        "overtime_pay": slip.overtime_pay,
        "gross_pay": slip.gross_pay,
        "insured_earnings": slip.insured_earnings,
        "taxable_earnings": slip.taxable_earnings,
        "employee_insurance": slip.employee_insurance,
        "employer_insurance": slip.employer_insurance,
        "payroll_tax": slip.payroll_tax,
        "total_deductions": slip.total_deductions,
        "net_pay": slip.net_pay,
        "status": slip.status,
        "attendance_status": slip.attendance_status,
        "applied_exemptions": slip.applied_exemptions or {},
        "contract_snapshot": slip.contract_snapshot or {},
        "calculation_meta": slip.calculation_meta or {},
        "payment_journal_id": slip.payment_journal_id,
        "version": slip.version,
    }
    if emp:
        data["employee_code"] = emp.employee_code
        data["employee_name"] = f"{emp.first_name} {emp.last_name}".strip()
        data["job_title"] = emp.job_title
        data["department"] = emp.department
    return data


def list_workshops(db: Session, company: str, user: m.User) -> dict[str, Any]:
    require_payroll_access(db, company, user)
    rows = db.scalars(
        select(CompanyPayrollWorkshop)
        .where(CompanyPayrollWorkshop.company_id == company)
        .order_by(CompanyPayrollWorkshop.active.desc(), CompanyPayrollWorkshop.workshop_code.asc())
    ).all()
    return {"items": [serialize_workshop(r) for r in rows]}


def add_workshop(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تعریف کارگاه حقوق ندارید.", 403)
    code = data["workshop_code"].strip()
    require(set(code) != {"0"}, "invalid_workshop_code", "کد کارگاه نمی‌تواند صفر پیش‌فرض باشد.")
    existing = db.scalar(
        select(CompanyPayrollWorkshop.id).where(
            CompanyPayrollWorkshop.company_id == company,
            CompanyPayrollWorkshop.workshop_code == code,
        )
    )
    require(existing is None, "duplicate_workshop_code", "این کد کارگاه قبلاً ثبت شده است.", 409)
    row = CompanyPayrollWorkshop(
        company_id=company,
        workshop_code=code,
        employer_name=data["employer_name"].strip(),
        tamin_branch_code=data.get("tamin_branch_code"),
        tamin_branch_name=data.get("tamin_branch_name"),
        tax_office_code=data.get("tax_office_code"),
        address=data.get("address"),
        active=bool(data.get("active", True)),
    )
    db.add(row)
    db.flush()
    audit(db, company, user.id, "payroll_workshop.created", row.id, {"workshop_code": code})
    return serialize_workshop(row)


def update_workshop(
    db: Session, company: str, user: m.User, workshop_id: str, data: dict[str, Any], expected_version: int
) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ویرایش کارگاه حقوق ندارید.", 403)
    row = get_entity(db, CompanyPayrollWorkshop, company, workshop_id)
    check_version(row, expected_version)
    if "workshop_code" in data and data["workshop_code"] is not None:
        code = data["workshop_code"].strip()
        require(set(code) != {"0"}, "invalid_workshop_code", "کد کارگاه نمی‌تواند صفر پیش‌فرض باشد.")
        dup = db.scalar(
            select(CompanyPayrollWorkshop.id).where(
                CompanyPayrollWorkshop.company_id == company,
                CompanyPayrollWorkshop.workshop_code == code,
                CompanyPayrollWorkshop.id != row.id,
            )
        )
        require(dup is None, "duplicate_workshop_code", "این کد کارگاه قبلاً ثبت شده است.", 409)
        row.workshop_code = code
    if "employer_name" in data and data["employer_name"] is not None:
        row.employer_name = data["employer_name"].strip()
    for field in ("tamin_branch_code", "tamin_branch_name", "tax_office_code", "address"):
        if field in data:
            val = data[field]
            row_val = val.strip() if isinstance(val, str) and val.strip() else None
            setattr(row, field, row_val)
    if "active" in data and data["active"] is not None:
        row.active = bool(data["active"])
    row.version += 1
    db.flush()
    audit(db, company, user.id, "payroll_workshop.updated", row.id, {"version": row.version})
    return serialize_workshop(row)


# --- Employee Operations ---


def add_employee(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه مدیریت کارمندان ندارید.", 403)
    if data.get("birth_date") and data.get("hire_date"):
        require(
            data["hire_date"] >= data["birth_date"],
            "invalid_employee_dates",
            "تاریخ استخدام نباید پیش از تاریخ تولد باشد.",
        )
    if data.get("national_id"):
        require(
            not db.scalar(
                select(Employee.id).where(
                    Employee.company_id == company,
                    Employee.national_id == data["national_id"],
                )
            ),
            "duplicate_national_id",
            "این کد ملی قبلاً برای کارمند دیگری ثبت شده است.",
            409,
        )

    emp = Employee(
        company_id=company,
        employee_code=allocate_number(db, company, "personnel", Employee, "employee_code"),
        first_name=data["first_name"],
        last_name=data["last_name"],
        identity_type=data.get("identity_type", "national_id"),
        national_id=data.get("national_id"),
        father_name=data.get("father_name"),
        birth_date=data.get("birth_date"),
        hire_date=data.get("hire_date"),
        insurance_number=data.get("insurance_number"),
        phone=data.get("phone"),
        iban=data.get("iban"),
        bank_name=data.get("bank_name"),
        account_number=data.get("account_number"),
        job_title=data.get("job_title"),
        department=data.get("department"),
        marital_status=data.get("marital_status", "single"),
        children_count=int(data.get("children_count") or 0),
        active=data.get("active", True),
        is_veteran_or_child=bool(data.get("is_veteran_or_child", False)),
        is_foreign_national=bool(data.get("is_foreign_national", False)),
        is_science_park_staff=bool(data.get("is_science_park_staff", False)),
        has_disability_charge=bool(data.get("has_disability_charge", False)),
        is_underdeveloped_region=bool(data.get("is_underdeveloped_region", False)),
        is_retired=bool(data.get("is_retired", False)),
    )
    db.add(emp)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "employee.created",
        emp.id,
        {"code": emp.employee_code, "name": f"{emp.first_name} {emp.last_name}"},
    )
    return serialize_employee(emp)


def list_employees(
    db: Session,
    company: str,
    user: m.User,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    active_only: bool = False,
) -> dict[str, Any]:
    require_payroll_access(db, company, user)
    stmt = select(Employee).where(Employee.company_id == company)
    if active_only:
        stmt = stmt.where(Employee.active.is_(True))
    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.employee_code.ilike(s),
                Employee.first_name.ilike(s),
                Employee.last_name.ilike(s),
                Employee.national_id.ilike(s),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Employee.employee_code.asc()).offset(offset).limit(limit)).all()
    return {"items": [serialize_employee(emp) for emp in items], "total": total}


def get_employee(db: Session, company: str, employee_id: str, user: m.User | None = None) -> dict[str, Any]:
    if user is not None:
        require_payroll_access(db, company, user)
    emp = get_entity(db, Employee, company, employee_id)
    contracts = db.scalars(
        select(EmployeeContract)
        .where(
            EmployeeContract.company_id == company,
            EmployeeContract.employee_id == employee_id,
        )
        .order_by(EmployeeContract.start_date.desc())
    ).all()
    res = serialize_employee(emp)
    res["contracts"] = [serialize_contract(c) for c in contracts]
    return res


def update_employee(
    db: Session,
    company: str,
    user: m.User,
    employee_id: str,
    data: dict[str, Any],
    expected_version: int | None = None,
) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ویرایش کارمند ندارید.", 403)
    emp = get_entity(db, Employee, company, employee_id)
    if expected_version is not None:
        check_version(emp, expected_version)

    required_fields = (
        "first_name",
        "last_name",
        "identity_type",
        "marital_status",
        "children_count",
        "active",
        "is_veteran_or_child",
        "is_foreign_national",
        "is_science_park_staff",
        "has_disability_charge",
        "is_underdeveloped_region",
        "is_retired",
    )
    optional_fields = (
        "national_id",
        "father_name",
        "birth_date",
        "hire_date",
        "insurance_number",
        "phone",
        "iban",
        "bank_name",
        "account_number",
        "job_title",
        "department",
    )
    for field in required_fields:
        if field in data:
            require(
                data[field] is not None,
                "invalid_field_value",
                f"مقدار فیلد اجباری «{field}» نمی‌تواند خالی باشد.",
            )
            setattr(emp, field, data[field])

    for field in optional_fields:
        if field in data:
            val = data[field]
            if isinstance(val, str) and not val.strip():
                val = None
            if field == "national_id" and val is not None:
                dup = db.scalar(
                    select(Employee.id).where(
                        Employee.company_id == company,
                        Employee.national_id == val,
                        Employee.id != emp.id,
                    )
                )
                require(not dup, "duplicate_national_id", "این کد ملی قبلاً برای کارمند دیگری ثبت شده است.", 409)
            setattr(emp, field, val)

    if emp.birth_date and emp.hire_date:
        require(
            emp.hire_date >= emp.birth_date,
            "invalid_employee_dates",
            "تاریخ استخدام نباید پیش از تاریخ تولد باشد.",
        )

    emp.version += 1
    db.flush()
    audit(db, company, user.id, "employee.updated", emp.id, {"version": emp.version})
    return serialize_employee(emp)


def delete_employee(
    db: Session,
    company: str,
    user: m.User,
    employee_id: str,
    expected_version: int | None = None,
) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه حذف کارمند ندارید.", 403)
    emp = get_entity(db, Employee, company, employee_id)
    if expected_version is not None:
        check_version(emp, expected_version)
    # Check if there are contracts or slips
    has_contracts = db.scalar(
        select(EmployeeContract.id)
        .where(EmployeeContract.company_id == company, EmployeeContract.employee_id == employee_id)
        .limit(1)
    )
    has_slips = db.scalar(
        select(PayrollSlip.id)
        .where(PayrollSlip.company_id == company, PayrollSlip.employee_id == employee_id)
        .limit(1)
    )
    if has_contracts or has_slips:
        emp.active = False
        emp.version += 1
        db.flush()
        audit(db, company, user.id, "employee.deactivated", emp.id, {"reason": "has_dependencies"})
        return {"status": "deactivated", "employee_id": employee_id, "version": emp.version}

    db.delete(emp)
    db.flush()
    audit(db, company, user.id, "employee.deleted", employee_id, {"code": emp.employee_code})
    return {"status": "deleted", "employee_id": employee_id}


# --- Contract Operations ---


def _validate_contract_parent(
    db: Session, company: str, employee_id: str, parent_id: str | None, contract_id: str | None = None
) -> None:
    seen = {contract_id} if contract_id else set()
    while parent_id:
        require(parent_id not in seen, "contract_amendment_cycle", "زنجیرهٔ الحاقیه نمی‌تواند به خودش برگردد.", 409)
        seen.add(parent_id)
        parent = get_entity(db, EmployeeContract, company, parent_id)
        require(parent.employee_id == employee_id, "contract_employee_mismatch", "الحاقیه باید متعلق به همان کارمند باشد.")
        parent_id = parent.amendment_of_contract_id


def add_contract(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه مدیریت قراردادها ندارید.", 403)
    emp = get_entity(db, Employee, company, data["employee_id"])
    if data.get("end_date") is not None:
        require(
            data["end_date"] >= data["start_date"],
            "invalid_contract_dates",
            "تاریخ پایان قرارداد نباید پیش از تاریخ شروع باشد.",
        )
    if data.get("workshop_id"):
        get_entity(db, CompanyPayrollWorkshop, company, data["workshop_id"])
    if data.get("amendment_of_contract_id"):
        _validate_contract_parent(db, company, emp.id, data["amendment_of_contract_id"])
    contract = EmployeeContract(
        company_id=company,
        employee_id=emp.id,
        contract_number=allocate_number(db, company, "employee_contract", EmployeeContract, "contract_number"),
        contract_type=data.get("contract_type", "full_time"),
        start_date=data["start_date"],
        end_date=data.get("end_date"),
        status=data.get("status", "active"),
        base_salary=canonical_money(data.get("base_salary", 0)),
        daily_rate=canonical_money(data.get("daily_rate", 0)),
        housing_allowance=canonical_money(data.get("housing_allowance", 0)),
        grocery_allowance=canonical_money(data.get("grocery_allowance", 0)),
        marital_allowance=canonical_money(data.get("marital_allowance", 0)),
        child_allowance=canonical_money(data.get("child_allowance", 0)),
        tenure_allowance=canonical_money(data.get("tenure_allowance", 0)),
        custom_fixed_allowances=canonical_money(data.get("custom_fixed_allowances", 0)),
        is_insured=bool(data.get("is_insured", True)),
        is_taxable=bool(data.get("is_taxable", True)),
        workshop_id=data.get("workshop_id"),
        work_location=data.get("work_location"),
        work_description=data.get("work_description"),
        weekly_hours=canonical_money(data["weekly_hours"]) if data.get("weekly_hours") is not None else "44",
        conclusion_date=data.get("conclusion_date"),
        amendment_of_contract_id=data.get("amendment_of_contract_id"),
        notes=data.get("notes"),
    )
    db.add(contract)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "contract.created",
        contract.id,
        {"contract_number": contract.contract_number, "employee_id": emp.id},
    )
    return serialize_contract(contract)


def list_contracts(
    db: Session,
    company: str,
    user: m.User,
    employee_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    require_payroll_access(db, company, user)
    stmt = (
        select(EmployeeContract, Employee)
        .join(Employee, EmployeeContract.employee_id == Employee.id)
        .where(EmployeeContract.company_id == company)
    )
    if employee_id:
        stmt = stmt.where(EmployeeContract.employee_id == employee_id)
    if status:
        stmt = stmt.where(EmployeeContract.status == status)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(EmployeeContract.start_date.desc()).offset(offset).limit(limit)).all()
    items = []
    for con, emp in rows:
        c_dict = serialize_contract(con)
        c_dict["employee_code"] = emp.employee_code
        c_dict["employee_name"] = f"{emp.first_name} {emp.last_name}".strip()
        items.append(c_dict)
    return {"items": items, "total": total}


def get_contract(db: Session, company: str, contract_id: str, user: m.User | None = None) -> dict[str, Any]:
    if user is not None:
        require_payroll_access(db, company, user)
    con = get_entity(db, EmployeeContract, company, contract_id)
    emp = get_entity(db, Employee, company, con.employee_id)
    res = serialize_contract(con)
    res["employee_code"] = emp.employee_code
    res["employee_name"] = f"{emp.first_name} {emp.last_name}".strip()
    return res


def update_contract(
    db: Session,
    company: str,
    user: m.User,
    contract_id: str,
    data: dict[str, Any],
    expected_version: int | None = None,
) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ویرایش قرارداد ندارید.", 403)
    if data.get("amendment_of_contract_id"):
        db.execute(select(m.Company.id).where(m.Company.id == company).with_for_update())
    con = get_entity(db, EmployeeContract, company, contract_id)
    if expected_version is not None:
        check_version(con, expected_version)

    required_fields = ("contract_type", "start_date", "status", "is_insured", "is_taxable")
    for field in required_fields:
        if field in data:
            require(
                data[field] is not None,
                "invalid_field_value",
                f"مقدار فیلد اجباری «{field}» نمی‌تواند خالی باشد.",
            )
            setattr(con, field, data[field])

    for optional_field in (
        "end_date",
        "notes",
        "workshop_id",
        "work_location",
        "work_description",
        "conclusion_date",
        "amendment_of_contract_id",
    ):
        if optional_field in data:
            val = data[optional_field]
            if isinstance(val, str) and not val.strip():
                val = None
            if optional_field == "workshop_id" and val is not None:
                get_entity(db, CompanyPayrollWorkshop, company, val)
            if optional_field == "amendment_of_contract_id" and val is not None:
                _validate_contract_parent(db, company, con.employee_id, val, con.id)
            setattr(con, optional_field, val)
    if "weekly_hours" in data and data["weekly_hours"] is not None:
        con.weekly_hours = canonical_money(data["weekly_hours"])

    for money_field in (
        "base_salary",
        "daily_rate",
        "housing_allowance",
        "grocery_allowance",
        "marital_allowance",
        "child_allowance",
        "tenure_allowance",
        "custom_fixed_allowances",
    ):
        if money_field in data:
            require(
                data[money_field] is not None,
                "invalid_field_value",
                f"مبلغ «{money_field}» نمی‌تواند خالی باشد.",
            )
            setattr(con, money_field, canonical_money(data[money_field]))

    if con.end_date is not None:
        require(
            con.end_date >= con.start_date,
            "invalid_contract_dates",
            "تاریخ پایان قرارداد نباید پیش از تاریخ شروع باشد.",
        )

    con.version += 1
    db.flush()
    audit(db, company, user.id, "contract.updated", con.id, {"version": con.version})
    return serialize_contract(con)


# --- Payroll Runs & Slips Operations ---


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    start = jdatetime.date(year, month, 1).togregorian()
    next_month = jdatetime.date(year + (month == 12), month % 12 + 1, 1).togregorian()
    return start, next_month


def _month_days(year: int, month: int) -> int:
    start, end = _month_bounds(year, month)
    return (end - start).days


def create_payroll_run(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ایجاد لیست حقوق ندارید.", 403)

    # Check period
    period = get_entity(db, m.Period, company, data["period_id"])
    year = int(data["year"])
    month = int(data["month"])
    month_start, next_month = _month_bounds(year, month)
    calculation_date = data["calculation_date"]
    require_open_period(db, company, period.id)
    require(
        period.start <= calculation_date <= period.end
        and month_start <= calculation_date
        and period.start < next_month,
        "payroll_date_outside_period",
        "ماه حقوق و تاریخ محاسبه را متناسب با دورهٔ مالی انتخاب کنید.",
    )
    contract_date = min(calculation_date, next_month - timedelta(days=1))

    require(
        not db.scalar(
            select(PayrollRun.id).where(
                PayrollRun.company_id == company,
                PayrollRun.year == year,
                PayrollRun.month == month,
            )
        ),
        "duplicate_payroll_run",
        f"لیست حقوق برای دوره {year}/{month:02d} قبلاً ایجاد شده است.",
        409,
    )

    run = PayrollRun(
        company_id=company,
        period_id=period.id,
        title=data["title"],
        year=year,
        month=month,
        calculation_date=data["calculation_date"],
        status="draft",
        created_by_user_id=user.id,
    )
    db.add(run)
    db.flush()

    # Query all active employees
    employees = db.scalars(
        select(Employee).where(
            Employee.company_id == company, Employee.active.is_(True),
            or_(Employee.hire_date.is_(None), Employee.hire_date <= contract_date),
        ).order_by(Employee.employee_code)
    ).all()

    days_in_month = _month_days(year, month)

    total_gross = Decimal("0")
    total_employee_insurance = Decimal("0")
    total_employer_insurance = Decimal("0")
    total_tax = Decimal("0")
    total_other_deductions = Decimal("0")
    total_net = Decimal("0")

    for emp in employees:
        # Find active contract
        contract = db.scalar(
            select(EmployeeContract)
            .where(
                EmployeeContract.company_id == company,
                EmployeeContract.employee_id == emp.id,
                EmployeeContract.status == "active",
                EmployeeContract.start_date <= contract_date,
                or_(EmployeeContract.end_date.is_(None), EmployeeContract.end_date >= contract_date),
            )
            .order_by(EmployeeContract.start_date.desc())
            .limit(1)
        )

        require(
            contract is not None,
            "payroll_contract_missing",
            f"کارمند {emp.employee_code} در تاریخ محاسبه قرارداد معتبر ندارد.",
            409,
        )
        emp_dict = serialize_employee(emp)
        contract_dict = serialize_contract(contract)
        month_end = next_month - timedelta(days=1)
        eff_start = max(month_start, contract.start_date, emp.hire_date or month_start)
        eff_end = min(month_end, contract.end_date or month_end)
        active_days = max(0, (eff_end - eff_start).days + 1)
        timesheet = {"work_days": active_days}

        calc = calculate_slip(emp_dict, contract_dict, timesheet, days_in_month=days_in_month, year=year)

        slip = PayrollSlip(
            company_id=company,
            payroll_run_id=run.id,
            employee_id=emp.id,
            contract_id=contract.id if contract else None,
            work_days=canonical_money(timesheet["work_days"]),
            work_hours="0",
            overtime_hours="0",
            absence_days="0",
            paid_leave_days="0",
            unpaid_leave_days="0",
            advance_payment="0",
            loan_installment="0",
            other_deductions="0",
            bonus_amount="0",
            base_pay=calc["base_pay"],
            housing_pay=calc["housing_pay"],
            grocery_pay=calc["grocery_pay"],
            marital_pay=calc["marital_pay"],
            child_pay=calc["child_pay"],
            tenure_pay=calc["tenure_pay"],
            overtime_pay=calc["overtime_pay"],
            gross_pay=calc["gross_pay"],
            insured_earnings=calc["insured_earnings"],
            taxable_earnings=calc["taxable_earnings"],
            employee_insurance=calc["employee_insurance"],
            employer_insurance=calc["employer_insurance"],
            payroll_tax=calc["payroll_tax"],
            total_deductions=calc["total_deductions"],
            net_pay=calc["net_pay"],
            status="unpaid",
            attendance_status="prorated_needs_review" if active_days < days_in_month else "full_month_default",
            applied_exemptions=calc["applied_exemptions"],
            contract_snapshot=contract_dict,
            calculation_meta={
                "rate_table_year": calc["rate_table_year"],
                "rate_status": calc["rate_status"],
                "days_in_month": days_in_month,
                "active_days": active_days,
            },
        )
        db.add(slip)

        total_gross += d(calc["gross_pay"])
        total_employee_insurance += d(calc["employee_insurance"])
        total_employer_insurance += d(calc["employer_insurance"])
        total_tax += d(calc["payroll_tax"])
        total_other_deductions += (
            d(calc["total_deductions"]) - d(calc["employee_insurance"]) - d(calc["payroll_tax"])
        )
        total_net += d(calc["net_pay"])

    run.total_gross = canonical_money(total_gross)
    run.total_employee_insurance = canonical_money(total_employee_insurance)
    run.total_employer_insurance = canonical_money(total_employer_insurance)
    run.total_tax = canonical_money(total_tax)
    run.total_other_deductions = canonical_money(total_other_deductions)
    run.total_net = canonical_money(total_net)
    run.status = "calculated"
    db.flush()

    audit(
        db, company, user.id, "payroll_run.created", run.id, {"title": run.title, "total_net": run.total_net}
    )
    return serialize_run(run)


def list_payroll_runs(
    db: Session,
    company: str,
    user: m.User,
    period_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    require_payroll_access(db, company, user)
    stmt = select(PayrollRun).where(PayrollRun.company_id == company)
    if period_id:
        stmt = stmt.where(PayrollRun.period_id == period_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    runs = db.scalars(
        stmt.order_by(PayrollRun.year.desc(), PayrollRun.month.desc()).offset(offset).limit(limit)
    ).all()
    return {"items": [serialize_run(r) for r in runs], "total": total}


def get_payroll_run(db: Session, company: str, run_id: str, user: m.User | None = None) -> dict[str, Any]:
    if user is not None:
        require_payroll_access(db, company, user)
    run = get_entity(db, PayrollRun, company, run_id)
    stmt = (
        select(PayrollSlip, Employee)
        .join(Employee, PayrollSlip.employee_id == Employee.id)
        .where(PayrollSlip.company_id == company, PayrollSlip.payroll_run_id == run_id)
        .order_by(Employee.employee_code.asc())
    )
    rows = db.execute(stmt).all()
    slips = [serialize_slip(s, emp) for s, emp in rows]
    res = serialize_run(run)
    res["slips"] = slips
    return res


def update_slip_timesheet(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
    slip_id: str,
    timesheet_data: dict[str, Any],
) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ویرایش کارکرد ندارید.", 403)
    run = get_entity(db, PayrollRun, company, run_id)
    _require_editable_run(db, company, run)

    slip = get_entity(db, PayrollSlip, company, slip_id)
    require(
        slip.payroll_run_id == run.id and timesheet_data.get("employee_id", slip.employee_id) == slip.employee_id,
        "not_found",
        "فیش در این لیست حقوق پیدا نشد.",
        404,
    )
    emp = get_entity(db, Employee, company, slip.employee_id)
    con = get_entity(db, EmployeeContract, company, slip.contract_id) if slip.contract_id else None

    # Update timesheet fields
    for field in (
        "work_days",
        "work_hours",
        "overtime_hours",
        "absence_days",
        "paid_leave_days",
        "unpaid_leave_days",
        "advance_payment",
        "loan_installment",
        "other_deductions",
        "bonus_amount",
    ):
        if field in timesheet_data and timesheet_data[field] is not None:
            setattr(slip, field, canonical_money(timesheet_data[field]))

    # Re-calculate
    days_in_month = _month_days(run.year, run.month)
    emp_dict = serialize_employee(emp)
    con_dict = serialize_contract(con) if con else None
    ts_dict = {
        "work_days": slip.work_days,
        "work_hours": slip.work_hours,
        "overtime_hours": slip.overtime_hours,
        "advance_payment": slip.advance_payment,
        "loan_installment": slip.loan_installment,
        "other_deductions": slip.other_deductions,
        "bonus_amount": slip.bonus_amount,
    }
    calc = calculate_slip(emp_dict, con_dict, ts_dict, days_in_month=days_in_month, year=run.year)

    for k, v in calc.items():
        if k == "applied_exemptions":
            slip.applied_exemptions = v
        elif hasattr(slip, k):
            setattr(slip, k, v)
    slip.attendance_status = "verified"
    slip.calculation_meta = {
        **(slip.calculation_meta or {}),
        "rate_table_year": calc["rate_table_year"],
        "rate_status": calc["rate_status"],
        "days_in_month": days_in_month,
    }

    slip.version += 1
    db.flush()

    # Recalculate run totals
    _refresh_run_totals(db, company, run)
    return serialize_slip(slip, emp)


def batch_update_timesheets(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
    slips_data: list[dict[str, Any]],
) -> dict[str, Any]:
    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ویرایش کارکرد ندارید.", 403)
    run = get_entity(db, PayrollRun, company, run_id)
    _require_editable_run(db, company, run)

    for item in slips_data:
        emp_id = item["employee_id"]
        slip = db.scalar(
            select(PayrollSlip).where(
                PayrollSlip.company_id == company,
                PayrollSlip.payroll_run_id == run_id,
                PayrollSlip.employee_id == emp_id,
            )
        )
        require(slip is not None, "not_found", "فیش در این لیست حقوق پیدا نشد.", 404)
        emp = get_entity(db, Employee, company, slip.employee_id)
        con = get_entity(db, EmployeeContract, company, slip.contract_id) if slip.contract_id else None

        for field in (
            "work_days",
            "work_hours",
            "overtime_hours",
            "absence_days",
            "paid_leave_days",
            "unpaid_leave_days",
            "advance_payment",
            "loan_installment",
            "other_deductions",
            "bonus_amount",
        ):
            if field in item and item[field] is not None:
                setattr(slip, field, canonical_money(item[field]))

        days_in_month = _month_days(run.year, run.month)
        calc = calculate_slip(
            serialize_employee(emp),
            serialize_contract(con) if con else None,
            {
                "work_days": slip.work_days,
                "work_hours": slip.work_hours,
                "overtime_hours": slip.overtime_hours,
                "advance_payment": slip.advance_payment,
                "loan_installment": slip.loan_installment,
                "other_deductions": slip.other_deductions,
                "bonus_amount": slip.bonus_amount,
            },
            days_in_month=days_in_month,
            year=run.year,
        )
        for k, v in calc.items():
            if k == "applied_exemptions":
                slip.applied_exemptions = v
            elif hasattr(slip, k):
                setattr(slip, k, v)
        slip.attendance_status = "verified"
        slip.calculation_meta = {
            **(slip.calculation_meta or {}),
            "rate_table_year": calc["rate_table_year"],
            "rate_status": calc["rate_status"],
            "days_in_month": days_in_month,
        }
        slip.version += 1

    db.flush()
    _refresh_run_totals(db, company, run)
    return get_payroll_run(db, company, run_id)


def _refresh_run_totals(db: Session, company: str, run: PayrollRun) -> None:
    slips = db.scalars(
        select(PayrollSlip).where(
            PayrollSlip.company_id == company,
            PayrollSlip.payroll_run_id == run.id,
        )
    ).all()

    total_gross = sum((d(s.gross_pay) for s in slips), Decimal("0"))
    total_employee_insurance = sum((d(s.employee_insurance) for s in slips), Decimal("0"))
    total_employer_insurance = sum((d(s.employer_insurance) for s in slips), Decimal("0"))
    total_tax = sum((d(s.payroll_tax) for s in slips), Decimal("0"))
    total_net = sum((d(s.net_pay) for s in slips), Decimal("0"))
    total_other = total_gross - (total_net + total_employee_insurance + total_tax)

    run.total_gross = canonical_money(total_gross)
    run.total_employee_insurance = canonical_money(total_employee_insurance)
    run.total_employer_insurance = canonical_money(total_employer_insurance)
    run.total_tax = canonical_money(total_tax)
    run.total_other_deductions = canonical_money(max(Decimal("0"), total_other))
    run.total_net = canonical_money(total_net)
    run.version += 1
    db.flush()


def _require_editable_run(db: Session, company: str, run: PayrollRun) -> None:
    require_open_period(db, company, run.period_id)
    require(run.status != "posted", "run_already_posted", "لیست حقوق ثبت نهایی شده است.", 409)
    legacy_reference = f"payroll-run-{run.year}-{run.month:02d}-{run.id[:8]}"
    existing = db.scalar(
        select(Draft.id)
        .join(OperationDraft, Draft.id == OperationDraft.draft_id)
        .where(
            Draft.company_id == company,
            Draft.state.in_(("draft", "posted")),
            OperationDraft.company_id == company,
            OperationDraft.kind == "payroll",
            or_(
                OperationDraft.payload["payroll_run_id"].as_string() == run.id,
                OperationDraft.source_reference == legacy_reference,
            ),
        )
        .limit(1)
    )
    require(
        not existing,
        "payroll_draft_exists",
        "برای این لیست سند وجود دارد. پیش‌نویس باز را ابتدا کنار بگذارید.",
        409,
    )


def payroll_run_for_draft(db: Session, company: str, draft: Draft) -> PayrollRun | None:
    operation = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.draft_id == draft.id,
            OperationDraft.kind == "payroll",
        )
    )
    if not operation:
        return None
    run_id = operation.payload.get("payroll_run_id")
    if run_id:
        return get_entity(db, PayrollRun, company, run_id)
    if operation.source_reference.startswith("payroll-run-"):
        candidates = db.scalars(select(PayrollRun).where(
            PayrollRun.company_id == company, PayrollRun.period_id == draft.period_id
        ))
        for run in candidates:
            if operation.source_reference == f"payroll-run-{run.year}-{run.month:02d}-{run.id[:8]}":
                return run
    return None


def payroll_posting_evidence(db: Session, company: str, draft: Draft) -> dict | None:
    from .operation_service import build

    run = payroll_run_for_draft(db, company, draft)
    if not run:
        return None
    operation = db.scalar(select(OperationDraft).where(
        OperationDraft.company_id == company, OperationDraft.draft_id == draft.id
    ))
    stored = operation.payload
    lines = [{key: line[key] for key in ("account_id", "party_id", "debit", "credit")} for line in draft.lines]
    require(
        run.status == "approved"
        and stored.get("payroll_run_version") == run.version
        and run.period_id == draft.period_id
        and run.calculation_date == draft.date
        and draft.description == stored.get("description")
        and draft.original_unit == stored.get("unit")
        and lines == build(stored),
        "payroll_draft_changed",
        "پیش‌نویس با نسخهٔ لیست حقوق منطبق نیست. آن را کنار بگذارید و دوباره بسازید.",
        409,
    )
    return {"run_id": run.id, "run_version": run.version}


def create_payroll_operation_draft(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
    accounts: dict[str, str],
    *,
    expected_version: int,
) -> dict[str, Any]:
    """Generates a balanced native operation draft for identifying the monthly payroll liabilities and expenses."""
    from .operation_service import create as create_operation

    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ایجاد سند شناسایی حقوق ندارید.", 403)
    run = get_entity(db, PayrollRun, company, run_id)
    check_version(run, expected_version)
    _require_editable_run(db, company, run)

    amounts = {
        "gross": d(run.total_gross),
        "employee_insurance": d(run.total_employee_insurance),
        "employer_insurance": d(run.total_employer_insurance),
        "payroll_tax": d(run.total_tax),
        "other_deductions": d(run.total_other_deductions),
        "net_pay": d(run.total_net),
    }

    op_data = {
        "kind": "payroll",
        "source_reference": f"payroll-run-{run.id}-v{run.version}",
        "payroll_run_id": run.id,
        "payroll_run_version": run.version + 1,
        "period_id": run.period_id,
        "date": run.calculation_date,
        "party_id": "پرسنل و کارکنان",
        "description": f"شناسایی حقوق و دستمزد {run.title}",
        "unit": "IRR",
        "amounts": amounts,
        "accounts": accounts,
    }

    res = create_operation(db, company, user, op_data)
    run.status = "approved"
    run.version += 1
    db.flush()
    audit(
        db, company, user.id, "payroll_run.draft_created", run.id, {"operation_id": res.get("operation_id")}
    )
    return {"run": serialize_run(run), "operation": res}


# --- Statutory End-of-Service & Settlement ---


def get_employee_settlement(
    db: Session,
    company: str,
    user: m.User,
    employee_id: str,
    calculation_date: date | None = None,
    used_leave_days: Decimal = Decimal(0),
) -> dict[str, Any]:
    require_payroll_access(db, company, user)
    emp = get_entity(db, Employee, company, employee_id)
    as_of = calculation_date or date.today()

    contract = db.scalar(
        select(EmployeeContract)
        .where(
            EmployeeContract.company_id == company,
            EmployeeContract.employee_id == employee_id,
        )
        .order_by(EmployeeContract.start_date.desc())
        .limit(1)
    )

    base_salary = d(contract.base_salary) if contract else Decimal(0)
    calc = calculate_end_of_service(
        base_salary=base_salary,
        hire_date=emp.hire_date,
        calculation_date=as_of,
        used_leave_days=used_leave_days,
    )

    return {
        "employee": serialize_employee(emp),
        "contract": serialize_contract(contract) if contract else None,
        "calculation_date": str(as_of),
        "settlement": calc,
    }


def create_payroll_payment_draft(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Prepare a balanced payroll settlement draft linked to specific unpaid slips (effect only on human post)."""
    from .operation_service import create as create_operation

    require_payroll_access(db, company, user, write=True)
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ایجاد پیش‌نویس پرداخت حقوق ندارید.", 403)
    run = get_entity(db, PayrollRun, company, run_id)
    check_version(run, data["expected_version"])
    require(run.status == "posted", "payroll_run_not_posted", "ابتدا سند شناسایی لیست حقوق باید ثبت نهایی شده باشد.", 409)

    stmt = select(PayrollSlip).where(
        PayrollSlip.company_id == company,
        PayrollSlip.payroll_run_id == run.id,
        PayrollSlip.status == "unpaid",
    )
    if data.get("slip_ids"):
        stmt = stmt.where(PayrollSlip.id.in_(data["slip_ids"]))
    slips = list(db.scalars(stmt))
    require(bool(slips), "no_unpaid_slips", "فیش پرداخت‌نشدهٔ معتبری برای پرداخت یافت نشد.", 409)
    total_pay = sum((d(s.net_pay) for s in slips), Decimal("0"))
    require(total_pay > 0, "zero_payroll_payment", "جمع قابل پرداخت صفر است.", 409)

    op_data = {
        "kind": "payroll_payment",
        "source_reference": f"payroll-pay-{run.id[:8]}-{m.uid()[:6]}",
        "payroll_run_id": run.id,
        "slip_ids": [s.id for s in slips],
        "period_id": run.period_id,
        "date": data["date"],
        "party_id": "پرسنل و کارکنان",
        "description": data.get("description") or f"پرداخت حقوق {run.title}",
        "unit": "IRR",
        "amounts": {"amount": canonical_money(total_pay)},
        "accounts": {
            "payroll_payable": data["payroll_payable_account_id"],
            "bank_a": data["bank_account_id"],
        },
    }
    res = create_operation(db, company, user, op_data)
    audit(db, company, user.id, "payroll_run.payment_draft_created", run.id, {"operation_id": res["operation_id"]})
    return {"run_id": run.id, "slip_ids": [s.id for s in slips], "amount": canonical_money(total_pay), "operation": res}


def on_payroll_payment_posted(db: Session, company: str, user: m.User, draft: Draft, journal: NativeJournal) -> None:
    """Mark selected payroll slips paid only upon explicit human journal posting."""
    op = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.draft_id == draft.id,
            OperationDraft.kind == "payroll_payment",
        )
    )
    if op is None:
        return
    slip_ids = op.payload.get("slip_ids") or []
    if not slip_ids:
        return
    for slip in db.scalars(
        select(PayrollSlip).where(
            PayrollSlip.company_id == company,
            PayrollSlip.id.in_(slip_ids),
            PayrollSlip.status == "unpaid",
        )
    ):
        slip.status = "paid"
        slip.payment_journal_id = journal.id
        slip.version += 1
    db.flush()


# --- Statutory Insurance & Tax Diskettes ---


def export_insurance_disk(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
) -> dict[str, Any]:
    """Generates internal working draft of SSO list (requires registered workshop and real IDs; not officially certified)."""
    require_payroll_access(db, company, user)
    run = get_entity(db, PayrollRun, company, run_id)

    stmt = (
        select(PayrollSlip, Employee, EmployeeContract)
        .join(Employee, PayrollSlip.employee_id == Employee.id)
        .outerjoin(EmployeeContract, PayrollSlip.contract_id == EmployeeContract.id)
        .where(PayrollSlip.company_id == company, PayrollSlip.payroll_run_id == run_id)
        .order_by(Employee.employee_code.asc())
    )
    rows = db.execute(stmt).all()

    workshop = None
    for _slip, _emp, con in rows:
        if con and con.workshop_id:
            workshop = db.get(CompanyPayrollWorkshop, con.workshop_id)
            if workshop and workshop.company_id == company and workshop.active:
                break
            workshop = None
    if workshop is None:
        workshop = db.scalar(
            select(CompanyPayrollWorkshop)
            .where(CompanyPayrollWorkshop.company_id == company, CompanyPayrollWorkshop.active.is_(True))
            .order_by(CompanyPayrollWorkshop.created_at.desc())
            .limit(1)
        )
    require(
        workshop is not None and bool(workshop.workshop_code) and set(workshop.workshop_code) != {"0"},
        "payroll_workshop_missing",
        "برای تهیه خروجی بیمه، کارگاه فعال با کد کارگاه واقعی ثبت کنید.",
        409,
    )
    workshop_code = workshop.workshop_code
    employer_name = workshop.employer_name

    year_str = str(run.year)[-2:] if len(str(run.year)) == 4 else str(run.year)
    month_str = f"{run.month:02d}"

    total_insured = 0
    total_days = 0
    total_insured_wage = Decimal(0)
    total_emp_share = Decimal(0)
    total_empr_share = Decimal(0)

    wor_lines = []
    ui_rows = []

    for idx, (slip, emp, con) in enumerate(rows, start=1):
        emp_share = d(slip.employee_insurance)
        empr_share = d(slip.employer_insurance)
        insured_earn = d(slip.insured_earnings)
        days = int(d(slip.work_days))

        nat_id = (emp.national_id or "").strip()
        insurance_num = (emp.insurance_number or "").strip()
        require(
            bool(nat_id) and set(nat_id) != {"0"},
            "payroll_employee_identity_missing",
            f"کد ملی واقعی کارمند {emp.employee_code} برای خروجی بیمه ثبت نشده است.",
            409,
        )
        if con is None or con.is_insured:
            require(
                bool(insurance_num) and set(insurance_num) != {"0"},
                "payroll_employee_identity_missing",
                f"شماره بیمه واقعی کارمند {emp.employee_code} برای خروجی بیمه ثبت نشده است.",
                409,
            )

        total_insured += 1
        total_days += days
        total_insured_wage += insured_earn
        total_emp_share += emp_share
        total_empr_share += empr_share

        fname = emp.first_name or ""
        lname = emp.last_name or ""
        fath_name = emp.father_name or ""
        job = emp.job_title or "کارشناس"

        wor_line = (
            f"{idx},{insurance_num},{nat_id},{fname},{lname},{fath_name},{job},"
            f"{days},{slip.base_pay},{slip.grocery_pay},{slip.housing_pay},"
            f"{slip.insured_earnings},{slip.employee_insurance},{slip.employer_insurance}"
        )
        wor_lines.append(wor_line)

        ui_rows.append({
            "row_number": idx,
            "employee_code": emp.employee_code,
            "employee_name": f"{fname} {lname}".strip(),
            "national_id": nat_id,
            "insurance_number": insurance_num,
            "job_title": job,
            "days_worked": days,
            "insured_earnings": slip.insured_earnings,
            "employee_insurance": slip.employee_insurance,
            "employer_insurance": slip.employer_insurance,
            "total_insurance": canonical_money(emp_share + empr_share),
        })

    kar_line = (
        f"{workshop_code},{employer_name},{year_str},{month_str},01,"
        f"{total_insured},{total_days},{canonical_money(total_insured_wage)},"
        f"{canonical_money(total_emp_share)},{canonical_money(total_empr_share)},"
        f"{canonical_money(total_emp_share + total_empr_share)}"
    )

    dskkar00_content = (
        f"DSK_ID,DSK_NAME,DSK_YY,DSK_MM,DSK_LISTNO,DSK_NUM,DSK_TDD,DSK_TMOT,DSK_TINS,DSK_TNET,DSK_TKAR\n"
        f"{kar_line}"
    )

    dskwor00_content = (
        "DSK_ROW,DSK_NUM,DSK_IDNO,DSK_NAME,DSK_LNAME,DSK_FATH,DSK_OCP,DSK_ROOZ,DSK_RMAH,DSK_BON,DSK_MSK,DSK_MASH,DSK_BIME,DSK_KAR\n"
        + "\n".join(wor_lines)
    )

    return {
        "run_id": run.id,
        "title": run.title,
        "year": run.year,
        "month": run.month,
        "workshop_code": workshop_code,
        "employer_name": employer_name,
        "rate_table_year": 1403,
        "rate_status": "verified_1403" if run.year == 1403 else "unverified_period_rates",
        "output_scope": "internal_draft_only",
        "official_format_verified": False,
        "summary": {
            "total_insured_employees": total_insured,
            "total_days_worked": total_days,
            "total_insured_wage": canonical_money(total_insured_wage),
            "total_employee_share_7pct": canonical_money(total_emp_share),
            "total_employer_share_23pct": canonical_money(total_empr_share),
            "total_insurance_payable": canonical_money(total_emp_share + total_empr_share),
        },
        "dskkar00": dskkar00_content,
        "dskwor00": dskwor00_content,
        "rows": ui_rows,
    }


def export_tax_disk(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
) -> dict[str, Any]:
    """Generates internal working draft of Payroll Tax List (requires valid employee IDs; not officially certified)."""
    require_payroll_access(db, company, user)
    run = get_entity(db, PayrollRun, company, run_id)

    stmt = (
        select(PayrollSlip, Employee, EmployeeContract)
        .join(Employee, PayrollSlip.employee_id == Employee.id)
        .outerjoin(EmployeeContract, PayrollSlip.contract_id == EmployeeContract.id)
        .where(PayrollSlip.company_id == company, PayrollSlip.payroll_run_id == run_id)
        .order_by(Employee.employee_code.asc())
    )
    rows = db.execute(stmt).all()

    tax_lines = []
    ui_rows = []
    total_tax = Decimal(0)
    total_gross = Decimal(0)
    total_taxable = Decimal(0)

    for idx, (slip, emp, con) in enumerate(rows, start=1):
        gross = d(slip.gross_pay)
        taxable = d(slip.taxable_earnings)
        tax = d(slip.payroll_tax)

        total_gross += gross
        total_taxable += taxable
        total_tax += tax

        nat_id = (emp.national_id or "").strip()
        require(
            bool(nat_id) and set(nat_id) != {"0"},
            "payroll_employee_identity_missing",
            f"کد ملی واقعی کارمند {emp.employee_code} برای خروجی مالیات ثبت نشده است.",
            409,
        )
        fname = emp.first_name or ""
        lname = emp.last_name or ""
        contract_type = con.contract_type if con else "full_time"

        tax_line = (
            f"{idx},{nat_id},{fname} {lname},{contract_type},{slip.work_days},"
            f"{slip.gross_pay},{slip.base_pay},{slip.taxable_earnings},{slip.payroll_tax}"
        )
        tax_lines.append(tax_line)

        ui_rows.append({
            "row_number": idx,
            "employee_code": emp.employee_code,
            "employee_name": f"{fname} {lname}".strip(),
            "national_id": nat_id,
            "contract_type": contract_type,
            "work_days": slip.work_days,
            "gross_pay": slip.gross_pay,
            "taxable_earnings": slip.taxable_earnings,
            "payroll_tax": slip.payroll_tax,
        })

    tax_file_content = (
        "ROW,NATIONAL_ID,FULL_NAME,CONTRACT_TYPE,WORK_DAYS,GROSS_PAY,BASE_PAY,TAXABLE_PAY,PAYROLL_TAX\n"
        + "\n".join(tax_lines)
    )

    return {
        "run_id": run.id,
        "title": run.title,
        "year": run.year,
        "month": run.month,
        "rate_table_year": 1403,
        "rate_status": "verified_1403" if run.year == 1403 else "unverified_period_rates",
        "output_scope": "internal_draft_only",
        "official_format_verified": False,
        "summary": {
            "total_employees": len(rows),
            "total_gross_pay": canonical_money(total_gross),
            "total_taxable_earnings": canonical_money(total_taxable),
            "total_payroll_tax": canonical_money(total_tax),
        },
        "tax_file": tax_file_content,
        "rows": ui_rows,
    }

