"""Comprehensive tests for:
1. Mixed Settlement Engine (ACC-02)
2. Liquidity Cliff Early Warning Detection
3. COGS & Negative Margin Anomaly Detection
4. Action Cards in Analytical Explanations
5. Financial ETag / Cache Key Generation & Invalidation
"""

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.analytical_explanations import format_analytical_response
from didban.cheque_models import Cheque
from didban.commercial_service import add_counterparty, convert_proforma, create_proforma
from didban.errors import DomainError
from didban.financial_decomposition_service import (
    detect_cogs_and_margin_anomalies,
    detect_liquidity_cliff,
)
from didban.inventory_models import InventoryMovement
from didban.inventory_service import add_item, add_warehouse, create_opening_stock_draft
from didban.native_reporting_models import NativeAccountRole
from didban.native_reporting_service import financial_etag
from didban.operation_models import OperationDraft
from didban.operation_service import validate_and_build_settlement_lines
from didban.posting_models import NativeJournal
from didban.posting_service import post_batch, preview


@pytest.fixture
def env(db_session):
    u = m.User(
        id=str(uuid4()),
        email="finance_eng@example.com",
        name="Finance Engineer",
        password_hash="fake",
    )
    c = m.Company(id=str(uuid4()), name="شرکت تست دیدبان مالی", timezone="Asia/Tehran")
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
        name=f"دوره {cur_year}",
        start=date(cur_year, 1, 1),
        end=date(cur_year, 12, 29),
    )
    setup = CompanyAccountingSetup(company_id=c.id, mode="primary")

    # Accounts
    bank_acc = Account(company_id=c.id, code="1010", name="بانک ملت")
    notes_recv_acc = Account(company_id=c.id, code="1020", name="اسناد دریافتنی تجاری")
    notes_pay_acc = Account(company_id=c.id, code="2020", name="اسناد پرداختنی تجاری")
    recv_acc = Account(company_id=c.id, code="1030", name="حساب‌های دریافتنی تجاری")
    pay_acc = Account(company_id=c.id, code="2010", name="حساب‌های پرداختنی تجاری")
    inv_acc = Account(company_id=c.id, code="1015", name="موجودی کالا")
    sales_acc = Account(company_id=c.id, code="6010", name="درآمد فروش")
    cogs_acc = Account(company_id=c.id, code="7010", name="بهای تمام‌شده کالای فروش‌رفته")
    equity_acc = Account(company_id=c.id, code="3010", name="سرمایه اولیه")

    db_session.add_all(
        [
            u,
            c,
            membership,
            period,
            setup,
            bank_acc,
            notes_recv_acc,
            notes_pay_acc,
            recv_acc,
            pay_acc,
            inv_acc,
            sales_acc,
            cogs_acc,
            equity_acc,
        ]
    )
    db_session.commit()

    # Assign explicit native roles
    roles = [
        NativeAccountRole(company_id=c.id, account_id=bank_acc.id, role="bank", actor_id=u.id),
        NativeAccountRole(company_id=c.id, account_id=notes_recv_acc.id, role="other_asset", actor_id=u.id),
        NativeAccountRole(
            company_id=c.id, account_id=notes_pay_acc.id, role="other_liability", actor_id=u.id
        ),
        NativeAccountRole(company_id=c.id, account_id=recv_acc.id, role="trade_receivable", actor_id=u.id),
        NativeAccountRole(company_id=c.id, account_id=pay_acc.id, role="trade_payable", actor_id=u.id),
        NativeAccountRole(company_id=c.id, account_id=inv_acc.id, role="other_asset", actor_id=u.id),
        NativeAccountRole(company_id=c.id, account_id=sales_acc.id, role="revenue", actor_id=u.id),
        NativeAccountRole(company_id=c.id, account_id=cogs_acc.id, role="expense", actor_id=u.id),
        NativeAccountRole(company_id=c.id, account_id=equity_acc.id, role="equity", actor_id=u.id),
    ]
    db_session.add_all(roles)
    db_session.commit()

    wh = add_warehouse(db_session, c.id, u, {"code": "WH-MIXED-1", "name": "انبار مرکزی"})
    it = add_item(
        db_session,
        c.id,
        u,
        {"code": "ITEM-MIXED-1", "name": "کالای دیجیتال"},
    )

    return {
        "user": u,
        "company": c,
        "period": period,
        "warehouse": wh,
        "item": it,
        "accounts": {
            "bank": bank_acc,
            "notes_receivable": notes_recv_acc,
            "notes_payable": notes_pay_acc,
            "receivable": recv_acc,
            "payable": pay_acc,
            "inventory": inv_acc,
            "sales": sales_acc,
            "cogs": cogs_acc,
            "equity": equity_acc,
        },
    }


# =====================================================================
# 1. ACC-02 Mixed Settlement Engine Tests
# =====================================================================


def test_mixed_settlement_validation_exact_sums(env):
    accounts = env["accounts"]

    # Invariant: cash_amount + cheque_amount + on_account_amount == total
    # Total = 1,000,000; cash = 300,000; cheque = 500,000; on_account = 100,000 -> Sum = 900,000 (Mismatch!)
    with pytest.raises(DomainError) as err:
        validate_and_build_settlement_lines(
            direction="sale",
            total_amount="1000000",
            settlement_type="mixed",
            cash_amount="300000",
            cheque_amount="500000",
            on_account_amount="100000",
            cash_account_id=accounts["bank"].id,
            cheque_account_id=accounts["notes_receivable"].id,
            counterparty_account_id=accounts["receivable"].id,
            cheque_number="CHQ-101",
            cheque_due_date="2026-12-01",
        )
    assert err.value.code == "settlement_sum_mismatch"

    # Negative amount rejected
    with pytest.raises(DomainError) as err:
        validate_and_build_settlement_lines(
            direction="sale",
            total_amount="1000000",
            settlement_type="mixed",
            cash_amount="-100000",
            cheque_amount="600000",
            on_account_amount="500000",
            cash_account_id=accounts["bank"].id,
            cheque_account_id=accounts["notes_receivable"].id,
            counterparty_account_id=accounts["receivable"].id,
            cheque_number="CHQ-101",
            cheque_due_date="2026-12-01",
        )
    assert err.value.code in ("invalid_amount", "operation_negative")


def test_mixed_settlement_missing_accounts_and_metadata(env):
    accounts = env["accounts"]

    # cash_amount > 0 but cash_account_id missing
    with pytest.raises(DomainError) as err:
        validate_and_build_settlement_lines(
            direction="sale",
            total_amount="1000000",
            settlement_type="mixed",
            cash_amount="400000",
            cheque_amount="600000",
            on_account_amount="0",
            cash_account_id="",
            cheque_account_id=accounts["notes_receivable"].id,
            cheque_number="CHQ-101",
            cheque_due_date="2026-12-01",
        )
    assert err.value.code == "cash_account_required"

    # cheque_amount > 0 but cheque_account_id missing
    with pytest.raises(DomainError) as err:
        validate_and_build_settlement_lines(
            direction="sale",
            total_amount="1000000",
            settlement_type="mixed",
            cash_amount="400000",
            cheque_amount="600000",
            on_account_amount="0",
            cash_account_id=accounts["bank"].id,
            cheque_account_id="",
            cheque_number="CHQ-101",
            cheque_due_date="2026-12-01",
        )
    assert err.value.code == "cheque_account_required"

    # cheque_amount > 0 but cheque_number missing
    with pytest.raises(DomainError) as err:
        validate_and_build_settlement_lines(
            direction="sale",
            total_amount="1000000",
            settlement_type="mixed",
            cash_amount="400000",
            cheque_amount="600000",
            on_account_amount="0",
            cash_account_id=accounts["bank"].id,
            cheque_account_id=accounts["notes_receivable"].id,
            cheque_number="",
            cheque_due_date="2026-12-01",
        )
    assert err.value.code == "cheque_number_required"

    # cheque_amount > 0 but cheque_due_date missing
    with pytest.raises(DomainError) as err:
        validate_and_build_settlement_lines(
            direction="sale",
            total_amount="1000000",
            settlement_type="mixed",
            cash_amount="400000",
            cheque_amount="600000",
            on_account_amount="0",
            cash_account_id=accounts["bank"].id,
            cheque_account_id=accounts["notes_receivable"].id,
            cheque_number="CHQ-101",
            cheque_due_date=None,
        )
    assert err.value.code == "cheque_due_date_required"

    # on_account_amount > 0 but counterparty_account_id missing
    with pytest.raises(DomainError) as err:
        validate_and_build_settlement_lines(
            direction="sale",
            total_amount="1000000",
            settlement_type="mixed",
            cash_amount="400000",
            cheque_amount="0",
            on_account_amount="600000",
            cash_account_id=accounts["bank"].id,
            counterparty_account_id="",
        )
    assert err.value.code == "counterparty_account_required"


def test_mixed_settlement_lines_generation(env):
    accounts = env["accounts"]

    # Valid mixed settlement lines for sale
    lines = validate_and_build_settlement_lines(
        direction="sale",
        total_amount="1000000",
        settlement_type="mixed",
        cash_amount="200000",
        cheque_amount="500000",
        on_account_amount="300000",
        cash_account_id=accounts["bank"].id,
        cheque_account_id=accounts["notes_receivable"].id,
        counterparty_account_id=accounts["receivable"].id,
        party_id="CUST-100",
        cheque_number="CHQ-7788",
        cheque_due_date="2026-11-30",
    )
    assert len(lines) == 3
    # Check debits match components
    assert lines[0]["account_id"] == accounts["bank"].id
    assert lines[0]["debit"] == "200000" and lines[0]["credit"] == "0"
    assert lines[1]["account_id"] == accounts["notes_receivable"].id
    assert lines[1]["debit"] == "500000" and lines[1]["credit"] == "0"
    assert lines[2]["account_id"] == accounts["receivable"].id
    assert lines[2]["debit"] == "300000" and lines[2]["credit"] == "0"
    assert lines[2]["party_id"] == "CUST-100"


def test_convert_proforma_mixed_settlement(env, db_session):
    u = env["user"]
    c = env["company"]
    p = env["period"]
    wh = env["warehouse"]
    it = env["item"]
    accounts = env["accounts"]

    # Initial opening stock so sale doesn't fail capacity
    op_res = create_opening_stock_draft(
        db_session,
        c.id,
        u,
        {
            "item_id": it["id"],
            "warehouse_id": wh["id"],
            "quantity": 100,
            "unit_price": "50000",
            "period_id": p.id,
            "source_reference": "OPEN-STOCK-01",
            "equity_account_id": accounts["equity"].id,
        },
    )
    prev_op = preview(db_session, c.id, u, op_res["draft"]["id"])
    post_batch(db_session, c.id, u, [prev_op])

    party = add_counterparty(db_session, c.id, u, {"name": "مشتری آزمایشی"})
    # Create proforma
    pf_res = create_proforma(
        db_session,
        c.id,
        u,
        {
            "number": "PF-MIXED-001",
            "direction": "sale",
            "date": date.today(),
            "expiry_date": date.today() + timedelta(days=30),
            "party_id": party["id"],
            "currency": "IRR",
            "lines": [
                {
                    "item_id": it["id"],
                    "description": "کالای بازرگانی",
                    "quantity": 10,
                    "unit_price": "100000",  # Total 1,000,000 IRR
                }
            ],
        },
    )

    # Convert with mixed settlement: cash 300,000 + cheque 500,000 + on_account 200,000 = 1,000,000
    conv_data = {
        "warehouse_id": wh["id"],
        "period_id": p.id,
        "source_reference": "CONV-PF-MIXED-1",
        "settlement_type": "mixed",
        "cash_amount": "300000",
        "cheque_amount": "500000",
        "on_account_amount": "200000",
        "cash_account_id": accounts["bank"].id,
        "cheque_account_id": accounts["notes_receivable"].id,
        "counterparty_account_id": accounts["receivable"].id,
        "revenue_account_id": accounts["sales"].id,
        "cost_account_id": accounts["cogs"].id,
        "cheque_number": "CHQ-8899",
        "cheque_due_date": date.today() + timedelta(days=20),
    }

    result = convert_proforma(db_session, c.id, u, pf_res["id"], 1, conv_data)
    assert result["operation_id"] is not None

    draft = result["draft"]
    lines = draft["lines"]
    # Check that lines are balanced: debits == credits
    total_debit = sum(Decimal(line["debit"]) for line in lines)
    total_credit = sum(Decimal(line["credit"]) for line in lines)
    assert total_debit == total_credit

    # Preview posting to verify ledger balance
    prev = preview(db_session, c.id, u, draft["id"])
    assert prev["digest"] is not None
    assert prev["draft_id"] == draft["id"]
    # Check that preview lines are balanced
    snap_lines = prev["snapshot"]["lines"]
    assert sum(Decimal(ln["debit"]) for ln in snap_lines) == sum(Decimal(ln["credit"]) for ln in snap_lines)


# =====================================================================
# 2. Liquidity Cliff Early Warning Detection Tests
# =====================================================================


def test_detect_liquidity_cliff_with_cliff(env, db_session):
    c = env["company"]
    accounts = env["accounts"]
    today = date.today()

    # Create starting cash via journal (1,000,000 IRR in bank)
    j = NativeJournal(
        id=str(uuid4()),
        company_id=c.id,
        period_id=env["period"].id,
        draft_id=str(uuid4()),
        draft_version=1,
        actor_id=env["user"].id,
        permission_provenance={},
        date=today,
        sequence=1,
        digest="sha256-initial-cash",
        snapshot={
            "period_id": env["period"].id,
            "lines": [
                {"account_id": accounts["bank"].id, "debit": "1000000", "credit": "0"},
                {"account_id": accounts["equity"].id, "debit": "0", "credit": "1000000"},
            ],
        },
    )
    db_session.add(j)

    # 1. Add upcoming issued cheque (payable 1,500,000 IRR due in 10 days) -> Exceeds cash!
    cheque_payable = Cheque(
        id=str(uuid4()),
        company_id=c.id,
        direction="issued",
        number="CHQ-OUT-101",
        bank_name="بانک صادرات",
        bank_account="0101010101",
        party_id="SUPPLIER-X",
        amount="1500000",
        original_amount="1500000",
        original_unit="IRR",
        issue_date=today,
        due_date=today + timedelta(days=10),
        state="registered",
        actor_id=env["user"].id,
    )
    db_session.add(cheque_payable)

    # 2. Add payroll obligation (due in 5 days, 500,000 IRR)
    payroll_op = OperationDraft(
        id=str(uuid4()),
        company_id=c.id,
        draft_id=str(uuid4()),
        kind="payroll",
        source_reference="PAYROLL-DRAFT-01",
        payload={
            "party_id": "EMP-01",
            "date": (today + timedelta(days=5)).isoformat(),
            "amounts": {"net_pay": "500000"},
        },
        actor_id=env["user"].id,
        policy_version="v1",
    )
    db_session.add(payroll_op)
    db_session.commit()

    # Detect cliff with threshold 0 IRR
    cliff_res = detect_liquidity_cliff(db_session, c.id, as_of=today, threshold_irr="0")
    assert cliff_res["cliff_detected"] is True
    assert cliff_res["cliff_date"] == (today + timedelta(days=10)).isoformat()
    # At day 5: 1,000,000 - 500,000 = 500,000
    # At day 10: 500,000 - 1,500,000 = -1,000,000 -> shortfall = 1,000,000
    assert Decimal(cliff_res["shortfall_irr"]) == Decimal("1000000")
    assert len(cliff_res["contributing_obligations"]) >= 2
    assert len(cliff_res["recovery_recommendations"]) >= 1


def test_detect_liquidity_cliff_no_cliff(env, db_session):
    c = env["company"]
    accounts = env["accounts"]
    today = date.today()

    # Generous starting cash: 10,000,000 IRR
    j = NativeJournal(
        id=str(uuid4()),
        company_id=c.id,
        period_id=env["period"].id,
        draft_id=str(uuid4()),
        draft_version=1,
        actor_id=env["user"].id,
        permission_provenance={},
        date=today,
        sequence=10,
        digest="sha256-high-cash",
        snapshot={
            "period_id": env["period"].id,
            "lines": [
                {"account_id": accounts["bank"].id, "debit": "10000000", "credit": "0"},
                {"account_id": accounts["equity"].id, "debit": "0", "credit": "10000000"},
            ],
        },
    )
    db_session.add(j)

    # Small cheque payable: 200,000 IRR
    small_chq = Cheque(
        id=str(uuid4()),
        company_id=c.id,
        direction="issued",
        number="CHQ-SMALL-01",
        bank_name="بانک سپه",
        bank_account="02020202",
        party_id="SUPPLIER-Y",
        amount="200000",
        original_amount="200000",
        original_unit="IRR",
        issue_date=today,
        due_date=today + timedelta(days=7),
        state="registered",
        actor_id=env["user"].id,
    )
    db_session.add(small_chq)
    db_session.commit()

    cliff_res = detect_liquidity_cliff(db_session, c.id, as_of=today, threshold_irr="0")
    assert cliff_res["cliff_detected"] is False
    assert cliff_res["cliff_date"] is None
    assert cliff_res["shortfall_irr"] == "0"


# =====================================================================
# 3. COGS & Negative Margin Anomaly Detection Tests
# =====================================================================


def test_cogs_price_spike_and_negative_margin_anomalies(env, db_session):
    c = env["company"]
    it = env["item"]
    wh = env["warehouse"]
    today = date.today()

    # 1. Historical purchase baseline: 10 units @ 100,000 IRR
    mv1 = InventoryMovement(
        company_id=c.id,
        item_id=it["id"],
        warehouse_id=wh["id"],
        journal_id=str(uuid4()),
        operation_id=str(uuid4()),
        kind="purchase_goods",
        date=today - timedelta(days=20),
        sequence=1,
        quantity=10,
        value_irr="1000000",  # 100,000 / unit
        evidence={"unit_price_irr": "100000", "quantity": 10},
    )
    # 2. Purchase with price spike: 5 units @ 140,000 IRR (> 1.20x of 100,000)
    mv2 = InventoryMovement(
        company_id=c.id,
        item_id=it["id"],
        warehouse_id=wh["id"],
        journal_id=str(uuid4()),
        operation_id=str(uuid4()),
        kind="purchase_goods",
        date=today - timedelta(days=10),
        sequence=2,
        quantity=5,
        value_irr="700000",  # 140,000 / unit (40% spike)
        evidence={"unit_price_irr": "140000", "quantity": 5},
    )
    # 3. Sale with negative margin: sale unit price = 80,000 IRR < FIFO consumed unit cost (100,000 IRR)
    mv3 = InventoryMovement(
        company_id=c.id,
        item_id=it["id"],
        warehouse_id=wh["id"],
        journal_id=str(uuid4()),
        operation_id=str(uuid4()),
        kind="sale_goods",
        date=today - timedelta(days=5),
        sequence=3,
        quantity=-2,
        value_irr="-200000",  # FIFO cost consumed = 200,000 / 2 = 100,000 / unit
        evidence={"unit_price_irr": "80000", "quantity": -2},  # Sold for 80,000 / unit
    )
    db_session.add_all([mv1, mv2, mv3])
    db_session.commit()

    anomalies = detect_cogs_and_margin_anomalies(db_session, c.id)
    assert len(anomalies) == 2

    types = {a["anomaly_type"] for a in anomalies}
    assert "purchase_price_spike" in types
    assert "negative_gross_margin" in types

    spike = next(a for a in anomalies if a["anomaly_type"] == "purchase_price_spike")
    assert spike["item_id"] == it["id"]
    assert spike["severity"] in ("high", "critical")
    assert spike["exact_amounts"]["spike_percentage"] == 40.0

    neg_margin = next(a for a in anomalies if a["anomaly_type"] == "negative_gross_margin")
    assert neg_margin["item_id"] == it["id"]
    assert neg_margin["severity"] == "critical"
    assert Decimal(neg_margin["exact_amounts"]["loss_per_unit_irr"]) == Decimal("20000")
    assert Decimal(neg_margin["exact_amounts"]["total_loss_irr"]) == Decimal("40000")


# =====================================================================
# 4. Action Cards in Analytical Explanations Tests
# =====================================================================


def test_action_cards_in_analytical_explanations():
    # Test receivables_analysis cards
    receivables_resp = {
        "intent": "receivables_analysis",
        "answer": "تحلیل مطالبات",
        "suggested_actions": ["پیگیری فاکتورها"],
    }
    res1 = format_analytical_response(receivables_resp)
    assert "action_cards" in res1
    assert len(res1["action_cards"]) >= 2
    for card in res1["action_cards"]:
        assert all(k in card for k in ("id", "title", "action_type", "target_path", "payload", "variant"))

    # Test cashflow_analysis cards with deficit
    cashflow_resp = {
        "intent": "cashflow_analysis",
        "answer": "کسری نقدینگی در تاریخ مورد نظر رخ می‌دهد",
        "has_deficit": True,
        "suggested_actions": ["تسریع وصول"],
    }
    res2 = format_analytical_response(cashflow_resp)
    assert "action_cards" in res2
    # Verify destructive variant for critical cash deficit
    card1 = res2["action_cards"][0]
    assert card1["variant"] == "destructive"
    assert card1["target_path"] == "/forecast"

    # Test profit_analysis cards
    profit_resp = {
        "intent": "profit_analysis",
        "answer": "کاهش سود به دلیل افزایش هزینه",
        "suggested_actions": ["بررسی هزینه"],
    }
    res3 = format_analytical_response(profit_resp)
    assert "action_cards" in res3
    assert any(c["target_path"] == "/reports/income-statement" for c in res3["action_cards"])


# =====================================================================
# 5. Financial ETag / Cache Key Generation & Invalidation Tests
# =====================================================================


def test_financial_etag_generation_and_invalidation(env, db_session):
    c = env["company"]
    p = env["period"]
    accounts = env["accounts"]

    # Initial ETag
    etag1 = financial_etag(db_session, c.id, p.id)
    assert etag1.startswith('"') and etag1.endswith('"')

    # Calling again without changes produces identical ETag
    assert etag1 == financial_etag(db_session, c.id, p.id)

    # 1. Posting a new journal increments max(sequence) -> ETag must invalidate!
    j1 = NativeJournal(
        id=str(uuid4()),
        company_id=c.id,
        period_id=p.id,
        draft_id=str(uuid4()),
        draft_version=1,
        actor_id=env["user"].id,
        permission_provenance={},
        date=date.today(),
        sequence=50,
        digest="sha256-etag-test-1",
        snapshot={
            "period_id": p.id,
            "lines": [
                {"account_id": accounts["bank"].id, "debit": "1000", "credit": "0"},
                {"account_id": accounts["sales"].id, "debit": "0", "credit": "1000"},
            ],
        },
    )
    db_session.add(j1)
    db_session.commit()

    etag2 = financial_etag(db_session, c.id, p.id)
    assert etag2 != etag1

    # 2. Bumping period version -> ETag must invalidate!
    p.version += 1
    db_session.commit()

    etag3 = financial_etag(db_session, c.id, p.id)
    assert etag3 != etag2

    # 3. Bumping company version -> ETag must invalidate!
    c.version += 1
    db_session.commit()

    etag4 = financial_etag(db_session, c.id, p.id)
    assert etag4 != etag3
