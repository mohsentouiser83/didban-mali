"""Phase 3 acceptance tests: D24–D34 multi-line commercial invoices, discounts, partial returns, FIFO/quarantine, credits, proforma recovery, and NRV assessment."""

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_service import save_account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.commercial_doc_models import (
    CommercialDocument,
    CommercialReturn,
    CounterpartyCredit,
)
from didban.commercial_doc_service import (
    allocate_invoice_discount,
    apply_credit_to_document,
    create_commercial_document_draft,
    create_commercial_return_draft,
    create_credit_refund_draft,
    decide_quarantine_draft,
    list_quarantine,
)
from didban.commercial_service import add_counterparty
from didban.errors import DomainError
from didban.inventory_models import InventoryMovement
from didban.inventory_service import (
    add_item,
    add_warehouse,
    assess_nrv,
    create_opening_stock_draft,
    valuation_report,
)
from didban.inventory_service import (
    create_draft as create_inv_draft,
)
from didban.native_invoice_service import detail as invoice_detail
from didban.posting_service import post_batch, preview


def _post(db, company_id, user, draft_res):
    draft_id = draft_res["draft"]["id"] if "draft" in draft_res else draft_res["id"]
    prev = preview(db, company_id, user, draft_id)
    return post_batch(
        db,
        company_id,
        user,
        [{"draft_id": draft_id, "expected_version": prev["expected_version"], "digest": prev["digest"]}],
    )


@pytest.fixture
def trade_env(db_session):
    db = db_session
    cid = f"c-p3-{uuid4().hex[:6]}"
    uid = f"u-p3-{uuid4().hex[:6]}"
    user = m.User(id=uid, email=f"{uid}@test.local", name="مدیر بازرگانی", password_hash="x", active=True)
    comp = m.Company(id=cid, name="شرکت بازرگانی پایلوت")
    db.add_all([user, comp])
    db.flush()
    mem = m.Membership(company_id=cid, user_id=uid, role="finance_manager", active=True)
    db.add(mem)
    db.add(CompanyAccountingSetup(company_id=cid, mode="primary"))
    period = m.Period(
        id=f"p-{uuid4().hex[:6]}",
        company_id=cid,
        name="دوره ۱۴۰۵",
        start=date(2026, 1, 1),
        end=date(2026, 12, 29),
    )
    from didban.period_lock_models import PeriodLock

    closed_period = m.Period(
        id=f"p-closed-{uuid4().hex[:6]}",
        company_id=cid,
        name="دوره ۱۴۰۴",
        start=date(2025, 1, 1),
        end=date(2025, 12, 29),
    )
    db.add_all([period, closed_period])
    db.flush()
    db.add(PeriodLock(company_id=cid, period_id=closed_period.id, closed=True))
    db.flush()

    def mk_acc(code: str, name: str, role: str):
        saved = save_account(
            db, cid, user, {"code": code, "name": name, "kind": "leaf", "active": True, "role": role}
        )
        return db.get(Account, saved["id"])

    accs = {
        "inv": mk_acc("1101", "موجودی کالا", "other_asset"),
        "cash": mk_acc("1102", "بانک مرکزی", "bank"),
        "ar": mk_acc("1103", "دریافتنی تجاری", "trade_receivable"),
        "notes_rec": mk_acc("1104", "اسناد دریافتنی", "other_asset"),
        "ap": mk_acc("2101", "پرداختنی تجاری", "trade_payable"),
        "equity": mk_acc("3101", "سرمایه", "equity"),
        "sales": mk_acc("4101", "فروش کالا", "revenue"),
        "svc_rev": mk_acc("4102", "درآمد حمل و خدمات", "revenue"),
        "disc": mk_acc("4103", "تخفیفات فروش", "revenue"),
        "cogs": mk_acc("5101", "بهای تمام‌شده", "expense"),
        "svc_exp": mk_acc("5102", "هزینه خدمات", "expense"),
    }
    wh = add_warehouse(db, cid, user, {"name": "انبار مرکزی"})
    item_a = add_item(db, cid, user, {"name": "کالای الف", "base_unit": "بسته"})
    item_b = add_item(db, cid, user, {"name": "کالای ب", "base_unit": "دستگاه"})
    customer = add_counterparty(
        db,
        cid,
        user,
        {"name": "مشتری عمده", "entity_kind": "legal_entity", "roles": ["customer"]},
    )
    supplier = add_counterparty(
        db,
        cid,
        user,
        {"name": "تأمین‌کننده اصلی", "entity_kind": "legal_entity", "roles": ["supplier"]},
    )
    db.commit()
    return {
        "company_id": cid,
        "user": user,
        "period": period,
        "closed_period": closed_period,
        "accs": accs,
        "wh": wh,
        "item_a": item_a,
        "item_b": item_b,
        "customer": customer,
        "supplier": supplier,
    }


def test_d27_largest_remainder_100_irr_split():
    allocs = allocate_invoice_discount([Decimal("1000"), Decimal("1000"), Decimal("1000")], Decimal("100"))
    assert allocs == [Decimal("34"), Decimal("33"), Decimal("33")]
    assert sum(allocs) == Decimal("100")


def test_multiline_commercial_sale_fifo_mixed_settlement_and_returns_d24_d34(trade_env, db_session):
    db = db_session
    cid = trade_env["company_id"]
    u = trade_env["user"]
    p = trade_env["period"]
    accs = trade_env["accs"]
    wh = trade_env["wh"]
    item_a = trade_env["item_a"]
    item_b = trade_env["item_b"]
    customer = trade_env["customer"]
    supplier = trade_env["supplier"]

    # Seed two FIFO layers for item_a (5 @ 1,000 and 5 @ 2,000) and one layer for item_b (10 @ 500)
    today = date.today()
    op_a1 = create_inv_draft(
        db,
        cid,
        u,
        {
            "kind": "purchase_goods",
            "item_id": item_a["id"],
            "warehouse_id": wh["id"],
            "quantity": 5,
            "unit_price": "1000",
            "unit": "IRR",
            "period_id": p.id,
            "date": today - timedelta(days=5),
            "description": "خرید لایه ۱ الف",
            "party_id": supplier["id"],
            "counterparty_account_id": accs["ap"].id,
        },
    )
    _post(db, cid, u, op_a1)
    op_a2 = create_inv_draft(
        db,
        cid,
        u,
        {
            "kind": "purchase_goods",
            "item_id": item_a["id"],
            "warehouse_id": wh["id"],
            "quantity": 5,
            "unit_price": "2000",
            "unit": "IRR",
            "period_id": p.id,
            "date": today - timedelta(days=4),
            "description": "خرید لایه ۲ الف",
            "party_id": supplier["id"],
            "counterparty_account_id": accs["ap"].id,
        },
    )
    _post(db, cid, u, op_a2)
    op_b = create_opening_stock_draft(
        db,
        cid,
        u,
        {
            "item_id": item_b["id"],
            "warehouse_id": wh["id"],
            "quantity": 10,
            "unit_price": "500",
            "unit": "IRR",
            "period_id": p.id,
            "date": today - timedelta(days=4),
            "description": "موجودی ب",
            "equity_account_id": accs["equity"].id,
        },
    )
    _post(db, cid, u, op_b)

    # Create 3-line sale: item_a qty=7 (spans both FIFO layers: 5*1000 + 2*2000 = 9,000), item_b qty=4, plus service line!
    # Line net before inv disc: (7*3000 - 1000 = 20,000), (4*1000 - 0 = 4,000), (1*1000 - 0 = 1,000) => sum = 25,000
    # Invoice discount = 500 -> D24 exact proportional: 400, 80, 20 -> Net = 19,600 + 3,920 + 980 = 24,500
    sale_res = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "sale",
            "period_id": p.id,
            "issue_date": today - timedelta(days=2),
            "party_id": customer["id"],
            "warehouse_id": wh["id"],
            "currency": "IRR",
            "invoice_discount": "500",
            "settlement_type": "mixed",
            "cash_amount": "10000",
            "cheque_amount": "4500",
            "on_account_amount": "10000",
            "cash_account_id": accs["cash"].id,
            "cheque_account_id": accs["notes_rec"].id,
            "cheque_number": "CHK-P3-1",
            "cheque_due_date": today + timedelta(days=15),
            "counterparty_account_id": accs["ar"].id,
            "revenue_account_id": accs["sales"].id,
            "service_revenue_account_id": accs["svc_rev"].id,
            "discount_account_id": accs["disc"].id,
            "cost_account_id": accs["cogs"].id,
            "lines": [
                {"line_kind": "goods", "item_id": item_a["id"], "description": "کالای الف", "quantity": 7, "unit_price": "3000", "line_discount": "1000"},
                {"line_kind": "goods", "item_id": item_b["id"], "description": "کالای ب", "quantity": 4, "unit_price": "1000", "line_discount": "0"},
                {"line_kind": "service", "description": "هزینه ارسال", "unit": "سرویس", "quantity": 1, "unit_price": "1000", "line_discount": "0"},
            ],
        },
    )
    doc = sale_res["document"]
    assert doc["net_amount_irr"] == "24500"
    assert [ln["allocated_invoice_discount_irr"] for ln in doc["lines"]] == ["400", "80", "20"]
    assert [ln["net_amount_irr"] for ln in doc["lines"]] == ["19600", "3920", "980"]
    assert doc["lines"][0]["unit"] == "بسته"
    assert doc["lines"][0]["cost_irr"] == "9000"  # 5*1000 + 2*2000

    # Must not post in closed period if attempted, nor before human approval
    posted_batch = _post(db, cid, u, sale_res)
    j_id = posted_batch["items"][0]["id"]
    movs = list(db.scalars(select(InventoryMovement).where(InventoryMovement.company_id == cid, InventoryMovement.journal_id == j_id)))
    assert len(movs) == 2  # Multi-line same-warehouse same-journal movements without constraint crash!
    assert {m.line_index for m in movs} == {0, 1}

    db_doc = db.get(CommercialDocument, doc["id"])
    assert db_doc.status == "posted"
    assert db_doc.native_invoice_id is not None
    assert invoice_detail(db, cid, u, db_doc.native_invoice_id)["remaining"] == "10000"

    # Closed period return must fail
    with pytest.raises(DomainError) as closed_exc:
        create_commercial_return_draft(
            db,
            cid,
            u,
            doc["id"],
            {
                "period_id": trade_env["closed_period"].id,
                "date": date(2025, 6, 1),
                "reason": "بسته",
                "lines": [{"document_line_id": doc["lines"][0]["id"], "quantity": 1, "condition": "healthy"}],
            },
        )
    assert closed_exc.value.code in ("period_closed", "period_locked")

    # Partial healthy return of 6 units of item_a (D25/D26/D30):
    # Proportional return net for 6/7 of 19,600 = 16,800 IRR!
    # Open balance is 10,000 -> reduces open balance to 0 and creates customer credit 6,800 IRR! (Zero cash!)
    # Restores FIFO layers in consumption order: 5 from layer 1 (@1,000) + 1 from layer 2 (@2,000) = 7,000 IRR cost!
    ret1 = create_commercial_return_draft(
        db,
        cid,
        u,
        doc["id"],
        {
            "period_id": p.id,
            "date": today - timedelta(days=1),
            "reason": "مرجوعی بخشی سالم",
            "return_account_id": accs["sales"].id,
            "counterparty_account_id": accs["ar"].id,
            "cost_account_id": accs["cogs"].id,
            "lines": [{"document_line_id": doc["lines"][0]["id"], "quantity": 6, "condition": "healthy"}],
        },
    )
    assert ret1["return"]["lines"][0]["return_net_amount_irr"] == "16800"
    assert ret1["return"]["lines"][0]["return_cost_irr"] == "7000"
    _post(db, cid, u, ret1)

    posted_ret1 = db.get(CommercialReturn, ret1["return"]["id"])
    assert posted_ret1.invoice_balance_reduced_irr == "10000"
    assert posted_ret1.credit_created_irr == "6800"
    assert invoice_detail(db, cid, u, db_doc.native_invoice_id)["remaining"] == "0"

    # Valuation check: item_a remaining = 3 + 6 = 9 units (5*1000 + 4*2000 = 13,000)
    val1 = {r["item_id"]: r for r in valuation_report(db, cid, u)["rows"]}
    assert val1[item_a["id"]]["quantity"] == 9
    assert val1[item_a["id"]]["total_value_irr"] == "13000"

    # Partial defective return of remaining 1 unit of item_a (D31 quarantine):
    # Must NOT add to salable stock, valuation remains 9 units / 13,000 IRR!
    # Over-return of 2 units rejected first!
    with pytest.raises(DomainError) as over_exc:
        create_commercial_return_draft(
            db,
            cid,
            u,
            doc["id"],
            {
                "period_id": p.id,
                "date": today,
                "reason": "تعداد زیاد",
                "lines": [{"document_line_id": doc["lines"][0]["id"], "quantity": 2, "condition": "defective"}],
            },
        )
    assert over_exc.value.code == "return_quantity_exceeded"

    ret2 = create_commercial_return_draft(
        db,
        cid,
        u,
        doc["id"],
        {
            "period_id": p.id,
            "date": today,
            "reason": "کالای معیوب",
            "return_account_id": accs["sales"].id,
            "counterparty_account_id": accs["ar"].id,
            "cost_account_id": accs["cogs"].id,
            "lines": [{"document_line_id": doc["lines"][0]["id"], "quantity": 1, "condition": "defective"}],
        },
    )
    _post(db, cid, u, ret2)
    val2 = {r["item_id"]: r for r in valuation_report(db, cid, u)["rows"]}
    assert val2[item_a["id"]]["quantity"] == 9  # Defective quarantined, NOT salable!
    q_items = list_quarantine(db, cid, u)["items"]
    assert len(q_items) == 1
    assert q_items[0]["quarantine_status"] == "pending_inspection"

    # Restock quarantined line after inspection -> now adds 1 unit back at 2,000 IRR cost
    q_dec = decide_quarantine_draft(
        db,
        cid,
        u,
        q_items[0]["id"],
        {"decision": "restocked", "period_id": p.id, "date": today, "note": "تأیید کنترل کیفیت", "cost_account_id": accs["cogs"].id},
    )
    _post(db, cid, u, q_dec)
    val3 = {r["item_id"]: r for r in valuation_report(db, cid, u)["rows"]}
    assert val3[item_a["id"]]["quantity"] == 10
    assert val3[item_a["id"]]["total_value_irr"] == "15000"

    # Verify customer credit 6,800 can apply to a second invoice & remaining can be refunded via approved draft
    credit = db.scalar(select(CounterpartyCredit).where(CounterpartyCredit.company_id == cid, CounterpartyCredit.return_id == posted_ret1.id))
    assert credit.remaining_amount_irr == "6800"
    sale2 = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "sale",
            "period_id": p.id,
            "issue_date": today,
            "party_id": customer["id"],
            "warehouse_id": wh["id"],
            "currency": "IRR",
            "counterparty_account_id": accs["ar"].id,
            "revenue_account_id": accs["svc_rev"].id,
            "service_revenue_account_id": accs["svc_rev"].id,
            "lines": [{"line_kind": "service", "description": "خدمات دوم", "quantity": 1, "unit_price": "4000"}],
        },
    )
    _post(db, cid, u, sale2)
    app_res = apply_credit_to_document(
        db, cid, u, credit.id, {"target_document_id": sale2["document"]["id"], "amount_irr": "4000", "date": today}
    )
    assert app_res["credit"]["remaining_amount_irr"] == "2800"
    assert app_res["target_open_balance_irr"] == "0"

    # Refund draft for remaining 2,800 IRR does not finalize until posted
    refund_draft = create_credit_refund_draft(
        db,
        cid,
        u,
        credit.id,
        {
            "period_id": p.id,
            "date": today,
            "amount_irr": "2800",
            "cash_account_id": accs["cash"].id,
            "counterparty_account_id": accs["ar"].id,
            "reason": "بازپرداخت مانده اعتبار",
        },
    )
    db.refresh(credit)
    assert credit.remaining_amount_irr == "2800"
    _post(db, cid, u, refund_draft)
    db.refresh(credit)
    assert credit.remaining_amount_irr == "0"
    assert credit.status == "refunded"


def test_purchase_return_d29_and_nrv_assessment(trade_env, db_session):
    db = db_session
    cid = trade_env["company_id"]
    u = trade_env["user"]
    p = trade_env["period"]
    accs = trade_env["accs"]
    wh = trade_env["wh"]
    item_b = trade_env["item_b"]
    supplier = trade_env["supplier"]
    today = date.today()

    pur = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "purchase",
            "period_id": p.id,
            "issue_date": today - timedelta(days=1),
            "party_id": supplier["id"],
            "warehouse_id": wh["id"],
            "currency": "IRR",
            "counterparty_account_id": accs["ap"].id,
            "lines": [{"line_kind": "goods", "item_id": item_b["id"], "description": "خرید ب", "quantity": 5, "unit_price": "2000"}],
        },
    )
    _post(db, cid, u, pur)

    pur_ret = create_commercial_return_draft(
        db,
        cid,
        u,
        pur["document"]["id"],
        {
            "period_id": p.id,
            "date": today,
            "reason": "برگشت ۲ عدد بابت مغایرت",
            "counterparty_account_id": accs["ap"].id,
            "lines": [{"document_line_id": pur["document"]["lines"][0]["id"], "quantity": 2, "condition": "healthy"}],
        },
    )
    _post(db, cid, u, pur_ret)
    val = {r["item_id"]: r for r in valuation_report(db, cid, u)["rows"]}
    assert val[item_b["id"]]["quantity"] == 3
    assert val[item_b["id"]]["total_value_irr"] == "6000"

    # Standard 8 NRV assessment: selling price 1,800 - selling cost 300 = 1,500 NRV per unit (< 2,000 cost)
    nrv = assess_nrv(
        db,
        cid,
        u,
        market_prices=[
            {
                "item_id": item_b["id"],
                "warehouse_id": wh["id"],
                "estimated_selling_price_irr": "1800",
                "estimated_selling_cost_irr": "300",
            }
        ],
    )
    assert nrv["financial_effect"] is False
    assert nrv["method"] == "allowance_contra_asset"
    assert nrv["policy_status"] == "approved_allowance_draft_only"
    assert nrv["total_cost_irr"] == "6000"
    assert nrv["total_lcnrv_irr"] == "4500"
    assert nrv["total_write_down_irr"] == "1500"

    # Prepare LCNRV allowance draft (D35): credits contra-asset allowance, never reduces FIFO inventory asset directly
    from didban.accounting_service import save_account
    from didban.inventory_service import create_nrv_adjustment_draft

    nrv_allow = save_account(db, cid, u, {"code": "1109", "name": "ذخیره کاهش ارزش موجودی", "kind": "leaf", "active": True, "role": "inventory_nrv_allowance"})
    nrv_exp = save_account(db, cid, u, {"code": "6109", "name": "هزینه کاهش ارزش موجودی", "kind": "leaf", "active": True, "role": "inventory_nrv_expense"})
    nrv_rec = save_account(db, cid, u, {"code": "7109", "name": "برگشت ذخیره کاهش ارزش", "kind": "leaf", "active": True, "role": "inventory_nrv_recovery"})
    nrv_draft_res = create_nrv_adjustment_draft(
        db,
        cid,
        u,
        {
            "period_id": p.id,
            "date": today,
            "description": "ذخیره کاهش ارزش پایان دوره",
            "items": [
                {
                    "item_id": item_b["id"],
                    "warehouse_id": wh["id"],
                    "estimated_selling_price_irr": "1800",
                    "estimated_selling_cost_irr": "300",
                }
            ],
        },
    )
    assert nrv_draft_res["financial_effect"] is False
    dlines = nrv_draft_res["draft"]["lines"]
    assert len(dlines) == 2
    assert dlines[0]["account_id"] == nrv_exp["id"] and dlines[0]["debit"] == "1500"
    assert dlines[1]["account_id"] == nrv_allow["id"] and dlines[1]["credit"] == "1500"
    # Recovery capped at prior write-down if NRV rises back above cost
    rec_draft_res = create_nrv_adjustment_draft(
        db,
        cid,
        u,
        {
            "period_id": p.id,
            "date": today,
            "description": "برگشت ذخیره کاهش ارزش",
            "items": [
                {
                    "item_id": item_b["id"],
                    "warehouse_id": wh["id"],
                    "estimated_selling_price_irr": "2500",
                    "estimated_selling_cost_irr": "100",
                    "prior_write_down_irr": "1500",
                }
            ],
        },
    )
    rlines = rec_draft_res["draft"]["lines"]
    assert rlines[0]["account_id"] == nrv_allow["id"] and rlines[0]["debit"] == "1500"
    assert rlines[1]["account_id"] == nrv_rec["id"] and rlines[1]["credit"] == "1500"


def test_acc06_commercial_replacement_compatibility(trade_env, db_session):
    """ACC-06: service-only multi-line mixed commercial replacement is adoptable; goods-bearing or mismatched journals are rejected."""
    from didban.errors import DomainError
    from didban.native_invoice_revisions import adopt, candidates
    from didban.posting_service import create_replacement, create_reversal

    db = db_session
    cid = trade_env["company_id"]
    u = trade_env["user"]
    p = trade_env["period"]
    accs = trade_env["accs"]
    customer = trade_env["customer"]
    wh = trade_env["wh"]
    item_a = trade_env["item_a"]
    today = date.today()

    # 1) Service-only multi-line mixed commercial sale (cash 400 + on_account 600 = 1000)
    srv = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "sale",
            "period_id": p.id,
            "issue_date": today,
            "party_id": customer["id"],
            "currency": "IRR",
            "settlement_type": "mixed",
            "cash_amount": "400",
            "cheque_amount": "0",
            "on_account_amount": "600",
            "cash_account_id": accs["cash"].id,
            "counterparty_account_id": accs["ar"].id,
            "service_revenue_account_id": accs["sales"].id,
            "lines": [
                {"line_kind": "service", "description": "خدمات ۱", "quantity": 1, "unit_price": "700"},
                {"line_kind": "service", "description": "خدمات ۲", "quantity": 1, "unit_price": "300"},
            ],
        },
    )
    from didban.commercial_doc_service import get_document

    _post(db, cid, u, srv)
    posted_srv = get_document(db, cid, u, srv["document"]["id"])
    orig_journal_id = posted_srv["journal_id"]
    ni_id = posted_srv["native_invoice_id"]
    assert ni_id is not None and orig_journal_id is not None

    # Reverse and prepare a replacement journal with matching on_account trade line
    rev_draft = create_reversal(db, cid, u, orig_journal_id, {"date": today, "period_id": p.id, "reason": "اصلاح حساب"})
    _post(db, cid, u, {"draft": rev_draft})
    rep_draft = create_replacement(
        db,
        cid,
        u,
        orig_journal_id,
        {
            "period_id": p.id,
            "date": today,
            "unit": "IRR",
            "description": "سند جایگزین خدماتی",
            "reason": "جایگزینی حساب خدمات",
            "lines": [
                {"account_id": accs["cash"].id, "party_id": customer["id"], "debit": "400", "credit": "0"},
                {"account_id": accs["ar"].id, "party_id": customer["id"], "debit": "600", "credit": "0"},
                {"account_id": accs["sales"].id, "party_id": customer["id"], "debit": "0", "credit": "1000"},
            ],
        },
    )
    from sqlalchemy import select

    from didban.posting_models import NativeJournal

    _post(db, cid, u, {"draft": rep_draft})
    rep_journal_id = db.scalar(select(NativeJournal.id).where(NativeJournal.draft_id == rep_draft["id"]))
    assert rep_journal_id is not None

    cands = candidates(db, cid, u, ni_id)["items"]
    cand = next((c for c in cands if c["journal_id"] == rep_journal_id and c["amount"] == "600"), None)
    assert cand is not None
    adopted = adopt(
        db,
        cid,
        u,
        ni_id,
        {
            "journal_id": rep_journal_id,
            "journal_digest": cand["journal_digest"],
            "approved_draft_version": cand["approved_draft_version"],
            "reason": "جایگزینی سند خدماتی",
        },
        1,
    )
    assert adopted["source"]["journal_id"] == rep_journal_id

    # 2) Goods-bearing commercial purchase cannot be replaced via manual replacement journal without inventory movement
    goods_pur = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "purchase",
            "period_id": p.id,
            "issue_date": today,
            "party_id": trade_env["supplier"]["id"],
            "warehouse_id": wh["id"],
            "currency": "IRR",
            "counterparty_account_id": accs["ap"].id,
            "lines": [{"line_kind": "goods", "item_id": item_a["id"], "description": "کالا", "quantity": 1, "unit_price": "5000"}],
        },
    )
    _post(db, cid, u, goods_pur)
    g_journal_id = get_document(db, cid, u, goods_pur["document"]["id"])["journal_id"]
    g_rev_draft = create_reversal(db, cid, u, g_journal_id, {"date": today, "period_id": p.id, "reason": "برگشت کالا"})
    _post(db, cid, u, {"draft": g_rev_draft})
    with pytest.raises(DomainError) as exc:
        create_replacement(
            db,
            cid,
            u,
            g_journal_id,
            {
                "period_id": p.id,
                "date": today,
                "unit": "IRR",
                "description": "تلاش جایگزینی کالا",
                "reason": "تلاش غیرمجاز",
                "lines": [
                    {"account_id": accs["inv"].id, "party_id": trade_env["supplier"]["id"], "debit": "5000", "credit": "0"},
                    {"account_id": accs["ap"].id, "party_id": trade_env["supplier"]["id"], "debit": "0", "credit": "5000"},
                ],
            },
        )
    assert exc.value.code == "inventory_replacement_required"


def test_d38_vat_in_sale_purchase_and_returns(trade_env, db_session):
    """D38: per-line VAT rate, exact integer IRR rounding, separate sale/purchase VAT accounts, and proportional VAT return."""
    from didban.accounting_models import Account
    from didban.commercial_doc_service import create_commercial_return_draft, get_document
    from didban.errors import DomainError
    from didban.native_reporting_service import save_role

    db = db_session
    cid = trade_env["company_id"]
    u = trade_env["user"]
    p = trade_env["period"]
    accs = trade_env["accs"]
    customer = trade_env["customer"]
    supplier = trade_env["supplier"]
    today = date.today()

    vat_sale_acc = Account(company_id=cid, code="2051", name="مالیات بر ارزش افزوده فروش")
    vat_pur_acc = Account(company_id=cid, code="1051", name="مالیات بر ارزش افزوده خرید")
    db.add_all([vat_sale_acc, vat_pur_acc])
    db.commit()

    # Without VAT account role/explicit ID, nonzero VAT must fail clearly
    with pytest.raises(DomainError) as missing_exc:
        create_commercial_document_draft(
            db,
            cid,
            u,
            {
                "direction": "sale",
                "period_id": p.id,
                "issue_date": today,
                "party_id": customer["id"],
                "currency": "IRR",
                "counterparty_account_id": accs["ar"].id,
                "service_revenue_account_id": accs["sales"].id,
                "lines": [{"line_kind": "service", "description": "خدمت مشمول", "quantity": 1, "unit_price": "10000", "vat_rate_pct": "10"}],
            },
        )
    assert missing_exc.value.code == "vat_account_missing"

    save_role(db, cid, u, vat_sale_acc.id, "vat_sale_payable", 1)
    save_role(db, cid, u, vat_pur_acc.id, "vat_purchase_receivable", 1)

    # 1) Sale with 10% VAT on line 1 (10,000 -> 1,000 VAT) and 0% on line 2 (5,000 -> 0 VAT) => payable 16,000
    sale = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "sale",
            "period_id": p.id,
            "issue_date": today,
            "party_id": customer["id"],
            "currency": "IRR",
            "settlement_type": "mixed",
            "cash_amount": "6000",
            "cheque_amount": "0",
            "on_account_amount": "10000",
            "cash_account_id": accs["cash"].id,
            "counterparty_account_id": accs["ar"].id,
            "service_revenue_account_id": accs["sales"].id,
            "lines": [
                {"line_kind": "service", "description": "خدمت مشمول", "quantity": 2, "unit_price": "5000", "vat_rate_pct": "10"},
                {"line_kind": "service", "description": "خدمت معاف", "quantity": 1, "unit_price": "5000", "vat_rate_pct": "0"},
            ],
        },
    )
    assert sale["document"]["net_amount_irr"] == "15000"
    assert sale["document"]["vat_total_irr"] == "1000"
    assert any(line["account_id"] == vat_sale_acc.id and line["credit"] == "1000" for line in sale["draft"]["lines"])
    _post(db, cid, u, sale)
    posted_sale = get_document(db, cid, u, sale["document"]["id"])
    assert posted_sale["open_balance_irr"] == "10000"

    # Partial return of 1 unit from line 1: net 5,000 + VAT 500 = 5,500 total return
    ret = create_commercial_return_draft(
        db,
        cid,
        u,
        posted_sale["id"],
        {
            "period_id": p.id,
            "date": today,
            "reason": "برگشت نیمی از خدمت مشمول",
            "counterparty_account_id": accs["ar"].id,
            "return_account_id": accs["sales"].id,
            "lines": [{"document_line_id": posted_sale["lines"][0]["id"], "quantity": 1, "condition": "healthy"}],
        },
    )
    assert ret["return"]["vat_total_irr"] == "500"
    assert ret["return"]["total_return_amount_irr"] == "5500"
    assert any(line["account_id"] == vat_sale_acc.id and line["debit"] == "500" for line in ret["draft"]["lines"])
    _post(db, cid, u, ret)

    # 2) Purchase with 10% VAT (20,000 + 2,000 VAT = 22,000 AP)
    pur = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "purchase",
            "period_id": p.id,
            "issue_date": today,
            "party_id": supplier["id"],
            "currency": "IRR",
            "counterparty_account_id": accs["ap"].id,
            "expense_account_id": accs["cogs"].id,
            "lines": [{"line_kind": "service", "description": "خدمت خرید", "quantity": 1, "unit_price": "20000", "vat_rate_pct": "10"}],
        },
    )
    assert pur["document"]["vat_total_irr"] == "2000"
    assert any(line["account_id"] == vat_pur_acc.id and line["debit"] == "2000" for line in pur["draft"]["lines"])
    assert any(line["account_id"] == accs["ap"].id and line["credit"] == "22000" for line in pur["draft"]["lines"])
