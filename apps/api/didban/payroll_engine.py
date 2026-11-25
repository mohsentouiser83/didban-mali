"""Statutory payroll calculation engine for Iranian labor, social security, and direct taxation laws."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from .money_type import canonical_money

ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")

# Statutory labor baselines (IRR - 1403 baseline)
DAILY_MIN_WAGE_1403 = Decimal("2388728")
MONTHLY_GROCERY_ALLOWANCE_1403 = Decimal("14000000")  # بن کارگری
MONTHLY_HOUSING_ALLOWANCE_1403 = Decimal("9000000")  # حق مسکن
MONTHLY_MARITAL_ALLOWANCE_1403 = Decimal("5000000")  # حق تأهل
MONTHLY_CHILD_ALLOWANCE_PER_CHILD = DAILY_MIN_WAGE_1403 * Decimal("3")  # 7,166,184 ریال
DAILY_TENURE_BASE_1403 = Decimal("70000")  # پایه سنوات روزانه

STANDARD_MONTHLY_HOURS = Decimal("220")
STANDARD_DAILY_HOURS = Decimal("7.333333")
OVERTIME_MULTIPLIER = Decimal("1.4")

# Tax brackets (Monthly - Article 84 / Budget law 1403)
TAX_EXEMPT_THRESHOLD_MONTHLY = Decimal("120000000")  # تا ۱۲ میلیون تومان معاف
TAX_BRACKETS_MONTHLY = (
    (Decimal("120000000"), Decimal("165000000"), Decimal("0.10")),  # ۱۲ تا ۱۶.۵ میلیون: ۱۰٪
    (Decimal("165000000"), Decimal("270000000"), Decimal("0.15")),  # ۱۶.۵ تا ۲۷ میلیون: ۱۵٪
    (Decimal("270000000"), Decimal("400000000"), Decimal("0.20")),  # ۲۷ تا ۴۰ میلیون: ۲۰٪
    (Decimal("400000000"), Decimal("999999999999999"), Decimal("0.30")),  # بیش از ۴۰ میلیون: ۳۰٪
)

# Social security rates
EMPLOYEE_INSURANCE_RATE_NORMAL = Decimal("0.07")
EMPLOYER_INSURANCE_RATE_NORMAL = Decimal("0.23")  # 20% + 3% بیکاری
EMPLOYER_INSURANCE_RATE_NO_UNEMPLOYMENT = Decimal("0.20")  # بدون ۳٪ بیکاری (اتباع و بازنشستگان)


def d(val: Any) -> Decimal:
    """Safe Decimal conversion."""
    if val is None or val == "":
        return ZERO
    return Decimal(str(val))


def round_irr(val: Decimal) -> Decimal:
    """Rounds to nearest whole Rial."""
    return val.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def calculate_slip(
    employee: dict[str, Any],
    contract: dict[str, Any] | None,
    timesheet: dict[str, Any],
    days_in_month: int = 30,
    year: int = 1403,
) -> dict[str, Any]:
    """Calculates an employee's detailed monthly payslip using statutory rules and special conditions.

    Args:
        employee: Employee profile with exemption flags:
            - is_veteran_or_child: Art. 56 (100% tax exempt, 0% employee insurance)
            - is_foreign_national: No unemployment insurance (employer = 20%)
            - is_science_park_staff: Knowledge-based / Science park (tax exempt)
            - has_disability_charge: Severe disability dependent (50% tax exempt)
            - is_underdeveloped_region: Underdeveloped area (50% tax discount)
            - is_retired: Employed retiree (employer = 20%)
            - marital_status: 'single' or 'married'
            - children_count: int
        contract: Employment terms:
            - contract_type: 'full_time', 'part_time', 'hourly', 'project'
            - base_salary: Monthly base salary
            - daily_rate: Daily or hourly wage
            - housing_allowance: Monthly housing allowance
            - grocery_allowance: Monthly grocery allowance
            - marital_allowance: Monthly marital allowance
            - child_allowance: Monthly child allowance (or 0 for statutory)
            - tenure_allowance: Monthly tenure allowance
            - custom_fixed_allowances: Other fixed allowances
            - is_insured: bool
            - is_taxable: bool
        timesheet: Working hours and deductions for the period:
            - work_days: Number of days worked (default 30)
            - work_hours: Working hours for part-time/hourly
            - overtime_hours: Hours of overtime
            - advance_payment: Advance salary deducted
            - loan_installment: Loan installment deducted
            - other_deductions: Other deductions
            - bonus_amount: Discretionary bonus
        days_in_month: Calendar days in the payroll month (29, 30, or 31).
    """
    applied_exemptions: dict[str, Any] = {}

    # Extract contract items
    contract_type = contract.get("contract_type", "full_time") if contract else "full_time"
    base_salary = d(contract.get("base_salary")) if contract else ZERO
    daily_rate = d(contract.get("daily_rate")) if contract else ZERO
    housing_allowance = d(contract.get("housing_allowance")) if contract else MONTHLY_HOUSING_ALLOWANCE_1403
    grocery_allowance = d(contract.get("grocery_allowance")) if contract else MONTHLY_GROCERY_ALLOWANCE_1403
    marital_allowance = (
        d(contract.get("marital_allowance"))
        if contract
        else (MONTHLY_MARITAL_ALLOWANCE_1403 if employee.get("marital_status") == "married" else ZERO)
    )
    custom_fixed = d(contract.get("custom_fixed_allowances")) if contract else ZERO
    is_insured = contract.get("is_insured", True) if contract else True
    is_taxable = contract.get("is_taxable", True) if contract else True

    # Child allowance calculation
    children_count = int(employee.get("children_count") or 0)
    contract_child_allowance = d(contract.get("child_allowance")) if contract else ZERO
    if contract_child_allowance > ZERO:
        total_child_allowance = contract_child_allowance
    else:
        total_child_allowance = MONTHLY_CHILD_ALLOWANCE_PER_CHILD * Decimal(children_count)

    # Tenure allowance
    tenure_allowance = d(contract.get("tenure_allowance")) if contract else ZERO

    # Timesheet values
    work_days = d(timesheet.get("work_days", days_in_month))
    work_hours = d(timesheet.get("work_hours", 0))
    overtime_hours = d(timesheet.get("overtime_hours", 0))
    advance_payment = d(timesheet.get("advance_payment", 0))
    loan_installment = d(timesheet.get("loan_installment", 0))
    other_deductions = d(timesheet.get("other_deductions", 0))
    bonus_amount = d(timesheet.get("bonus_amount", 0))

    # Calculate earnings based on contract type
    if contract_type == "part_time":
        ratio = (
            min(ONE, work_hours / STANDARD_MONTHLY_HOURS)
            if work_hours > ZERO
            else (work_days / Decimal(days_in_month))
        )
        applied_exemptions["contract_type"] = "part_time"
        applied_exemptions["part_time_ratio"] = str(ratio)

        base_pay = round_irr(base_salary * ratio) if base_salary > ZERO else round_irr(daily_rate * work_days)
        housing_pay = round_irr(housing_allowance * ratio)
        grocery_pay = round_irr(grocery_allowance * ratio)
        marital_pay = round_irr(marital_allowance * ratio)
        child_pay = round_irr(total_child_allowance * ratio)
        tenure_pay = round_irr(tenure_allowance * ratio)
        custom_pay = round_irr(custom_fixed * ratio)
    elif contract_type == "hourly":
        applied_exemptions["contract_type"] = "hourly"
        base_pay = round_irr(daily_rate * work_hours)
        ratio = min(ONE, work_hours / STANDARD_MONTHLY_HOURS)
        housing_pay = round_irr(housing_allowance * ratio)
        grocery_pay = round_irr(grocery_allowance * ratio)
        marital_pay = round_irr(marital_allowance * ratio)
        child_pay = round_irr(total_child_allowance * ratio)
        tenure_pay = round_irr(tenure_allowance * ratio)
        custom_pay = round_irr(custom_fixed * ratio)
    elif contract_type == "project":
        applied_exemptions["contract_type"] = "project"
        base_pay = base_salary
        housing_pay = ZERO
        grocery_pay = ZERO
        marital_pay = ZERO
        child_pay = ZERO
        tenure_pay = ZERO
        custom_pay = custom_fixed
    elif contract_type == "honorarium":
        applied_exemptions["contract_type"] = "honorarium"
        base_pay = base_salary if base_salary > ZERO else (daily_rate * work_days if work_days > ZERO else ZERO)
        housing_pay = ZERO
        grocery_pay = ZERO
        marital_pay = ZERO
        child_pay = ZERO
        tenure_pay = ZERO
        custom_pay = custom_fixed
    else:  # full_time
        applied_exemptions["contract_type"] = "full_time"
        day_ratio = work_days / Decimal(days_in_month) if days_in_month > 0 else ONE
        base_pay = (
            round_irr(base_salary * day_ratio) if base_salary > ZERO else round_irr(daily_rate * work_days)
        )
        housing_pay = round_irr(housing_allowance * day_ratio)
        grocery_pay = round_irr(grocery_allowance * day_ratio)
        marital_pay = round_irr(marital_allowance * day_ratio)
        child_pay = round_irr(total_child_allowance * day_ratio)
        tenure_pay = round_irr(tenure_allowance * day_ratio)
        custom_pay = round_irr(custom_fixed * day_ratio)

    # Overtime calculation
    if overtime_hours > ZERO and base_salary > ZERO:
        hourly_rate = base_salary / STANDARD_MONTHLY_HOURS
        overtime_pay = round_irr(overtime_hours * hourly_rate * OVERTIME_MULTIPLIER)
    else:
        overtime_pay = ZERO

    # Gross pay
    gross_pay = (
        base_pay
        + housing_pay
        + grocery_pay
        + marital_pay
        + child_pay
        + tenure_pay
        + custom_pay
        + overtime_pay
        + bonus_amount
    )

    # Social Security Insurance
    # Under labor law, child allowance is exempt from social security insurance
    if contract_type == "honorarium":
        insured_earnings = gross_pay
        employee_insurance = ZERO
        employer_insurance = round_irr(gross_pay * Decimal("0.1667"))
        applied_exemptions["honorarium_article_38_insurance"] = "16.67%"
    elif is_insured:
        insured_earnings = max(ZERO, gross_pay - child_pay)

        # Employee share (7%): exempt if veteran/child under Art. 56
        if employee.get("is_veteran_or_child"):
            employee_insurance = ZERO
            applied_exemptions["veteran_employee_insurance_exempt"] = True
        else:
            employee_insurance = round_irr(insured_earnings * EMPLOYEE_INSURANCE_RATE_NORMAL)

        # Employer share (23% normal, 20% for foreign nationals or retirees without 3% unemployment)
        if employee.get("is_foreign_national") or employee.get("is_retired"):
            employer_rate = EMPLOYER_INSURANCE_RATE_NO_UNEMPLOYMENT
            if employee.get("is_foreign_national"):
                applied_exemptions["foreign_national_no_unemployment_insurance"] = True
            if employee.get("is_retired"):
                applied_exemptions["retired_no_unemployment_insurance"] = True
        else:
            employer_rate = EMPLOYER_INSURANCE_RATE_NORMAL

        employer_insurance = round_irr(insured_earnings * employer_rate)
    else:
        insured_earnings = ZERO
        employee_insurance = ZERO
        employer_insurance = ZERO

    # Payroll Tax calculation
    if contract_type == "honorarium":
        taxable_earnings = gross_pay
        payroll_tax = round_irr(gross_pay * Decimal("0.10"))
        applied_exemptions["honorarium_article_86_flat_tax"] = "10%"
    elif is_taxable:
        # Check complete tax exemptions:
        # 1. Veteran / child of martyr/veteran (Art. 56)
        # 2. Science park / knowledge-based staff (Art. 10 / Art. 91)
        if employee.get("is_veteran_or_child"):
            taxable_earnings = ZERO
            payroll_tax = ZERO
            applied_exemptions["art_56_veteran_tax_exempt"] = True
        elif employee.get("is_science_park_staff"):
            taxable_earnings = ZERO
            payroll_tax = ZERO
            applied_exemptions["science_park_tax_exempt"] = True
        else:
            # Statutory deduction: 2/7 of employee insurance is tax deductible (Art. 137)
            exempt_insurance_portion = round_irr(employee_insurance * Decimal("2") / Decimal("7"))
            taxable_earnings = max(ZERO, gross_pay - exempt_insurance_portion)

            # Severe disability guardian exemption (Art. 25: 50% exempt)
            if employee.get("has_disability_charge"):
                taxable_earnings = round_irr(taxable_earnings * Decimal("0.50"))
                applied_exemptions["art_25_disability_charge_50pct_exempt"] = True

            # Calculate progressive tax using monthly brackets
            computed_tax = ZERO
            if taxable_earnings > TAX_EXEMPT_THRESHOLD_MONTHLY:
                for lower, upper, rate in TAX_BRACKETS_MONTHLY:
                    if taxable_earnings > lower:
                        taxable_in_tier = min(taxable_earnings, upper) - lower
                        computed_tax += taxable_in_tier * rate

            # Underdeveloped area 50% discount (Art. 92)
            if employee.get("is_underdeveloped_region"):
                computed_tax = computed_tax * Decimal("0.50")
                applied_exemptions["art_92_underdeveloped_region_50pct_discount"] = True

            payroll_tax = round_irr(computed_tax)
    else:
        taxable_earnings = ZERO
        payroll_tax = ZERO

    # Total deductions & Net Pay
    total_deductions = (
        employee_insurance + payroll_tax + advance_payment + loan_installment + other_deductions
    )
    net_pay = max(ZERO, gross_pay - total_deductions)

    return {
        "base_pay": canonical_money(base_pay),
        "housing_pay": canonical_money(housing_pay),
        "grocery_pay": canonical_money(grocery_pay),
        "marital_pay": canonical_money(marital_pay),
        "child_pay": canonical_money(child_pay),
        "tenure_pay": canonical_money(tenure_pay),
        "overtime_pay": canonical_money(overtime_pay),
        "bonus_amount": canonical_money(bonus_amount),
        "gross_pay": canonical_money(gross_pay),
        "insured_earnings": canonical_money(insured_earnings),
        "taxable_earnings": canonical_money(taxable_earnings),
        "employee_insurance": canonical_money(employee_insurance),
        "employer_insurance": canonical_money(employer_insurance),
        "payroll_tax": canonical_money(payroll_tax),
        "advance_payment": canonical_money(advance_payment),
        "loan_installment": canonical_money(loan_installment),
        "other_deductions": canonical_money(other_deductions),
        "total_deductions": canonical_money(total_deductions),
        "net_pay": canonical_money(net_pay),
        "applied_exemptions": applied_exemptions,
        "rate_table_year": 1403,
        "rate_status": "verified_1403" if year == 1403 else "unverified_period_rates",
    }


def calculate_end_of_service(
    base_salary: Decimal,
    hire_date: Any,
    calculation_date: Any,
    used_leave_days: Decimal = ZERO,
    total_days_worked_override: int | None = None,
) -> dict[str, Any]:
    """Calculates statutory Eydi (عیدی), Sanavat (حق سنوات), and leave settlement (تسویه مانده مرخصی).

    Statutory rules:
    - Eydi: 60 days of base salary per full year, capped between 2x and 3x monthly minimum wage.
    - Sanavat: 1 month base salary for each full year of service (pro-rated for partial years).
    - Leave: 30 days per year (2.5 days/month). Unused days redeemed at daily base rate.
    """
    salary = max(ZERO, d(base_salary))

    if total_days_worked_override is not None and total_days_worked_override >= 0:
        days_worked = total_days_worked_override
    elif hire_date and calculation_date:
        # Date difference
        delta = (calculation_date - hire_date).days + 1
        days_worked = max(0, delta)
    else:
        days_worked = 365

    years_worked = (Decimal(days_worked) / Decimal("365")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    days_worked_in_year = min(365, days_worked)

    # 1. Eydi calculation
    min_wage_monthly = DAILY_MIN_WAGE_1403 * Decimal("30")
    eydi_floor = Decimal("2") * min_wage_monthly
    eydi_ceiling = Decimal("3") * min_wage_monthly
    full_year_eydi = min(max(Decimal("2") * salary, eydi_floor), eydi_ceiling)
    eydi_amount = round_irr(full_year_eydi * Decimal(days_worked_in_year) / Decimal("365"))

    # 2. Sanavat calculation (Article 24 Labor Law)
    sanavat_amount = round_irr(salary * Decimal(days_worked) / Decimal("365"))

    # 3. Leave calculation & settlement (Article 64 / 66 Labor Law)
    accrued_leave_days = (Decimal(days_worked_in_year) / Decimal("365") * Decimal("30")).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP
    )
    remaining_leave_days = max(ZERO, accrued_leave_days - d(used_leave_days))
    daily_wage = round_irr(salary / Decimal("30")) if salary > ZERO else ZERO
    leave_settlement_amount = round_irr(remaining_leave_days * daily_wage)

    total_settlement = eydi_amount + sanavat_amount + leave_settlement_amount

    return {
        "days_worked": days_worked,
        "years_worked": str(years_worked),
        "days_worked_in_year": days_worked_in_year,
        "base_salary": canonical_money(salary),
        "daily_wage": canonical_money(daily_wage),
        "eydi_amount": canonical_money(eydi_amount),
        "eydi_ceiling": canonical_money(eydi_ceiling),
        "eydi_floor": canonical_money(eydi_floor),
        "sanavat_amount": canonical_money(sanavat_amount),
        "accrued_leave_days": str(accrued_leave_days),
        "used_leave_days": str(used_leave_days),
        "remaining_leave_days": str(remaining_leave_days),
        "leave_settlement_amount": canonical_money(leave_settlement_amount),
        "total_settlement": canonical_money(total_settlement),
    }

