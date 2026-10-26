"""Unambiguous reconciliation titles, including findings saved with older copy."""

from decimal import Decimal
from typing import Literal

from sqlalchemy import and_, case, func
from sqlalchemy.sql.elements import ColumnElement

from app.findings.models import Finding
from app.findings.reconciliation_scope import (
    UNMATCHED_RULE_SIDES,
    ReconciliationState,
    reconciliation_state_expression,
)

TITLE_PREFIXES = {
    "bank_transaction": "تراکنش بانکی فاقد تطبیق تأییدشده: ",
    "journal_line": "سطر حسابداری فاقد تطبیق تأییدشده: ",
}


def unmatched_title(side: Literal["bank_transaction", "journal_line"], amount: Decimal) -> str:
    return f"{TITLE_PREFIXES[side]}{abs(amount):,.0f} ریال"


def finding_title(finding: Finding, state: ReconciliationState = "unavailable") -> str:
    """Use the saved rule and source side, never infer the side from severity or wording."""
    if finding.rule_code not in {rule for rule, _ in UNMATCHED_RULE_SIDES}:
        return finding.title_fa
    amount = finding.financial_impact_irr
    if amount is None:
        amount = finding.affected_amount_irr
    side = finding.source_entity_type
    if (finding.rule_code, side) in UNMATCHED_RULE_SIDES and amount is not None:
        if side == "bank_transaction":
            return classified_title("bank_transaction", amount, state)
        if side == "journal_line":
            return classified_title("journal_line", amount, state)
    return finding.title_fa


def classified_title(side: Literal["bank_transaction", "journal_line"], amount: Decimal, state: ReconciliationState) -> str:
    label = "تراکنش بانکی" if side == "bank_transaction" else "سطر حسابداری"
    qualifier = {
        "suggested": "دارای پیشنهاد تطبیق",
        "no_candidate": "بدون پیشنهاد تطبیق",
        "matched": "تطبیق تأییدشده",
        "unavailable": "در انتظار بررسی تطبیق",
        "not_applicable": "در انتظار بررسی تطبیق",
    }[state]
    return f"{label} {qualifier}: {abs(amount):,.0f} ریال"


def finding_summary(finding: Finding, state: ReconciliationState) -> str:
    if (finding.rule_code, finding.source_entity_type) not in UNMATCHED_RULE_SIDES:
        return finding.summary_fa
    label = "تراکنش بانکی" if finding.source_entity_type == "bank_transaction" else "سطر حسابداری"
    return {
        "suggested": f"برای این {label} پیشنهاد تطبیق وجود دارد؛ هنوز تأیید نشده است.",
        "no_candidate": f"برای این {label} در آخرین اجرا پیشنهاد تطبیق پیدا نشد؛ نبودن ثبت متناظر قطعی نیست.",
        "matched": f"تطبیق این {label} تأیید شده است.",
        "unavailable": f"داده کافی برای بررسی تطبیق این {label} در آخرین اجرا موجود نیست.",
        "not_applicable": finding.summary_fa,
    }[state]


def finding_title_expression() -> ColumnElement[str]:
    """Searches, list titles and recent activities use the same current classification."""
    amount = func.coalesce(Finding.financial_impact_irr, Finding.affected_amount_irr)
    formatted_amount = func.trim(func.to_char(func.abs(amount), "999,999,999,999,999,999,999,999,999"))
    state = reconciliation_state_expression()
    qualifier = case(
        (state == "suggested", "دارای پیشنهاد تطبیق"),
        (state == "no_candidate", "بدون پیشنهاد تطبیق"),
        (state == "matched", "تطبیق تأییدشده"),
        else_="در انتظار بررسی تطبیق",
    )
    return case(
        *[
            (
                and_(Finding.rule_code == rule, Finding.source_entity_type == side, amount.is_not(None)),
                func.concat("تراکنش بانکی " if side == "bank_transaction" else "سطر حسابداری ", qualifier, ": ", formatted_amount, " ریال"),
            )
            for rule, side in UNMATCHED_RULE_SIDES
        ],
        else_=Finding.title_fa,
    )
