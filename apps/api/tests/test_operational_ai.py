"""Tests for Conversational Operations (ChatOps):

Phase 1:
- Persian amount & party extraction
- Operational intent detection
- Conversational draft creation (expense, receipt, payment, sale_service, purchase_service)
- In-chat posting confirmation and permission controls

Phase 2:
- Register received / issued cheque via chat
- Cheque action transition via chat (deposit, return, endorse)
- In-chat cheque listing and due dates inquiry
- Overdue collection reminder generation in chat
- End-to-end API assistant questions route with action cards
"""

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select

from didban import models as m
from didban.accounting_models import Account, Draft
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.cheque_models import Cheque
from didban.native_reporting_models import NativeAccountRole
from didban.operational_orchestrator import (
    detect_operational_intent,
    extract_cheque_number,
    extract_party_name,
    orchestrate_operation,
    parse_persian_amount,
)
from didban.posting_models import NativeJournal
from didban.posting_service import post_batch
from didban.posting_service import preview as posting_preview


@pytest.fixture
def operational_setup(db_session):
    db = db_session
    c_id = f"c-op-{uuid4().hex[:6]}"
    u_id = f"u-op-{uuid4().hex[:6]}"

    user = m.User(id=u_id, email=f"op-{u_id}@example.com", name="Finance User", password_hash="test")
    company = m.Company(id=c_id, name="شرکت تست عملیات چت")
    db.add_all([user, company])
    db.flush()

    db.add(m.Membership(company_id=c_id, user_id=u_id, role="finance_manager"))
    db.add(CompanyAccountingSetup(company_id=c_id, mode="primary", version=1))

    p = m.Period(
        id=f"p-{c_id}",
        company_id=c_id,
        name="دوره مالی جاری",
        start=date(2026, 1, 1),
        end=date(2026, 12, 29),
    )
    db.add(p)

    acc_bank = Account(id=f"acc-bank-{c_id}", company_id=c_id, code="10101", name="بانک ملت جاری")
    acc_exp = Account(id=f"acc-exp-{c_id}", company_id=c_id, code="60101", name="هزینه اجاره دفتر")
    acc_rev = Account(id=f"acc-rev-{c_id}", company_id=c_id, code="40101", name="درآمد خدمات فنی")
    acc_rec = Account(id=f"acc-rec-{c_id}", company_id=c_id, code="10301", name="حساب‌های دریافتنی تجاری")
    acc_pay = Account(id=f"acc-pay-{c_id}", company_id=c_id, code="20101", name="حساب‌های پرداختنی تجاری")
    db.add_all([acc_bank, acc_exp, acc_rev, acc_rec, acc_pay])
    db.flush()

    db.add_all(
        [
            NativeAccountRole(company_id=c_id, account_id=acc_bank.id, role="bank", actor_id=u_id),
            NativeAccountRole(company_id=c_id, account_id=acc_exp.id, role="expense", actor_id=u_id),
            NativeAccountRole(company_id=c_id, account_id=acc_rev.id, role="revenue", actor_id=u_id),
            NativeAccountRole(company_id=c_id, account_id=acc_rec.id, role="trade_receivable", actor_id=u_id),
            NativeAccountRole(company_id=c_id, account_id=acc_pay.id, role="trade_payable", actor_id=u_id),
        ]
    )
    db.flush()

    return user, company, p


def test_persian_amount_parser():
    assert parse_persian_amount("۲۰ میلیون تومان") == (20_000_000, "TOMAN")
    assert parse_persian_amount("۲/۵ میلیون تومان") == (2_500_000, "TOMAN")
    assert parse_persian_amount("۳۰،۰۰۰،۰۰۰ ریال") == (30_000_000, "IRR")
    assert parse_persian_amount("۵۰۰ هزار تومان") == (500_000, "TOMAN")
    assert parse_persian_amount("۱۰ میلیارد ریال") == (10_000_000_000, "IRR")
    assert parse_persian_amount("متن بدون عدد")[0] is None


def test_party_and_cheque_extraction():
    assert extract_party_name("پرداخت به شرکت آرمان مبلغ ۵۰ میلیون تومان") == "آرمان"
    assert extract_party_name("دریافت از مشتری پارس مبلغ ۱۰۰ میلیون") == "پارس"
    assert extract_party_name("فروش خدمات به شرکت سپهر به مبلغ ۸۰ میلیون") == "سپهر"
    assert extract_cheque_number("چک صیادی شماره ۹۸۷۶۵۴۳۲۱ به سررسید دی") == "987654321"
    assert extract_cheque_number("چک شماره ۱۱۲۲۳۳ برگشت خورد") == "112233"


def test_intent_detection():
    assert detect_operational_intent("یک هزینه اجاره به مبلغ ۲۰ میلیون ثبت کن") == "expense"
    assert detect_operational_intent("پرداخت به شرکت آرمان مبلغ ۳۰ میلیون") == "payment"
    assert detect_operational_intent("دریافت از مشتری سپهر ۵۰ میلیون") == "receipt"
    assert detect_operational_intent("تراز آزمایشی ۴ ستونی را نشان بده") == "inquiry_trial_balance"
    assert detect_operational_intent("ریز گردش حساب بانک ملت") == "inquiry_account_statement"
    assert detect_operational_intent("صورت سود و زیان شرکت") == "inquiry_income_statement"
    assert detect_operational_intent("لیست بدهکاران تجاری را بده") == "inquiry_top_debtors"
    assert detect_operational_intent("ثبت چک صیادی به شماره ۱۲۳۴۵۶") == "register_cheque"
    assert detect_operational_intent("چک شماره ۱۲۳۴۵۶ برگشت خورد") == "cheque_action"
    assert detect_operational_intent("لیست چک‌های دریافتی را نشان بده") == "inquiry_cheques"
    assert detect_operational_intent("پیگیری وصول مطالبات و ارسال یادآوری") == "collection_followup"
    assert detect_operational_intent("تأیید کن") == "confirm_post"


def test_create_expense_draft_conversational(db_session, operational_setup):
    db = db_session
    user, company, period = operational_setup

    q = "یک هزینه اجاره به مبلغ ۳۰ میلیون تومان از بانک ملت ثبت کن"
    res = orchestrate_operation(db, company.id, user, q)

    assert res is not None
    assert res["mode"] == "operational_draft"
    assert "پیش‌نویس سند هزینه پرداخت‌شده" in res["answer"]
    assert "۳۰،۰۰۰،۰۰۰ تومان" in res["answer"]
    draft_id = res["draft_id"]
    assert res["action_cards"][0]["target_path"] == f"/accounting?review_draft={draft_id}"
    draft = db.get(Draft, draft_id)
    assert draft is not None
    assert draft.state == "draft"


def test_free_text_cannot_post_or_switch_accounting_mode(db_session, operational_setup):
    db = db_session
    user, company, _period = operational_setup
    result = orchestrate_operation(db, company.id, user, "یک هزینه اجاره به مبلغ ۲۰ میلیون تومان از بانک ملت ثبت کن")
    setup = db.get(CompanyAccountingSetup, company.id)
    if setup:
        setup.mode = "external_analysis"
    mode = setup.mode if setup else None

    response = orchestrate_operation(db, company.id, user, "تأیید کن")

    assert response["mode"] == "operational_clarification"
    assert db.get(Draft, result["draft_id"]).state == "draft"
    assert db.scalar(select(NativeJournal).where(NativeJournal.company_id == company.id)) is None
    current = db.get(CompanyAccountingSetup, company.id)
    assert (current.mode if current else None) == mode


def test_register_and_act_cheque_conversational(db_session, operational_setup):
    db = db_session
    user, company, period = operational_setup

    # 1. Register Cheque
    q_reg = "یک فقره چک دریافتی به شماره صیادی ۹۸۷۶۵۴۳۲۱ به مبلغ ۵۰ میلیون تومان از شرکت بهار بانک ملت ثبت کن"
    res_reg = orchestrate_operation(db, company.id, user, q_reg)

    assert res_reg is not None
    assert res_reg["mode"] == "cheque_registered"
    assert "987654321" in res_reg["answer"]
    assert "۵۰،۰۰۰،۰۰۰ تومان" in res_reg["answer"]
    assert len(res_reg["action_cards"]) > 0

    cheque_id = res_reg["cheque_id"]
    cheque = db.get(Cheque, cheque_id)
    assert cheque is not None
    assert cheque.number == "987654321"
    assert cheque.state == "received"

    # 2. Deposit Cheque
    q_act = "چک شماره ۹۸۷۶۵۴۳۲۱ را به حساب بانک ملت بخوابان"
    res_act = orchestrate_operation(db, company.id, user, q_act)

    assert res_act is not None
    assert res_act["mode"] == "cheque_updated"
    assert "خوابانده‌شده به حساب بانک" in res_act["answer"]

    cheque_updated = db.get(Cheque, cheque_id)
    assert cheque_updated.state == "deposited"


def test_inquiry_cheques_and_collection_followup(db_session, operational_setup):
    db = db_session
    user, company, period = operational_setup

    # Cheque inquiry
    q_chq = "لیست چک‌های دریافتی شرکت را نشان بده"
    res_chq = orchestrate_operation(db, company.id, user, q_chq)
    assert res_chq is not None
    assert res_chq["mode"] == "cheque_inquiry"

    # Collection followup reminder
    q_col = "متن پیگیری وصول مطالبات برای شرکت آرمان بساز"
    res_col = orchestrate_operation(db, company.id, user, q_col)
    assert res_col is not None
    assert res_col["mode"] == "collection_followup"
    assert "آرمان" in res_col["answer"]
    assert "پیش‌نویس پیامک و نامه رسمی" in res_col["answer"]
    assert len(res_col["action_cards"]) == 2


def test_end_to_end_operational_assistant_api():
    from fastapi.testclient import TestClient

    from didban.api import app
    from didban.config import settings
    from didban.db import transaction
    from didban.security import hasher

    c_id = f"c-api-op-{uuid4().hex[:6]}"
    u_id = f"u-api-op-{uuid4().hex[:6]}"
    email = f"op-{uuid4().hex[:6]}@example.com"
    pwd = "Secret-password-123!"

    with transaction() as db:
        user = m.User(id=u_id, email=email, name="Op Tester", password_hash=hasher.hash(pwd))
        company = m.Company(id=c_id, name="شرکت تست عملیات")
        db.add_all([user, company])
        db.flush()
        db.add(m.Membership(company_id=c_id, user_id=u_id, role="finance_manager"))
        db.add(CompanyAccountingSetup(company_id=c_id, mode="primary", version=1))

        p = m.Period(
            id=f"p-{c_id}",
            company_id=c_id,
            name="دوره مالی ۱۴۰۵",
            start=date(2026, 1, 1),
            end=date(2026, 12, 29),
        )
        db.add(p)

        acc_bank = Account(id=f"acc-b-{c_id}", company_id=c_id, code="10101", name="بانک ملت")
        acc_exp = Account(id=f"acc-e-{c_id}", company_id=c_id, code="60101", name="هزینه اجاره")
        db.add_all([acc_bank, acc_exp])
        db.flush()

        db.add_all(
            [
                NativeAccountRole(company_id=c_id, account_id=acc_bank.id, role="bank", actor_id=u_id),
                NativeAccountRole(company_id=c_id, account_id=acc_exp.id, role="expense", actor_id=u_id),
            ]
        )

    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200, login.text
    csrf = login.json()["csrf"]

    base = f"/api/v1/companies/{c_id}"
    headers = {"X-CSRF-Token": csrf, "Idempotency-Key": str(uuid4()), "Origin": settings.web_origin}
    body = {"question": "یک هزینه اجاره به مبلغ ۱۵ میلیون تومان از بانک ملت ثبت کن"}
    res = client.post(base + "/assistant/questions", json=body, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["mode"] == "operational_draft"
    assert data["action_cards"][0]["target_path"] == f"/accounting?review_draft={data['draft_id']}"
    retry = client.post(base + "/assistant/questions", json=body, headers=headers)
    assert retry.json() == data
    changed = client.post(base + "/assistant/questions", json={"question": "تأیید کن"}, headers=headers)
    assert changed.status_code == 409

    headers["Idempotency-Key"] = str(uuid4())
    confirmation = client.post(base + "/assistant/questions", json={"question": "تأیید کن"}, headers=headers)
    assert confirmation.json()["mode"] == "operational_clarification"
    with transaction(c_id) as db:
        setup = db.get(CompanyAccountingSetup, c_id)
        if not setup:
            db.add(CompanyAccountingSetup(company_id=c_id, mode="primary"))
        else:
            setup.mode = "primary"
        assert len(db.scalars(select(Draft).where(Draft.company_id == c_id)).all()) == 1
        assert db.get(Draft, data["draft_id"]).state == "draft"

    preview = client.get(base + f"/accounting/drafts/{data['draft_id']}/posting-preview").json()
    headers["Idempotency-Key"] = str(uuid4())
    posting = client.post(
        base + "/accounting/postings",
        json={"items": [{key: preview[key] for key in ("draft_id", "expected_version", "digest")}]},
        headers=headers,
    )
    assert posting.status_code == 201, posting.text

    # 3. Register cheque via chat API
    res_chq = client.post(
        f"/api/v1/companies/{c_id}/assistant/questions",
        json={
            "question": "یک فقره چک دریافتی به شماره صیادی ۱۲۳۴۵۶ به مبلغ ۳۰ میلیون تومان از شرکت پرواز ثبت کن"
        },
        headers={
            "X-CSRF-Token": csrf,
            "Idempotency-Key": f"key-{uuid4().hex[:8]}",
            "Origin": settings.web_origin,
        },
    )
    assert res_chq.status_code == 200, res_chq.text
    assert res_chq.json()["mode"] == "cheque_registered"

    # 4. Trial balance reporting table via chat API
    res_tb = client.post(
        f"/api/v1/companies/{c_id}/assistant/questions",
        json={"question": "تراز آزمایشی را نشان بده"},
        headers={
            "X-CSRF-Token": csrf,
            "Idempotency-Key": f"key-{uuid4().hex[:8]}",
            "Origin": settings.web_origin,
        },
    )
    assert res_tb.status_code == 200, res_tb.text
    data_tb = res_tb.json()
    assert data_tb["mode"] == "inquiry_trial_balance"
    assert "data_table" in data_tb
    assert len(data_tb["data_table"]["columns"]) == 5
    assert len(data_tb["data_table"]["rows"]) > 0

    # 5. Ledger account statement table via chat API
    res_stmt = client.post(
        f"/api/v1/companies/{c_id}/assistant/questions",
        json={"question": "ریز گردش حساب بانک ملت را نشان بده"},
        headers={
            "X-CSRF-Token": csrf,
            "Idempotency-Key": f"key-{uuid4().hex[:8]}",
            "Origin": settings.web_origin,
        },
    )
    assert res_stmt.status_code == 200, res_stmt.text
    data_stmt = res_stmt.json()
    assert data_stmt["mode"] == "inquiry_account_statement"
    assert "data_table" in data_stmt
    assert len(data_stmt["data_table"]["rows"]) > 0


def test_reporting_data_tables_orchestration(operational_setup, db_session):
    user, company, period = operational_setup
    db = db_session

    # 1. Empty state tests
    res_tb_empty = orchestrate_operation(db, company.id, user, "تراز آزمایشی را نشان بده")
    assert res_tb_empty["mode"] == "inquiry_trial_balance"
    assert "هیچ سند قطعی حسابداری در این دوره ثبت نشده است" in res_tb_empty["answer"]

    # 2. Create and post operations
    res_exp = orchestrate_operation(
        db, company.id, user, "یک هزینه اجاره به مبلغ ۲۰ میلیون تومان از بانک ملت ثبت کن"
    )
    assert res_exp["mode"] == "operational_draft"
    setup = db.get(CompanyAccountingSetup, company.id)
    if not setup:
        db.add(CompanyAccountingSetup(company_id=company.id, mode="primary"))
    else:
        setup.mode = "primary"
    db.flush()
    posting_fields = ("draft_id", "expected_version", "digest")
    preview = posting_preview(db, company.id, user, res_exp["draft_id"])
    post_batch(db, company.id, user, [{key: preview[key] for key in posting_fields}])

    res_sale = orchestrate_operation(
        db, company.id, user, "فروش خدمات به مبلغ ۵۰ میلیون تومان به آرمان ثبت کن"
    )
    assert res_sale["mode"] == "operational_draft"
    preview = posting_preview(db, company.id, user, res_sale["draft_id"])
    post_batch(db, company.id, user, [{key: preview[key] for key in posting_fields}])

    # 3. Test Trial Balance reporting table
    res_tb = orchestrate_operation(db, company.id, user, "تراز آزمایشی ۴ ستونی را نشان بده")
    assert res_tb["mode"] == "inquiry_trial_balance"
    assert "data_table" in res_tb
    dt = res_tb["data_table"]
    assert "تراز آزمایشی" in dt["title"]
    assert len(dt["columns"]) == 5
    assert len(dt["rows"]) >= 3
    assert dt["summary"]["code"] == "جمع کل"
    assert dt["summary"]["balance"] == "۰"  # Balanced double-entry

    # 4. Test Ledger Account Statement table
    res_stmt = orchestrate_operation(db, company.id, user, "ریز گردش حساب بانک ملت")
    assert res_stmt["mode"] == "inquiry_account_statement"
    assert "data_table" in res_stmt
    dt_stmt = res_stmt["data_table"]
    assert "بانک ملت" in dt_stmt["title"]
    assert len(dt_stmt["columns"]) == 6
    assert len(dt_stmt["rows"]) >= 1
    assert dt_stmt["rows"][0]["credit"] != "—"  # Expense payment credited bank

    # 5. Test Income Statement table
    res_inc = orchestrate_operation(db, company.id, user, "صورت سود و زیان شرکت را نشان بده")
    assert res_inc["mode"] == "inquiry_income_statement"
    assert "data_table" in res_inc
    dt_inc = res_inc["data_table"]
    assert "صورت سود و زیان" in dt_inc["title"]
    assert len(dt_inc["rows"]) == 3
    assert dt_inc["rows"][0]["id"] == "rev"
    assert dt_inc["rows"][1]["id"] == "exp"
    assert dt_inc["rows"][2]["id"] == "profit"

    # 6. Test Debtors Ranking table
    res_debtors = orchestrate_operation(db, company.id, user, "لیست بدهکاران تجاری شرکت")
    assert res_debtors["mode"] == "inquiry_top_debtors"
    assert "data_table" in res_debtors
    dt_debt = res_debtors["data_table"]
    assert "جدول بدهکاران" in dt_debt["title"]
    assert len(dt_debt["rows"]) >= 1
    assert "آرمان" in dt_debt["rows"][0]["party"]
    assert len(res_debtors["action_cards"]) == 2
