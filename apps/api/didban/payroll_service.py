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
from .operation_models import OperationDraft
from .payroll_engine import calculate_slip, d
from .payroll_models import Employee, EmployeeContract, PayrollRun, PayrollSlip
from .period_lock_service import require_open_period
from .security import membership
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
        "applied_exemptions": slip.applied_exemptions or {},
        "version": slip.version,
    }
    if emp:
        data["employee_code"] = emp.employee_code
        data["employee_name"] = f"{emp.first_name} {emp.last_name}".strip()
        data["job_title"] = emp.job_title
        data["department"] = emp.department
    return data


# --- Employee Operations ---


def add_employee(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه مدیریت کارمندان ندارید.", 403)
    require(
        not db.scalar(
            select(Employee.id).where(
                Employee.company_id == company,
                Employee.employee_code == data["employee_code"],
            )
        ),
        "duplicate_employee_code",
        "این کد پرسنلی قبلاً ثبت شده است.",
        409,
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
        employee_code=data["employee_code"],
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
    membership(db, company, user, "read")
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


def get_employee(db: Session, company: str, employee_id: str) -> dict[str, Any]:
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
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ویرایش کارمند ندارید.", 403)
    emp = get_entity(db, Employee, company, employee_id)
    if expected_version is not None:
        check_version(emp.version, expected_version)

    if "employee_code" in data and data["employee_code"] != emp.employee_code:
        require(
            not db.scalar(
                select(Employee.id).where(
                    Employee.company_id == company,
                    Employee.employee_code == data["employee_code"],
                    Employee.id != employee_id,
                )
            ),
            "duplicate_employee_code",
            "این کد پرسنلی برای کارمند دیگری ثبت شده است.",
            409,
        )

    for field in (
        "employee_code",
        "first_name",
        "last_name",
        "identity_type",
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
        "marital_status",
        "children_count",
        "active",
        "is_veteran_or_child",
        "is_foreign_national",
        "is_science_park_staff",
        "has_disability_charge",
        "is_underdeveloped_region",
        "is_retired",
    ):
        if field in data and data[field] is not None:
            setattr(emp, field, data[field])

    emp.version += 1
    db.flush()
    audit(db, company, user.id, "employee.updated", emp.id, {"version": emp.version})
    return serialize_employee(emp)


def delete_employee(db: Session, company: str, user: m.User, employee_id: str) -> dict[str, Any]:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه حذف کارمند ندارید.", 403)
    emp = get_entity(db, Employee, company, employee_id)
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
        return {"status": "deactivated", "employee_id": employee_id}

    db.delete(emp)
    db.flush()
    audit(db, company, user.id, "employee.deleted", employee_id, {"code": emp.employee_code})
    return {"status": "deleted", "employee_id": employee_id}


# --- Contract Operations ---


def add_contract(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه مدیریت قراردادها ندارید.", 403)
    emp = get_entity(db, Employee, company, data["employee_id"])
    require(
        not db.scalar(
            select(EmployeeContract.id).where(
                EmployeeContract.company_id == company,
                EmployeeContract.contract_number == data["contract_number"],
            )
        ),
        "duplicate_contract_number",
        "این شماره قرارداد قبلاً ثبت شده است.",
        409,
    )

    contract = EmployeeContract(
        company_id=company,
        employee_id=emp.id,
        contract_number=data["contract_number"],
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
    membership(db, company, user, "read")
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


def get_contract(db: Session, company: str, contract_id: str) -> dict[str, Any]:
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
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه ویرایش قرارداد ندارید.", 403)
    con = get_entity(db, EmployeeContract, company, contract_id)
    if expected_version is not None:
        check_version(con.version, expected_version)

    for field in (
        "contract_number",
        "contract_type",
        "start_date",
        "end_date",
        "status",
        "is_insured",
        "is_taxable",
        "notes",
    ):
        if field in data and data[field] is not None:
            setattr(con, field, data[field])

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
        if money_field in data and data[money_field] is not None:
            setattr(con, money_field, canonical_money(data[money_field]))

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
        timesheet = {"work_days": days_in_month}

        calc = calculate_slip(emp_dict, contract_dict, timesheet, days_in_month=days_in_month)

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
            applied_exemptions=calc["applied_exemptions"],
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
    membership(db, company, user, "read")
    stmt = select(PayrollRun).where(PayrollRun.company_id == company)
    if period_id:
        stmt = stmt.where(PayrollRun.period_id == period_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    runs = db.scalars(
        stmt.order_by(PayrollRun.year.desc(), PayrollRun.month.desc()).offset(offset).limit(limit)
    ).all()
    return {"items": [serialize_run(r) for r in runs], "total": total}


def get_payroll_run(db: Session, company: str, run_id: str) -> dict[str, Any]:
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
    calc = calculate_slip(emp_dict, con_dict, ts_dict, days_in_month=days_in_month)

    for k, v in calc.items():
        if k == "applied_exemptions":
            slip.applied_exemptions = v
        elif hasattr(slip, k):
            setattr(slip, k, v)

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
        )
        for k, v in calc.items():
            if k == "applied_exemptions":
                slip.applied_exemptions = v
            elif hasattr(slip, k):
                setattr(slip, k, v)
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
