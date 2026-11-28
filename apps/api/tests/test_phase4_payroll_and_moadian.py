"""Phase 4 acceptance tests: Payroll workshops, mid-month proration, rate year flags, payment drafts, and Moadian multi-line/subject/buyer linkages."""

from datetime import date
from uuid import uuid4

import pytest

from didban import models as m
from didban import payroll_service
from didban.accounting_models import Account
from didban.accounting_service import save_account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.commercial_doc_service import create_commercial_document_draft
from didban.commercial_service import add_counterparty
from didban.errors import DomainError
from didban.inventory_service import add_item, add_warehouse, create_opening_stock_draft
from didban.moadian_gateway import MoadianCredentials
from didban.moadian_payload import _verhoeff_valid, build_payload
from didban.moadian_profiles import MoadianProfile
from didban.moadian_schemas import MoadianInvoiceInput
from didban.moadian_service import preview as moadian_preview
from didban.native_invoice_models import NativeInvoice
from didban.posting_service import post_batch, preview


def _post(db, cid, u, res):
    did = res["draft"]["id"] if "draft" in res else res["id"]
    p = preview(db, cid, u, did)
    return post_batch(db, cid, u, [{"draft_id": did, "expected_version": p["expected_version"], "digest": p["digest"]}])


def test_payroll_mid_month_proration_unverified_rate_year_and_payment_draft(db_session):
    db = db_session
    cid = f"c-p4-{uuid4().hex[:6]}"
    uid = f"u-p4-{uuid4().hex[:6]}"
    u = m.User(id=uid, email=f"{uid}@test.local", name="مدیر", password_hash="x", active=True)
    comp = m.Company(id=cid, name="شرکت تست حقوق ۴")
    db.add_all([u, comp])
    db.flush()
    db.add(m.Membership(company_id=cid, user_id=uid, role="finance_manager", active=True))
    db.add(CompanyAccountingSetup(company_id=cid, mode="primary"))
    # Period covering 1404 (2025-03-21 to 2026-03-20) -> non-1403 rates must be marked unverified_period_rates
    period = m.Period(
        id=f"p4-{uuid4().hex[:6]}",
        company_id=cid,
        name="دوره ۱۴۰۴",
        start=date(2025, 3, 21),
        end=date(2026, 3, 20),
    )
    db.add(period)
    db.flush()

    def mk_acc(code, name, role):
        saved = save_account(db, cid, u, {"code": code, "name": name, "kind": "leaf", "active": True, "role": role})
        return db.get(Account, saved["id"])

    accs = {
        "salary_expense": mk_acc("6101", "هزینه حقوق", "expense").id,
        "employer_insurance_expense": mk_acc("6102", "بیمه کارفرما", "expense").id,
        "payroll_payable": mk_acc("2201", "حقوق پرداختنی", "other_liability").id,
        "insurance_payable": mk_acc("2202", "بیمه پرداختنی", "other_liability").id,
        "payroll_tax_payable": mk_acc("2203", "مالیات حقوق", "other_liability").id,
        "other_deductions_payable": mk_acc("2204", "سایر کسورات", "other_liability").id,
        "bank": mk_acc("1101", "بانک حقوق", "bank").id,
    }

    with pytest.raises(DomainError) as zero_ws:
        payroll_service.add_workshop(db, cid, u, {"workshop_code": "0000000000", "employer_name": "شعبه مرکزی"})
    assert zero_ws.value.code == "invalid_workshop_code"

    ws = payroll_service.add_workshop(
        db,
        cid,
        u,
        {"workshop_code": "1400123456", "employer_name": "کارگاه بازرگانی دیدبان", "tamin_branch_code": "021"},
    )
    emp = payroll_service.add_employee(
        db,
        cid,
        u,
        {
            "first_name": "رضا",
            "last_name": "کریمی",
            "national_id": "0087654321",
            "insurance_number": "11223344",
            "hire_date": date(2025, 4, 5),  # Mid-Farvardin 1404 (Farvardin 1 = 2025-03-21, Farvardin 31 = 2025-04-20 -> 16 days active!)
        },
    )
    con = payroll_service.add_contract(
        db,
        cid,
        u,
        {
            "employee_id": emp["id"],
            "contract_type": "full_time",
            "start_date": date(2025, 4, 5),
            "workshop_id": ws["id"],
            "work_location": "تهران - دفتر مرکزی",
            "work_description": "کارشناس فروش",
            "weekly_hours": "44",
            "conclusion_date": date(2025, 4, 4),
            "base_salary": "155000000",
        },
    )
    assert con["workshop_id"] == ws["id"]
    assert con["work_location"] == "تهران - دفتر مرکزی"

    run = payroll_service.create_payroll_run(
        db,
        cid,
        u,
        {"period_id": period.id, "title": "فروردین ۱۴۰۴", "year": 1404, "month": 1, "calculation_date": date(2025, 4, 20)},
    )
    assert run["rate_status"] == "unverified_period_rates"
    details = payroll_service.get_payroll_run(db, cid, run["id"])
    slip = details["slips"][0]
    assert slip["work_days"] == "16"  # NOT auto-filled 31 full days!
    assert slip["attendance_status"] == "prorated_needs_review"
    assert slip["calculation_meta"]["rate_status"] == "unverified_period_rates"

    # Confirm attendance via timesheet update -> transitions attendance_status to verified
    slip = payroll_service.update_slip_timesheet(db, cid, u, run["id"], slip["id"], {"work_days": "16"})
    assert slip["attendance_status"] == "verified"

    # Insurance export labels internal draft cleanly
    ins = payroll_service.export_insurance_disk(db, cid, u, run["id"])
    assert ins["rate_status"] == "unverified_period_rates"
    assert ins["official_format_verified"] is False
    assert ins["output_scope"] == "internal_draft_only"

    # Create payroll accrual draft and post it
    run_refreshed = payroll_service.get_payroll_run(db, cid, run["id"])
    op = payroll_service.create_payroll_operation_draft(
        db,
        cid,
        u,
        run["id"],
        {k: accs[k] for k in ("salary_expense", "employer_insurance_expense", "payroll_payable", "insurance_payable", "payroll_tax_payable", "other_deductions_payable")},
        expected_version=run_refreshed["version"],
    )
    _post(db, cid, u, op["operation"])
    posted_run = payroll_service.get_payroll_run(db, cid, run["id"])
    assert posted_run["status"] == "posted"

    # Prepare payment draft -> slip stays unpaid until explicitly posted
    pay_res = payroll_service.create_payroll_payment_draft(
        db,
        cid,
        u,
        run["id"],
        {
            "date": date(2025, 4, 22),
            "bank_account_id": accs["bank"],
            "payroll_payable_account_id": accs["payroll_payable"],
            "expected_version": posted_run["version"],
        },
    )
    assert payroll_service.get_payroll_run(db, cid, run["id"])["slips"][0]["status"] == "unpaid"
    pay_j = _post(db, cid, u, pay_res["operation"])["items"][0]
    paid_slip = payroll_service.get_payroll_run(db, cid, run["id"])["slips"][0]
    assert paid_slip["status"] == "paid"
    assert paid_slip["payment_journal_id"] == pay_j["id"]


def test_moadian_commercial_invoice_multiline_buyer_check_and_subjects(db_session):
    db = db_session
    cid = f"c-m4-{uuid4().hex[:6]}"
    uid = f"u-m4-{uuid4().hex[:6]}"
    u = m.User(id=uid, email=f"{uid}@test.local", name="مدیر مالی", password_hash="x", active=True)
    comp = m.Company(id=cid, name="شرکت مؤدیان")
    db.add_all([u, comp])
    db.flush()
    mem = m.Membership(company_id=cid, user_id=uid, role="finance_manager", active=True)
    db.add(mem)
    db.add(CompanyAccountingSetup(company_id=cid, mode="primary"))
    period = m.Period(
        id=f"pm4-{uuid4().hex[:6]}",
        company_id=cid,
        name="دوره ۱۴۰۵",
        start=date(2026, 1, 1),
        end=date(2026, 12, 29),
    )
    db.add(period)
    db.flush()

    def mk_acc(code, name, role):
        saved = save_account(db, cid, u, {"code": code, "name": name, "kind": "leaf", "active": True, "role": role})
        return db.get(Account, saved["id"])

    mk_acc("1101", "موجودی", "other_asset")
    ar_acc = mk_acc("1102", "دریافتنی", "trade_receivable")
    eq_acc = mk_acc("3101", "سرمایه", "equity")
    sales_acc = mk_acc("4101", "فروش", "revenue")
    cogs_acc = mk_acc("5101", "بها", "expense")

    wh = add_warehouse(db, cid, u, {"name": "انبار"})
    item1 = add_item(db, cid, u, {"name": "کالا یک", "base_unit": "عدد"})
    item2 = add_item(db, cid, u, {"name": "کالا دو", "base_unit": "بسته"})
    customer = add_counterparty(
        db,
        cid,
        u,
        {
            "name": "خریدار حقوقی نمونه",
            "entity_kind": "legal_entity",
            "roles": ["customer"],
            "economic_code": "14001122334",
        },
    )

    sale_date = date(2026, 5, 10)
    for itm in (item1, item2):
        op_s = create_opening_stock_draft(
            db,
            cid,
            u,
            {
                "item_id": itm["id"],
                "warehouse_id": wh["id"],
                "quantity": 10,
                "unit_price": "100",
                "unit": "IRR",
                "period_id": period.id,
                "date": date(2026, 5, 1),
                "description": "موجودی",
                "equity_account_id": eq_acc.id,
            },
        )
        _post(db, cid, u, op_s)

    doc_res = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "sale",
            "period_id": period.id,
            "issue_date": sale_date,
            "party_id": customer["id"],
            "warehouse_id": wh["id"],
            "currency": "IRR",
            "invoice_discount": "100",
            "counterparty_account_id": ar_acc.id,
            "revenue_account_id": sales_acc.id,
            "cost_account_id": cogs_acc.id,
            "lines": [
                {"line_kind": "goods", "item_id": item1["id"], "description": "ردیف یک", "quantity": 2, "unit_price": "1000"},
                {"line_kind": "goods", "item_id": item2["id"], "description": "ردیف دو", "quantity": 1, "unit_price": "2000"},
            ],
        },
    )
    _post(db, cid, u, doc_res)
    ni_id = db.query(NativeInvoice.id).filter_by(company_id=cid).scalar()
    ni = db.get(NativeInvoice, ni_id)

    memory = "A11121"
    days = (sale_date - date(1970, 1, 1)).days
    digits = f"6511121{days:06d}{1:012d}"
    check = next(str(i) for i in range(10) if _verhoeff_valid(digits + str(i)))
    tax_id = f"{memory}{days:05X}{1:010X}{check}"

    profile = MoadianProfile(MoadianCredentials(memory, b"k", b"c"), "09876543210")
    from didban import moadian_service

    orig_loader = moadian_service.load_profile
    moadian_service.load_profile = lambda c: profile if c == cid else None
    try:
        # Buyer economic_code mismatch against frozen party snapshot must be rejected
        bad_input = MoadianInvoiceInput(
            invoice_id=ni.id,
            invoice_version=ni.version,
            tax_id=tax_id,
            issued_at="2026-05-10T10:00:00+03:30",
            buyer_type="legal",
            buyer_tax_number="99999999999",
            item_tax_id="1234567890123",
            unit_code="1627",
            vat_treatment="exempt",
            vat_evidence="ساختگی",
        )
        with pytest.raises(DomainError) as mismatch:
            moadian_preview(db, cid, u, mem, bad_input)
        assert mismatch.value.code == "moadian_buyer_mismatch"

        ok_input = MoadianInvoiceInput(
            invoice_id=ni.id,
            invoice_version=ni.version,
            tax_id=tax_id,
            issued_at="2026-05-10T10:00:00+03:30",
            buyer_type="legal",
            buyer_tax_number="14001122334",
            item_tax_id="1234567890123",
            unit_code="1627",
            vat_treatment="exempt",
            vat_evidence="ساختگی",
        )
        rev = moadian_preview(db, cid, u, mem, ok_input)
        assert rev["commercial_document_id"] == doc_res["document"]["id"]
        assert rev["amount"] == "3900"
        assert rev["invoice_subject"] == 1

        # Build multi-line payload verifies both commercial lines and exact D24 discount split (50 + 50 = 100)
        from didban.moadian_service import _commercial_context
        from didban.native_invoice_service import detail as inv_detail

        _cdoc, clines = _commercial_context(db, cid, ni.id)
        pkt = build_payload(inv_detail(db, cid, u, ni.id), ok_input, memory, "09876543210", commercial_lines=clines)
        assert len(pkt["body"]) == 2
        assert pkt["header"]["tprdis"] == 4000
        assert pkt["header"]["tdis"] == 100
        assert pkt["header"]["tbill"] == 3900
    finally:
        moadian_service.load_profile = orig_loader


def test_d36_payroll_confidentiality_permission_enforcement(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
owner = client_for("owner")
manager = client_for("finance_manager")
advisor = client_for("advisor")
viewer = client_for("viewer")

# Without explicit view_payroll grant, owner/advisor/viewer are denied confidential payroll reads
assert viewer.get(base + "/employees").status_code == 403
assert viewer.get(base + "/payroll/runs").status_code == 403
assert viewer.get(base + "/employee-reports").status_code == 403
assert owner.get(base + "/employees").status_code == 403
assert advisor.get(base + "/employees").status_code == 403

# Finance manager retains implicit payroll access
emp_res = command(manager, "POST", base + "/employees", {
    "first_name": "مریم",
    "last_name": "مرادی",
    "national_id": "0019998877",
})
assert emp_res.status_code == 201, emp_res.text
emp_id = emp_res.json()["id"]

# Viewer cannot be granted view_payroll
perms = owner.get(base + "/accounting/permissions").json()["items"]
viewer_mem = next(item for item in perms if item["role"] == "viewer")
advisor_mem = next(item for item in perms if item["role"] == "advisor")
assert command(
    owner,
    "PATCH",
    base + f"/accounting/permissions/{viewer_mem['membership_id']}",
    {"post_journal": False, "reopen_period": False, "view_payroll": True},
    version=viewer_mem["version"],
).status_code == 403

# Owner grants explicit view_payroll to advisor -> advisor can now read/manage employees
assert command(
    owner,
    "PATCH",
    base + f"/accounting/permissions/{advisor_mem['membership_id']}",
    {"post_journal": False, "reopen_period": False, "view_payroll": True},
    version=advisor_mem["version"],
).status_code == 200
assert advisor.get(base + f"/employees/{emp_id}").status_code == 200
""",
    )
