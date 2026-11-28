"""FIN-03: Full-period accounting & closing reference suite."""

from datetime import date, timedelta

from sqlalchemy import select
from test_phase3_commercial_and_returns import _post, trade_env  # noqa: F401

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_service import save_draft
from didban.cheque_service import act as apply_cheque_action
from didban.cheque_service import create as register_cheque
from didban.closing_service import create_closing, create_opening
from didban.commercial_doc_service import create_commercial_document_draft, get_document
from didban.native_reporting_service import (
    calculate_statement,
    declare_opening,
    save_statement,
)
from didban.period_checklist_service import items as checklist_items
from didban.period_lock_service import checklist as period_checklist
from didban.period_lock_service import transition as transition_period
from didban.posting_models import NativeJournal
from didban.posting_service import create_replacement, create_reversal, trial_balance


def test_fin03_complete_period_lifecycle_closing_reopen_and_next_opening(trade_env, db_session):  # noqa: F811
    db = db_session
    cid = trade_env["company_id"]
    u = trade_env["user"]
    p = trade_env["period"]
    accs = trade_env["accs"]
    customer = trade_env["customer"]
    wh = trade_env["wh"]
    item_a = trade_env["item_a"]
    today = date.today()

    # Extra accounts for result/equity & cheque
    result_acc = Account(company_id=cid, code="3090", name="سود و زیان انباشته")
    cheque_acc = Account(company_id=cid, code="1040", name="اسناد دریافتنی")
    db.add_all([result_acc, cheque_acc])
    db.commit()

    from didban.inventory_service import create_opening_stock_draft
    from didban.native_reporting_service import save_role

    save_role(db, cid, u, result_acc.id, "equity", 1)
    save_role(db, cid, u, cheque_acc.id, "other_asset", 1)

    op_stock = create_opening_stock_draft(
        db,
        cid,
        u,
        {
            "period_id": p.id,
            "date": p.start,
            "warehouse_id": wh["id"],
            "item_id": item_a["id"],
            "quantity": 10,
            "unit_price": "2000",
            "equity_account_id": result_acc.id,
        },
    )
    _post(db, cid, u, op_stock)
    op_j = db.scalar(select(NativeJournal).where(NativeJournal.draft_id == op_stock["draft"]["id"]))
    declare_opening(db, cid, u, op_j.id, op_j.digest, "افتتاحیه کالا و سرمایه")

    # 1) Commercial sale with mixed settlement (cash + cheque + on_account)
    sale = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "sale",
            "period_id": p.id,
            "issue_date": today - timedelta(days=5),
            "party_id": customer["id"],
            "warehouse_id": wh["id"],
            "currency": "IRR",
            "settlement_type": "mixed",
            "cash_amount": "2000",
            "cheque_amount": "3000",
            "on_account_amount": "5000",
            "cash_account_id": accs["cash"].id,
            "cheque_account_id": cheque_acc.id,
            "cheque_number": "CHQ-FIN03-1",
            "cheque_due_date": (today + timedelta(days=10)).isoformat(),
            "counterparty_account_id": accs["ar"].id,
            "revenue_account_id": accs["sales"].id,
            "cost_account_id": accs["cogs"].id,
            "lines": [{"line_kind": "goods", "item_id": item_a["id"], "description": "فروش مرجع", "quantity": 2, "unit_price": "5000"}],
        },
    )
    _post(db, cid, u, sale)

    # 2) Register & clear cheque
    chq = register_cheque(
        db,
        cid,
        u,
        {
            "direction": "received",
            "number": "CHQ-FIN03-1",
            "amount": "3000",
            "unit": "IRR",
            "issue_date": today - timedelta(days=5),
            "due_date": today,
                "party_id": customer["id"],
                "bank_name": "بانک ملی",
                "bank_account": "01001",
                "cheque_account_id": cheque_acc.id,
            "cash_account_id": accs["cash"].id,
            "period_id": p.id,
        },
    )
    deposited = apply_cheque_action(db, cid, u, chq["id"], {"action": "deposit", "event_date": today, "period_id": p.id, "cash_account_id": accs["cash"].id, "reason": "واگذاری به بانک"}, chq["version"])
    bm = m.BankMovement(
        id="bm-fin03-1",
        company_id=cid,
        account="01001",
        date=today,
        amount="3000",
        original_amount="3000",
        original_unit="IRR",
        reference="CHQ-FIN03-1",
        party_id=customer["id"],
        kind="movement",
        source_row_id="sr-fin03-1",
        session_id="sess-fin03-1",
    )
    db.add(bm)
    db.add(
        m.ResultManifest(
            id="rm-fin03-1",
            company_id=cid,
            session_id="sess-fin03-1",
            period_id=p.id,
            digest="d-fin03-1",
            selection={"row_ids": ["sr-fin03-1"]},
            metrics=[],
            details={},
        )
    )
    db.flush()
    apply_cheque_action(db, cid, u, chq["id"], {"action": "clear", "event_date": today, "period_id": p.id, "cash_account_id": accs["cash"].id, "bank_id": bm.id, "reason": "وصول چک"}, deposited["version"])

    # 3) Service journal + reversal + replacement
    srv_draft = save_draft(
        db,
        cid,
        u,
        {
            "period_id": p.id,
            "date": today - timedelta(days=1),
            "description": "درآمد خدماتی اولیه",
            "unit": "IRR",
            "lines": [
                {"account_id": accs["cash"].id, "party_id": customer["id"], "debit": "1000", "credit": "0"},
                {"account_id": accs["sales"].id, "party_id": customer["id"], "debit": "0", "credit": "1000"},
            ],
        },
    )
    _post(db, cid, u, {"draft": srv_draft})
    orig_jid = db.scalar(select(NativeJournal.id).where(NativeJournal.draft_id == srv_draft["id"]))
    rev_d = create_reversal(db, cid, u, orig_jid, {"date": today, "period_id": p.id, "reason": "اصلاح"})
    _post(db, cid, u, {"draft": rev_d})
    rep_d = create_replacement(
        db,
        cid,
        u,
        orig_jid,
        {
            "period_id": p.id,
            "date": today,
            "unit": "IRR",
            "description": "درآمد خدماتی اصلاح‌شده",
            "reason": "اصلاح حساب",
            "lines": [
                {"account_id": accs["cash"].id, "party_id": customer["id"], "debit": "1500", "credit": "0"},
                {"account_id": accs["sales"].id, "party_id": customer["id"], "debit": "0", "credit": "1500"},
            ],
        },
    )
    _post(db, cid, u, {"draft": rep_d})

    # 4) Checklist & pre-closing statement snapshot
    chk = checklist_items(db, cid, p.id)
    assert isinstance(chk, list)
    pre_close_stmt = save_statement(db, cid, u, p.id, today)
    pre_close_rev = next(m["value"] for m in pre_close_stmt["snapshot"]["metrics"] if m["metric_key"] == "revenue")
    assert pre_close_rev == "11500"

    # 5) Close temporary accounts (revenue + cogs -> result_acc)
    closing = create_closing(
        db,
        cid,
        u,
        {
            "period_id": p.id,
            "closing_kind": "temporary",
            "account_ids": [accs["sales"].id, accs["cogs"].id],
            "result_account_id": result_acc.id,
            "reason": "بستن حساب‌های موقت پایان دوره",
        },
    )
    _post(db, cid, u, {"draft": closing})
    tb = trial_balance(db, cid, u, p.id)
    assert next(r for r in tb["items"] if r["account_id"] == accs["sales"].id)["balance"] == "0"
    assert next(r for r in tb["items"] if r["account_id"] == accs["cogs"].id)["balance"] == "0"

    # Historical statement snapshot remains immutable after closing
    reloaded_pre = calculate_statement(db, cid, p.id, today)
    reloaded_rev = next(m["value"] for m in reloaded_pre["metrics"] if m["metric_key"] == "revenue")
    assert reloaded_rev == "11500"

    # 6) Lock period -> reopen with reason -> re-lock -> open next period
    chk_close = period_checklist(db, cid, p.id, u)
    closed_state = transition_period(
        db, cid, u, p.id, True, "قفل پایان دوره", True, chk_close["version"], chk_close["checklist_digest"]
    )
    assert closed_state["closed"] is True
    reopened_state = transition_period(
        db, cid, u, p.id, False, "بازگشایی جهت بررسی حسابرس", True, closed_state["version"]
    )
    assert reopened_state["closed"] is False
    chk_reclose = period_checklist(db, cid, p.id, u)
    final_closed = transition_period(
        db, cid, u, p.id, True, "قفل نهایی دوره", True, reopened_state["version"], chk_reclose["checklist_digest"]
    )
    assert final_closed["closed"] is True

    next_p = m.Period(
        id="p-next-fin03",
        company_id=cid,
        name="دوره بعد مرجع",
        start=p.end + timedelta(days=1),
        end=p.end + timedelta(days=365),
    )
    db.add(next_p)
    db.flush()

    opening_next = create_opening(
        db,
        cid,
        u,
        {
            "source_period_id": p.id,
            "target_period_id": next_p.id,
            "account_ids": sorted({r["account_id"] for r in tb["items"] if r["balance"] != "0"}),
            "reason": "انتقال مانده‌های ترازنامه‌ای به دوره جدید",
        },
    )
    assert opening_next["date"] == next_p.start
    assert get_document(db, cid, u, sale["document"]["id"])["status"] == "posted"
