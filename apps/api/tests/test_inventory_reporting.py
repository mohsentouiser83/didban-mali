"""Tests for INV-04: Cardex, stock valuation, and gross profit reporting."""

from datetime import date
from uuid import uuid4

import pytest

from didban import models as m
from didban.accounting_models import Account
from didban.inventory_models import InventoryItem, InventoryMovement, InventoryWarehouse
from didban.inventory_service import cardex, item_profit_report, valuation_report


@pytest.fixture
def inventory_test_setup(db_session):
    db = db_session
    company_id = f"c-inv-{uuid4().hex[:6]}"
    user_id = f"u-inv-{uuid4().hex[:6]}"

    user = m.User(id=user_id, email=f"{user_id}@test.local", name="مدیر انبار", password_hash="test")
    company = m.Company(id=company_id, name="شرکت تست انبار")
    member = m.Membership(company_id=company_id, user_id=user_id, role="finance_manager", active=True)
    db.add_all([user, company, member])

    inv_acc = Account(id=f"acc-inv-{uuid4().hex[:6]}", company_id=company_id, code="101", name="موجودی کالا")
    db.add(inv_acc)

    item = InventoryItem(id="item-1", company_id=company_id, code="ITM-01", name="کالای الف", inventory_account_id=inv_acc.id)
    warehouse = InventoryWarehouse(id="wh-1", company_id=company_id, code="WH-01", name="انبار مرکزی")
    db.add_all([item, warehouse])

    period = m.Period(id="p-inv", company_id=company_id, name="دوره تست", start=date(2026, 1, 1), end=date(2026, 12, 31))
    db.add(period)

    # 1. Purchase 100 units @ 10,000 IRR = 1,000,000 IRR on 2026-02-01
    m1 = InventoryMovement(
        company_id=company_id,
        item_id=item.id,
        warehouse_id=warehouse.id,
        journal_id="j-1",
        operation_id="op-1",
        kind="purchase_goods",
        date=date(2026, 2, 1),
        sequence=1,
        quantity=100,
        value_irr="1000000",
        evidence={
            "source_reference": "PO-101",
            "unit_price": "10000",
            "unit_price_irr": "10000",
            "amount_irr": "1000000",
            "value_irr": "1000000",
        },
    )

    # 2. Purchase 50 units @ 12,000 IRR = 600,000 IRR on 2026-03-01
    m2 = InventoryMovement(
        company_id=company_id,
        item_id=item.id,
        warehouse_id=warehouse.id,
        journal_id="j-2",
        operation_id="op-2",
        kind="purchase_goods",
        date=date(2026, 3, 1),
        sequence=2,
        quantity=50,
        value_irr="600000",
        evidence={
            "source_reference": "PO-102",
            "unit_price": "12000",
            "unit_price_irr": "12000",
            "amount_irr": "600000",
            "value_irr": "600000",
        },
    )

    # 3. Sale 60 units (FIFO: 60 from lot 1 @ 10,000 = 600,000 COGS) sold at 15,000 = 900,000 Revenue on 2026-04-01
    m3 = InventoryMovement(
        company_id=company_id,
        item_id=item.id,
        warehouse_id=warehouse.id,
        journal_id="j-3",
        operation_id="op-3",
        kind="sale_goods",
        date=date(2026, 4, 1),
        sequence=3,
        quantity=-60,
        value_irr="-600000",
        evidence={
            "source_reference": "INV-201",
            "unit_price": "15000",
            "unit_price_irr": "15000",
            "amount_irr": "900000",
            "value_irr": "-600000",
        },
    )

    db.add_all([m1, m2, m3])
    db.flush()

    return user, company, item, warehouse


def test_cardex_full_history_and_balances(db_session, inventory_test_setup):
    db = db_session
    user, company, item, warehouse = inventory_test_setup

    res = cardex(db, company.id, user, item_id=item.id)
    assert res["total_records"] == 3
    assert res["opening_quantity"] == 0
    assert res["opening_value_irr"] == "0"
    assert res["total_in_quantity"] == 150
    assert res["total_in_value_irr"] == "1600000"
    assert res["total_out_quantity"] == 60
    assert res["total_out_value_irr"] == "600000"
    assert res["closing_quantity"] == 90
    assert res["closing_value_irr"] == "1000000"

    rows = res["rows"]
    assert len(rows) == 3
    # Row 1 (first purchase): in=100, bal=100, val=1,000,000
    assert rows[0]["in_quantity"] == 100
    assert rows[0]["balance_quantity"] == 100
    assert rows[0]["balance_value_irr"] == "1000000"
    # Row 2 (second purchase): in=50, bal=150, val=1,600,000
    assert rows[1]["in_quantity"] == 50
    assert rows[1]["balance_quantity"] == 150
    assert rows[1]["balance_value_irr"] == "1600000"
    # Row 3 (sale): out=60, bal=90, val=1,000,000
    assert rows[2]["out_quantity"] == 60
    assert rows[2]["balance_quantity"] == 90
    assert rows[2]["balance_value_irr"] == "1000000"


def test_cardex_date_filtering_and_opening_balance(db_session, inventory_test_setup):
    db = db_session
    user, company, item, warehouse = inventory_test_setup

    # Query from 2026-03-01 to 2026-04-30
    res = cardex(db, company.id, user, item_id=item.id, from_date=date(2026, 3, 1))
    assert res["total_records"] == 2
    # Before 2026-03-01: movement 1 (100 units, 1,000,000 IRR)
    assert res["opening_quantity"] == 100
    assert res["opening_value_irr"] == "1000000"
    assert res["closing_quantity"] == 90
    assert res["closing_value_irr"] == "1000000"


def test_valuation_report(db_session, inventory_test_setup):
    db = db_session
    user, company, item, warehouse = inventory_test_setup

    val = valuation_report(db, company.id, user)
    assert val["total_inventory_value_irr"] == "1000000"
    assert val["items_count"] == 1
    row = val["rows"][0]
    assert row["item_id"] == item.id
    assert row["quantity"] == 90
    assert row["total_value_irr"] == "1000000"


def test_item_profit_report(db_session, inventory_test_setup):
    db = db_session
    user, company, item, warehouse = inventory_test_setup

    profit = item_profit_report(db, company.id, user)
    assert profit["total_revenue_irr"] == "900000"
    assert profit["total_cogs_irr"] == "600000"
    assert profit["total_gross_profit_irr"] == "300000"
    # Margin = 300,000 / 900,000 = 33.33%
    assert profit["overall_margin_percent"] == 33.33

    assert len(profit["rows"]) == 1
    r = profit["rows"][0]
    assert r["quantity_sold"] == 60
    assert r["revenue_irr"] == "900000"
    assert r["cogs_irr"] == "600000"
    assert r["gross_profit_irr"] == "300000"
    assert r["margin_percent"] == 33.33


def test_inventory_reporting_http_endpoints():
    from fastapi.testclient import TestClient

    from didban.api import app
    from didban.config import settings
    from didban.db import transaction
    from didban.security import hasher

    c_id = f"c-api-inv-{uuid4().hex[:6]}"
    u_id = f"u-api-inv-{uuid4().hex[:6]}"
    email = f"{u_id}@test.local"
    pwd = "Secret-password-123!"

    with transaction() as db:
        user = m.User(id=u_id, email=email, name="مدیر انبار", password_hash=hasher.hash(pwd))
        company = m.Company(id=c_id, name="شرکت تست ای پی آی انبار")
        db.add_all([user, company])
        db.flush()

        member = m.Membership(company_id=c_id, user_id=u_id, role="finance_manager", active=True)
        db.add(member)
        db.flush()

        acc = Account(id=f"acc-{uuid4().hex[:6]}", company_id=c_id, code="101", name="کالا")
        db.add(acc)
        item = InventoryItem(id=f"item-api-{uuid4().hex[:6]}", company_id=c_id, code=f"ITM-{uuid4().hex[:4]}", name="کالای تست", inventory_account_id=acc.id)
        wh = InventoryWarehouse(id=f"wh-api-{uuid4().hex[:6]}", company_id=c_id, code=f"WH-{uuid4().hex[:4]}", name="انبار تست")
        db.add_all([item, wh])

    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    csrf = login.json()["csrf"]
    headers = {"X-CSRF-Token": csrf, "Origin": settings.web_origin}

    # Test cardex endpoint
    res_cardex = client.get(f"/api/v1/companies/{c_id}/accounting/inventory/cardex", headers=headers)
    assert res_cardex.status_code == 200, res_cardex.text
    assert "total_records" in res_cardex.json()

    # Test valuation endpoint
    res_val = client.get(f"/api/v1/companies/{c_id}/accounting/inventory/valuation", headers=headers)
    assert res_val.status_code == 200, res_val.text
    assert "total_inventory_value_irr" in res_val.json()

    # Test profit endpoint
    res_prof = client.get(f"/api/v1/companies/{c_id}/accounting/inventory/profit", headers=headers)
    assert res_prof.status_code == 200, res_prof.text
    assert "total_gross_profit_irr" in res_prof.json()

