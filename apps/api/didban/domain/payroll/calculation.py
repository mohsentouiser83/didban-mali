from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, localcontext
from ..financial.common import amount, decimal_text

ZERO = Decimal("0")


class PayrollValidation(ValueError):
    pass


def number(value, *, nonnegative=True):
    try:
        result = amount(value)
    except ValueError as exc:
        raise PayrollValidation("invalid_amount") from exc
    if nonnegative and result < 0:
        raise PayrollValidation("negative_amount")
    return result


def rounded(value, rules):
    unit = number(rules["rounding_unit"])
    if not unit:
        raise PayrollValidation("invalid_rounding")
    return (value / unit).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * unit


def validate_rules(rules):
    if not isinstance(rules, dict) or len(rules) > 50:
        raise PayrollValidation("invalid_rules")
    if (
        not isinstance(rules.get("tax_bands"), list)
        or not 1 <= len(rules["tax_bands"]) <= 20
        or any(
            not isinstance(b, dict) or set(b) != {"up_to", "rate"}
            for b in rules["tax_bands"]
        )
    ):
        raise PayrollValidation("invalid_tax_bands")
    if (
        not isinstance(rules.get("shift_rates"), dict)
        or not 1 <= len(rules["shift_rates"]) <= 16
    ):
        raise PayrollValidation("invalid_shift_rates")
    if not isinstance(rules.get("special_treatment"), dict):
        raise PayrollValidation("missing_special_treatment")
    if (
        not isinstance(rules.get("source_urls"), list)
        or not 1 <= len(rules["source_urls"]) <= 20
        or any(not isinstance(u, str) or len(u) > 2048 for u in rules["source_urls"])
    ):
        raise PayrollValidation("invalid_source_urls")
    if "special_tax_profiles" in rules:
        validate_special_tax_profiles(rules["special_tax_profiles"])
    required = (
        "rounding_unit",
        "monthly_reference_days",
        "hours_per_day",
        "overtime_multiplier",
        "night_premium",
        "holiday_multiplier",
        "shift_rates",
        "employee_insurance_rate",
        "employer_insurance_rate",
        "insurance_daily_floor",
        "insurance_daily_cap",
        "tax_exemption_monthly",
        "tax_bands",
        "tax_mode",
        "eidi_wage_days",
        "eidi_cap_daily_wage",
        "sanavat_wage_days",
        "year_days",
        "annual_leave_days",
        "special_treatment",
        "source_urls",
    )
    if any(key not in rules for key in required):
        raise PayrollValidation("incomplete_rules")
    if rules["tax_mode"] not in ("monthly", "cumulative") or not rules["source_urls"]:
        raise PayrollValidation("invalid_rules")
    for key in required:
        if key not in (
            "shift_rates",
            "tax_bands",
            "tax_mode",
            "special_treatment",
            "source_urls",
        ):
            number(rules[key])
    if (
        not number(rules["monthly_reference_days"])
        or not number(rules["hours_per_day"])
        or not number(rules["year_days"])
    ):
        raise PayrollValidation("invalid_divisor")
    if number(rules["insurance_daily_cap"]) < number(rules["insurance_daily_floor"]):
        raise PayrollValidation("invalid_insurance_range")
    for key in ("employee_insurance_rate", "employer_insurance_rate", "night_premium"):
        if number(rules[key]) > 1:
            raise PayrollValidation("invalid_rate")
    if not isinstance(rules["shift_rates"], dict) or any(
        number(v) > 1 for v in rules["shift_rates"].values()
    ):
        raise PayrollValidation("invalid_shift_rates")
    previous = ZERO
    for index, band in enumerate(rules["tax_bands"]):
        if number(band["rate"]) > 1:
            raise PayrollValidation("invalid_tax_rate")
        if band["up_to"] is None:
            if index != len(rules["tax_bands"]) - 1:
                raise PayrollValidation("invalid_tax_bands")
        else:
            bound = number(band["up_to"])
            if bound <= previous:
                raise PayrollValidation("invalid_tax_bands")
            previous = bound
    if not rules["tax_bands"] or rules["tax_bands"][-1]["up_to"] is not None:
        raise PayrollValidation("incomplete_tax_bands")
    for kind in ("monthly", "eidi", "sanavat", "termination", "arrears"):
        treatment = rules["special_treatment"].get(kind)
        if (
            not isinstance(treatment, dict)
            or set(treatment) != {"taxable", "insurable"}
            or any(type(v) is not bool for v in treatment.values())
        ):
            raise PayrollValidation("missing_special_treatment")


SPECIAL_KINDS = ("eidi", "sanavat", "termination", "arrears")


def validate_special_tax_profiles(profiles):
    if not isinstance(profiles, dict) or any(k not in SPECIAL_KINDS for k in profiles):
        raise PayrollValidation("invalid_special_tax_profiles")
    for profile in profiles.values():
        if not isinstance(profile, dict) or set(profile) != {
            "tax_mode",
            "tax_exemption_monthly",
            "tax_bands",
        }:
            raise PayrollValidation("invalid_special_tax_profile")
        if profile["tax_mode"] not in ("monthly", "cumulative"):
            raise PayrollValidation("invalid_special_tax_profile")
        number(profile["tax_exemption_monthly"])
        bands = profile["tax_bands"]
        if not isinstance(bands, list) or not 1 <= len(bands) <= 20:
            raise PayrollValidation("invalid_tax_bands")
        previous = ZERO
        for index, band in enumerate(bands):
            if (
                not isinstance(band, dict)
                or set(band) != {"up_to", "rate"}
                or number(band["rate"]) > 1
            ):
                raise PayrollValidation("invalid_tax_bands")
            if band["up_to"] is None:
                if index != len(bands) - 1:
                    raise PayrollValidation("invalid_tax_bands")
            else:
                bound = number(band["up_to"])
                if bound <= previous:
                    raise PayrollValidation("invalid_tax_bands")
                previous = bound
        if bands[-1]["up_to"] is not None:
            raise PayrollValidation("incomplete_tax_bands")


def tax_amount(taxable, rules, months=1):
    remaining = max(ZERO, taxable - number(rules["tax_exemption_monthly"]) * months)
    previous, result = ZERO, ZERO
    for band in rules["tax_bands"]:
        ceiling = number(band["up_to"]) * months if band["up_to"] is not None else None
        width = remaining if ceiling is None else min(remaining, ceiling - previous)
        result += max(ZERO, width) * number(band["rate"])
        remaining -= max(ZERO, width)
        if remaining <= 0:
            break
        previous = ceiling
    return rounded(result, rules)


def calculate(contract, work, rules, *, kind="monthly"):
    validate_rules(rules)
    with localcontext() as context:
        context.prec = 70
        days, hours = number(work["worked_days"]), number(work["worked_hours"])
        month_days = number(work["period_days"])
        if month_days < 1 or month_days > 366 or days > month_days:
            raise PayrollValidation("invalid_work_days")
        base = number(contract["base_amount"])
        basis = contract["pay_basis"]
        if basis not in ("monthly", "daily", "hourly"):
            raise PayrollValidation("invalid_pay_basis")
        daily = (
            base / number(rules["monthly_reference_days"])
            if basis == "monthly"
            else base
            if basis == "daily"
            else base * number(rules["hours_per_day"])
        )
        hourly = daily / number(contract.get("hours_per_day", rules["hours_per_day"]))
        wage = daily * days if basis != "hourly" else base * hours
        lines = []

        def add(key, value, taxable, insurable):
            lines.append(
                {
                    "key": key,
                    "amount": decimal_text(rounded(value, rules)),
                    "taxable": taxable,
                    "insurable": insurable,
                }
            )

        if kind == "monthly":
            add("base", wage, True, True)
            overtime = (
                hourly
                * number(work.get("overtime_hours", "0"))
                * number(rules["overtime_multiplier"])
            )
            add("overtime", overtime, True, True)
            shift = work.get("shift_code", "none")
            if shift not in rules["shift_rates"]:
                raise PayrollValidation("unknown_shift")
            if shift != "none" and number(work.get("night_hours", "0")):
                raise PayrollValidation("night_and_shift_overlap")
            add("shift", wage * number(rules["shift_rates"][shift]), True, True)
            add(
                "night",
                hourly
                * number(work.get("night_hours", "0"))
                * number(rules["night_premium"]),
                True,
                True,
            )
            add(
                "holiday",
                hourly
                * number(work.get("holiday_hours", "0"))
                * number(rules["holiday_multiplier"]),
                True,
                True,
            )
            for component in contract.get("components", []):
                amount_value = number(component["amount"])
                if component.get("prorate", True):
                    amount_value *= days / month_days
                add(
                    component["key"],
                    amount_value,
                    component["taxable"],
                    component["insurable"],
                )
        else:
            treatment = rules["special_treatment"][kind]
            service = number(work.get("service_days", "0"))
            if kind == "eidi":
                special = (
                    min(
                        daily * number(rules["eidi_wage_days"]),
                        number(rules["eidi_cap_daily_wage"])
                        * number(rules["eidi_wage_days"]),
                    )
                    * min(service, number(rules["year_days"]))
                    / number(rules["year_days"])
                )
            elif kind == "sanavat":
                special = (
                    daily
                    * number(rules["sanavat_wage_days"])
                    * service
                    / number(rules["year_days"])
                )
            elif kind == "termination":
                special = daily * number(rules["sanavat_wage_days"]) * service / number(
                    rules["year_days"]
                ) + daily * number(work.get("leave_cashout_days", "0"))
            elif kind == "arrears":
                if not work.get("correction_reference"):
                    raise PayrollValidation("missing_correction_reference")
                special = number(work.get("arrears_amount", "0"))
            else:
                raise PayrollValidation("unknown_payroll_kind")
            prior = number(work.get("prior_paid_special", "0"))
            if prior > special:
                raise PayrollValidation("prior_paid_exceeds_entitlement")
            add(kind, special - prior, treatment["taxable"], treatment["insurable"])
        carry = number(work.get("unpaid_wages", "0")) if kind == "termination" else ZERO
        if carry:
            if work.get("unpaid_wages_already_processed") is not True or not work.get(
                "unpaid_wages_reference"
            ):
                raise PayrollValidation("unpaid_wages_processing_evidence_required")
            add("unpaid_wages_carry", carry, False, False)
        gross = sum(
            (
                number(line["amount"])
                for line in lines
                if line["key"] != "unpaid_wages_carry"
            ),
            ZERO,
        )
        insured = sum(
            (number(line["amount"]) for line in lines if line["insurable"]), ZERO
        )
        if insured:
            if not days:
                raise PayrollValidation("insurance_days_required")
            insured = min(
                max(insured, number(rules["insurance_daily_floor"]) * days),
                number(rules["insurance_daily_cap"]) * days,
            )
        employee_insurance = rounded(
            insured * number(rules["employee_insurance_rate"]), rules
        )
        employer_insurance = rounded(
            insured * number(rules["employer_insurance_rate"]), rules
        )
        taxable = sum(
            (number(line["amount"]) for line in lines if line["taxable"]), ZERO
        )
        profile = rules.get("special_tax_profiles", {}).get(kind)
        tax_rules = rules | profile if profile is not None else rules
        history_prefix = kind + "_" if profile is not None else ""
        if tax_rules["tax_mode"] == "cumulative":
            if work.get(history_prefix + "tax_history_complete") is not True:
                raise PayrollValidation("missing_tax_history")
            try:
                elapsed = int(work.get(history_prefix + "tax_elapsed_months", 0))
            except (ValueError, TypeError) as exc:
                raise PayrollValidation("invalid_tax_months") from exc
            if elapsed < 1 or elapsed > 12:
                raise PayrollValidation("invalid_tax_months")
            tax = max(
                ZERO,
                tax_amount(
                    taxable + number(work.get(history_prefix + "prior_taxable", "0")),
                    tax_rules,
                    elapsed,
                )
                - number(work.get(history_prefix + "prior_tax_paid", "0")),
            )
        else:
            tax = tax_amount(taxable, tax_rules)
        deductions = (
            number(work.get("deductions", "0"))
            + number(work.get("loan_installment", "0"))
            + number(work.get("advance_offset", "0"))
        )
        net = gross - employee_insurance - tax - deductions + carry
        if net < 0:
            raise PayrollValidation("deductions_exceed_pay")
        leave_balance = (
            number(work.get("leave_opening_days", "0"))
            + (
                number(work["leave_accrued_days"])
                if "leave_accrued_days" in work
                else (
                    number(rules["annual_leave_days"])
                    * days
                    / number(rules["year_days"])
                ).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            )
            - number(work.get("leave_used_days", "0"))
            - number(work.get("leave_cashout_days", "0"))
        )
        if leave_balance < 0:
            raise PayrollValidation("negative_leave_balance")
        values = {
            "gross": gross,
            "unpaid_wages_carry": carry,
            "insurance_base": insured,
            "tax_base": taxable,
            "employee_insurance": employee_insurance,
            "employer_insurance": employer_insurance,
            "tax": tax,
            "deductions": deductions,
            "loan_installment": number(work.get("loan_installment", "0")),
            "advance_offset": number(work.get("advance_offset", "0")),
            "net": net,
            "employer_cost": gross + employer_insurance,
            "leave_balance_days": leave_balance,
        }
        return {"lines": lines, **{k: decimal_text(v) for k, v in values.items()}}
