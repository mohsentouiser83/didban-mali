"""Validate proposed synthetic accounting fixtures, never production posting rules.

This checks arithmetic, references, review status and decision coverage only.
It does not invoke the API, a model, a bank or an accountant.
"""
from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal, localcontext
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "docs/validation/accounting-v1/reference.json"


def validate() -> dict:
    raw = REFERENCE.read_bytes()
    data = json.loads(raw)
    checks = 0

    def require(condition: bool, message: str) -> None:
        nonlocal checks
        if not condition:
            raise ValueError(message)
        checks += 1

    def money(value: str) -> Decimal:
        require(isinstance(value, str) and bool(re.fullmatch(r"-?\d+(?:\.\d{1,6})?", value)), f"Invalid exact money: {value!r}")
        result = Decimal(value)
        require(result.is_finite(), "Money must be finite")
        return result

    require(data["synthetic"] is True, "Reference must remain synthetic")
    require(data["review_status"] == "pending_accountant_review", "No accountant approval is established")
    require(data["production_posting_approved"] is False, "Fixture validation cannot approve posting")
    require(data["review_record"]["accountant_name"] is None, "Do not fabricate accountant review")
    require(not data["review_record"]["accepted_case_ids"], "No cases have accountant acceptance")
    require(data["scope"]["tax_rates_calculated"] is False, "No statutory-rate calculation")
    require(data["scope"]["bank_money_movement"] is False, "No bank transaction")
    account_map = {a["alias"]: a for a in data["account_aliases"]}
    require(len(account_map) == len(data["account_aliases"]), "Account aliases must be unique")
    journals = {j["id"]: j for j in data["journal_cases"]}
    require(list(journals) == [f"J{i:02}" for i in range(1, 18)], "Expected all 17 journal cases")
    derived_by_id = {}
    with localcontext() as context:
        context.prec = 50
        for case in journals.values():
            require(case["review_status"] == "proposed_pending_accountant_review", f"{case['id']}: review status")
            debit = credit = Decimal(0)
            derived = {key: Decimal(0) for key in ("revenue", "expense", "net_result", "bank")}
            for line in case["lines"]:
                alias = line["account"]
                require(alias in account_map, f"Unknown account: {alias}")
                dr, cr = money(line["debit"]), money(line["credit"])
                require(dr >= 0 and cr >= 0 and ((dr == 0) != (cr == 0)), f"{case['id']}: one nonzero side per line")
                debit += dr
                credit += cr
                kind = account_map[alias]["kind"]
                if kind == "revenue":
                    derived["revenue"] += cr - dr
                elif kind == "expense":
                    derived["expense"] += dr - cr
                elif alias.startswith("bank_"):
                    derived["bank"] += dr - cr
                else:
                    derived[alias] = derived.get(alias, Decimal(0)) + (cr - dr if kind == "liability" else dr - cr)
            derived["net_result"] = derived["revenue"] - derived["expense"]
            require(debit == credit == money(case["expected_total_debit"]) == money(case["expected_total_credit"]), f"{case['id']}: unbalanced expected entry")
            expected = case["expected_report_deltas"]
            for key, value in expected.items():
                require(key in derived and derived[key] == money(value), f"{case['id']}: wrong delta {key}")
            for key, value in derived.items():
                require(value == 0 or key in expected, f"{case['id']}: omitted material delta {key}")
            derived_by_id[case["id"]] = derived
            for link in ("requires_prior_event", "reversal_of", "replacement_for", "linked_reversal"):
                if link in case["context"]:
                    require(case["context"][link] in journals, f"{case['id']}: broken {link}")
        payroll = journals["J07"]["context"]
        require(money(payroll["gross"]) - money(payroll["employee_insurance"]) - money(payroll["payroll_tax"]) - money(payroll["other_deductions"]) == money(payroll["net_pay"]), "Payroll net formula")
        require(money(payroll["employee_insurance"]) + money(payroll["employer_insurance"]) == money(journals["J07"]["expected_report_deltas"]["insurance_payable"]), "Employer insurance is not deducted from employee net")
        conversion = journals["J05"]["context"]
        require(money(conversion["original_amount"]) * 10 == money(conversion["canonical_amount"]), "Exact toman conversion")
        for key in set(derived_by_id["J01"]) | set(derived_by_id["J16"]):
            require(derived_by_id["J01"].get(key, Decimal(0)) + derived_by_id["J16"].get(key, Decimal(0)) == 0, "Original + full reversal must cancel")
        require(derived_by_id["J01"]["revenue"] + derived_by_id["J16"]["revenue"] + derived_by_id["J17"]["revenue"] == 1200, "Replacement changes revenue exactly once")
        require(derived_by_id["J06"]["bank"] == -2, "Internal transfer only reduces cash by explicit fee")
        require(derived_by_id["J09"]["bank"] == 0 and derived_by_id["J12"]["bank"] == 0, "Receiving/issuing check is not bank collection/payment")
    require([case["id"] for case in data["behavior_cases"]] == [f"B{i:02}" for i in range(1, 19)], "Expected all 18 behavior specifications")
    require([case["decision"] for case in data["decision_acceptance"]] == [f"P{i:02}" for i in range(1, 29)], "Expected P01–P28 exactly once in order")
    require(all(case["execution_status"] == "specified_not_executed" for case in data["behavior_cases"] + data["decision_acceptance"]), "Do not claim product execution")
    return {"reference": str(REFERENCE.relative_to(ROOT)), "sha256": hashlib.sha256(raw).hexdigest(), "checks_passed": checks,
            "journal_cases": len(journals), "behavior_specifications": len(data["behavior_cases"]), "decisions_mapped": len(data["decision_acceptance"]),
            "result": "fixture_arithmetic_and_coverage_passed", "accountant_review": "pending", "product_execution": "not_performed", "production_posting_approved": False}


if __name__ == "__main__":
    print(json.dumps(validate(), ensure_ascii=False, indent=2))
