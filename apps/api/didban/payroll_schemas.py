"""Pydantic schemas for employees, contracts, and monthly payroll runs."""

from datetime import date as CalendarDate
from typing import Annotated, Literal

from pydantic import Field, StrictInt

from .accounting_schemas import StrictInput


class EmployeeInput(StrictInput):
    employee_code: str = Field(min_length=1, max_length=50)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    identity_type: Literal["national_id", "foreign_national_id"] = "national_id"
    national_id: str | None = Field(default=None, max_length=20)
    father_name: str | None = Field(default=None, max_length=100)
    birth_date: CalendarDate | None = None
    hire_date: CalendarDate | None = None
    insurance_number: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=30)
    iban: str | None = Field(default=None, max_length=34)
    bank_name: str | None = Field(default=None, max_length=100)
    account_number: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=120)
    department: str | None = Field(default=None, max_length=120)
    marital_status: Literal["single", "married"] = "single"
    children_count: StrictInt = Field(default=0, ge=0, le=50)
    active: bool = True

    # Special conditions
    is_veteran_or_child: bool = False
    is_foreign_national: bool = False
    is_science_park_staff: bool = False
    has_disability_charge: bool = False
    is_underdeveloped_region: bool = False
    is_retired: bool = False


class UpdateEmployeeInput(StrictInput):
    employee_code: str | None = Field(default=None, min_length=1, max_length=50)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    identity_type: Literal["national_id", "foreign_national_id"] | None = None
    national_id: str | None = Field(default=None, max_length=20)
    father_name: str | None = Field(default=None, max_length=100)
    birth_date: CalendarDate | None = None
    hire_date: CalendarDate | None = None
    insurance_number: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=30)
    iban: str | None = Field(default=None, max_length=34)
    bank_name: str | None = Field(default=None, max_length=100)
    account_number: str | None = Field(default=None, max_length=50)
    job_title: str | None = Field(default=None, max_length=120)
    department: str | None = Field(default=None, max_length=120)
    marital_status: Literal["single", "married"] | None = None
    children_count: StrictInt | None = Field(default=None, ge=0, le=50)
    active: bool | None = None

    is_veteran_or_child: bool | None = None
    is_foreign_national: bool | None = None
    is_science_park_staff: bool | None = None
    has_disability_charge: bool | None = None
    is_underdeveloped_region: bool | None = None
    is_retired: bool | None = None


class ContractInput(StrictInput):
    employee_id: str = Field(min_length=1, max_length=36)
    contract_number: str = Field(min_length=1, max_length=50)
    contract_type: Literal["full_time", "part_time", "hourly", "project"] = "full_time"
    start_date: CalendarDate
    end_date: CalendarDate | None = None
    status: Literal["draft", "active", "terminated"] = "active"

    base_salary: Annotated[str, Field(max_length=80)] | StrictInt = "0"
    daily_rate: Annotated[str, Field(max_length=80)] | StrictInt = "0"
    housing_allowance: Annotated[str, Field(max_length=80)] | StrictInt = "0"
    grocery_allowance: Annotated[str, Field(max_length=80)] | StrictInt = "0"
    marital_allowance: Annotated[str, Field(max_length=80)] | StrictInt = "0"
    child_allowance: Annotated[str, Field(max_length=80)] | StrictInt = "0"
    tenure_allowance: Annotated[str, Field(max_length=80)] | StrictInt = "0"
    custom_fixed_allowances: Annotated[str, Field(max_length=80)] | StrictInt = "0"

    is_insured: bool = True
    is_taxable: bool = True
    notes: str | None = Field(default=None, max_length=1000)


class UpdateContractInput(StrictInput):
    contract_number: str | None = Field(default=None, min_length=1, max_length=50)
    contract_type: Literal["full_time", "part_time", "hourly", "project"] | None = None
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None
    status: Literal["draft", "active", "terminated"] | None = None

    base_salary: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    daily_rate: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    housing_allowance: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    grocery_allowance: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    marital_allowance: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    child_allowance: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    tenure_allowance: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    custom_fixed_allowances: Annotated[str, Field(max_length=80)] | StrictInt | None = None

    is_insured: bool | None = None
    is_taxable: bool | None = None
    notes: str | None = Field(default=None, max_length=1000)


class PayrollRunCreateInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    title: str = Field(min_length=1, max_length=150)
    year: StrictInt = Field(ge=1300, le=1500)
    month: StrictInt = Field(ge=1, le=12)
    calculation_date: CalendarDate


class PayrollSlipTimesheetInput(StrictInput):
    employee_id: str = Field(min_length=1, max_length=36)
    work_days: Annotated[str, Field(max_length=40)] | StrictInt | None = None
    work_hours: Annotated[str, Field(max_length=40)] | StrictInt | None = None
    overtime_hours: Annotated[str, Field(max_length=40)] | StrictInt | None = None
    absence_days: Annotated[str, Field(max_length=40)] | StrictInt | None = None
    paid_leave_days: Annotated[str, Field(max_length=40)] | StrictInt | None = None
    unpaid_leave_days: Annotated[str, Field(max_length=40)] | StrictInt | None = None
    advance_payment: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    loan_installment: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    other_deductions: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    bonus_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None


class BatchTimesheetInput(StrictInput):
    slips: list[PayrollSlipTimesheetInput] = Field(min_length=1, max_length=500)


class PayrollPostJournalInput(StrictInput):
    date: CalendarDate | None = None
    description: str | None = Field(default=None, max_length=300)
