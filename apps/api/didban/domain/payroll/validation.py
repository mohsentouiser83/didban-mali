from __future__ import annotations
from datetime import date
from urllib.parse import urlparse
from .calculation import PayrollValidation, number


def valid_date(value):
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError) as exc:
        raise PayrollValidation("invalid_date") from exc


def employee_profile(profile):
    if isinstance(profile, dict) and profile.get("unit", "IRR") != "IRR":
        raise PayrollValidation("canonical_payroll_rial_required")
    if (
        not isinstance(profile, dict)
        or not isinstance(profile.get("name"), str)
        or not profile["name"].strip()
    ):
        raise PayrollValidation("employee_name_required")
    if any(
        not isinstance(k, str) or len(k) > 64 or not isinstance(v, str) or len(v) > 4000
        for k, v in profile.items()
    ):
        raise PayrollValidation("invalid_employee_field_type")
    for key in ("national_id", "insurance_number", "iban"):
        if key in profile and (
            not isinstance(profile[key], str) or len(profile[key]) > 64
        ):
            raise PayrollValidation("invalid_employee_identifier")
    if (
        "national_id" in profile
        and profile["national_id"]
        and (
            len(profile["national_id"]) != 10
            or not profile["national_id"].isascii()
            or not profile["national_id"].isdigit()
        )
    ):
        raise PayrollValidation("invalid_national_id")
    if not isinstance(profile.get("hired_on"), str):
        raise PayrollValidation("employment_date_required")
    if len(profile["name"]) > 250 or len(profile) > 40:
        raise PayrollValidation("invalid_employee_profile")
    start = valid_date(profile["hired_on"])
    if profile.get("ended_on") and valid_date(profile["ended_on"]) < start:
        raise PayrollValidation("invalid_employment_dates")
    for key in (
        "opening_loan",
        "opening_advance",
        "opening_unpaid_wages",
        "opening_leave_days",
    ):
        if key in profile:
            number(profile[key])
    if any(
        number(profile.get(k, "0"))
        for k in (
            "opening_loan",
            "opening_advance",
            "opening_unpaid_wages",
            "opening_leave_days",
        )
    ) and (not profile.get("opening_as_of") or not profile.get("opening_source")):
        raise PayrollValidation("opening_balance_source_required")
    if profile.get("opening_as_of"):
        valid_date(profile["opening_as_of"])
    return profile


def contract_content(content):
    if content.get("unit", "IRR") != "IRR":
        raise PayrollValidation("canonical_payroll_rial_required")
    if content.get("employment_type") not in ("full_time", "part_time") or content.get(
        "pay_basis"
    ) not in ("monthly", "daily", "hourly"):
        raise PayrollValidation("invalid_contract_type")
    if number(content.get("base_amount")) <= 0:
        raise PayrollValidation("base_amount_required")
    if content["employment_type"] == "part_time" and (
        "hours_per_day" not in content or not number(content["hours_per_day"])
    ):
        raise PayrollValidation("part_time_hours_required")
    if "hours_per_day" in content and (
        not number(content["hours_per_day"]) or number(content["hours_per_day"]) > 24
    ):
        raise PayrollValidation("invalid_contract_hours")
    components = content.get("components", [])
    if (
        not isinstance(components, list)
        or len(components) > 30
        or any(not isinstance(i, dict) for i in components)
    ):
        raise PayrollValidation("invalid_components")
    keys = set()
    for item in components:
        key = item.get("key")
        if (
            not isinstance(key, str)
            or not key.strip()
            or key in keys
            or key in ("base", "overtime", "shift", "night", "holiday")
        ):
            raise PayrollValidation("invalid_component_key")
        keys.add(key)
        number(item.get("amount"))
        if any(
            type(item.get(k)) is not bool for k in ("taxable", "insurable", "prorate")
        ):
            raise PayrollValidation("component_treatment_required")
    return content


def work_content(content):
    if isinstance(content, dict) and (
        content.get("unit", "IRR") != "IRR"
        or content.get("source_unit", "IRR") not in ("IRR", "IRT")
    ):
        raise PayrollValidation("canonical_payroll_rial_required")
    if not isinstance(content, dict) or len(content) > 50:
        raise PayrollValidation("invalid_work_content")
    if (
        "tax_history_complete" in content
        and type(content["tax_history_complete"]) is not bool
    ):
        raise PayrollValidation("invalid_tax_history_flag")
    if "tax_elapsed_months" in content and (
        not isinstance(content["tax_elapsed_months"], str)
        or not content["tax_elapsed_months"].isascii()
        or not content["tax_elapsed_months"].isdigit()
        or not 0 <= int(content["tax_elapsed_months"]) <= 12
    ):
        raise PayrollValidation("invalid_tax_months")
    if (
        "unpaid_wages_already_processed" in content
        and type(content["unpaid_wages_already_processed"]) is not bool
    ):
        raise PayrollValidation("invalid_unpaid_wages_flag")
    for key in (
        "prior_paid_reference",
        "correction_reference",
        "shift_code",
        "unpaid_wages_reference",
    ):
        if key in content and (
            not isinstance(content[key], str) or len(content[key]) > 1000
        ):
            raise PayrollValidation("invalid_work_reference")
    for kind in ("eidi", "sanavat", "termination", "arrears"):
        flag = kind + "_tax_history_complete"
        months = kind + "_tax_elapsed_months"
        if flag in content and type(content[flag]) is not bool:
            raise PayrollValidation("invalid_tax_history_flag")
        if months in content and (
            not isinstance(content[months], str)
            or not content[months].isascii()
            or not content[months].isdigit()
            or not 0 <= int(content[months]) <= 12
        ):
            raise PayrollValidation("invalid_tax_months")
        for suffix in ("prior_taxable", "prior_tax_paid"):
            if kind + "_" + suffix in content:
                number(content[kind + "_" + suffix])
    for key in ("period_days", "worked_days", "worked_hours"):
        number(content.get(key))
    if not 1 <= number(content["period_days"]) <= 366 or number(
        content["worked_days"]
    ) > number(content["period_days"]):
        raise PayrollValidation("invalid_work_days")
    for key in (
        "overtime_hours",
        "night_hours",
        "holiday_hours",
        "deductions",
        "loan_installment",
        "advance_offset",
        "leave_opening_days",
        "leave_accrued_days",
        "leave_used_days",
        "leave_cashout_days",
        "service_days",
        "prior_paid_special",
        "unpaid_wages",
        "arrears_amount",
        "prior_taxable",
        "prior_tax_paid",
    ):
        if key in content:
            number(content[key])
    return content


def primary_sources(urls):
    allowed = (
        "tamin.ir",
        "tax.gov.ir",
        "intamedia.ir",
        "mcls.gov.ir",
        "qavanin.ir",
        "rrk.ir",
        "rc.majlis.ir",
        "natlex.ilo.org",
    )
    if not isinstance(urls, list) or not 1 <= len(urls) <= 20:
        return False
    for value in urls:
        if not isinstance(value, str) or len(value) > 2048:
            return False
        try:
            parsed = urlparse(value)
            if (
                parsed.scheme != "https"
                or parsed.username is not None
                or parsed.password is not None
                or parsed.port not in (None, 443)
                or not any(
                    (parsed.hostname or "") == host
                    or (parsed.hostname or "").endswith("." + host)
                    for host in allowed
                )
            ):
                return False
        except ValueError:
            return False
    return True
