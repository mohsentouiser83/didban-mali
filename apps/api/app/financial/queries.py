"""Shared, date-effective ledger scopes used by reports and calculators."""

from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.sql import ColumnElement, Select
from sqlalchemy.sql.selectable import ScalarSelect

from app.financial.models import (
    Account,
    AccountClass,
    AccountClassification,
    Counterparty,
    JournalEntry,
    JournalLine,
)


def effective_account_class() -> ScalarSelect[AccountClass]:
    return (
        select(AccountClassification.account_class)
        .where(
            AccountClassification.company_id == JournalLine.company_id,
            AccountClassification.account_id == JournalLine.account_id,
            AccountClassification.effective_from <= JournalEntry.entry_date,
            AccountClassification.rule_version != "auto-v1",
        )
        .order_by(AccountClassification.effective_from.desc())
        .limit(1)
        .correlate(JournalLine, JournalEntry)
        .scalar_subquery()
    )


def cash_account_scope() -> ColumnElement[bool]:
    # Existing accounts can retain their confirmed descriptive names until reimport.
    return or_(
        Account.role == "cash",
        (Account.role == "other")
        & or_(
            Account.normalized_name.startswith("بانک "),
            Account.normalized_name.startswith("صندوق "),
            Account.normalized_name.startswith("تنخواه "),
        ),
    )


def trade_payable_scope(as_of_date: date) -> Select[tuple[JournalLine, JournalEntry, Counterparty]]:
    opening = aliased(JournalEntry)
    opening_line = aliased(JournalLine)
    latest_opening = (
        select(func.coalesce(func.max(opening.entry_date), date.min))
        .join(opening_line, opening_line.entry_id == opening.id)
        .where(
            opening.company_id == JournalLine.company_id,
            opening_line.company_id == JournalLine.company_id,
            opening_line.account_id == JournalLine.account_id,
            opening_line.counterparty_id == JournalLine.counterparty_id,
            opening.entry_type == "opening",
            opening.entry_date <= as_of_date,
        )
        .correlate(JournalLine)
        .scalar_subquery()
    )
    return (
        select(JournalLine, JournalEntry, Counterparty)
        .join(
            JournalEntry,
            (JournalLine.entry_id == JournalEntry.id)
            & (JournalLine.company_id == JournalEntry.company_id),
        )
        .join(
            Account,
            (JournalLine.account_id == Account.id) & (JournalLine.company_id == Account.company_id),
        )
        .join(
            Counterparty,
            (JournalLine.counterparty_id == Counterparty.id)
            & (JournalLine.company_id == Counterparty.company_id),
        )
        .where(
            effective_account_class() == AccountClass.LIABILITY,
            JournalEntry.entry_type != "closing",
            JournalEntry.entry_date >= latest_opening,
            or_(
                Account.role == "trade_payable",
                (Account.role == "other") & Counterparty.kind.in_(["vendor", "supplier"]),
            ),
        )
    )
