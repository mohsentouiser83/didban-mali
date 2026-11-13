"""Tests for Commercial Accounting & Counterparties (ACC-03, ACC-04, ACC-05):
- ACC-03: Proforma invoice lifecycle, lines calculation, expiry, conversion to operation draft
- ACC-04: Counterparty management, credit limit control, outstanding exposure calculation
- ACC-05: Printable frozen commercial document PDF generation
- Commercial HTTP API endpoints
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.commercial_service import (
    add_counterparty,
    check_credit_limit,
    convert_proforma,
    create_proforma,
    get_proforma,
    list_counterparties,
    pdf_commercial_document,
    update_counterparty,
)
from didban.errors import DomainError
from didban.inventory_service import add_item, add_warehouse, create_opening_stock_draft
from didban.posting_service import post_batch, preview


@pytest.fixture
def commercial_env(db_session):
    u = m.User(
        id=str(uuid4()),
        email="commercial_user@example.com",
        name="Commercial Tester",
        password_hash="fake",
    )
    c = m.Company(id=str(uuid4()), name="شرکت بازرگانی آزمایشی")
    membership = m.Membership(
        id=str(uuid4()),
        user_id=u.id,
        company_id=c.id,
        role="finance_manager",
        active=True,
    )
    cur_year = date.today().year
    period = m.Period(
        id=str(uuid4()),
        company_id=c.id,
        name=f"دوره مالی {cur_year}",
        start=date(cur_year, 1, 1),
        end=date(cur_year, 12, 29),
    )
    setup = CompanyAccountingSetup(company_id=c.id, mode="primary")

    cash_acc = Account(
        company_id=c.id,
        code="1010",
        name="موجودی نقد و بانک",
    )
    recv_acc = Account(
        company_id=c.id,
        code="1030",
        name="حساب‌های دریافتنی تجاری",
    )
    pay_acc = Account(
        company_id=c.id,
        code="2010",
        name="حساب‌های پرداختنی تجاری",
    )
    inv_acc = Account(
        company_id=c.id,
        code="1050",
        name="موجودی کالا",
    )
    sales_acc = Account(
        company_id=c.id,
        code="6010",
        name="فروش کالا و خدمات",
    )
    cogs_acc = Account(
        company_id=c.id,
        code="7010",
        name="بهای تمام‌شده کالای فروش‌رفته",
    )
    equity_acc = Account(
        company_id=c.id,
        code="3010",
        name="سرمایه اولیه",
    )

    db_session.add_all(
        [u, c, membership, period, setup, cash_acc, recv_acc, pay_acc, inv_acc, sales_acc, cogs_acc, equity_acc]
    )
    db_session.commit()

    wh = add_warehouse(db_session, c.id, u, {"code": "WH-COMM-1", "name": "انبار مرکزی بازرگانی"})
    it = add_item(
        db_session,
        c.id,
        u,
        {
            "code": "COMM-ITEM-01",
            "name": "کالای آزمایشی بازرگانی",
            "inventory_account_id": inv_acc.id,
        },
    )

    return {
        "user": u,
        "company": c,
        "period": period,
        "warehouse": wh,
        "item": it,
        "accounts": {
            "cash": cash_acc,
            "receivable": recv_acc,
            "payable": pay_acc,
            "inventory": inv_acc,
            "sales": sales_acc,
            "cogs": cogs_acc,
            "equity": equity_acc,
        },
    }


def test_counterparty_crud_and_credit_limit(commercial_env, db_session):
    c_id = commercial_env["company"].id
    user = commercial_env["user"]

    payload = {
        "code": "CUST-001",
        "name": "مشتری الف",
        "national_id": "10101010101",
        "economic_code": "411111111111",
        "phone": "02188888888",
        "credit_limit_irr": "50000000",
        "active": True,
    }
    cp = add_counterparty(db_session, c_id, user, payload)
    assert cp["id"] is not None
    assert cp["name"] == "مشتری الف"
    assert cp["credit_limit_irr"] == "50000000"

    # Duplicate code check
    with pytest.raises(DomainError) as exc:
        add_counterparty(db_session, c_id, user, payload)
    assert exc.value.code == "duplicate_counterparty_code"

    # Update
    update_payload = {"credit_limit_irr": "80000000", "phone": "02199999999"}
    updated = update_counterparty(db_session, c_id, user, cp["id"], update_payload, version=cp["version"])
    assert updated["credit_limit_irr"] == "80000000"
    assert updated["phone"] == "02199999999"

    # List
    parties = list_counterparties(db_session, c_id, user, search="مشتری")
    assert parties["total"] == 1
    assert parties["items"][0]["code"] == "CUST-001"

    # Credit limit check (no outstanding invoices yet -> passes for 30M)
    check_credit_limit(db_session, c_id, user, cp["code"], "30000000")

    # Exceeding credit limit (80M limit vs 90M requested)
    with pytest.raises(DomainError) as exc:
        check_credit_limit(db_session, c_id, user, cp["code"], "90000000")
    assert exc.value.code == "credit_limit_exceeded"

    # With authorized override and reason, it succeeds
    check_credit_limit(
        db_session,
        c_id,
        user,
        cp["code"],
        "90000000",
        allow_override=True,
        override_reason="تاییدیه کتبی مدیریت مالی",
    )


def test_proforma_lifecycle_and_conversion(commercial_env, db_session):
    c_id = commercial_env["company"].id
    user = commercial_env["user"]
    item = commercial_env["item"]
    wh = commercial_env["warehouse"]
    period = commercial_env["period"]
    accs = commercial_env["accounts"]

    cp = add_counterparty(
        db_session,
        c_id,
        user,
        {"code": "CUST-002", "name": "مشتری ب", "credit_limit_irr": "200000000"},
    )

    today = date.today()
    proforma_payload = {
        "number": "PF-1403-001",
        "direction": "sale",
        "date": today,
        "expiry_date": today + timedelta(days=30),
        "party_id": cp["code"],
        "currency": "IRR",
        "lines": [
            {
                "item_id": item["id"],
                "description": "کالای شماره ۱",
                "quantity": 10,
                "unit_price": "1000000",
                "discount": "500000",
            }
        ],
        "terms": "نقدی یا اعتباری ۳۰ روزه",
    }

    pf = create_proforma(db_session, c_id, user, proforma_payload)
    assert pf["number"] == "PF-1403-001"
    assert pf["total_amount"] == "9500000"
    assert pf["status"] == "issued"

    # Duplicate number check
    with pytest.raises(DomainError) as exc:
        create_proforma(db_session, c_id, user, proforma_payload)
    assert exc.value.code == "duplicate_proforma_number"

    # Ensure warehouse has stock for sale
    opening = create_opening_stock_draft(
        db_session,
        c_id,
        user,
        {
            "item_id": item["id"],
            "warehouse_id": wh["id"],
            "quantity": 50,
            "unit_price": "600000",
            "unit": "IRR",
            "period_id": period.id,
            "source_reference": "OPEN-001",
            "equity_account_id": accs["equity"].id,
        },
    )
    draft_id = opening["draft"]["id"]
    prev = preview(db_session, c_id, user, draft_id)
    post_batch(
        db_session,
        c_id,
        user,
        [
            {
                "draft_id": prev["draft_id"],
                "expected_version": prev["expected_version"],
                "digest": prev["digest"],
            }
        ],
    )

    # Convert proforma to operation draft
    conv_payload = {
        "warehouse_id": wh["id"],
        "period_id": period.id,
        "source_reference": "CONV-001",
        "counterparty_account_id": accs["receivable"].id,
        "revenue_account_id": accs["sales"].id,
        "cost_account_id": accs["cogs"].id,
    }
    conv_result = convert_proforma(db_session, c_id, user, pf["id"], pf["version"], conv_payload)
    assert conv_result["operation_id"] is not None
    assert conv_result["proforma_id"] == pf["id"]

    refreshed_pf = get_proforma(db_session, c_id, pf["id"])
    assert refreshed_pf["status"] == "converted"
    assert refreshed_pf["converted_operation_id"] == conv_result["operation_id"]

    # Second conversion attempt must fail
    with pytest.raises(DomainError) as exc2:
        convert_proforma(db_session, c_id, user, pf["id"], refreshed_pf["version"], conv_payload)
    assert exc2.value.code == "proforma_not_convertible"

    # Test expired proforma
    expired_payload = {
        "number": "PF-EXPIRED-001",
        "direction": "sale",
        "date": date(2025, 1, 1),
        "expiry_date": date(2025, 2, 1),
        "party_id": cp["code"],
        "currency": "IRR",
        "lines": [
            {
                "item_id": item["id"],
                "description": "کالای منقضی",
                "quantity": 1,
                "unit_price": "100000",
            }
        ],
    }
    exp_pf = create_proforma(db_session, c_id, user, expired_payload)
    with pytest.raises(DomainError) as exp_exc:
        convert_proforma(db_session, c_id, user, exp_pf["id"], exp_pf["version"], conv_payload)
    assert exp_exc.value.code == "proforma_expired"


def test_commercial_document_pdf(commercial_env, db_session):
    c_id = commercial_env["company"].id
    user = commercial_env["user"]
    item = commercial_env["item"]

    cp = add_counterparty(
        db_session,
        c_id,
        user,
        {"code": "CUST-003", "name": "شرکت خریدار نمونه"},
    )

    today = date(2024, 6, 1)
    proforma_payload = {
        "number": "PF-1403-002",
        "direction": "sale",
        "date": today,
        "party_id": cp["code"],
        "lines": [
            {
                "item_id": item["id"],
                "description": "ارائه کالای تستی",
                "quantity": 5,
                "unit_price": "2000000",
                "discount": "0",
            }
        ],
    }
    pf = create_proforma(db_session, c_id, user, proforma_payload)

    pdf_bytes = pdf_commercial_document(pf, company_name=commercial_env["company"].name)
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 500
