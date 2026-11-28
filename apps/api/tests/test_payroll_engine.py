"""Unit tests for the statutory payroll calculation engine and legal exemptions."""

from didban.payroll_engine import (
    MONTHLY_GROCERY_ALLOWANCE_1403,
    MONTHLY_HOUSING_ALLOWANCE_1403,
    calculate_slip,
)


def test_standard_fulltime_calculation():
    """Standard full-time employee below tax threshold."""
    emp = {"marital_status": "single", "children_count": 0}
    contract = {
        "contract_type": "full_time",
        "base_salary": "100000000",  # 10 million Toman
        "housing_allowance": str(MONTHLY_HOUSING_ALLOWANCE_1403),
        "grocery_allowance": str(MONTHLY_GROCERY_ALLOWANCE_1403),
        "marital_allowance": "0",
        "child_allowance": "0",
        "tenure_allowance": "0",
        "custom_fixed_allowances": "0",
        "is_insured": True,
        "is_taxable": True,
    }
    timesheet = {"work_days": 30, "overtime_hours": 0}
    res = calculate_slip(emp, contract, timesheet, days_in_month=30)

    # Gross: 100M + 9M + 14M = 123,000,000 IRR
    assert res["gross_pay"] == "123000000"
    assert res["insured_earnings"] == "123000000"
    # Employee insurance: 7% of 123M = 8,610,000
    assert res["employee_insurance"] == "8610000"
    # Employer insurance: 23% of 123M = 28,290,000
    assert res["employer_insurance"] == "28290000"
    # Taxable: 123M - (2/7 * 8.61M = 2,460,000) = 120,540,000 IRR
    # Threshold is 120,000,000, excess is 540,000 at 10% = 54,000
    assert res["payroll_tax"] == "54000"
    # Net: 123M - (8.61M + 54k) = 114,336,000
    assert res["net_pay"] == "114336000"


def test_veteran_exemption_art_56():
    """Veteran / child of martyr: 100% tax exempt and 0% employee insurance."""
    emp = {
        "marital_status": "married",
        "children_count": 1,
        "is_veteran_or_child": True,
    }
    contract = {
        "contract_type": "full_time",
        "base_salary": "300000000",  # 30M Toman (high salary)
        "housing_allowance": str(MONTHLY_HOUSING_ALLOWANCE_1403),
        "grocery_allowance": str(MONTHLY_GROCERY_ALLOWANCE_1403),
        "is_insured": True,
        "is_taxable": True,
    }
    timesheet = {"work_days": 30}
    res = calculate_slip(emp, contract, timesheet, days_in_month=30)

    # 100% tax exempt under Art. 56
    assert res["payroll_tax"] == "0"
    assert res["applied_exemptions"]["art_56_veteran_tax_exempt"] is True
    # 0% employee insurance under veteran rules
    assert res["employee_insurance"] == "0"
    assert res["applied_exemptions"]["veteran_employee_insurance_exempt"] is True
    # Employer insurance still applies (23%)
    assert int(res["employer_insurance"]) > 0


def test_foreign_national_no_unemployment_insurance():
    """Foreign nationals: exempt from 3% unemployment insurance (employer pays 20% instead of 23%)."""
    emp = {"is_foreign_national": True, "marital_status": "single", "children_count": 0}
    contract = {
        "contract_type": "full_time",
        "base_salary": "100000000",
        "housing_allowance": "0",
        "grocery_allowance": "0",
        "is_insured": True,
        "is_taxable": False,
    }
    timesheet = {"work_days": 30}
    res = calculate_slip(emp, contract, timesheet, days_in_month=30)

    # Insured: 100M
    assert res["insured_earnings"] == "100000000"
    # Employee share: 7% = 7M
    assert res["employee_insurance"] == "7000000"
    # Employer share: 20% (not 23%) = 20M
    assert res["employer_insurance"] == "20000000"
    assert res["applied_exemptions"]["foreign_national_no_unemployment_insurance"] is True


def test_science_park_staff_exemption():
    """Science park / knowledge-based staff: zero tax rate."""
    emp = {"is_science_park_staff": True}
    contract = {
        "contract_type": "full_time",
        "base_salary": "250000000",
        "is_insured": True,
        "is_taxable": True,
    }
    timesheet = {"work_days": 30}
    res = calculate_slip(emp, contract, timesheet, days_in_month=30)

    assert res["payroll_tax"] == "0"
    assert res["applied_exemptions"]["science_park_tax_exempt"] is True


def test_disability_guardian_and_underdeveloped_region():
    """Severe disability guardian (50% tax exempt) in underdeveloped area (50% discount)."""
    emp = {
        "has_disability_charge": True,
        "is_underdeveloped_region": True,
    }
    contract = {
        "contract_type": "full_time",
        "base_salary": "300000000",  # High income
        "housing_allowance": "0",
        "grocery_allowance": "0",
        "is_insured": False,
        "is_taxable": True,
    }
    timesheet = {"work_days": 30}
    res = calculate_slip(emp, contract, timesheet, days_in_month=30)

    assert res["applied_exemptions"]["art_25_disability_charge_50pct_exempt"] is True
    assert res["applied_exemptions"]["art_92_underdeveloped_region_50pct_discount"] is True
    # Tax should be calculated and reduced
    assert int(res["payroll_tax"]) > 0


def test_part_time_proportionate_calculation():
    """Part-time contract: hours worked scaled to 220 standard monthly hours."""
    emp = {"marital_status": "single", "children_count": 0}
    contract = {
        "contract_type": "part_time",
        "base_salary": "220000000",
        "housing_allowance": "22000000",
        "grocery_allowance": "22000000",
        "is_insured": True,
        "is_taxable": True,
    }
    # Worked 110 hours out of 220 (50%)
    timesheet = {"work_hours": 110}
    res = calculate_slip(emp, contract, timesheet)

    assert res["applied_exemptions"]["contract_type"] == "part_time"
    # Base pay should be half (110M)
    assert res["base_pay"] == "110000000"
    assert res["housing_pay"] == "11000000"
    assert res["grocery_pay"] == "11000000"
    assert res["gross_pay"] == "132000000"


def test_configurable_year_rates_and_unverified_fallback():
    """Custom company rates override 1403 defaults; unknown years fall back to unverified_period_rates."""
    emp = {"marital_status": "single", "children_count": 0}
    contract = {
        "contract_type": "full_time",
        "base_salary": "250000000",
        "housing_allowance": "0",
        "grocery_allowance": "0",
        "is_insured": False,
        "is_taxable": True,
    }
    unverified = calculate_slip(emp, contract, {"work_days": 30}, year=1405)
    assert unverified["rate_table_year"] == 1403
    assert unverified["rate_status"] == "unverified_period_rates"

    configured = calculate_slip(
        emp,
        contract,
        {"work_days": 30},
        year=1404,
        custom_rates={"tax_exempt_threshold_monthly": "240000000", "tax_brackets_monthly": [(240000000, 300000000, "0.10")]},
    )
    assert configured["rate_table_year"] == 1404
    assert configured["rate_status"] == "company_configured"
    assert configured["payroll_tax"] == "1000000"
