"""Unit and integration tests for counterparty statement reconciliation and Moadian reconciliation."""

from datetime import date
from uuid import uuid4

import pytest

from didban import counterparty_reconciliation_service as service
from didban import models as m
from didban.commercial_service import add_counterparty
from didban.posting_models import NativeJournal


@pytest.fixture
def recon_env(db_session):
    u = m.User(
        id=str(uuid4()),
        email="recon_user@example.com",
        name="Recon Officer",
        password_hash="fake",
    )
    c = m.Company(id=str(uuid4()), name="شرکت تولیدی آزمایشی رایا")
    membership = m.Membership(
        id=str(uuid4()),
        user_id=u.id,
        company_id=c.id,
        role="finance_manager",
        active=True,
    )
    period = m.Period(
        id=str(uuid4()),
        company_id=c.id,
        name="دوره مالی ۱۴۰۳",
        start=date(2024, 1, 1),
        end=date(2024, 12, 29),
    )
    db_session.add_all([u, c, membership, period])
    db_session.commit()

    # Add 2 counterparties
    cp1 = add_counterparty(
        db_session,
        c.id,
        u,
        {
            "code": "CUST-001",
            "name": "شرکت پتروشیمی پویا",
            "national_id": "10102030405",
            "phone": "02188889999",
            "credit_limit_irr": "500000000",
        },
    )

    cp2 = add_counterparty(
        db_session,
        c.id,
        u,
        {
            "code": "SUPP-001",
            "name": "صنایع بسته‌بندی رازی",
            "national_id": "10109998877",
            "phone": "02177776666",
            "credit_limit_irr": "300000000",
        },
    )

    # Add Native Journals with party lines
    j1 = NativeJournal(
        id=str(uuid4()),
        company_id=c.id,
        draft_id=str(uuid4()),
        draft_version=1,
        period_id=period.id,
        date=date(2024, 5, 10),
        sequence=1,
        digest="d1",
        snapshot={
            "summary": "فروش نسیه محصول پلیمری",
            "lines": [
                {
                    "code": "1030",
                    "party_id": cp1["id"],
                    "reference": "INV-101",
                    "description": "فاکتور فروش شماره ۱۰۱",
                    "debit": "100000000",
                    "credit": "0",
                },
                {
                    "code": "6010",
                    "party_id": "",
                    "reference": "INV-101",
                    "description": "درآمد فروش",
                    "debit": "0",
                    "credit": "100000000",
                },
            ],
        },
        actor_id=u.id,
        permission_provenance={},
    )

    j2 = NativeJournal(
        id=str(uuid4()),
        company_id=c.id,
        draft_id=str(uuid4()),
        draft_version=1,
        period_id=period.id,
        date=date(2024, 5, 15),
        sequence=2,
        digest="d2",
        snapshot={
            "summary": "واریز نقدی مشتری به حساب صادرات",
            "lines": [
                {
                    "code": "1010",
                    "party_id": "",
                    "reference": "PAY-201",
                    "description": "واریز بانکی مشتری",
                    "debit": "40000000",
                    "credit": "0",
                },
                {
                    "code": "1030",
                    "party_id": cp1["id"],
                    "reference": "PAY-201",
                    "description": "تسویه قسمتی از فاکتور ۱۰۱",
                    "debit": "0",
                    "credit": "40000000",
                },
            ],
        },
        actor_id=u.id,
        permission_provenance={},
    )

    j3 = NativeJournal(
        id=str(uuid4()),
        company_id=c.id,
        draft_id=str(uuid4()),
        draft_version=1,
        period_id=period.id,
        date=date(2024, 5, 20),
        sequence=3,
        digest="d3",
        snapshot={
            "summary": "فروش تکمیلی",
            "lines": [
                {
                    "code": "1030",
                    "party_id": cp1["id"],
                    "reference": "INV-102",
                    "description": "فاکتور شماره ۱۰۲",
                    "debit": "50000000",
                    "credit": "0",
                },
                {
                    "code": "6010",
                    "party_id": "",
                    "reference": "INV-102",
                    "description": "فروش",
                    "debit": "0",
                    "credit": "50000000",
                },
            ],
        },
        actor_id=u.id,
        permission_provenance={},
    )

    db_session.add_all([j1, j2, j3])
    db_session.commit()

    return {
        "user": u,
        "company": c,
        "period": period,
        "cp1": cp1,
        "cp2": cp2,
    }


def test_list_candidates(recon_env, db_session):
    u = recon_env["user"]
    c = recon_env["company"]
    cp1 = recon_env["cp1"]

    res = service.list_candidates(db_session, c.id, u)
    assert len(res["items"]) >= 2
    p1 = next(item for item in res["items"] if item["id"] == cp1["id"])
    assert p1["name"] == "شرکت پتروشیمی پویا"
    assert p1["transaction_count"] == 3
    assert p1["debit_total"] == "150000000"
    assert p1["credit_total"] == "40000000"
    assert p1["current_balance"] == "110000000"
    assert p1["direction"] == "debtor"


def test_get_counterparty_ledger(recon_env, db_session):
    u = recon_env["user"]
    c = recon_env["company"]
    cp1 = recon_env["cp1"]

    ledger = service.get_counterparty_ledger(db_session, c.id, u, cp1["id"])
    assert len(ledger["entries"]) == 3
    assert ledger["totals"]["debit_total"] == "150000000"
    assert ledger["totals"]["credit_total"] == "40000000"
    assert ledger["totals"]["net_balance"] == "110000000"
    assert ledger["totals"]["direction"] == "debtor"

    # Running balances check
    entries = ledger["entries"]
    assert entries[0]["running_balance"] == "100000000"
    assert entries[1]["running_balance"] == "60000000"
    assert entries[2]["running_balance"] == "110000000"
    db_session.add(m.JournalLine(
        company_id=c.id, source_row_id=str(uuid4()), session_id=str(uuid4()),
        original_unit="IRR", original_amount="50000000", entry_id="imported", date=date(2024, 5, 20),
        account="1030", role="trade_receivable", party_id=cp1["id"], debit="50000000", credit="0",
        entry_type="regular",
    ))
    db_session.flush()
    combined = service.get_counterparty_ledger(db_session, c.id, u, cp1["id"])
    assert combined["totals"]["net_balance"] == "160000000"
    native = service.get_counterparty_ledger(db_session, c.id, u, cp1["id"], include_imported=False)
    assert len(native["entries"]) == 3
    assert {entry["source_kind"] for entry in native["entries"]} == {"native_journal"}
    assert native["totals"]["net_balance"] == "110000000"



def test_reconcile_with_exact_and_discrepancy(recon_env, db_session):
    u = recon_env["user"]
    c = recon_env["company"]
    cp1 = recon_env["cp1"]

    # In our books:
    # 1. 2024-05-10: Debit 100,000,000 (INV-101)
    # 2. 2024-05-15: Credit 40,000,000 (PAY-201)
    # 3. 2024-05-20: Debit 50,000,000 (INV-102)

    # Counterparty sends statement:
    # 1. Credit 100,000,000 with ref INV-101 (Exact match with #1)
    # 2. Debit 40,000,000 with ref PAY-201 (Exact match with #2)
    # 3. Credit 45,000,000 with ref INV-102 (Amount mismatch with #3: 50M vs 45M!)
    # 4. Debit 15,000,000 with ref PAY-305 (Open in statement! Customer claims paid 15M which we haven't booked)
    statement_rows = [
        {
            "date": "2024-05-10",
            "reference": "INV-101",
            "credit": "100000000",
            "debit": "0",
            "description": "فاکتور خرید محصول ۱۰۱",
        },
        {
            "date": "2024-05-15",
            "reference": "PAY-201",
            "credit": "0",
            "debit": "40000000",
            "description": "پرداخت حواله پایا",
        },
        {
            "date": "2024-05-20",
            "reference": "INV-102",
            "credit": "45000000",
            "debit": "0",
            "description": "فاکتور با تخفیف ۵ میلیون تومانی ادعایی",
        },
        {
            "date": "2024-05-25",
            "reference": "PAY-305",
            "credit": "0",
            "debit": "15000000",
            "description": "حواله مستقیم بانک ملی",
        },
    ]

    result = service.reconcile(
        db_session,
        c.id,
        u,
        {
            "counterparty_id": cp1["id"],
            "as_of_date": "2024-05-30",
            "tolerance_days": 7,
            "statement_rows": statement_rows,
        },
    )

    assert result["id"].startswith("cp-rec-")
    assert result["matched_count"] == 2
    assert result["open_statement_count"] == 1
    assert len(result["payload"]["discrepancy_items"]) == 1

    # Check discrepancy item
    disc = result["payload"]["discrepancy_items"][0]
    assert disc["type"] == "amount_mismatch"
    assert disc["difference"] == "5000000"

    # Check open statement item
    open_stmt = result["payload"]["open_in_statement"][0]
    assert open_stmt["reference"] == "PAY-305"
    assert open_stmt["debit"] == "15000000"

    # Check history and get_run
    runs = service.list_runs(db_session, c.id, u, cp1["id"])
    assert len(runs["items"]) == 1
    assert runs["items"][0]["id"] == result["id"]

    # Decide run
    decide_res = service.decide_run(
        db_session,
        c.id,
        u,
        result["id"],
        "reviewed",
        "تخفیف ۵ میلیونی فاکتور ۱۰۲ در حال بررسی با واحد فروش است.",
    )
    assert decide_res["status"] == "reviewed"
    assert "تخفیف" in decide_res["notes"]


def test_counterparty_and_moadian_api_endpoints(recon_env, db_session):
    from sqlalchemy import select

    from didban import moadian_service

    u = recon_env["user"]
    c = recon_env["company"]
    cp1 = recon_env["cp1"]

    member = db_session.scalar(
        select(m.Membership).where(m.Membership.company_id == c.id, m.Membership.user_id == u.id)
    )

    # 1. Candidates service
    candidates = service.list_candidates(db_session, c.id, u)
    assert len(candidates["items"]) >= 2
    assert any(item["id"] == cp1["id"] for item in candidates["items"])

    # 2. Statement Ledger service
    ledger = service.get_counterparty_ledger(db_session, c.id, u, cp1["id"])
    assert ledger["counterparty"]["id"] == cp1["id"]
    assert len(ledger["entries"]) == 3

    # 3. Reconcile service
    stmt_rows = [
        {"date": "2024-05-10", "reference": "INV-101", "credit": "100000000", "debit": "0", "description": "فاکتور"},
        {"date": "2024-05-15", "reference": "PAY-201", "credit": "0", "debit": "40000000", "description": "حواله"},
    ]
    run_data = service.reconcile(
        db_session,
        c.id,
        u,
        {
            "counterparty_id": cp1["id"],
            "as_of_date": "2024-05-30",
            "tolerance_days": 7,
            "statement_rows": stmt_rows,
        },
    )
    assert run_data["matched_count"] == 2

    # 4. List runs & detail
    runs = service.list_runs(db_session, c.id, u, cp1["id"])
    assert len(runs["items"]) >= 1

    run_detail = service.get_run(db_session, c.id, u, run_data["id"])
    assert run_detail["id"] == run_data["id"]

    # 5. Decide
    decided = service.decide_run(db_session, c.id, u, run_data["id"], "reviewed", "بررسی شد")
    assert decided["status"] == "reviewed"

    # 6. Moadian reconciliation summary
    moadian_summary = moadian_service.reconciliation_summary(db_session, c.id, u, member)
    assert "summary" in moadian_summary
    assert moadian_summary["summary"]["invoices_count"] == 0

