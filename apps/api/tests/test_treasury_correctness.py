"""Financial correctness, draft reservation isolation, and concurrency tests for Treasury & NativeInvoice."""

import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from didban import models as m
from didban.accounting_service import save_account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.commercial_service import add_counterparty
from didban.errors import DomainError
from didban.native_invoice_service import allocate as allocate_native_invoice
from didban.native_invoice_service import create as create_native_invoice
from didban.native_invoice_service import detail as native_invoice_detail
from didban.operation_service import create as create_operation
from didban.posting_service import create_reversal, post_batch
from didban.posting_service import preview as posting_preview
from didban.treasury_models import TreasuryDocument
from didban.treasury_service import (
    bank_movement_used_amount,
    create_treasury_account,
    create_treasury_document,
    prepare_treasury_document_draft,
    reverse_treasury_allocation,
)


def _seed_treasury_fixture(db, company: str, owner: m.User, fm: m.User, period: m.Period):
    db.add(CompanyAccountingSetup(company_id=company, mode="primary"))
    db.flush()

    g1 = save_account(db, company, owner, {"code": "11", "name": "دارایی", "level": "group"})
    gen1 = save_account(db, company, owner, {"code": "1101", "name": "نقد و مطالبات", "level": "general", "parent_id": g1["id"]})
    sub_bank = save_account(db, company, owner, {"code": "110101", "name": "بانک", "level": "subsidiary", "parent_id": gen1["id"], "role": "bank"})
    sub_ar = save_account(db, company, owner, {"code": "110102", "name": "مطالبات", "level": "subsidiary", "parent_id": gen1["id"], "role": "trade_receivable"})

    g4 = save_account(db, company, owner, {"code": "41", "name": "درآمد", "level": "group"})
    gen4 = save_account(db, company, owner, {"code": "4101", "name": "فروش", "level": "general", "parent_id": g4["id"]})
    sub_rev = save_account(db, company, owner, {"code": "410101", "name": "درآمد خدمات", "level": "subsidiary", "parent_id": gen4["id"], "role": "revenue"})

    cp = add_counterparty(db, company, owner, {
        "name": "مشتری آزمایشی خزانه",
        "entity_kind": "legal_entity",
        "roles": ["customer"],
        "national_id": "10101010101",
    })
    ta_bank = create_treasury_account(db, company, owner, {
        "kind": "bank",
        "name": "بانک سامان",
        "code": "11010101",
        "level": "detail",
        "parent_account_id": sub_bank["id"],
        "bank_name": "سامان",
        "account_number": "100-200-300",
    })

    ps = m.ProcessingSession(company_id=company, actor_id=owner.id, period_id=period.id, state="completed")
    db.add(ps)
    db.flush()
    sf = m.SourceFile(company_id=company, session_id=ps.id, name="bank.csv", sha256="f" * 64, size=10, storage_key="k", scan_status="clean", row_count=1)
    db.add(sf)
    db.flush()
    sr = m.SourceRow(company_id=company, file_id=sf.id, sheet="s", row_number=2, values={})
    db.add(sr)
    db.flush()
    bm = m.BankMovement(
        company_id=company,
        session_id=ps.id,
        source_row_id=sr.id,
        original_unit="IRR",
        original_amount="500000",
        account="100-200-300",
        date=date(2026, 9, 15),
        amount="500000",
        reference="BM-500K",
        party_id=cp["code"],
        kind="movement",
    )
    db.add(bm)
    db.flush()

    sale_op = create_operation(db, company, fm, {
        "kind": "sale_service",
        "period_id": period.id,
        "date": date(2026, 9, 5),
        "description": "فروش فاکتور",
        "unit": "IRR",
        "party_id": cp["code"],
        "source_reference": "INV-500K",
        "amounts": {"amount": "900000"},
        "accounts": {"trade_receivable": sub_ar["id"], "service_revenue": sub_rev["id"]},
    })
    sale_prev = posting_preview(db, company, fm, sale_op["draft"]["id"])
    sale_post = post_batch(db, company, fm, [{
        "draft_id": sale_op["draft"]["id"],
        "expected_version": sale_prev["expected_version"],
        "digest": sale_prev["digest"],
    }])
    inv = create_native_invoice(db, company, fm, {
        "operation_id": sale_op["operation_id"],
        "journal_digest": sale_post["items"][0]["digest"],
        "due_date": date(2026, 9, 30),
        "due_unknown": False,
        "expected_unknown": False,
    })
    return cp, ta_bank, sub_ar, bm, inv


def test_multi_line_bank_capacity_and_draft_vs_posted_invoice_balance(db_session, test_company_context, monkeypatch):
    db = db_session
    company = test_company_context["company"].id
    owner = test_company_context["users"]["owner"]
    fm = test_company_context["users"]["finance_manager"]
    period = test_company_context["period"]
    cp, ta_bank, sub_ar, bm, inv = _seed_treasury_fixture(db, company, owner, fm, period)

    # 1. Two tool lines in ONE document exceeding 500,000 IRR capacity (300k + 300k = 600k) must be rejected
    with pytest.raises(DomainError) as err:
        create_treasury_document(db, company, fm, {
            "direction": "receipt",
            "date": date(2026, 9, 15),
            "period_id": period.id,
            "party_id": cp["id"],
            "unit": "IRR",
            "description": "تلاش مصرف بیش از ظرفیت در یک سند",
            "tools": [
                {"tool_kind": "bank_transfer", "treasury_account_id": ta_bank["id"], "bank_movement_id": bm.id, "amount": "300000"},
                {"tool_kind": "bank_transfer", "treasury_account_id": ta_bank["id"], "bank_movement_id": bm.id, "amount": "300000"},
            ],
        })
    assert err.value.code == "bank_movement_capacity"
    assert bank_movement_used_amount(db, company, bm.id) == 0

    # 2. Two tool lines totaling exactly 500,000 IRR (300k + 200k) succeed as DRAFT
    doc = create_treasury_document(db, company, fm, {
        "direction": "receipt",
        "date": date(2026, 9, 15),
        "period_id": period.id,
        "party_id": cp["id"],
        "unit": "IRR",
        "description": "رسید دو ردیفی مجاز",
        "tools": [
            {"tool_kind": "bank_transfer", "treasury_account_id": ta_bank["id"], "bank_movement_id": bm.id, "amount": "300000"},
            {"tool_kind": "bank_transfer", "treasury_account_id": ta_bank["id"], "bank_movement_id": bm.id, "amount": "200000"},
        ],
        "allocations": [
            {"tool_line_index": 0, "invoice_id": inv["id"], "amount": "300000"},
        ],
    })
    assert doc["state"] == "draft"
    assert doc["has_payment_proof"] is False
    assert bank_movement_used_amount(db, company, bm.id) == 500000

    # 3. Draft allocation is ONLY a reservation: NativeInvoice.remaining stays 900,000!
    inv_after_draft = native_invoice_detail(db, company, fm, inv["id"], date(2026, 9, 30))
    assert inv_after_draft["remaining"] == "900000"
    assert inv_after_draft["reserved_amount"] == "300000"
    assert inv_after_draft["allocations"][0]["status"] == "reserved"
    assert inv_after_draft["allocations"][0]["effective"] is False

    # Even if state were manually tampered to 'posted' without a journal_id, it cannot reduce invoice balance!
    doc_row = db.get(TreasuryDocument, doc["id"])
    doc_row.state = "posted"
    db.flush()
    inv_no_journal = native_invoice_detail(db, company, fm, inv["id"], date(2026, 9, 30))
    assert inv_no_journal["remaining"] is None
    assert inv_no_journal["allocations"][0]["status"] == "unavailable"
    assert inv_no_journal["allocations"][0]["reason"] == "treasury_payment_proof_missing"
    doc_row.state = "draft"
    db.flush()

    # 4. Prepare & post accounting draft -> NOW doc becomes posted with valid journal proof -> remaining drops to 600,000!
    prepared = prepare_treasury_document_draft(db, company, fm, doc["id"], {"counterparty_account_id": sub_ar["id"]}, doc["version"])
    prev_tr = posting_preview(db, company, fm, prepared["draft"]["id"])
    posted_tr = post_batch(db, company, fm, [{
        "draft_id": prepared["draft"]["id"],
        "expected_version": prev_tr["expected_version"],
        "digest": prev_tr["digest"],
    }])
    assert posted_tr["items"][0]["id"]

    inv_after_post = native_invoice_detail(db, company, fm, inv["id"], date(2026, 9, 30))
    assert inv_after_post["remaining"] == "600000"
    assert inv_after_post["reserved_amount"] == "0"
    assert inv_after_post["allocations"][0]["status"] == "available"
    assert inv_after_post["allocations"][0]["effective"] is True

    # 5. Prevent double-applying the same treasury operation via NativeInvoiceAllocation!
    with pytest.raises(DomainError) as dup_path:
        allocate_native_invoice(db, company, fm, inv["id"], {
            "operation_id": prepared["operation_id"],
            "journal_digest": posted_tr["items"][0]["digest"],
            "amount": "200000",
        }, inv_after_post["version"])
    assert dup_path.value.code == "settlement_managed_by_treasury"

    # 6. Reverse valid treasury allocation -> restores invoice remaining to 900,000
    # 21:00 UTC is already September 30 in the company's timezone.
    monkeypatch.setattr(m, "now", lambda: datetime(2026, 9, 29, 21, tzinfo=timezone.utc))
    doc_latest = db.get(TreasuryDocument, doc["id"])
    rev_doc = reverse_treasury_allocation(db, company, fm, doc["allocations"][0]["id"], "برگشت تخصیص آزمایشی", doc_latest.version)
    assert rev_doc["allocations"][0]["reversed_at"] is not None
    before_allocation_reversal = native_invoice_detail(db, company, fm, inv["id"], date(2026, 9, 29))
    assert before_allocation_reversal["remaining"] == "600000"
    assert before_allocation_reversal["allocations"][0]["reversal"] is None
    inv_after_rev = native_invoice_detail(db, company, fm, inv["id"], date(2026, 9, 30))
    assert inv_after_rev["remaining"] == "900000"

    # A linked journal reversal only takes effect on its accounting date, including on an earlier report.
    correction = create_reversal(db, company, fm, posted_tr["items"][0]["id"], {
        "period_id": period.id, "date": date(2026, 9, 25), "reason": "اصلاح سند خزانه آزمایشی",
    })
    correction_preview = posting_preview(db, company, fm, correction["id"])
    post_batch(db, company, fm, [{
        "draft_id": correction["id"],
        "expected_version": correction_preview["expected_version"],
        "digest": correction_preview["digest"],
    }])
    assert db.get(TreasuryDocument, doc["id"]).state == "reversed"
    before_journal_reversal = native_invoice_detail(db, company, fm, inv["id"], date(2026, 9, 24))
    assert before_journal_reversal["remaining"] == "600000"
    on_journal_reversal = native_invoice_detail(db, company, fm, inv["id"], date(2026, 9, 25))
    assert on_journal_reversal["remaining"] == "900000"
    assert on_journal_reversal["allocations"][0]["status"] == "reversed"
    assert on_journal_reversal["allocations"][0]["reversal"] is None


def test_treasury_account_options_hide_details_and_enforce_company_access(tmp_path: Path):
    from test_api_delivery import scenario

    scenario(tmp_path, r"""
manager = client_for("finance_manager")
payload = {
    "kind": "bank", "name": "بانک آزمایشی", "code": "100", "account_number": "123456789",
    "iban": "IR123456789012345678901234", "custodian_name": "مسئول آزمایشی",
}
key = str(uuid4())
account = command(manager, "POST", base + "/treasury/accounts", payload, key=key)
assert account.status_code == 201, account.text
account = account.json()
expected = {"id": account["id"], "name": account["name"], "kind": "bank", "active": True}
for role in ("owner", "finance_manager"):
    client = client_for(role)
    assert client.get(base + "/treasury/accounts/options").json()["items"] == [expected]
    details = client.get(base + "/treasury/accounts")
    assert details.status_code == 200, details.text
    assert details.json()["items"][0]["iban"] == account["iban"]

for role in ("advisor", "viewer"):
    client = client_for(role)
    response = client.get(base + "/treasury/accounts/options?kind=bank&active_only=true")
    assert response.status_code == 200, response.text
    assert response.json()["items"] == [expected]
    assert client.get(base + "/treasury/accounts").status_code == 403

assert client_for("outsider").get(base + "/treasury/accounts/options").status_code == 404
with transaction("company-a") as db:
    db.get(m.Membership, members["finance_manager"]).role = "advisor"
assert command(manager, "POST", base + "/treasury/accounts", payload, key=key).status_code == 403
""")


def test_http_idempotency_and_concurrent_sqlite_requests(tmp_path: Path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from concurrent.futures import ThreadPoolExecutor
import threading
from didban.accounting_service import save_account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.commercial_service import add_counterparty
from didban.native_invoice_service import create as create_native_invoice
from didban.operation_service import create as create_operation
from didban.posting_service import post_batch, preview as posting_preview
from didban.treasury_service import bank_movement_used_amount, create_treasury_account

with transaction("company-a") as db:
    owner = db.get(m.User, users["owner"])
    fm = db.get(m.User, users["finance_manager"])
    db.add(CompanyAccountingSetup(company_id="company-a", mode="primary"))
    g1 = save_account(db, "company-a", owner, {"code": "11", "name": "دارایی", "level": "group"})
    gen1 = save_account(db, "company-a", owner, {"code": "1101", "name": "نقد", "level": "general", "parent_id": g1["id"]})
    sub_bank = save_account(db, "company-a", owner, {"code": "110101", "name": "بانک", "level": "subsidiary", "parent_id": gen1["id"], "role": "bank"})
    sub_ar = save_account(db, "company-a", owner, {"code": "110102", "name": "مطالبات", "level": "subsidiary", "parent_id": gen1["id"], "role": "trade_receivable"})
    g4 = save_account(db, "company-a", owner, {"code": "41", "name": "درآمد", "level": "group"})
    gen4 = save_account(db, "company-a", owner, {"code": "4101", "name": "فروش", "level": "general", "parent_id": g4["id"]})
    sub_rev = save_account(db, "company-a", owner, {"code": "410101", "name": "فروش", "level": "subsidiary", "parent_id": gen4["id"], "role": "revenue"})
    cp = add_counterparty(db, "company-a", owner, {"name": "خریدار", "entity_kind": "legal_entity", "roles": ["customer"]})
    ta = create_treasury_account(db, "company-a", owner, {
        "kind": "bank", "name": "بانک تست", "code": "11010101", "level": "detail", "parent_account_id": sub_bank["id"]
    })
    sf = m.SourceFile(company_id="company-a", session_id=source_session, name="b.csv", sha256="e"*64, size=1, storage_key="k", scan_status="clean", row_count=1)
    db.add(sf); db.flush()
    sr = m.SourceRow(company_id="company-a", file_id=sf.id, sheet="s", row_number=1, values={})
    db.add(sr); db.flush()
    bm = m.BankMovement(company_id="company-a", session_id=source_session, source_row_id=sr.id, original_unit="IRR", original_amount="500000", account="11010101", date=date(2026, 9, 10), amount="500000", reference="BM-CONC", party_id=cp["code"], kind="movement")
    db.add(bm); db.flush()
    bm_id = bm.id; cp_id = cp["id"]; ta_id = ta["id"]
    invoice_row = m.SourceRow(company_id="company-a", file_id=sf.id, sheet="s", row_number=2, values={})
    db.add(invoice_row); db.flush()
    invoice = m.Invoice(
        company_id="company-a", session_id=source_session, source_row_id=invoice_row.id,
        original_unit="IRR", original_amount="500000", reference="IMPORTED-INV", party_id=cp["code"],
        date=date(2026, 9, 5), amount="500000", direction="sales",
    )
    db.add(invoice); db.flush()
    imported_invoice_id = invoice.id
    reviewed = m.ProcessingSession(
        company_id="company-a", actor_id=owner.id, period_id=period_id, state="completed",
    )
    db.add(reviewed); db.flush()
    db.add(m.ResultManifest(
        company_id="company-a", session_id=reviewed.id, period_id=period_id, digest="f"*64,
        selection={"row_ids": [sr.id, invoice_row.id], "coverage": {}}, metrics=[], details={},
    ))

fm_client = client_for("finance_manager")
payload = {
    "direction": "receipt",
    "date": "2026-09-10",
    "period_id": period_id,
    "party_id": cp_id,
    "unit": "IRR",
    "description": "تست همزمانی و تکرار",
    "tools": [{"tool_kind": "bank_transfer", "treasury_account_id": ta_id, "bank_movement_id": bm_id, "amount": "300000"}],
}

# 1. Duplicate request with same Idempotency-Key replays exact response without consuming extra capacity
idem_key = str(uuid4())
r1 = command(fm_client, "POST", base + "/treasury/documents", payload, key=idem_key)
r2 = command(fm_client, "POST", base + "/treasury/documents", payload, key=idem_key)
assert r1.status_code == 201, r1.text
assert r2.status_code == 201, r2.text
assert r1.json()["id"] == r2.json()["id"]

# 2. Second independent request for 300k on remaining 200k fails with 409
r3 = command(fm_client, "POST", base + "/treasury/documents", payload)
assert r3.status_code == 409, r3.text
assert r3.json()["code"] == "bank_movement_capacity"

# The imported invoice path must honor the same bank capacity.
imported = command(fm_client, "POST", base + "/allocations", {
    "bank_id": bm_id, "invoice_id": imported_invoice_id, "amount": "250000",
})
assert imported.status_code == 409, imported.text
assert imported.json()["code"] == "allocation_capacity"

barrier = threading.Barrier(2)
replay_key = str(uuid4())
concurrent_payload = payload | {"tools": [payload["tools"][0] | {"amount": "150000"}]}

def create_simultaneously(_):
    client = client_for("finance_manager")
    barrier.wait(timeout=10)
    return command(client, "POST", base + "/treasury/documents", concurrent_payload, key=replay_key)

with ThreadPoolExecutor(max_workers=2) as pool:
    first, second = list(pool.map(create_simultaneously, range(2)))
assert first.status_code == second.status_code == 201, (first.text, second.text)
assert first.json()["id"] == second.json()["id"]

with transaction("company-a") as db:
    assert bank_movement_used_amount(db, "company-a", bm_id) == 450000
""",
    )


@pytest.mark.skipif(
    not os.environ.get("DIDBAN_POSTGRES_TEST_URL"),
    reason="Requires isolated PostgreSQL validation database (DIDBAN_POSTGRES_TEST_URL)",
)
def test_concurrent_treasury_capacity_on_postgresql():
    """Verify two concurrent transactions cannot exceed 500,000 IRR BankMovement capacity on PostgreSQL."""
    from didban.db import engine, initialize, transaction

    initialize()
    c_id = f"c-pg-conc-{uuid4().hex[:6]}"
    u_id = f"u-pg-conc-{uuid4().hex[:6]}"
    p_id = f"p-pg-conc-{uuid4().hex[:6]}"

    with transaction() as db:
        owner = m.User(id=u_id, email=f"{u_id}@pg.test", name="pg", password_hash="x")
        company = m.Company(id=c_id, name="شرکت همزمانی پستگرس")
        db.add_all([owner, company])
        db.flush()

    with transaction(c_id) as db:
        owner = db.get(m.User, u_id)
        db.add(m.Membership(company_id=c_id, user_id=u_id, role="finance_manager", active=True))
        period = m.Period(id=p_id, company_id=c_id, name="پاییز", start=date(2026, 9, 1), end=date(2026, 9, 30))
        db.add(period)
        db.flush()
        cp, ta_bank, _sub_ar, bm, _inv = _seed_treasury_fixture(db, c_id, owner, owner, period)
        bm_id, cp_id, ta_id = bm.id, cp["id"], ta_bank["id"]

    barrier = threading.Barrier(2)

    def attempt_create(_idx: int) -> str:
        barrier.wait(timeout=10)
        try:
            with transaction(c_id) as db:
                actor = db.get(m.User, u_id)
                create_treasury_document(
                    db,
                    c_id,
                    actor,
                    {
                        "direction": "receipt",
                        "date": date(2026, 9, 15),
                        "period_id": p_id,
                        "party_id": cp_id,
                        "unit": "IRR",
                        "description": "درخواست همزمان",
                        "tools": [
                            {
                                "tool_kind": "bank_transfer",
                                "treasury_account_id": ta_id,
                                "bank_movement_id": bm_id,
                                "amount": "300000",
                            }
                        ],
                    },
                )
            return "created"
        except DomainError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(attempt_create, range(2)))

    assert sorted(outcomes) == ["bank_movement_capacity", "created"], outcomes
    with transaction(c_id) as db:
        assert bank_movement_used_amount(db, c_id, bm_id) == 300000
    engine.dispose()
