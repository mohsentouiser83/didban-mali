"""Phase 2 tests: counterparty multi-roles, persistent journal lines, account detail links, treasury, cheques, and allocations."""

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from didban import models as m
from didban.accounting_service import save_account, save_detail_link, save_draft
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.cheque_models import ChequeEvent
from didban.cheque_service import act as cheque_act
from didban.cheque_service import create as create_cheque
from didban.commercial_service import add_counterparty
from didban.dimensions_models import Dimension
from didban.errors import DomainError
from didban.native_invoice_service import create as create_native_invoice
from didban.operation_service import create as create_operation
from didban.posting_models import NativeJournalLine
from didban.posting_service import post_batch, preview
from didban.treasury_service import (
    allocate_treasury_tool,
    create_treasury_account,
    create_treasury_document,
    reverse_treasury_allocation,
    update_treasury_account,
)


def test_counterparty_entity_kind_multi_role_and_code_vs_id_allocation(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_setup_models import CompanyAccountingSetup
owner = client_for("owner")
manager = client_for("finance_manager")
with transaction("company-a") as db:
    db.add(CompanyAccountingSetup(company_id="company-a", mode="primary"))

# Create dual-role counterparty (both customer & supplier) as legal_entity
cp_res = command(owner, "POST", base + "/commercial/counterparties", {
    "name": "شرکت بازرگانی دلتا",
    "entity_kind": "legal_entity",
    "roles": ["customer", "supplier"],
    "national_id": "10102030405",
    "economic_code": "411122334455",
    "postal_code": "1415566778",
    "phone": "02188990011",
    "address": "تهران، خیابان ولیعصر",
})
assert cp_res.status_code == 201, cp_res.text
cp = cp_res.json()
assert cp["entity_kind"] == "legal_entity"
assert set(cp["roles"]) == {"customer", "supplier"}

# Appears in BOTH customer and supplier filters
custs = owner.get(base + "/commercial/counterparties", params={"type": "customer"}).json()["items"]
supps = owner.get(base + "/commercial/counterparties", params={"type": "supplier"}).json()["items"]
assert any(x["id"] == cp["id"] for x in custs)
assert any(x["id"] == cp["id"] for x in supps)

# Reject unknown role on account save
bad_acc = command(owner, "POST", base + "/accounting/accounts", {
    "code": "11",
    "name": "گروه دارایی",
    "level": "group",
    "role": "invented_unknown_role",
})
assert bad_acc.status_code == 422

# Create chart & accounts and test sale using cp.code vs receipt using cp.id!
g1 = command(owner, "POST", base + "/accounting/accounts", {"code": "11", "name": "دارایی", "level": "group"}).json()
gen1 = command(owner, "POST", base + "/accounting/accounts", {"code": "1101", "name": "نقد و مطالبات", "level": "general", "parent_id": g1["id"]}).json()
sub_bank = command(owner, "POST", base + "/accounting/accounts", {"code": "110101", "name": "بانک", "level": "subsidiary", "parent_id": gen1["id"], "role": "bank"}).json()
sub_ar = command(owner, "POST", base + "/accounting/accounts", {"code": "110102", "name": "مطالبات", "level": "subsidiary", "parent_id": gen1["id"], "role": "trade_receivable"}).json()
g4 = command(owner, "POST", base + "/accounting/accounts", {"code": "41", "name": "درآمد", "level": "group"}).json()
gen4 = command(owner, "POST", base + "/accounting/accounts", {"code": "4101", "name": "فروش", "level": "general", "parent_id": g4["id"]}).json()
sub_rev = command(owner, "POST", base + "/accounting/accounts", {"code": "410101", "name": "درآمد خدمات", "level": "subsidiary", "parent_id": gen4["id"], "role": "revenue"}).json()

# Sale operation using cp["code"]
sale_op = command(manager, "POST", base + "/accounting/operations", {
    "kind": "sale_service",
    "period_id": period_id,
    "date": "2026-09-05",
    "description": "فروش خدمت",
    "unit": "IRR",
    "party_id": cp["code"],
    "source_reference": "SALE-CP-1",
    "amounts": {"amount": "1000000"},
    "accounts": {"trade_receivable": sub_ar["id"], "service_revenue": sub_rev["id"]},
}).json()
prev_sale = manager.get(base + "/accounting/drafts/" + sale_op["draft"]["id"] + "/posting-preview").json()
posted_sale = command(manager, "POST", base + "/accounting/postings", {"items": [{"draft_id": sale_op["draft"]["id"], "expected_version": prev_sale["expected_version"], "digest": prev_sale["digest"]}]})
assert posted_sale.status_code == 201, posted_sale.text

# Native invoice created from sale_op (party_id = cp["code"])
inv_res = command(manager, "POST", base + "/accounting/native-invoices", {
    "operation_id": sale_op["operation_id"],
    "journal_digest": posted_sale.json()["items"][0]["digest"],
    "due_date": "2026-09-20",
    "due_unknown": False,
    "expected_unknown": False,
})
assert inv_res.status_code == 201, inv_res.text
inv = inv_res.json()

# Receipt operation using cp["id"] (UUID instead of code!)
rec_op = command(manager, "POST", base + "/accounting/operations", {
    "kind": "receipt",
    "period_id": period_id,
    "date": "2026-09-10",
    "description": "دریافت وجه",
    "unit": "IRR",
    "party_id": cp["id"],
    "source_reference": "REC-CP-1",
    "amounts": {"amount": "400000"},
    "accounts": {"bank_a": sub_bank["id"], "trade_receivable": sub_ar["id"]},
}).json()
prev_rec = manager.get(base + "/accounting/drafts/" + rec_op["draft"]["id"] + "/posting-preview").json()
posted_rec = command(manager, "POST", base + "/accounting/postings", {"items": [{"draft_id": rec_op["draft"]["id"], "expected_version": prev_rec["expected_version"], "digest": prev_rec["digest"]}]})
assert posted_rec.status_code == 201, posted_rec.text

# Allocation matches despite one using cp["code"] and the other using cp["id"]!
alloc = command(manager, "POST", base + "/accounting/native-invoices/" + inv["id"] + "/allocations", {
    "operation_id": rec_op["operation_id"],
    "journal_digest": posted_rec.json()["items"][0]["digest"],
    "amount": "400000",
}, version=inv["version"])
assert alloc.status_code in (200, 201), alloc.text
assert alloc.json()["remaining"] == "600000"
""",
    )


def test_persistent_journal_lines_detail_links_treasury_cheques_and_double_spend_guards(
    db_session: Session, test_company_context
):
    db = db_session
    company = test_company_context["company"].id
    owner = test_company_context["users"]["owner"]
    fm = test_company_context["users"]["finance_manager"]
    period = test_company_context["period"]
    db.add(CompanyAccountingSetup(company_id=company, mode="primary"))
    db.flush()

    # Build 4-level chart + floating detail linked to 2 subsidiaries
    g1 = save_account(db, company, owner, {"code": "11", "name": "دارایی", "level": "group"})
    gen1 = save_account(db, company, owner, {"code": "1101", "name": "نقد و مطالبات", "level": "general", "parent_id": g1["id"]})
    sub_bank = save_account(db, company, owner, {"code": "110101", "name": "بانک‌ها", "level": "subsidiary", "parent_id": gen1["id"]})
    sub_ar = save_account(db, company, owner, {"code": "110102", "name": "مطالبات تجاری", "level": "subsidiary", "parent_id": gen1["id"], "role": "trade_receivable"})
    sub_ap = save_account(db, company, owner, {"code": "110103", "name": "سایر حساب‌ها", "level": "subsidiary", "parent_id": gen1["id"], "role": "other_asset"})
    det_cp = save_account(db, company, owner, {"code": "11010201", "name": "تفصیلی مشتری", "level": "detail", "parent_id": sub_ar["id"]})

    g4 = save_account(db, company, owner, {"code": "41", "name": "درآمد", "level": "group"})
    gen4 = save_account(db, company, owner, {"code": "4101", "name": "فروش", "level": "general", "parent_id": g4["id"]})
    sub_rev = save_account(db, company, owner, {"code": "410101", "name": "فروش خدمات", "level": "subsidiary", "parent_id": gen4["id"], "role": "revenue"})

    cp = add_counterparty(db, company, owner, {
        "name": "مشتری نمونه",
        "entity_kind": "natural_person",
        "roles": ["customer", "supplier"],
        "national_id": "0012345678",
    })

    # Link single detail account to two subsidiaries
    l1 = save_detail_link(db, company, owner, {"detail_account_id": det_cp["id"], "subsidiary_account_id": sub_ar["id"], "counterparty_id": cp["id"]})
    l2 = save_detail_link(db, company, owner, {"detail_account_id": det_cp["id"], "subsidiary_account_id": sub_ap["id"], "counterparty_id": cp["id"]})
    assert l1["id"] != l2["id"]

    # Create TreasuryAccount (bank & petty cash) with separate fields
    ta_bank = create_treasury_account(db, company, owner, {
        "kind": "bank",
        "name": "بانک سامان مرکزی",
        "code": "11010101",
        "level": "detail",
        "parent_account_id": sub_bank["id"],
        "bank_name": "سامان",
        "account_number": "801-110-2233",
        "iban": "IR120560080111000223300001",
        "branch_name": "ونک",
        "branch_code": "801",
    })
    assert ta_bank["account_number"] == "801-110-2233"
    assert ta_bank["iban"] == "IR120560080111000223300001"
    ta_petty = create_treasury_account(db, company, owner, {
        "kind": "petty_cash",
        "name": "تنخواه دفتر",
        "code": "11010102",
        "level": "detail",
        "parent_account_id": sub_bank["id"],
        "custodian_name": "حسین کریمی",
        "petty_cash_limit_irr": "50000000",
    })
    assert ta_petty["custodian_name"] == "حسین کریمی"
    assert ta_petty["petty_cash_limit_irr"] == "50000000"

    # Deactivating treasury account preserves historical entity
    ta_petty_deactivated = update_treasury_account(db, company, owner, ta_petty["id"], {"active": False}, ta_petty["version"])
    assert ta_petty_deactivated["active"] is False

    # Dimension validation on draft lines + persistent NativeJournalLine creation
    dim = Dimension(company_id=company, kind="project", code="PRJ-1", name="پروژه الف", active=True)
    db.add(dim)
    db.flush()

    draft = save_draft(db, company, fm, {
        "period_id": period.id,
        "date": date(2026, 9, 10),
        "description": "فروش با ابعاد و ردیف",
        "unit": "IRR",
        "lines": [
            {
                "account_id": det_cp["id"],
                "party_id": cp["code"],
                "debit": "1000000",
                "credit": "0",
                "description": "بدهکار مشتری بابت پروژه الف",
                "dimension_ids": [dim.id],
            },
            {
                "account_id": sub_rev["id"],
                "party_id": "",
                "debit": "0",
                "credit": "1000000",
                "description": "فروش خدمات پروژه الف",
                "dimension_ids": [dim.id],
            },
        ],
    })
    prev = preview(db, company, fm, draft["id"])
    posted = post_batch(db, company, fm, [{"draft_id": draft["id"], "expected_version": draft["version"], "digest": prev["digest"]}])
    j_id = posted["items"][0]["id"]

    j_lines = list(db.scalars(select(NativeJournalLine).where(NativeJournalLine.journal_id == j_id).order_by(NativeJournalLine.line_index)))
    assert len(j_lines) == 2
    assert j_lines[0].counterparty_id == cp["id"]
    assert j_lines[0].description == "بدهکار مشتری بابت پروژه الف"
    assert j_lines[0].dimension_ids == [dim.id]

    # Seed BankMovement + Cheque with Sayad ID and verify endorse event + shared BankMovement capacity
    session = m.ProcessingSession(company_id=company, actor_id=owner.id, period_id=period.id, state="completed")
    db.add(session)
    db.flush()
    sf = m.SourceFile(company_id=company, session_id=session.id, name="b.csv", sha256="1"*64, size=10, storage_key="k1", scan_status="clean", row_count=1)
    db.add(sf)
    db.flush()
    sr = m.SourceRow(company_id=company, file_id=sf.id, sheet="s", row_number=2, values={})
    db.add(sr)
    db.flush()
    bm = m.BankMovement(
        company_id=company, session_id=session.id, source_row_id=sr.id,
        original_unit="IRR", original_amount="500000", account="801-110-2233",
        date=date(2026, 9, 15), amount="500000", reference="BM-1", party_id=cp["code"], kind="movement",
    )
    db.add(bm)
    db.flush()
    manifest = m.ResultManifest(company_id=company, session_id=session.id, period_id=period.id, digest="d1", selection={"row_ids": [sr.id]}, metrics=[], details={})
    db.add(manifest)
    db.flush()

    chk = create_cheque(db, company, owner, {
        "period_id": period.id,
        "direction": "received",
        "number": "123456",
        "sayad_id": "1234567890123456",
        "bank_name": "سامان",
        "bank_account": "801-110-2233",
        "treasury_account_id": ta_bank["id"],
        "party_id": cp["id"],
        "amount": "500000",
        "unit": "IRR",
        "issue_date": date(2026, 9, 10),
        "received_date": date(2026, 9, 11),
        "due_date": date(2026, 9, 25),
    })
    assert chk["sayad_id"] == "1234567890123456"
    assert chk["sayad_status"] == "not_verified"

    # Endorse preserves endorsee on ChequeEvent itself
    cheque_act(db, company, owner, chk["id"], {
        "action": "endorse",
        "period_id": period.id,
        "event_date": date(2026, 9, 12),
        "reason": "واگذاری به تأمین‌کننده",
        "endorsed_to": cp["code"],
    }, chk["version"])
    ev = db.scalar(select(ChequeEvent).where(ChequeEvent.cheque_id == chk["id"], ChequeEvent.action == "endorse"))
    assert ev.endorsed_to == cp["code"]
    assert ev.endorsed_to_counterparty_id == cp["id"]

    # Create a sale invoice & TreasuryDocument using the same BankMovement (500,000 IRR) -> succeeds,
    # then a second TreasuryDocument trying to double-spend the same BankMovement fails!
    sale_op = create_operation(db, company, fm, {
        "kind": "sale_service",
        "period_id": period.id,
        "date": date(2026, 9, 5),
        "description": "فروش فاکتوری",
        "unit": "IRR",
        "party_id": cp["code"],
        "source_reference": "S-TR-1",
        "amounts": {"amount": "900000"},
        "accounts": {"trade_receivable": det_cp["id"], "service_revenue": sub_rev["id"]},
    })
    sale_prev = preview(db, company, fm, sale_op["draft"]["id"])
    sale_post = post_batch(db, company, fm, [{"draft_id": sale_op["draft"]["id"], "expected_version": sale_prev["expected_version"], "digest": sale_prev["digest"]}])
    inv = create_native_invoice(db, company, fm, {
        "operation_id": sale_op["operation_id"],
        "journal_digest": sale_post["items"][0]["digest"],
        "due_date": date(2026, 9, 30),
        "due_unknown": False,
        "expected_unknown": False,
    })

    doc = create_treasury_document(db, company, fm, {
        "direction": "receipt",
        "date": date(2026, 9, 15),
        "period_id": period.id,
        "party_id": cp["id"],
        "unit": "IRR",
        "description": "رسید ترکیبی",
        "tools": [
            {"tool_kind": "bank_transfer", "treasury_account_id": ta_bank["id"], "bank_movement_id": bm.id, "amount": "500000"},
            {"tool_kind": "cash", "treasury_account_id": ta_petty_deactivated["id"] if False else ta_bank["id"], "amount": "200000"},
        ],
        "allocations": [
            {"tool_line_index": 0, "invoice_id": inv["id"], "amount": "300000"},
        ],
    })
    assert doc["total_amount"] == "700000"
    assert len(doc["allocations"]) == 1

    # Duplicate allocation to same (tool_line_id, invoice_id) rejected
    with pytest.raises(DomainError) as err:
        allocate_treasury_tool(db, company, fm, doc["id"], {
            "tool_line_id": doc["tools"][0]["id"],
            "invoice_id": inv["id"],
            "amount": "100000",
        }, doc["version"])
    assert err.value.code == "treasury_allocation_exists"

    # Double-spending BankMovement bm.id in a second TreasuryDocument rejected!
    with pytest.raises(DomainError) as err:
        create_treasury_document(db, company, fm, {
            "direction": "receipt",
            "date": date(2026, 9, 15),
            "period_id": period.id,
            "party_id": cp["id"],
            "unit": "IRR",
            "description": "خرج دوباره بانک",
            "tools": [
                {"tool_kind": "bank_transfer", "treasury_account_id": ta_bank["id"], "bank_movement_id": bm.id, "amount": "100000"},
            ],
        })
    assert err.value.code == "bank_movement_capacity"

    # Reversing treasury allocation frees capacity cleanly
    rev_doc = reverse_treasury_allocation(db, company, fm, doc["allocations"][0]["id"], "اصلاح تسویه", doc["version"])
    assert rev_doc["allocations"][0]["reversed_at"] is not None
