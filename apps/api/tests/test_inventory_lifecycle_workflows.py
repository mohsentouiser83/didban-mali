"""Comprehensive tests for INV-05, INV-01, INV-02, INV-03:
- INV-05: Catalog lifecycle, edit, deactivation, deletion protection, inactive guards
- INV-01: Opening stock draft, posting, lot consumption in subsequent sales
- INV-02: Warehouse transfer, FIFO consumption from source, lot creation in destination
- INV-03: Stocktake & adjustment (shortage and surplus), journals, movements
"""

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.errors import DomainError
from didban.inventory_models import InventoryItem, InventoryMovement, InventoryWarehouse
from didban.inventory_service import (
    add_item,
    add_warehouse,
    cardex,
    create_adjustment_draft,
    create_draft,
    create_opening_stock_draft,
    create_transfer_draft,
    delete_item,
    delete_warehouse,
    summary,
    update_item,
    update_warehouse,
)
from didban.posting_service import post_batch, preview


def _post_draft(db, c_id, user, draft_id):
    prev = preview(db, c_id, user, draft_id)
    return post_batch(
        db,
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


@pytest.fixture
def inv_lifecycle_env(db_session):
    db = db_session
    c_id = f"c-inv-life-{uuid4().hex[:6]}"
    u_id = f"u-inv-life-{uuid4().hex[:6]}"

    user = m.User(id=u_id, email=f"{u_id}@test.local", name="مدیر انبار", password_hash="test")
    company = m.Company(id=c_id, name="شرکت تست گردش انبار")
    member = m.Membership(company_id=c_id, user_id=u_id, role="finance_manager", active=True)
    setup = CompanyAccountingSetup(company_id=c_id, mode="primary")
    db.add_all([user, company, member, setup])

    period = m.Period(
        id=f"p-inv-{uuid4().hex[:6]}",
        company_id=c_id,
        name="دوره مالی ۱۴۰۵",
        start=date(2026, 1, 1),
        end=date(2026, 12, 29),
    )
    db.add(period)

    # Accounts
    acc_inv = Account(id=f"acc-inv-{uuid4().hex[:6]}", company_id=c_id, code="10101", name="موجودی کالا")
    acc_equity = Account(id=f"acc-eq-{uuid4().hex[:6]}", company_id=c_id, code="30101", name="سرمایه اولیه")
    acc_ar = Account(id=f"acc-ar-{uuid4().hex[:6]}", company_id=c_id, code="10301", name="حسابهای دریافتنی")
    acc_ap = Account(id=f"acc-ap-{uuid4().hex[:6]}", company_id=c_id, code="20101", name="حسابهای پرداختنی")
    acc_rev = Account(id=f"acc-rev-{uuid4().hex[:6]}", company_id=c_id, code="40101", name="فروش")
    acc_cogs = Account(id=f"acc-cogs-{uuid4().hex[:6]}", company_id=c_id, code="50101", name="بهای تمام شده")
    acc_adj_loss = Account(id=f"acc-adj-l-{uuid4().hex[:6]}", company_id=c_id, code="50201", name="کسری انبار")
    acc_adj_gain = Account(id=f"acc-adj-g-{uuid4().hex[:6]}", company_id=c_id, code="40201", name="اضافه انبار")

    db.add_all([acc_inv, acc_equity, acc_ar, acc_ap, acc_rev, acc_cogs, acc_adj_loss, acc_adj_gain])
    db.flush()

    return {
        "db": db,
        "company_id": c_id,
        "user": user,
        "period": period,
        "accounts": {
            "inventory": acc_inv,
            "equity": acc_equity,
            "ar": acc_ar,
            "ap": acc_ap,
            "revenue": acc_rev,
            "cogs": acc_cogs,
            "adj_loss": acc_adj_loss,
            "adj_gain": acc_adj_gain,
        },
    }


def test_inv_05_catalog_lifecycle_and_validation(inv_lifecycle_env):
    db = inv_lifecycle_env["db"]
    c_id = inv_lifecycle_env["company_id"]
    user = inv_lifecycle_env["user"]
    accounts = inv_lifecycle_env["accounts"]

    # 1. Add item and warehouses
    item_res = add_item(
        db,
        c_id,
        user,
        {"code": "ITM-A", "name": "کالای الف", "inventory_account_id": accounts["inventory"].id},
    )
    wh_a_res = add_warehouse(db, c_id, user, {"code": "WH-A", "name": "انبار الف"})
    wh_b_res = add_warehouse(db, c_id, user, {"code": "WH-B", "name": "انبار ب"})

    item_id = item_res["id"]
    wh_a_id = wh_a_res["id"]
    wh_b_id = wh_b_res["id"]

    # 2. Update item name and code
    upd_item = update_item(db, c_id, user, item_id, {"name": "کالای الف اصلاح‌شده", "code": "ITM-A1"})
    assert upd_item["name"] == "کالای الف اصلاح‌شده"
    assert upd_item["code"] == "ITM-A1"

    # 3. Deactivate item and warehouse
    update_item(db, c_id, user, item_id, {"active": False})
    item_obj = db.get(InventoryItem, item_id)
    assert item_obj.active is False

    # Attempting to use inactive item in a draft fails
    with pytest.raises(DomainError) as err:
        create_draft(
            db,
            c_id,
            user,
            {
                "kind": "purchase_goods",
                "item_id": item_id,
                "warehouse_id": wh_a_id,
                "quantity": 10,
                "unit_price": 5000,
                "unit": "IRR",
                "period_id": inv_lifecycle_env["period"].id,
                "date": date(2026, 2, 1),
                "description": "خرید تستی",
                "source_reference": f"ref-{uuid4().hex[:6]}",
                "party_id": "vendor-1",
                "counterparty_account_id": accounts["ap"].id,
                "revenue_account_id": None,
                "cost_account_id": None,
            },
        )
    assert err.value.code == "inactive_item"

    # Reactivate item
    update_item(db, c_id, user, item_id, {"active": True})
    assert db.get(InventoryItem, item_id).active is True

    # 4. Deactivate warehouse
    update_warehouse(db, c_id, user, wh_a_id, {"active": False})
    with pytest.raises(DomainError) as err:
        create_draft(
            db,
            c_id,
            user,
            {
                "kind": "purchase_goods",
                "item_id": item_id,
                "warehouse_id": wh_a_id,
                "quantity": 10,
                "unit_price": 5000,
                "unit": "IRR",
                "period_id": inv_lifecycle_env["period"].id,
                "date": date(2026, 2, 1),
                "description": "خرید تستی",
                "source_reference": f"ref-{uuid4().hex[:6]}",
                "party_id": "vendor-1",
                "counterparty_account_id": accounts["ap"].id,
                "revenue_account_id": None,
                "cost_account_id": None,
            },
        )
    assert err.value.code == "inactive_warehouse"

    # Reactivate warehouse
    update_warehouse(db, c_id, user, wh_a_id, {"active": True})

    # 5. Delete unused warehouse B
    del_wh = delete_warehouse(db, c_id, user, wh_b_id)
    assert del_wh["deleted"] is True
    assert db.get(InventoryWarehouse, wh_b_id) is None


def test_inv_01_opening_stock_and_posting(inv_lifecycle_env):
    db = inv_lifecycle_env["db"]
    c_id = inv_lifecycle_env["company_id"]
    user = inv_lifecycle_env["user"]
    accounts = inv_lifecycle_env["accounts"]
    period = inv_lifecycle_env["period"]

    item = add_item(
        db,
        c_id,
        user,
        {"code": "ITM-OPEN", "name": "کالای اول دوره", "inventory_account_id": accounts["inventory"].id},
    )
    wh = add_warehouse(db, c_id, user, {"code": "WH-OPEN", "name": "انبار اول دوره"})

    # 1. Create opening stock draft: 50 units @ 10,000 IRR
    op_draft = create_opening_stock_draft(
        db,
        c_id,
        user,
        {
            "item_id": item["id"],
            "warehouse_id": wh["id"],
            "quantity": 50,
            "unit_price": 10000,
            "unit": "IRR",
            "period_id": period.id,
            "date": date(2026, 1, 1),
            "description": "ثبت موجودی ابتدای دوره",
            "source_reference": f"op-ref-{uuid4().hex[:6]}",
            "equity_account_id": accounts["equity"].id,
        },
    )
    draft_id = op_draft["draft"]["id"]

    # 2. Post opening journal draft
    _post_draft(db, c_id, user, draft_id)

    # 3. Verify InventoryMovement was created with kind="opening_stock"
    mov = db.scalar(
        select(InventoryMovement).where(
            InventoryMovement.company_id == c_id,
            InventoryMovement.item_id == item["id"],
            InventoryMovement.kind == "opening_stock",
        )
    )
    assert mov is not None
    assert mov.quantity == 50
    assert mov.value_irr == "500000"

    # Cardex reflects opening stock
    cdx = cardex(db, c_id, user, item_id=item["id"], warehouse_id=wh["id"])
    assert cdx["total_records"] == 1
    assert cdx["closing_quantity"] == 50
    assert cdx["closing_value_irr"] == "500000"

    # 4. Subsequent sale consumes from opening stock lot
    sale_draft = create_draft(
        db,
        c_id,
        user,
        {
            "kind": "sale_goods",
            "item_id": item["id"],
            "warehouse_id": wh["id"],
            "quantity": 20,
            "unit_price": 15000,
            "unit": "IRR",
            "period_id": period.id,
            "date": date(2026, 2, 1),
            "description": "فروش از موجودی اول دوره",
            "source_reference": f"sale-ref-{uuid4().hex[:6]}",
            "party_id": "customer-1",
            "counterparty_account_id": accounts["ar"].id,
            "revenue_account_id": accounts["revenue"].id,
            "cost_account_id": accounts["cogs"].id,
        },
    )
    _post_draft(db, c_id, user, sale_draft["draft"]["id"])

    cdx2 = cardex(db, c_id, user, item_id=item["id"], warehouse_id=wh["id"])
    assert cdx2["total_records"] == 2
    assert cdx2["closing_quantity"] == 30
    # Remaining value: 30 * 10,000 = 300,000 IRR
    assert cdx2["closing_value_irr"] == "300000"

    # 5. Item with movements cannot have inventory_account_id changed or be deleted
    with pytest.raises(DomainError) as err:
        update_item(db, c_id, user, item["id"], {"inventory_account_id": accounts["cogs"].id})
    assert err.value.code == "inventory_account_locked"

    with pytest.raises(DomainError) as err:
        delete_item(db, c_id, user, item["id"])
    assert err.value.code == "inventory_item_referenced"


def test_inv_02_warehouse_transfer(inv_lifecycle_env):
    db = inv_lifecycle_env["db"]
    c_id = inv_lifecycle_env["company_id"]
    user = inv_lifecycle_env["user"]
    accounts = inv_lifecycle_env["accounts"]
    period = inv_lifecycle_env["period"]

    item = add_item(
        db,
        c_id,
        user,
        {"code": "ITM-TR", "name": "کالای انتقال", "inventory_account_id": accounts["inventory"].id},
    )
    wh_src = add_warehouse(db, c_id, user, {"code": "WH-SRC", "name": "انبار مبدأ"})
    wh_dst = add_warehouse(db, c_id, user, {"code": "WH-DST", "name": "انبار مقصد"})

    # 1. Opening stock in WH-SRC: 100 units @ 20,000 IRR = 2,000,000 IRR
    op = create_opening_stock_draft(
        db,
        c_id,
        user,
        {
            "item_id": item["id"],
            "warehouse_id": wh_src["id"],
            "quantity": 100,
            "unit_price": 20000,
            "unit": "IRR",
            "period_id": period.id,
            "date": date(2026, 1, 1),
            "description": "موجودی اولیه در انبار مبدأ",
            "source_reference": f"op-src-{uuid4().hex[:6]}",
            "equity_account_id": accounts["equity"].id,
        },
    )
    _post_draft(db, c_id, user, op["draft"]["id"])

    # 2. Transfer 40 units from WH-SRC to WH-DST
    tr_draft = create_transfer_draft(
        db,
        c_id,
        user,
        {
            "item_id": item["id"],
            "source_warehouse_id": wh_src["id"],
            "destination_warehouse_id": wh_dst["id"],
            "quantity": 40,
            "period_id": period.id,
            "date": date(2026, 1, 15),
            "description": "انتقال بین انبارها",
            "source_reference": f"tr-ref-{uuid4().hex[:6]}",
        },
    )
    _post_draft(db, c_id, user, tr_draft["draft"]["id"])

    # 3. Check movements: one transfer_out and one transfer_in
    movements = list(
        db.scalars(
            select(InventoryMovement)
            .where(InventoryMovement.company_id == c_id, InventoryMovement.item_id == item["id"])
            .order_by(InventoryMovement.sequence)
        )
    )
    # Total movements: 1 opening + 1 transfer_out + 1 transfer_in = 3
    assert len(movements) == 3
    assert movements[1].kind == "transfer_out"
    assert movements[1].quantity == -40
    assert movements[1].value_irr == "-800000"

    assert movements[2].kind == "transfer_in"
    assert movements[2].quantity == 40
    assert movements[2].value_irr == "800000"

    # 4. Check balances in both warehouses
    summ = summary(db, c_id, user)
    bal_by_wh = {b["warehouse_id"]: b for b in summ["balances"] if b["item_id"] == item["id"]}
    assert bal_by_wh[wh_src["id"]]["quantity"] == 60
    assert bal_by_wh[wh_src["id"]]["value_irr"] == "1200000"
    assert bal_by_wh[wh_dst["id"]]["quantity"] == 40
    assert bal_by_wh[wh_dst["id"]]["value_irr"] == "800000"

    # Total company stock is still exactly 100 units / 2,000,000 IRR
    total_qty = sum(b["quantity"] for b in bal_by_wh.values())
    total_val = sum(int(b["value_irr"]) for b in bal_by_wh.values())
    assert total_qty == 100
    assert total_val == 2000000


def test_inv_03_stocktake_and_adjustment(inv_lifecycle_env):
    db = inv_lifecycle_env["db"]
    c_id = inv_lifecycle_env["company_id"]
    user = inv_lifecycle_env["user"]
    accounts = inv_lifecycle_env["accounts"]
    period = inv_lifecycle_env["period"]

    item = add_item(
        db,
        c_id,
        user,
        {"code": "ITM-ADJ", "name": "کالای تعدیل", "inventory_account_id": accounts["inventory"].id},
    )
    wh = add_warehouse(db, c_id, user, {"code": "WH-ADJ", "name": "انبار تعدیل"})

    # 1. Establish initial stock: 50 units @ 10,000 IRR = 500,000 IRR
    op = create_opening_stock_draft(
        db,
        c_id,
        user,
        {
            "item_id": item["id"],
            "warehouse_id": wh["id"],
            "quantity": 50,
            "unit_price": 10000,
            "unit": "IRR",
            "period_id": period.id,
            "date": date(2026, 1, 1),
            "description": "موجودی اولیه برای انبارگردانی",
            "source_reference": f"op-adj-{uuid4().hex[:6]}",
            "equity_account_id": accounts["equity"].id,
        },
    )
    _post_draft(db, c_id, user, op["draft"]["id"])

    # 2. Stocktake Shortage: Counted quantity is 45 (system was 50 -> shortage of 5 units)
    adj_short = create_adjustment_draft(
        db,
        c_id,
        user,
        {
            "item_id": item["id"],
            "warehouse_id": wh["id"],
            "counted_quantity": 45,
            "period_id": period.id,
            "date": date(2026, 3, 1),
            "description": "تعدیل کسری انبارگردانی پایان سال",
            "source_reference": f"adj-short-{uuid4().hex[:6]}",
            "adjustment_account_id": accounts["adj_loss"].id,
        },
    )
    _post_draft(db, c_id, user, adj_short["draft"]["id"])

    cdx1 = cardex(db, c_id, user, item_id=item["id"], warehouse_id=wh["id"])
    assert cdx1["total_records"] == 2
    assert cdx1["closing_quantity"] == 45
    assert cdx1["closing_value_irr"] == "450000"

    # 3. Stocktake Surplus: Counted quantity is 48 (system was 45 -> surplus of 3 units)
    adj_surplus = create_adjustment_draft(
        db,
        c_id,
        user,
        {
            "item_id": item["id"],
            "warehouse_id": wh["id"],
            "counted_quantity": 48,
            "unit_price": 10000,
            "unit": "IRR",
            "period_id": period.id,
            "date": date(2026, 3, 15),
            "description": "تعدیل اضافه انبارگردانی",
            "source_reference": f"adj-surplus-{uuid4().hex[:6]}",
            "adjustment_account_id": accounts["adj_gain"].id,
        },
    )
    _post_draft(db, c_id, user, adj_surplus["draft"]["id"])

    cdx2 = cardex(db, c_id, user, item_id=item["id"], warehouse_id=wh["id"])
    assert cdx2["total_records"] == 3
    assert cdx2["closing_quantity"] == 48
    assert cdx2["closing_value_irr"] == "480000"
