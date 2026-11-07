"""Final native posting is exact, authorized, immutable and independent of imported facts."""

from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from didban import models as m
from didban.accounting_models import Account, Draft
from didban.accounting_service import grant, save_account, save_draft
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.errors import DomainError
from didban.period_lock_models import PeriodLock
from didban.posting_models import NativeJournal
from didban.posting_service import create_replacement, create_reversal, post_batch, preview, trial_balance


@pytest.fixture
def book():
    engine = create_engine("sqlite://")
    m.Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        db.add_all([m.Company(id="c", name="شرکت"), m.Company(id="other", name="دیگر")])
        for role in ("owner", "finance_manager", "advisor", "viewer", "outsider"):
            db.add(m.User(id=role, email=role + "@example.test", name=role, password_hash="unused"))
        db.flush()
        for role in ("owner", "finance_manager", "advisor", "viewer"):
            db.add(m.Membership(id=role, company_id="c", user_id=role, role=role))
        db.add(m.Period(id="p", company_id="c", name="سال", start=date(2026, 1, 1), end=date(2026, 12, 31)))
        db.add(CompanyAccountingSetup(company_id="c", mode="primary"))
        db.flush()
        for code in ("001", "002"):
            save_account(db, "c", db.get(m.User, "owner"), {"code": code, "name": code, "active": True})
        db.flush()
        yield db


def data(db, amount="9007199254740993"):
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    return {
        "period_id": "p",
        "date": date(2026, 11, 1),
        "description": "خدمات",
        "unit": "TOMAN",
        "lines": [
            {"account_id": accounts[0].id, "party_id": "customer", "debit": amount, "credit": "0"},
            {"account_id": accounts[1].id, "party_id": "customer", "debit": "0", "credit": amount},
        ],
    }


def approval(db, draft, actor="finance_manager"):
    item = preview(db, "c", db.get(m.User, actor), draft["id"])
    return {key: item[key] for key in ("draft_id", "expected_version", "digest")}


def test_exact_posting_snapshot_authority_and_native_only_balance(book):
    db = book
    user = db.get(m.User, "finance_manager")
    draft = save_draft(db, "c", user, data(db))
    checked = approval(db, draft)
    result = post_batch(db, "c", user, [checked])["items"][0]
    assert result["sequence"] == 1 and result["draft_version"] == 1
    assert result["snapshot"]["lines"][0]["debit"] == "90071992547409930"
    assert result["snapshot"]["lines"][0]["original_debit"] == "9007199254740993"
    assert result["snapshot"]["lines"][0]["code"] == "001"
    assert result["permission_provenance"]["source"] == "role:finance_manager"
    assert db.get(Draft, draft["id"]).state == "posted"
    assert db.scalar(select(m.JournalLine.id)) is None
    report = trial_balance(db, "c", user, "p")
    assert report["total_debit"] == report["total_credit"] == "90071992547409930"
    assert report["basis"] == "native_book" and report["includes_imported_ledger"] is False
    with pytest.raises(DomainError):
        post_batch(db, "c", user, [checked])
    with pytest.raises(DomainError):
        save_draft(db, "c", user, data(db), draft["id"], 2)


def test_live_grant_revocation_and_independent_permissions(book):
    db = book
    owner = db.get(m.User, "owner")
    advisor = db.get(m.User, "advisor")
    draft = save_draft(db, "c", advisor, data(db))
    checked = approval(db, draft)
    with pytest.raises(DomainError):
        post_batch(db, "c", owner, [checked])
    grant(db, "c", owner, "advisor", {"post_journal": True, "reopen_period": False}, 1)
    grant(db, "c", owner, "advisor", {"post_journal": False, "reopen_period": False}, 2)
    with pytest.raises(DomainError):
        post_batch(db, "c", advisor, [checked])
    grant(db, "c", owner, "advisor", {"post_journal": True, "reopen_period": False}, 3)
    posted = post_batch(db, "c", advisor, [checked])["items"][0]
    assert posted["permission_provenance"]["source"] == "explicit_post_journal"
    assert db.scalar(select(m.ReportApproval.id)) is None
    assert not db.get(m.Membership, "advisor").approve_financial_report


def test_stale_account_and_atomic_batch_validation(book):
    db = book
    user = db.get(m.User, "finance_manager")
    first = save_draft(db, "c", user, data(db, "10"))
    second = save_draft(db, "c", user, data(db, "20"))
    one = approval(db, first)
    two = approval(db, second)
    save_draft(db, "c", user, data(db, "30"), second["id"], 1)
    with pytest.raises(DomainError):
        post_batch(db, "c", user, [one, two])
    assert db.get(Draft, first["id"]).state == "draft"
    assert db.scalar(select(NativeJournal.id)) is None
    account = db.get(Account, first["lines"][0]["account_id"])
    account.name = "تغییر"
    account.version += 1
    db.flush()
    with pytest.raises(DomainError) as error:
        post_batch(db, "c", user, [one])
    assert error.value.code == "posting_preview_changed"
    account.active = False
    db.flush()
    with pytest.raises(DomainError):
        preview(db, "c", user, first["id"])


def test_primary_mode_closed_period_and_crosscompany_guards(book):
    db = book
    user = db.get(m.User, "finance_manager")
    draft = save_draft(db, "c", user, data(db))
    checked = approval(db, draft)
    db.get(CompanyAccountingSetup, "c").mode = "analysis"
    db.flush()
    with pytest.raises(DomainError):
        post_batch(db, "c", user, [checked])
    db.get(CompanyAccountingSetup, "c").mode = "primary"
    db.add(PeriodLock(company_id="c", period_id="p", closed=True))
    db.flush()
    with pytest.raises(DomainError):
        post_batch(db, "c", user, [checked])
    with pytest.raises(DomainError):
        save_draft(db, "c", user, data(db))
    with pytest.raises(DomainError):
        preview(db, "other", user, draft["id"])
    with pytest.raises(DomainError):
        post_batch(db, "c", db.get(m.User, "viewer"), [checked])


def test_reversal_and_replacement_each_require_explicit_approval(book):
    db = book
    user = db.get(m.User, "finance_manager")
    first = save_draft(db, "c", user, data(db, "100"))
    original = post_batch(db, "c", user, [approval(db, first)])["items"][0]
    reason = {"period_id": "p", "date": date(2026, 11, 2), "reason": "اصلاح مبلغ"}
    reversal = create_reversal(db, "c", user, original["id"], reason)
    assert len(list(db.scalars(select(NativeJournal)))) == 1
    replacement_input = {**data(db, "120"), "reason": "مبلغ صحیح"}
    with pytest.raises(DomainError):
        create_replacement(db, "c", user, original["id"], replacement_input)
    reverse_journal = post_batch(db, "c", user, [approval(db, reversal)])["items"][0]
    assert reverse_journal["reversal_of"] == original["id"]
    with pytest.raises(DomainError):
        create_reversal(db, "c", user, original["id"], reason)
    replacement = create_replacement(db, "c", user, original["id"], replacement_input)
    posted = post_batch(db, "c", user, [approval(db, replacement)])["items"][0]
    assert posted["replacement_of"] == original["id"]
    balance = trial_balance(db, "c", user, "p")
    assert next(row for row in balance["items"] if row["code"] == "001")["balance"] == "1200"
    assert len(list(db.scalars(select(NativeJournal)))) == 3


def test_modified_reversal_cannot_be_posted(book):
    db = book
    user = db.get(m.User, "finance_manager")
    draft = save_draft(db, "c", user, data(db, "100"))
    original = post_batch(db, "c", user, [approval(db, draft)])["items"][0]
    reversal = create_reversal(
        db, "c", user, original["id"], {"period_id": "p", "date": date(2026, 11, 2), "reason": "اصلاح"}
    )
    save_draft(db, "c", user, data(db, "999"), reversal["id"], 1)
    with pytest.raises(DomainError) as error:
        approval(db, reversal)
    assert error.value.code == "reversal_content_changed"


def test_http_exact_confirmation_replay_report_freeze_and_database_immutability(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.posting_models import NativeJournal, NativeBookReportRun, JournalCorrectionDraft
owner=client_for("owner");manager=client_for("finance_manager");viewer=client_for("viewer");outsider=client_for("outsider")
path=base+"/accounting"
with transaction("company-a") as db:
    db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"))
accounts=[]
for code in ("001","002"):
    response=command(owner,"POST",path+"/accounts",{"code":code,"name":code,"active":True})
    assert response.status_code==201,response.text
    accounts.append(response.json()["id"])
body={"period_id":period_id,"date":"2026-09-01","description":"خدمات آزمایشی","unit":"TOMAN","lines":[{"account_id":accounts[0],"party_id":"customer","debit":"9007199254740993","credit":"0"},{"account_id":accounts[1],"party_id":"customer","debit":"0","credit":"9007199254740993"}]}
created=command(manager,"POST",path+"/drafts",body);assert created.status_code==201,created.text
draft=created.json();checked=manager.get(path+"/drafts/"+draft["id"]+"/posting-preview").json()
payload={"items":[{key:checked[key] for key in ("draft_id","expected_version","digest")}]}
assert command(owner,"POST",path+"/postings",payload).status_code==403
assert command(viewer,"POST",path+"/postings",payload).status_code==403
key=str(uuid4());posted=command(manager,"POST",path+"/postings",payload,key=key)
assert posted.status_code==201,posted.text
assert command(manager,"POST",path+"/postings",payload,key=key).json()==posted.json()
assert command(manager,"POST",path+"/postings",payload).status_code==409
journal=posted.json()["items"][0]
# The unified document list resolves the exact final journal without paging through other documents.
listed=manager.get(path+"/journals",params={"draft_id":draft["id"]})
assert listed.status_code==200,listed.text
assert [item["id"] for item in listed.json()["items"]]==[journal["id"]]
assert manager.get(path+"/journals",params={"draft_id":"nonexistent"}).json()["items"]==[]
assert outsider.get(path+"/journals",params={"draft_id":draft["id"]}).status_code==404
assert journal["snapshot"]["lines"][0]["debit"]=="90071992547409930"
report=command(manager,"POST",path+"/trial-balance/runs",{"period_id":period_id})
assert report.status_code==201,report.text
run=report.json();assert run["snapshot"]["journal_ids"]==[journal["id"]]
assert manager.get(path+"/trial-balance/runs/"+run["id"]+"/export",params={"format":"xlsx"}).content[:2]==b"PK"
assert manager.get(path+"/trial-balance/runs/"+run["id"]+"/export",params={"format":"pdf"}).content[:4]==b"%PDF"
assert outsider.get(path+"/journals/"+journal["id"]).status_code==404
assert outsider.get(path+"/trial-balance/runs/"+run["id"]+"/export").status_code==404
reverse=command(manager,"POST",path+"/journals/"+journal["id"]+"/reversal-draft",{"period_id":period_id,"date":"2026-09-02","reason":"اصلاح آزمون"})
assert reverse.status_code==201,reverse.text
checked=manager.get(path+"/drafts/"+reverse.json()["id"]+"/posting-preview").json()
assert command(manager,"POST",path+"/postings",{"items":[{key:checked[key] for key in ("draft_id","expected_version","digest")}]}).status_code==201
# Saving a later correction never mutates the original fixed report.
assert manager.get(path+"/trial-balance/runs/"+run["id"]).json()["snapshot"]==run["snapshot"]
assert "items" not in manager.get(path+"/trial-balance/runs").json()["items"][0]["snapshot"]
for model in (NativeJournal,NativeBookReportRun,JournalCorrectionDraft):
    try:
        with transaction("company-a") as db:db.execute(update(model).values(actor_id=users["owner"]))
    except IntegrityError:pass
    else:raise AssertionError("Native journal provenance must be immutable")
with transaction("company-a") as db:
    assert len(list(db.scalars(select(NativeJournal))))==2
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.ReportApproval.id)) is None
initialize()
""",
    )


def test_aggregate_report_totals_can_exceed_single_line_storage_limit(book):
    db = book
    user = db.get(m.User, "finance_manager")
    value = "9999999999999999999999999999999"
    for _index in range(12):
        draft = save_draft(db, "c", user, {**data(db, value), "unit": "IRR"})
        post_batch(db, "c", user, [approval(db, draft)])
    report = trial_balance(db, "c", user, "p")
    assert report["total_debit"] == str(int(value) * 12)
    assert report["total_credit"] == str(int(value) * 12)
