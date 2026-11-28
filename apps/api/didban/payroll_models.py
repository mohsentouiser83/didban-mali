"""Native personnel, employment contracts, and periodic payroll runs."""

from datetime import date

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Entity, Tenant, Versioned
from .money_type import Money


class Employee(Entity, Tenant, Versioned, Base):
    """First-class employee profile, identifying attributes, and statutory exemption flags."""

    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "employee_code"),
    )

    employee_code: Mapped[str] = mapped_column(String(50))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    identity_type: Mapped[str] = mapped_column(
        String(20), default="national_id"
    )  # national_id or foreign_national_id
    national_id: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    father_name: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    insurance_number: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True, default=None)
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True, default=None)
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    marital_status: Mapped[str] = mapped_column(String(20), default="single")  # single, married
    children_count: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Special conditions & statutory exemptions
    is_veteran_or_child: Mapped[bool] = mapped_column(Boolean, default=False)
    is_foreign_national: Mapped[bool] = mapped_column(Boolean, default=False)
    is_science_park_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    has_disability_charge: Mapped[bool] = mapped_column(Boolean, default=False)
    is_underdeveloped_region: Mapped[bool] = mapped_column(Boolean, default=False)
    is_retired: Mapped[bool] = mapped_column(Boolean, default=False)


class CompanyPayrollWorkshop(Entity, Tenant, Versioned, Base):
    """Employer Social Security / tax workshop registration details for payroll outputs."""

    __tablename__ = "company_payroll_workshops"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "workshop_code"),
    )

    workshop_code: Mapped[str] = mapped_column(String(20))
    employer_name: Mapped[str] = mapped_column(String(200))
    tamin_branch_code: Mapped[str | None] = mapped_column(String(30), nullable=True, default=None)
    tamin_branch_name: Mapped[str | None] = mapped_column(String(120), nullable=True, default=None)
    tax_office_code: Mapped[str | None] = mapped_column(String(30), nullable=True, default=None)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class EmployeeContract(Entity, Tenant, Versioned, Base):
    """Employment terms, contract type (full-time, part-time, hourly, project), and base financial amounts."""

    __tablename__ = "employee_contracts"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "contract_number"),
        ForeignKeyConstraint(
            ["company_id", "employee_id"],
            ["employees.company_id", "employees.id"],
        ),
    )

    employee_id: Mapped[str] = mapped_column(String(36))
    contract_number: Mapped[str] = mapped_column(String(50))
    contract_type: Mapped[str] = mapped_column(
        String(30), default="full_time"
    )  # full_time, part_time, hourly, project
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="active")  # draft, active, terminated

    # Monthly contract amounts (IRR)
    base_salary: Mapped[str] = mapped_column(Money(), default="0")
    daily_rate: Mapped[str] = mapped_column(Money(), default="0")
    housing_allowance: Mapped[str] = mapped_column(Money(), default="0")
    grocery_allowance: Mapped[str] = mapped_column(Money(), default="0")
    marital_allowance: Mapped[str] = mapped_column(Money(), default="0")
    child_allowance: Mapped[str] = mapped_column(Money(), default="0")
    tenure_allowance: Mapped[str] = mapped_column(Money(), default="0")
    custom_fixed_allowances: Mapped[str] = mapped_column(Money(), default="0")

    # Inclusions
    is_insured: Mapped[bool] = mapped_column(Boolean, default=True)
    is_taxable: Mapped[bool] = mapped_column(Boolean, default=True)
    workshop_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    work_location: Mapped[str | None] = mapped_column(String(200), nullable=True, default=None)
    work_description: Mapped[str | None] = mapped_column(String(300), nullable=True, default=None)
    weekly_hours: Mapped[str | None] = mapped_column(Money(), nullable=True, default="44", server_default="44")
    conclusion_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    amendment_of_contract_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)


class PayrollRun(Entity, Tenant, Versioned, Base):
    """Monthly payroll execution batch for a financial period."""

    __tablename__ = "payroll_runs"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "year", "month"),
        ForeignKeyConstraint(
            ["company_id", "period_id"],
            ["financial_periods.company_id", "financial_periods.id"],
        ),
    )

    period_id: Mapped[str] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(150))
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    calculation_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, calculated, approved, posted

    total_gross: Mapped[str] = mapped_column(Money(), default="0")
    total_employee_insurance: Mapped[str] = mapped_column(Money(), default="0")
    total_employer_insurance: Mapped[str] = mapped_column(Money(), default="0")
    total_tax: Mapped[str] = mapped_column(Money(), default="0")
    total_other_deductions: Mapped[str] = mapped_column(Money(), default="0")
    total_net: Mapped[str] = mapped_column(Money(), default="0")

    journal_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
    created_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)


class PayrollSlip(Entity, Tenant, Versioned, Base):
    """Detailed employee payslip containing timesheet inputs, earnings breakdown, deductions, and net pay."""

    __tablename__ = "payroll_slips"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "payroll_run_id", "employee_id"),
        ForeignKeyConstraint(
            ["company_id", "payroll_run_id"],
            ["payroll_runs.company_id", "payroll_runs.id"],
        ),
        ForeignKeyConstraint(
            ["company_id", "employee_id"],
            ["employees.company_id", "employees.id"],
        ),
    )

    payroll_run_id: Mapped[str] = mapped_column(String(36))
    employee_id: Mapped[str] = mapped_column(String(36))
    contract_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)

    # Timesheet inputs
    work_days: Mapped[str] = mapped_column(Money(), default="30")
    work_hours: Mapped[str] = mapped_column(Money(), default="0")
    overtime_hours: Mapped[str] = mapped_column(Money(), default="0")
    absence_days: Mapped[str] = mapped_column(Money(), default="0")
    paid_leave_days: Mapped[str] = mapped_column(Money(), default="0")
    unpaid_leave_days: Mapped[str] = mapped_column(Money(), default="0")
    advance_payment: Mapped[str] = mapped_column(Money(), default="0")
    loan_installment: Mapped[str] = mapped_column(Money(), default="0")
    other_deductions: Mapped[str] = mapped_column(Money(), default="0")
    bonus_amount: Mapped[str] = mapped_column(Money(), default="0")

    # Calculated components
    base_pay: Mapped[str] = mapped_column(Money(), default="0")
    housing_pay: Mapped[str] = mapped_column(Money(), default="0")
    grocery_pay: Mapped[str] = mapped_column(Money(), default="0")
    marital_pay: Mapped[str] = mapped_column(Money(), default="0")
    child_pay: Mapped[str] = mapped_column(Money(), default="0")
    tenure_pay: Mapped[str] = mapped_column(Money(), default="0")
    overtime_pay: Mapped[str] = mapped_column(Money(), default="0")
    gross_pay: Mapped[str] = mapped_column(Money(), default="0")

    insured_earnings: Mapped[str] = mapped_column(Money(), default="0")
    taxable_earnings: Mapped[str] = mapped_column(Money(), default="0")
    employee_insurance: Mapped[str] = mapped_column(Money(), default="0")
    employer_insurance: Mapped[str] = mapped_column(Money(), default="0")
    payroll_tax: Mapped[str] = mapped_column(Money(), default="0")
    total_deductions: Mapped[str] = mapped_column(Money(), default="0")
    net_pay: Mapped[str] = mapped_column(Money(), default="0")

    status: Mapped[str] = mapped_column(String(20), default="unpaid")  # unpaid, paid
    attendance_status: Mapped[str] = mapped_column(String(30), default="verified", server_default="verified")
    applied_exemptions: Mapped[dict] = mapped_column(JSON, default=dict)
    contract_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    calculation_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    project_allocations: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    payment_journal_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=None)
