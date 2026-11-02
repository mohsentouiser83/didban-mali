"""Native controls are evidence snapshots, never a fraud verdict or journal mutation."""

from datetime import date

import pytest
from sqlalchemy import func, select
from test_posting import book as book
from test_posting import data

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_service import save_draft
from didban.errors import DomainError
from didban.native_control_models import NativeControlRun
from didban.native_control_service import build, on_postings, save
from didban.native_roles_service import save_role
from didban.posting_models import NativeJournal
from didban.posting_service import create_reversal, post_batch, preview


def post(db, *, amount="10", period_id="p", day=date(2026, 11, 1)):
    actor = db.get(m.User, "finance_manager")
    value = data(db, amount)
    value.update(period_id=period_id, date=day, unit="IRR")
    draft = save_draft(db, "c", actor, value)
    checked = preview(db, "c", actor, draft["id"])
    return post_batch(
        db, "c", actor, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}]
    )["items"][0]


def test_posting_hook_is_idempotent_and_live_roles_rebuild_without_rewriting_snapshots(book):
    db = book
    actor = db.get(m.User, "finance_manager")
    first = post(db)
    runs = list(db.scalars(select(NativeControlRun)))
    assert len(runs) == 1 and runs[0].trigger == "after_posting"
    old = runs[0].snapshot
    assert len(old["findings"]) == 2 and all(
        row["classification"] == "data_limitation" for row in old["findings"]
    )
    on_postings(db, "c", actor, ["p", "p"])
    assert db.scalar(select(func.count()).select_from(NativeControlRun)) == 1
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    save_role(db, "c", actor, accounts[0].id, "expense", 1)
    save_role(db, "c", actor, accounts[1].id, "bank", 1)
    assert build(db, "c", actor, "p")["findings"] == []
    latest = save(db, "c", actor, "p")
    assert latest["id"] != runs[0].id and runs[0].snapshot == old
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == 1
    assert db.scalar(select(m.JournalLine.id)) is None
    assert first["digest"] == db.get(NativeJournal, first["id"]).digest


def test_same_financial_profiles_are_review_only_and_reversed_sources_leave_current_group(book):
    db = book
    actor = db.get(m.User, "finance_manager")
    first = post(db, amount="9007199254740993")
    post(db, amount="9007199254740993")
    snapshot = build(db, "c", actor, "p")
    similar = next(row for row in snapshot["findings"] if row["code"] == "native_similar_journals")
    assert similar["classification"] == "review" and similar["amount"] == "18014398509481986"
    assert len(similar["journal_refs"]) == 2 and snapshot["risk_assessment"] == "not_calibrated"
    reverse = create_reversal(
        db, "c", actor, first["id"], {"period_id": "p", "date": date(2026, 11, 2), "reason": "اصلاح سند"}
    )
    checked = preview(db, "c", actor, reverse["id"])
    post_batch(db, "c", actor, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
    assert not any(row["code"] == "native_similar_journals" for row in build(db, "c", actor, "p")["findings"])


def test_native_expense_comparison_requires_comparable_evidence_and_excludes_imported_facts(book):
    db = book
    actor = db.get(m.User, "finance_manager")
    db.add(
        m.Period(id="previous", company_id="c", name="قبل", start=date(2025, 1, 1), end=date(2025, 12, 31))
    )
    db.flush()
    db.get(m.Period, "p").previous_period_id = "previous"
    db.flush()
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    save_role(db, "c", actor, accounts[0].id, "expense", 1)
    save_role(db, "c", actor, accounts[1].id, "bank", 1)
    post(db, amount="30")
    assert build(db, "c", actor, "p")["expense_comparison"]["status"] == "unavailable"
    post(db, amount="10", period_id="previous", day=date(2025, 11, 1))
    compared = build(db, "c", actor, "p")["expense_comparison"]
    assert compared["status"] == "available" and compared["difference"] == "20"
    assert compared["rows"][0]["current"] == "30" and compared["rows"][0]["previous"] == "10"
    assert compared["risk_assessment"] == "not_calibrated"
    db.get(m.Period, "previous").end = date(2025, 12, 30)
    db.flush()
    assert build(db, "c", actor, "p")["expense_comparison"]["status"] == "unavailable"
    with pytest.raises(DomainError):
        build(db, "other", actor, "p")
    with pytest.raises(DomainError):
        save(db, "c", db.get(m.User, "viewer"), "p")


def test_http_native_control_auto_snapshot_company_scope_and_immutability(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_control_models import NativeControlRun
owner=client_for('owner');manager=client_for('finance_manager');viewer=client_for('viewer');outsider=client_for('outsider')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','rev')])
draft=command(owner,'POST',base+'/accounting/drafts',{'period_id':period_id,'date':'2026-09-01','description':'خدمات','unit':'IRR','lines':[{'account_id':'ar','party_id':'customer','debit':'100','credit':'0'},{'account_id':'rev','party_id':'customer','debit':'0','credit':'100'}]}).json()
checked=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
assert command(manager,'POST',base+'/accounting/postings',{'items':[{key:checked[key] for key in ('draft_id','expected_version','digest')}]}).status_code==201
path=base+'/accounting/native-controls'
current=viewer.get(path,params={'period_id':period_id});assert current.status_code==200,current.text
assert current.json()['basis']=='native_book' and current.json()['finding_count']==2 and current.json()['includes_imported_ledger'] is False
runs=viewer.get(path+'/runs',params={'period_id':period_id}).json()['items'];assert len(runs)==1 and runs[0]['trigger']=='after_posting'
assert command(viewer,'POST',path+'/runs',{'period_id':period_id}).status_code==403
assert outsider.get(path+'/runs/'+runs[0]['id']).status_code==404
assert command(owner,'POST',path+'/runs',{'period_id':period_id}).json()['id']==runs[0]['id']
try:
    with transaction('company-a') as db:db.execute(update(NativeControlRun).values(trigger='changed'))
except IntegrityError:pass
else:raise AssertionError('Native audit snapshots must be immutable')
with transaction('company-a') as db:
    assert db.scalar(select(m.Notification.id)) is None
    assert db.scalar(select(m.JournalLine.id)) is None
    member=db.get(m.Membership,members['viewer']);member.active=False
assert viewer.get(path+'/runs/'+runs[0]['id']).status_code==404
""",
    )
