"""Synthetic end-to-end verification across Proforma, Commercial Sale, Posting, Treasury Proof/Capacity, Returns, Ledgers, Inventory, Payroll & Closed Period."""

from datetime import date, timedelta
from uuid import uuid4

import pytest

from didban import models as m
from didban.accounting_service import save_account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.commercial_doc_service import (
    create_commercial_return_draft,
    get_document,
)
from didban.commercial_service import (
    add_counterparty,
    convert_proforma,
    create_proforma,
    get_proforma,
)
from didban.errors import DomainError
from didban.inventory_service import (
    add_item,
    add_warehouse,
    create_opening_stock_draft,
    valuation_report,
)
from didban.native_invoice_service import current as list_invoices
from didban.native_invoice_service import detail as invoice_detail
from didban.payroll_service import list_employees
from didban.period_lock_service import checklist as period_checklist
from didban.period_lock_service import transition as lock_period
from didban.posting_service import post_batch, preview, trial_balance
from didban.treasury_service import (
    create_treasury_account,
    create_treasury_document,
    list_treasury_documents,
    prepare_treasury_document_draft,
    reverse_treasury_allocation,
)


def _post(db, company_id: str, user: m.User, draft_res: dict) -> dict:
    draft_id = draft_res["draft"]["id"] if "draft" in draft_res else draft_res["id"]
    prev = preview(db, company_id, user, draft_id)
    return post_batch(
        db,
        company_id,
        user,
        [{"draft_id": draft_id, "expected_version": prev["expected_version"], "digest": prev["digest"]}],
    )


def test_full_synthetic_proforma_sale_post_treasury_return_and_boundaries(db_session):
    db = db_session
    cid = f"c-e2e-{uuid4().hex[:6]}"
    owner = m.User(id=f"u-own-{uuid4().hex[:6]}", email=f"own-{uuid4().hex[:6]}@t.local", name="مالک", password_hash="x", active=True)
    fm = m.User(id=f"u-fm-{uuid4().hex[:6]}", email=f"fm-{uuid4().hex[:6]}@t.local", name="مدیر مالی", password_hash="x", active=True)
    viewer = m.User(id=f"u-vw-{uuid4().hex[:6]}", email=f"vw-{uuid4().hex[:6]}@t.local", name="بیننده", password_hash="x", active=True)
    comp = m.Company(id=cid, name="شرکت آزمون یکپارچه")
    db.add_all([owner, fm, viewer, comp])
    db.flush()
    db.add_all([
        m.Membership(company_id=cid, user_id=owner.id, role="owner", active=True),
        m.Membership(company_id=cid, user_id=fm.id, role="finance_manager", active=True),
        m.Membership(company_id=cid, user_id=viewer.id, role="viewer", active=True),
        CompanyAccountingSetup(company_id=cid, mode="primary"),
    ])
    today = date.today()
    period = m.Period(
        id=f"p-e2e-{uuid4().hex[:6]}",
        company_id=cid,
        name="دوره ۱۴۰۵",
        start=today - timedelta(days=30),
        end=today + timedelta(days=330),
    )
    db.add(period)
    db.flush()

    # Role boundary check: viewer cannot read payroll or post
    with pytest.raises(DomainError) as vw_err:
        list_employees(db, cid, viewer)
    assert vw_err.value.code == "payroll_access_required"

    # Chart of accounts & Treasury & Inventory setup
    acc_bank = save_account(db, cid, owner, {"code": "1101", "name": "بانک", "active": True, "role": "bank"})
    acc_ar = save_account(db, cid, owner, {"code": "1102", "name": "دریافتنی تجاری", "active": True, "role": "trade_receivable"})
    acc_inv = save_account(db, cid, owner, {"code": "1103", "name": "موجودی کالا", "active": True, "role": "other_asset"})
    acc_eq = save_account(db, cid, owner, {"code": "3101", "name": "سرمایه", "active": True, "role": "equity"})
    acc_rev = save_account(db, cid, owner, {"code": "4101", "name": "فروش کالا", "active": True, "role": "revenue"})
    acc_srv_rev = save_account(db, cid, owner, {"code": "4102", "name": "درآمد خدمات", "active": True, "role": "revenue"})
    acc_cogs = save_account(db, cid, owner, {"code": "5101", "name": "بهای تمام‌شده", "active": True, "role": "expense"})

    ta = create_treasury_account(
        db,
        cid,
        owner,
        {"kind": "bank", "name": "بانک اصلی", "account_id": acc_bank["id"], "account_number": "900-1"},
    )
    cp = add_counterparty(db, cid, owner, {"name": "مشتری یکپارچه", "entity_kind": "legal_entity", "roles": ["customer"]})
    wh = add_warehouse(db, cid, owner, {"name": "انبار یک"})
    item = add_item(db, cid, owner, {"name": "کالای آزمون", "base_unit": "عدد", "inventory_account_id": acc_inv["id"]})

    # Opening FIFO stock: 10 units @ 10,000 IRR
    open_stock = create_opening_stock_draft(
        db,
        cid,
        fm,
        {
            "item_id": item["id"],
            "warehouse_id": wh["id"],
            "quantity": 10,
            "unit_price": "10000",
            "unit": "IRR",
            "period_id": period.id,
            "date": today - timedelta(days=5),
            "description": "موجودی اول دوره",
            "equity_account_id": acc_eq["id"],
        },
    )
    _post(db, cid, fm, open_stock)

    # Seed real bank movement (150,000 IRR)
    ps = m.ProcessingSession(company_id=cid, actor_id=owner.id, period_id=period.id, state="completed")
    db.add(ps)
    db.flush()
    sf = m.SourceFile(company_id=cid, session_id=ps.id, name="b.csv", sha256="a" * 64, size=10, storage_key="k", scan_status="clean", row_count=1)
    db.add(sf)
    db.flush()
    sr = m.SourceRow(company_id=cid, file_id=sf.id, sheet="s", row_number=1, values={})
    db.add(sr)
    db.flush()
    bm = m.BankMovement(
        company_id=cid,
        session_id=ps.id,
        source_row_id=sr.id,
        original_unit="IRR",
        original_amount="150000",
        account="900-1",
        date=today,
        amount="150000",
        reference="BM-E2E-150",
        party_id=cp["code"],
        kind="movement",
    )
    db.add(bm)
    db.flush()

    # 1. Proforma -> Issue -> Convert (Goods 3*50,000 + Service 1*100,000 = 250,000)
    pf = create_proforma(
        db,
        cid,
        fm,
        {
            "direction": "sale",
            "date": today - timedelta(days=2),
            "expiry_date": today + timedelta(days=10),
            "party_id": cp["id"],
            "currency": "IRR",
            "lines": [
                {"line_kind": "goods", "item_id": item["id"], "description": "کالای آزمون", "quantity": 3, "unit_price": "50000"},
                {"line_kind": "service", "item_id": None, "description": "خدمات نصب", "quantity": 1, "unit_price": "100000"},
            ],
        },
    )
    conv = convert_proforma(
        db,
        cid,
        fm,
        pf["id"],
        pf["version"],
        {
            "period_id": period.id,
            "issue_date": today - timedelta(days=1),
            "warehouse_id": wh["id"],
            "settlement_type": "on_account",
            "counterparty_account_id": acc_ar["id"],
            "revenue_account_id": acc_rev["id"],
            "service_revenue_account_id": acc_srv_rev["id"],
            "cost_account_id": acc_cogs["id"],
        },
    )
    # Duplicate convert attempt must fail (idempotent/lifecycle guard)
    with pytest.raises(DomainError):
        convert_proforma(db, cid, fm, pf["id"], pf["version"] + 1, {"period_id": period.id})

    # Post exact version
    _post(db, cid, fm, conv)
    pf_after = get_proforma(db, cid, pf["id"])
    assert pf_after["status"] == "converted"
    assert pf_after["converted_document_number"] == conv["document"]["number"]

    # Check FIFO stock decremented (10 -> 7) and NativeInvoice open balance == 250,000
    val = {r["item_id"]: r for r in valuation_report(db, cid, fm)["rows"]}
    assert val[item["id"]]["quantity"] == 7
    assert val[item["id"]]["total_value_irr"] == "70000"

    invs = list_invoices(db, cid, fm, today, direction="sale")["items"]
    sale_inv = next(i for i in invs if i["commercial_document_id"] == conv["document"]["id"])
    assert sale_inv["remaining"] == "250000"

    # 2. Treasury BUG checks:
    # (a) Unproved draft allocation MUST NOT lower invoice remaining
    unproved = create_treasury_document(
        db,
        cid,
        fm,
        {
            "direction": "receipt",
            "date": today,
            "period_id": period.id,
            "party_id": cp["id"],
            "unit": "IRR",
            "description": "پیش‌نویس بدون شاهد",
            "tools": [{"tool_kind": "cash", "treasury_account_id": ta["id"], "amount": "100000"}],
            "allocations": [{"tool_line_index": 0, "invoice_id": sale_inv["id"], "amount": "100000"}],
        },
    )
    assert unproved["has_payment_proof"] is False
    assert invoice_detail(db, cid, fm, sale_inv["id"])["remaining"] == "250000"

    # Reverse with parent version
    rev_unproved = reverse_treasury_allocation(
        db, cid, fm, unproved["allocations"][0]["id"], "برگشت پیش‌نویس بدون شاهد", unproved["version"]
    )
    assert rev_unproved["allocations"][0]["reversed_at"] is not None

    # (b) Two rows in one doc referencing same bank_movement MUST NOT exceed capacity (100k + 60k > 150k)
    with pytest.raises(DomainError) as cap_err:
        create_treasury_document(
            db,
            cid,
            fm,
            {
                "direction": "receipt",
                "date": today,
                "period_id": period.id,
                "party_id": cp["id"],
                "unit": "IRR",
                "description": "مصرف مضاعف گردش بانکی",
                "tools": [
                    {"tool_kind": "bank_transfer", "treasury_account_id": ta["id"], "bank_movement_id": bm.id, "amount": "100000"},
                    {"tool_kind": "bank_transfer", "treasury_account_id": ta["id"], "bank_movement_id": bm.id, "amount": "60000"},
                ],
            },
        )
    assert cap_err.value.code == "bank_movement_capacity"

    # (c) Proved treasury receipt (150,000) reduces remaining to 100,000 once draft is posted
    proved = create_treasury_document(
        db,
        cid,
        fm,
        {
            "direction": "receipt",
            "date": today,
            "period_id": period.id,
            "party_id": cp["id"],
            "unit": "IRR",
            "description": "دریافت دارای شاهد بانکی",
            "tools": [{"tool_kind": "bank_transfer", "treasury_account_id": ta["id"], "bank_movement_id": bm.id, "amount": "150000"}],
            "allocations": [{"tool_line_index": 0, "invoice_id": sale_inv["id"], "amount": "150000"}],
        },
    )
    assert proved["has_payment_proof"] is False
    assert invoice_detail(db, cid, fm, sale_inv["id"])["remaining"] == "250000"
    tdoc_draft = prepare_treasury_document_draft(
        db, cid, fm, proved["id"], {"counterparty_account_id": acc_ar["id"]}, proved["version"]
    )
    _post(db, cid, fm, tdoc_draft)
    proved_posted = next(
        d for d in list_treasury_documents(db, cid, fm)["items"] if d["id"] == proved["id"]
    )
    assert proved_posted["state"] == "posted"
    assert proved_posted["has_payment_proof"] is True
    assert invoice_detail(db, cid, fm, sale_inv["id"])["remaining"] == "100000"
    assert get_document(db, cid, fm, conv["document"]["id"])["open_balance_irr"] == "100000"

    # 3. Return draft: 1 healthy good (50,000)
    goods_line = next(line for line in conv["document"]["lines"] if line["line_kind"] == "goods")
    ret = create_commercial_return_draft(
        db,
        cid,
        fm,
        conv["document"]["id"],
        {
            "period_id": period.id,
            "date": today,
            "reason": "برگشت ۱ عدد کالا",
            "counterparty_account_id": acc_ar["id"],
            "lines": [{"document_line_id": goods_line["id"], "quantity": 1, "condition": "healthy"}],
        },
    )
    _post(db, cid, fm, ret)
    val_after = {r["item_id"]: r for r in valuation_report(db, cid, fm)["rows"]}
    assert val_after[item["id"]]["quantity"] == 8
    tb = {row["code"]: row["balance"] for row in trial_balance(db, cid, fm, period.id)["items"]}
    # AR = 250,000 sale - 150,000 treasury receipt - 50,000 return = 50,000
    assert tb["1102"] == "50000"
    assert tb["1101"] == "150000"

    # 4. Closed period lock blocks new commercial draft
    chk = period_checklist(db, cid, period.id, fm)
    lock_period(db, cid, fm, period.id, True, "قفل آزمون", True, chk["version"], chk.get("checklist_digest"))
    with pytest.raises(DomainError) as closed_err:
        create_commercial_return_draft(
            db,
            cid,
            fm,
            conv["document"]["id"],
            {
                "period_id": period.id,
                "date": today,
                "reason": "تلاش در دوره بسته",
                "counterparty_account_id": acc_ar["id"],
                "lines": [{"document_line_id": goods_line["id"], "quantity": 1, "condition": "healthy"}],
            },
        )
    assert closed_err.value.code in ("period_closed", "period_locked")
