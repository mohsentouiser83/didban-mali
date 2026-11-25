from datetime import date

from sqlalchemy.orm import Session

from didban.accounting_models import Account, AccountHierarchy
from didban.electronic_ledgers_service import get_electronic_ledger
from didban.posting_models import NativeJournal


def test_electronic_ledger_daily_sequential_numbering(db_session: Session, test_company_context):
    company = test_company_context["company"].id
    user = test_company_context["users"]["owner"]
    # Setup accounts: Group, General and Subsidiary
    acc_grp = Account(
        company_id=company,
        code="10",
        name="دارایی‌های جاری",
        nature="debit",
        active=True,
    )
    acc_gen = Account(
        company_id=company,
        code="11",
        name="موجودی نقد و بانک",
        nature="debit",
        active=True,
    )
    acc_sub = Account(
        company_id=company,
        code="1101",
        name="بانک سامان",
        nature="debit",
        active=True,
    )
    acc_sales = Account(
        company_id=company,
        code="4101",
        name="درآمد فروش",
        nature="credit",
        active=True,
    )
    db_session.add_all([acc_grp, acc_gen, acc_sub, acc_sales])
    db_session.flush()

    h_grp = AccountHierarchy(company_id=company, account_id=acc_grp.id, level="group", parent_id=None)
    h_gen = AccountHierarchy(company_id=company, account_id=acc_gen.id, level="general", parent_id=acc_grp.id)
    h_sub = AccountHierarchy(company_id=company, account_id=acc_sub.id, level="subsidiary", parent_id=acc_gen.id)
    db_session.add_all([h_grp, h_gen, h_sub])
    db_session.flush()

    # Create journals on 1st Farvardin (Day 1) and 3rd Farvardin (Day 2 sequential)
    d1 = date(2026, 3, 21)  # 1 Farvardin
    d3 = date(2026, 3, 23)  # 3 Farvardin (2 Farvardin has no entries)

    j1 = NativeJournal(
        company_id=company,
        draft_id="d1",
        draft_version=1,
        period_id="p1",
        date=d1,
        sequence=101,
        digest="sha1",
        snapshot={
            "description": "فروش نقد شماره ۱",
            "lines": [
                {"account_id": acc_sub.id, "debit": "1000000", "credit": "0"},
                {"account_id": acc_sales.id, "debit": "0", "credit": "1000000"},
            ],
        },
        actor_id=user.id,
        permission_provenance={},
    )
    j2 = NativeJournal(
        company_id=company,
        draft_id="d2",
        draft_version=1,
        period_id="p1",
        date=d1,
        sequence=102,
        digest="sha2",
        snapshot={
            "description": "فروش نقد شماره ۲ در همان روز",
            "lines": [
                {"account_id": acc_sub.id, "debit": "500000", "credit": "0"},
                {"account_id": acc_sales.id, "debit": "0", "credit": "500000"},
            ],
        },
        actor_id=user.id,
        permission_provenance={},
    )
    j3 = NativeJournal(
        company_id=company,
        draft_id="d3",
        draft_version=1,
        period_id="p1",
        date=d3,
        sequence=103,
        digest="sha3",
        snapshot={
            "description": "فروش دو روز بعد",
            "lines": [
                {"account_id": acc_sub.id, "debit": "2000000", "credit": "0"},
                {"account_id": acc_sales.id, "debit": "0", "credit": "2000000"},
            ],
        },
        actor_id=user.id,
        permission_provenance={},
    )
    db_session.add_all([j1, j2, j3])
    db_session.flush()

    # 1. Test General Ledger with auto daily numbering
    result_gen = get_electronic_ledger(
        db_session, company, level="general", auto_daily_numbering=True, include_turnover=True
    )
    assert result_gen["dates_count"] == 2
    assert result_gen["total_journals"] == 3

    # Check bank general account entries
    bank_group = next(item for item in result_gen["items"] if item["account"]["code"] == "11")
    entries = bank_group["entries"]
    assert len(entries) == 3
    # First day entries must have daily_doc_no == 1
    assert entries[0]["daily_doc_no"] == 1
    assert entries[1]["daily_doc_no"] == 1
    # Day 3 entries must have daily_doc_no == 2! (sequential per date)
    assert entries[2]["daily_doc_no"] == 2

    # 2. Test Subsidiary Ledger
    result_sub = get_electronic_ledger(
        db_session, company, level="subsidiary", auto_daily_numbering=True, include_turnover=True
    )
    sub_bank = next(item for item in result_sub["items"] if item["account"]["code"] == "1101")
    assert sub_bank["total_debit"] == "3500000"
    assert sub_bank["total_credit"] == "0"
    assert len(sub_bank["entries"]) == 3
    assert sub_bank["entries"][0]["daily_doc_no"] == 1
    assert sub_bank["entries"][1]["daily_doc_no"] == 1
    assert sub_bank["entries"][2]["daily_doc_no"] == 2


def test_electronic_ledger_four_level_rollup_excludes_group(db_session: Session, test_company_context):
    company = test_company_context["company"].id
    user = test_company_context["users"]["owner"]
    acc_grp = Account(company_id=company, code="11", name="دارایی جاری", nature="debit", active=True)
    acc_gen = Account(company_id=company, code="1101", name="نقد و بانک", nature="debit", active=True)
    acc_sub = Account(company_id=company, code="110101", name="بانک‌ها", nature="debit", active=True)
    acc_det = Account(company_id=company, code="11010101", name="بانک ملت", nature="debit", active=True)
    acc_rev = Account(company_id=company, code="410101", name="درآمد", nature="credit", active=True)
    db_session.add_all([acc_grp, acc_gen, acc_sub, acc_det, acc_rev])
    db_session.flush()
    db_session.add_all([
        AccountHierarchy(company_id=company, account_id=acc_grp.id, level="group", parent_id=None),
        AccountHierarchy(company_id=company, account_id=acc_gen.id, level="general", parent_id=acc_grp.id),
        AccountHierarchy(company_id=company, account_id=acc_sub.id, level="subsidiary", parent_id=acc_gen.id),
        AccountHierarchy(company_id=company, account_id=acc_det.id, level="detail", parent_id=acc_sub.id),
    ])
    db_session.flush()
    db_session.add(NativeJournal(
        company_id=company, draft_id="d-det", draft_version=1, period_id="p1",
        date=date(2026, 4, 1), sequence=201, digest="sha-det",
        snapshot={"description": "فروش", "lines": [
            {"account_id": acc_det.id, "debit": "500000", "credit": "0"},
            {"account_id": acc_rev.id, "debit": "0", "credit": "500000"},
        ]},
        actor_id=user.id, permission_provenance={},
    ))
    db_session.flush()

    gen_ledger = get_electronic_ledger(db_session, company, level="general")
    codes = {item["account"]["code"] for item in gen_ledger["items"]}
    assert "1101" in codes and "11" not in codes

    sub_ledger = get_electronic_ledger(db_session, company, level="subsidiary")
    sub_item = next(item for item in sub_ledger["items"] if item["account"]["code"] == "110101")
    assert sub_item["total_debit"] == "500000"
    assert sub_item["account"]["parent_code"] == "1101"


def test_electronic_ledger_reversal_cutoff_opening_balance_and_excel_precision(db_session: Session, test_company_context):
    import io

    import openpyxl

    from didban.electronic_ledgers_service import export_electronic_ledger_xlsx

    company = test_company_context["company"].id
    user = test_company_context["users"]["owner"]
    acc_grp = Account(company_id=company, code="11", name="دارایی", nature="debit", active=True)
    acc_gen = Account(company_id=company, code="1101", name="بانک‌ها", nature="debit", active=True)
    acc_sub = Account(company_id=company, code="110101", name="بانک ملت", nature="debit", active=True)
    acc_rev_grp = Account(company_id=company, code="41", name="درآمد", nature="credit", active=True)
    acc_rev_gen = Account(company_id=company, code="4101", name="فروش", nature="credit", active=True)
    acc_rev_sub = Account(company_id=company, code="410101", name="فروش کالا", nature="credit", active=True)
    acc_unmapped = Account(company_id=company, code="0099", name="حساب صفر پیشرو بدون ساختار", nature="debit", active=True)
    db_session.add_all([acc_grp, acc_gen, acc_sub, acc_rev_grp, acc_rev_gen, acc_rev_sub, acc_unmapped])
    db_session.flush()
    db_session.add_all([
        AccountHierarchy(company_id=company, account_id=acc_grp.id, level="group", parent_id=None),
        AccountHierarchy(company_id=company, account_id=acc_gen.id, level="general", parent_id=acc_grp.id),
        AccountHierarchy(company_id=company, account_id=acc_sub.id, level="subsidiary", parent_id=acc_gen.id),
        AccountHierarchy(company_id=company, account_id=acc_rev_grp.id, level="group", parent_id=None),
        AccountHierarchy(company_id=company, account_id=acc_rev_gen.id, level="general", parent_id=acc_rev_grp.id),
        AccountHierarchy(company_id=company, account_id=acc_rev_sub.id, level="subsidiary", parent_id=acc_rev_gen.id),
    ])
    db_session.flush()

    m1 = date(2026, 4, 5)
    m2 = date(2026, 5, 10)
    j1 = NativeJournal(
        company_id=company, draft_id="d1", draft_version=1, period_id="p1",
        date=m1, sequence=1, digest="s1",
        snapshot={"description": "فروش بزرگ", "lines": [
            {"account_id": acc_sub.id, "debit": "9007199254740993", "credit": "0"},
            {"account_id": acc_rev_sub.id, "debit": "0", "credit": "9007199254740993"},
        ]},
        actor_id=user.id, permission_provenance={},
    )
    j2 = NativeJournal(
        company_id=company, draft_id="d2", draft_version=1, period_id="p1",
        date=m1, sequence=2, digest="s2",
        snapshot={"description": "ثبت با کد صفر پیشرو", "lines": [
            {"account_id": acc_unmapped.id, "debit": "100", "credit": "0"},
            {"account_id": acc_rev_sub.id, "debit": "0", "credit": "100"},
        ]},
        actor_id=user.id, permission_provenance={},
    )
    db_session.add_all([j1, j2])
    db_session.flush()
    j1_rev = NativeJournal(
        company_id=company, draft_id="d3", draft_version=1, period_id="p1",
        date=m2, sequence=3, digest="s3", reversal_of=j1.id,
        snapshot={"description": "برگشت در ماه بعد", "lines": [
            {"account_id": acc_sub.id, "debit": "0", "credit": "9007199254740993"},
            {"account_id": acc_rev_sub.id, "debit": "9007199254740993", "credit": "0"},
        ]},
        actor_id=user.id, permission_provenance={},
    )
    db_session.add(j1_rev)
    db_session.flush()

    # 1. Cutoff before reversal MUST show the original entry!
    before_rev = get_electronic_ledger(db_session, company, level="general", to_date=date(2026, 4, 30))
    assert before_rev["total_journals"] == 2
    bank_before = next(i for i in before_rev["items"] if i["account"]["code"] == "1101")
    assert bank_before["total_debit"] == "9007199254740993"
    assert bank_before["final_balance"] == "9007199254740993"
    assert bank_before["entries"][0]["daily_doc_no"] == 1
    assert bank_before["entries"][0]["journal_sequence"] == 1

    # 2. Range covering both dates shows both original and reversal in their own dates
    full = get_electronic_ledger(db_session, company, level="general", to_date=date(2026, 5, 31))
    assert full["total_journals"] == 3
    bank_full = next(i for i in full["items"] if i["account"]["code"] == "1101")
    assert len(bank_full["entries"]) == 2
    assert bank_full["entries"][0]["debit"] == "9007199254740993"
    assert bank_full["entries"][1]["credit"] == "9007199254740993"
    assert bank_full["entries"][1]["is_reversal"] is True
    assert bank_full["final_balance"] == "0"
    assert bank_full["entries"][1]["daily_doc_no"] == 2

    # 3. Partial range starting in Month 2 keeps daily_doc_no == 2 and computes opening balance!
    partial = get_electronic_ledger(
        db_session, company, level="general", from_date=date(2026, 5, 1), to_date=date(2026, 5, 31)
    )
    bank_partial = next(i for i in partial["items"] if i["account"]["code"] == "1101")
    assert bank_partial["opening_balance"] == "9007199254740993"
    assert bank_partial["opening_nature"] == "بدهکار"
    assert bank_partial["total_debit"] == "0"
    assert bank_partial["total_credit"] == "9007199254740993"
    assert bank_partial["final_balance"] == "0"
    assert bank_partial["entries"][0]["daily_doc_no"] == 2
    assert bank_partial["entries"][0]["journal_sequence"] == 3

    # 4. Unmapped account is explicitly flagged, never silently dropped
    assert partial["unmapped_accounts_count"] >= 1
    unmapped = next(i for i in partial["items"] if i["account"]["code"] == "0099")
    assert unmapped["account"]["mapping_status"] == "unclassified"
    assert unmapped["opening_balance"] == "100"
    assert unmapped["final_balance"] == "100"

    # 5. Excel exports preserve exact string amounts (9007199254740993) and leading zeros (0099)
    mgmt_bytes = export_electronic_ledger_xlsx(db_session, company, level="general", export_mode="management")
    wb_mgmt = openpyxl.load_workbook(io.BytesIO(mgmt_bytes))
    ws_mgmt = wb_mgmt.active
    headers = [c.value for c in ws_mgmt[1]]
    debit_vals = [ws_mgmt.cell(r, headers.index("بدهکار (ریال)") + 1).value for r in range(2, ws_mgmt.max_row + 1)]
    assert "9007199254740993" in debit_vals
    assert ws_mgmt.cell(2, headers.index("بدهکار (ریال)") + 1).data_type == "s"
    codes = [ws_mgmt.cell(r, headers.index("کد حساب ردیف") + 1).value for r in range(2, ws_mgmt.max_row + 1)]
    assert "0099" in codes

    draft_bytes = export_electronic_ledger_xlsx(db_session, company, level="general", export_mode="upload_draft")
    wb_draft = openpyxl.load_workbook(io.BytesIO(draft_bytes))
    assert "پیش‌نویس دفاتر" in wb_draft.sheetnames
    assert "وضعیت قالب" in wb_draft.sheetnames
    ws_draft = wb_draft["پیش‌نویس دفاتر"]
    d_headers = [c.value for c in ws_draft[1]]
    assert "کد کل" in d_headers and "کد معین" in d_headers
    assert ws_draft.cell(2, d_headers.index("بدهکار (ریال)") + 1).value == "9007199254740993"
    assert ws_draft.cell(2, d_headers.index("بدهکار (ریال)") + 1).data_type == "s"
