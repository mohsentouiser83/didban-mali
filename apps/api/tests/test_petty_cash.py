"""Tests for petty cash expenses, limit checks, project tagging, and settlement drafts."""

from datetime import date
from uuid import uuid4

import pytest

from didban import models as m
from didban import petty_cash_service as service
from didban.accounting_models import Account, Draft
from didban.dimensions_models import Dimension
from didban.errors import DomainError
from didban.treasury_models import TreasuryAccount


@pytest.fixture
def petty_cash_env(db_session):
    user = m.User(
        id=str(uuid4()),
        email="petty_admin@example.com",
        name="تنخواه‌دار نمونه",
        password_hash="fake",
    )
    company = m.Company(id=str(uuid4()), name="شرکت نرم‌افزاری نمونه", business_mode="service")
    member = m.Membership(
        id=str(uuid4()),
        user_id=user.id,
        company_id=company.id,
        role="finance_manager",
    )
    period = m.Period(
        id=str(uuid4()),
        company_id=company.id,
        name="سال مالی ۱۴۰۳",
        start=date(2024, 3, 20),
        end=date(2025, 3, 20),
    )
    acc_petty = Account(id=str(uuid4()), company_id=company.id, code="1102", name="تنخواه گردان", nature="debit")
    acc_bank = Account(id=str(uuid4()), company_id=company.id, code="1101", name="بانک ملت", nature="debit")
    acc_exp = Account(id=str(uuid4()), company_id=company.id, code="6105", name="هزینه سرور و زیرساخت", nature="debit")
    treasury_petty = TreasuryAccount(
        id=str(uuid4()),
        company_id=company.id,
        kind="petty_cash",
        name="تنخواه فنی",
        account_id=acc_petty.id,
        custodian_name="رضا محمدی",
        petty_cash_limit_irr="50000000",
    )
    treasury_bank = TreasuryAccount(
        id=str(uuid4()),
        company_id=company.id,
        kind="bank",
        name="بانک اصلی",
        account_id=acc_bank.id,
    )
    dim = Dimension(
        id=str(uuid4()),
        company_id=company.id,
        kind="project",
        code="PRJ-CLOUD",
        name="پروژه ابری",
        active=True,
    )
    db_session.add_all([user, company, member, period, acc_petty, acc_bank, acc_exp, treasury_petty, treasury_bank, dim])
    db_session.flush()
    return {
        "user": user,
        "company": company.id,
        "period": period,
        "petty": treasury_petty,
        "bank": treasury_bank,
        "exp_account": acc_exp,
        "dimension": dim,
    }


def test_petty_cash_expense_limit_and_settlement_draft(db_session, petty_cash_env):
    company = petty_cash_env["company"]
    user = petty_cash_env["user"]
    period = petty_cash_env["period"]
    petty = petty_cash_env["petty"]
    bank = petty_cash_env["bank"]
    exp_acc = petty_cash_env["exp_account"]
    dim = petty_cash_env["dimension"]

    e1 = service.record_expense(
        db_session,
        company,
        user,
        {
            "treasury_account_id": petty.id,
            "period_id": period.id,
            "expense_account_id": exp_acc.id,
            "dimension_id": dim.id,
            "category": "cloud_server",
            "expense_date": date(2024, 5, 1),
            "title": "تمدید سرور ابری",
            "amount_irr": "30000000",
            "receipt_reference": "INV-991",
        },
    )
    assert e1["status"] == "recorded"
    assert e1["dimension_id"] == dim.id

    with pytest.raises(DomainError) as limit_err:
        service.record_expense(
            db_session,
            company,
            user,
            {
                "treasury_account_id": petty.id,
                "period_id": period.id,
                "expense_account_id": exp_acc.id,
                "category": "other",
                "expense_date": date(2024, 5, 2),
                "title": "هزینه مازاد سقف",
                "amount_irr": "25000000",
            },
        )
    assert limit_err.value.code == "petty_cash_limit_exceeded"

    listing = service.list_expenses(db_session, company, treasury_account_id=petty.id)
    assert listing["summary"]["recorded_total_irr"] == "30000000"
    assert listing["summary"]["remaining_limit_irr"] == "20000000"

    settlement = service.settle_petty_cash(
        db_session,
        company,
        user,
        {
            "treasury_account_id": petty.id,
            "period_id": period.id,
            "settlement_date": date(2024, 5, 5),
            "replenish_from_treasury_id": bank.id,
        },
    )
    assert settlement["total_amount_irr"] == "30000000"
    assert settlement["draft_id"] is not None

    draft = db_session.get(Draft, settlement["draft_id"])
    assert draft is not None
    assert draft.state == "draft"
    assert len(draft.lines) == 2
    assert draft.lines[0]["debit"] == "30000000"
    assert draft.lines[1]["credit"] == "30000000"

    after = service.list_expenses(db_session, company, treasury_account_id=petty.id)
    assert after["summary"]["recorded_total_irr"] == "0"
    assert after["summary"]["settled_total_irr"] == "30000000"
