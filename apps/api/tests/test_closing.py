"""Closing and opening are pinned native-only draft proposals requiring separate approval."""

from datetime import date

import pytest
from sqlalchemy import select
from test_posting import approval, data
from test_posting import book as book

from didban import models as m
from didban.accounting_models import Account, Draft
from didban.accounting_service import save_account, save_draft
from didban.closing_models import PeriodAccountingDraft
from didban.closing_service import create_closing, create_opening
from didban.errors import DomainError
from didban.native_reporting_service import save_role
from didban.period_lock_models import PeriodLock
from didban.posting_models import NativeJournal
from didban.posting_service import discard_draft, post_batch, trial_balance


def setup(db):
    user = db.get(m.User, "finance_manager")
    accounts = list(db.scalars(select(Account).order_by(Account.code)))
    result = save_account(db, "c", user, {"code": "003", "name": "نتیجه", "active": True})
    save_role(db, "c", user, accounts[0].id, "bank", 1)
    save_role(db, "c", user, accounts[1].id, "revenue", 1)
    save_role(db, "c", user, result["id"], "equity", 1)
    draft = save_draft(db, "c", user, data(db, "100"))
    post_batch(db, "c", user, [approval(db, draft)])
    return user, accounts, result


def test_explicit_closing_preserves_originals_and_opening_carries_only_selected_balances(book):
    db = book
    user, accounts, result = setup(db)
    closing = create_closing(
        db,
        "c",
        user,
        {
            "period_id": "p",
            "account_ids": [accounts[1].id],
            "result_account_id": result["id"],
            "reason": "حساب درآمد انتخاب شد",
        },
    )
    assert len(list(db.scalars(select(NativeJournal)))) == 1
    checked = approval(db, closing)
    posted = post_batch(db, "c", user, [checked])["items"][0]
    assert posted["snapshot"]["period_accounting"]["scope"] == "explicit_selected_accounts"
    balance = trial_balance(db, "c", user, "p")
    assert next(row for row in balance["items"] if row["code"] == "002")["balance"] == "0"
    assert next(row for row in balance["items"] if row["code"] == "003")["balance"] == "-1000"
    with pytest.raises(DomainError):
        create_closing(
            db,
            "c",
            user,
            {
                "period_id": "p",
                "account_ids": [accounts[1].id],
                "result_account_id": result["id"],
                "reason": "دوباره",
            },
        )
    db.add(m.Period(id="next", company_id="c", name="بعد", start=date(2027, 1, 1), end=date(2027, 12, 31)))
    db.flush()
    opening_data = {
        "source_period_id": "p",
        "target_period_id": "next",
        "account_ids": [accounts[0].id, result["id"]],
        "reason": "حساب‌های ترازنامه انتخاب شد",
    }
    with pytest.raises(DomainError):
        create_opening(db, "c", user, opening_data)
    db.add(PeriodLock(company_id="c", period_id="p", closed=True))
    db.flush()
    opening = create_opening(db, "c", user, opening_data)
    assert opening["date"] == date(2027, 1, 1)
    post_batch(db, "c", user, [approval(db, opening)])
    assert trial_balance(db, "c", user, "next")["total_debit"] == "1000"
    assert db.scalar(select(m.JournalLine.id)) is None


def test_stale_source_and_modified_draft_require_regeneration_and_can_discard(book):
    db = book
    user, accounts, result = setup(db)
    proposal = {
        "period_id": "p",
        "account_ids": [accounts[1].id],
        "result_account_id": result["id"],
        "reason": "بستن",
    }
    closing = create_closing(db, "c", user, proposal)
    checked = approval(db, closing)
    other = save_draft(db, "c", user, data(db, "20"))
    post_batch(db, "c", user, [approval(db, other)])
    with pytest.raises(DomainError) as error:
        post_batch(db, "c", user, [checked])
    assert error.value.code == "period_source_changed"
    discarded = discard_draft(db, "c", user, closing["id"], "مبنای تازه", 1)
    assert discarded["state"] == "discarded"
    with pytest.raises(DomainError):
        post_batch(db, "c", user, [checked])
    fresh = create_closing(db, "c", user, proposal)
    save_draft(db, "c", user, data(db, "999"), fresh["id"], 1)
    with pytest.raises(DomainError) as error:
        post_batch(db, "c", user, [approval(db, fresh)])
    assert error.value.code == "period_draft_changed"


def test_period_draft_cannot_share_posting_batch_and_reopened_source_invalidates_opening(book):
    db = book
    user, accounts, result = setup(db)
    closing = create_closing(
        db,
        "c",
        user,
        {
            "period_id": "p",
            "account_ids": [accounts[1].id],
            "result_account_id": result["id"],
            "reason": "بستن",
        },
    )
    other = save_draft(db, "c", user, data(db, "20"))
    with pytest.raises(DomainError) as error:
        post_batch(db, "c", user, [approval(db, closing), approval(db, other)])
    assert error.value.code == "period_draft_post_alone"
    assert db.get(Draft, other["id"]).state == "draft"
    post_batch(db, "c", user, [approval(db, closing)])
    discard_draft(db, "c", user, other["id"], "کنارگذاشتن", 1)
    db.add(m.Period(id="next", company_id="c", name="بعد", start=date(2027, 1, 1), end=date(2027, 12, 31)))
    lock = PeriodLock(company_id="c", period_id="p", closed=True)
    db.add(lock)
    db.flush()
    opening = create_opening(
        db,
        "c",
        user,
        {
            "source_period_id": "p",
            "target_period_id": "next",
            "account_ids": [accounts[0].id, result["id"]],
            "reason": "انتقال",
        },
    )
    checked = approval(db, opening)
    lock.closed = False
    db.flush()
    with pytest.raises(DomainError) as error:
        post_batch(db, "c", user, [checked])
    assert error.value.code == "opening_source_open"
    assert len(list(db.scalars(select(PeriodAccountingDraft)))) == 2


def test_http_closing_draft_replay_and_immutable_provenance(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.closing_models import PeriodAccountingDraft
from didban.posting_models import NativeJournal
manager=client_for("finance_manager");owner=client_for("owner");viewer=client_for("viewer")
path=base+"/accounting"
with transaction("company-a") as db:db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"))
accounts=[]
for code in ("001","002","003"):
    response=command(owner,"POST",path+"/accounts",{"code":code,"name":code,"active":True})
    assert response.status_code==201,response.text
    accounts.append(response.json()["id"])
for account_id,role in zip(accounts,("bank","revenue","equity")):
    assert command(owner,"PATCH",path+"/account-roles/"+account_id,{"role":role}).status_code==200
body={"period_id":period_id,"date":"2026-09-01","description":"خدمات","unit":"IRR","lines":[{"account_id":accounts[0],"party_id":"customer","debit":"100","credit":"0"},{"account_id":accounts[1],"party_id":"customer","debit":"0","credit":"100"}]}
draft=command(manager,"POST",path+"/drafts",body).json()
def confirm(draft):
    checked=manager.get(path+"/drafts/"+draft["id"]+"/posting-preview").json()
    return command(manager,"POST",path+"/postings",{"items":[{key:checked[key] for key in ("draft_id","expected_version","digest")}]})
assert confirm(draft).status_code==201
proposal={"period_id":period_id,"account_ids":[accounts[1]],"result_account_id":accounts[2],"reason":"انتخاب صریح درآمد و نتیجه"}
assert command(viewer,"POST",path+"/period-closing-drafts",proposal).status_code==403
key=str(uuid4());created=command(manager,"POST",path+"/period-closing-drafts",proposal,key=key)
assert created.status_code==201,created.text
assert command(manager,"POST",path+"/period-closing-drafts",proposal,key=key).json()["id"]==created.json()["id"]
with transaction("company-a") as db:assert len(list(db.scalars(select(NativeJournal))))==1
assert confirm(created.json()).status_code==201
try:
    with transaction("company-a") as db:db.execute(update(PeriodAccountingDraft).values(reason="changed"))
except IntegrityError:pass
else:raise AssertionError("Closing selection provenance must be immutable")
initialize()
""",
    )


def test_roles_prevent_closing_bank_and_pin_exact_assignment_versions(book):
    from didban.posting_service import preview

    db = book
    user, accounts, result = setup(db)
    proposal = {
        "period_id": "p",
        "account_ids": [accounts[1].id],
        "result_account_id": result["id"],
        "reason": "بستن",
    }
    with pytest.raises(DomainError) as error:
        create_closing(db, "c", user, {**proposal, "account_ids": [accounts[0].id]})
    assert error.value.code == "period_account_role_invalid"
    with pytest.raises(DomainError):
        create_closing(db, "c", user, {**proposal, "result_account_id": accounts[0].id})
    draft = create_closing(db, "c", user, proposal)
    checked = approval(db, draft)
    assert all(row["version"] == 2 for row in draft["period_accounting"]["selection"]["account_roles"])
    save_role(db, "c", user, accounts[1].id, "expense", 2)
    with pytest.raises(DomainError) as error:
        preview(db, "c", user, draft["id"])
    assert error.value.code == "period_account_roles_changed"
    with pytest.raises(DomainError):
        post_batch(db, "c", user, [checked])
    assert db.get(Draft, draft["id"]).state == "draft"
    save_role(db, "c", user, accounts[1].id, None, 3)
    with pytest.raises(DomainError) as error:
        create_closing(db, "c", user, proposal)
    assert error.value.code == "period_account_role_missing"


def test_opening_does_not_carry_revenue_accounts(book):
    db = book
    user, accounts, _result = setup(db)
    db.add(m.Period(id="next", company_id="c", name="بعد", start=date(2027, 1, 1), end=date(2027, 12, 31)))
    db.add(PeriodLock(company_id="c", period_id="p", closed=True))
    db.flush()
    with pytest.raises(DomainError) as error:
        create_opening(
            db,
            "c",
            user,
            {
                "source_period_id": "p",
                "target_period_id": "next",
                "account_ids": [accounts[0].id, accounts[1].id],
                "reason": "نباید درآمد منتقل شود",
            },
        )
    assert error.value.code == "period_account_role_invalid"


def test_active_replacement_closing_blocks_second_closing(book):
    from didban.posting_service import create_replacement, create_reversal

    db = book
    user, accounts, result = setup(db)
    proposal = {
        "period_id": "p",
        "account_ids": [accounts[1].id],
        "result_account_id": result["id"],
        "reason": "بستن",
    }
    draft = create_closing(db, "c", user, proposal)
    original = post_batch(db, "c", user, [approval(db, draft)])["items"][0]
    reversal = create_reversal(
        db, "c", user, original["id"], {"period_id": "p", "date": date(2026, 12, 31), "reason": "اصلاح بستن"}
    )
    post_batch(db, "c", user, [approval(db, reversal)])
    replacement = create_replacement(
        db,
        "c",
        user,
        original["id"],
        {
            "period_id": "p",
            "date": date(2026, 12, 31),
            "description": "جایگزین بستن",
            "unit": "IRR",
            "lines": [
                {key: row[key] for key in ("account_id", "party_id", "debit", "credit")}
                for row in original["snapshot"]["lines"]
            ],
            "reason": "جایگزینی",
        },
    )
    post_batch(db, "c", user, [approval(db, replacement)])
    extra = save_draft(db, "c", user, {**data(db, "20"), "unit": "IRR"})
    post_batch(db, "c", user, [approval(db, extra)])
    with pytest.raises(DomainError) as error:
        create_closing(db, "c", user, proposal)
    assert error.value.code == "period_closing_exists"
