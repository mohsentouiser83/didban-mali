"""Dated trial balances remain a distinct financial basis, not fabricated journals."""

from ..financial.common import ZERO, amount, coverage_reason, day, selected, usable
from .statements import (
    SECTIONS,
    ROLE_SECTION,
    FLOW_SECTIONS,
    measure,
    reference,
    assemble_statement,
)


def trial_balance_statements(rows, period, declared, template=None):
    source = selected(rows, "trial_balance")
    reasons = [] if source else ["trial_balance_source_missing"]
    eligible = []
    for row in source:
        try:
            when = day(row.values.get("as_of_date"))
            if when != period.cutoff:
                continue
            if row.values.get("row_level") == "summary":
                continue
            if not usable(row):
                reasons.append("invalid_rows")
                continue
            if row.values.get("row_level") != "detail":
                reasons.append("trial_balance_level_unknown")
            v = row.values
            for prefix in ("opening", "period", "closing"):
                if (
                    amount(v.get(prefix + "_debit")) < ZERO
                    or amount(v.get(prefix + "_credit")) < ZERO
                ):
                    raise ValueError()
            if v.get("role") not in ROLE_SECTION or v.get("role_provenance") not in {
                "explicit_source_field",
                "user_declaration",
                "validated_policy",
            }:
                reasons.append("account_role_unknown")
            if v.get("role_provenance") == "validated_policy" and not (
                v.get("role_evidence") and v.get("role_controls_passed") is True
            ):
                reasons.append("account_role_unknown")
            eligible.append(row)
        except ValueError:
            reasons.append("invalid_rows")
    if source and not eligible:
        reasons.append("trial_balance_date_missing")
    starts = {r.values.get("period_start") for r in eligible}
    if len(starts) != 1:
        reasons.append("trial_balance_scope_mismatch")
    start = next(iter(starts)) if len(starts) == 1 else str(period.starts_on)
    try:
        issue = coverage_reason("trial_balance", day(start), period.cutoff, declared)
        if issue:
            reasons.append(issue)
    except ValueError:
        reasons.append("invalid_rows")
    accounts = [r.values["account"] for r in eligible]
    if len(accounts) != len(set(accounts)):
        reasons.append("duplicate_trial_balance_account")
    for prefix in ("opening", "period", "closing"):
        if sum(
            (
                amount(r.values[prefix + "_debit"])
                - amount(r.values[prefix + "_credit"])
                for r in eligible
            ),
            ZERO,
        ):
            reasons.append("trial_balance_unbalanced")
    for r in eligible:
        v = r.values
        if amount(v["opening_debit"]) - amount(v["opening_credit"]) + amount(
            v["period_debit"]
        ) - amount(v["period_credit"]) != amount(v["closing_debit"]) - amount(
            v["closing_credit"]
        ):
            reasons.append("trial_balance_rollforward_mismatch")
    flow_reasons = list(reasons)
    if start != str(period.starts_on):
        flow_reasons.append("trial_balance_scope_mismatch")
    if any(r.values.get("flow_basis") != "before_closing" for r in eligible):
        flow_reasons.append("trial_balance_closing_entries_unknown")
    mapped = {a for line in (template or {}).get("lines", []) for a in line["accounts"]}
    unmapped = sorted(set(accounts) - mapped) if template else []
    if unmapped:
        reasons.append("template_accounts_unmapped")
        flow_reasons.append("template_accounts_unmapped")
    definitions = (template or {}).get("lines") or [
        {"key": key, "label": label, "section": key, "accounts": []}
        for key, (label, _, _) in SECTIONS.items()
    ]
    lines = []
    has_cogs = any(r.values.get("role") == "cogs" for r in eligible)
    has_tax = any(r.values.get("role") == "income_tax_expense" for r in eligible)
    cogs = declared.get("cogs", {}).get(period.id)
    tax = declared.get("income_tax", {}).get(period.id)
    cogs_reasons = (
        []
        if cogs == "recognized" and has_cogs or cogs == "not_required" and not has_cogs
        else ["cogs_unknown"]
    )
    tax_reasons = (
        []
        if tax == "recognized"
        and has_tax
        or tax == "zero_confirmed"
        and not any(
            r.values.get("role") == "income_tax_expense"
            and amount(r.values["period_debit"]) != amount(r.values["period_credit"])
            for r in eligible
        )
        else ["income_tax_unknown"]
    )
    for definition in definitions:
        section = definition["section"]
        sign = SECTIONS[section][2]
        flow = section in FLOW_SECTIONS
        matches = (
            [r for r in eligible if r.values["account"] in definition["accounts"]]
            if template
            else [
                r for r in eligible if ROLE_SECTION.get(r.values.get("role")) == section
            ]
        )
        errors = list(flow_reasons if flow else reasons)
        if section == "cogs":
            errors += cogs_reasons
        if section == "income_tax":
            errors += tax_reasons
        if template:
            if set(definition["accounts"]) - set(accounts):
                errors.append("template_account_missing")
            if any(ROLE_SECTION.get(r.values.get("role")) != section for r in matches):
                errors.append("template_role_conflict")
        prefix = "period" if flow else "closing"
        details = []
        for r in matches:
            v = r.values
            ref = reference(r)
            ref.update(
                date=v["as_of_date"],
                debit=v[prefix + "_debit"],
                credit=v[prefix + "_credit"],
                basis="period_movement" if flow else "closing_balance",
            )
            details.append(
                {
                    "account": v["account"],
                    **measure(
                        sign
                        * (
                            amount(v[prefix + "_debit"]) - amount(v[prefix + "_credit"])
                        ),
                        errors,
                    ),
                    "source_refs": [ref],
                }
            )
        value = sum(
            (
                sign
                * (
                    amount(r.values[prefix + "_debit"])
                    - amount(r.values[prefix + "_credit"])
                )
                for r in matches
            ),
            ZERO,
        )
        lines.append({**definition, **measure(value, errors), "details": details})
    earnings = sum(
        (
            amount(r.values["closing_credit"]) - amount(r.values["closing_debit"])
            for r in eligible
            if r.values.get("role")
            in {
                role
                for role, section in ROLE_SECTION.items()
                if section in FLOW_SECTIONS
            }
        ),
        ZERO,
    )
    return assemble_statement(
        lines, period, sorted(set(accounts)), unmapped, earnings, reasons
    )
