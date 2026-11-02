from datetime import date

import pytest
from sqlalchemy import func, select
from test_native_invoices import alloc, invoice, posted, reverse_journal
from test_posting import book as book

from didban import models as m
from didban import native_invoice_revisions as revisions
from didban import native_invoice_service as service
from didban.errors import DomainError
from didban.native_invoice_models import NativeInvoice, NativeInvoiceSnapshot
from didban.posting_models import NativeJournal
from didban.posting_service import create_replacement, post_batch, preview


def replace(db, source, amount="80", day=date(2026, 10, 15), party=None):
    actor = db.get(m.User, "finance_manager")
    original = db.get(NativeJournal, source["journal_id"])
    rows = [
        dict(
            account_id=line["account_id"],
            party_id=party or line["party_id"],
            debit=amount if index == 0 else "0",
            credit=amount if index == 1 else "0",
        )
        for index, line in enumerate(original.snapshot["lines"])
    ]
    draft = create_replacement(
        db,
        "c",
        actor,
        original.id,
        dict(period_id="p", date=day, description="جایگزین", unit="IRR", reason="اصلاح مبلغ", lines=rows),
    )
    check = preview(db, "c", actor, draft["id"])
    result = post_batch(db, "c", actor, [{k: check[k] for k in ("draft_id", "expected_version", "digest")}])[
        "items"
    ][0]
    return result


def adopt(db, item, replacement):
    return revisions.adopt(
        db,
        "c",
        db.get(m.User, "advisor"),
        item["id"],
        dict(
            journal_id=replacement["id"],
            journal_digest=replacement["digest"],
            approved_draft_version=replacement["draft_version"],
            reason="پذیرش اصلاح تأییدشده",
        ),
        item["version"],
    )


def test_changed_amount_adoption_requires_release_preserves_original_and_historical_intervals(book):
    db = book
    actor = db.get(m.User, "advisor")
    original = posted(db)
    item = invoice(db, original)
    receipt = posted(db, "receipt", "60", "RCPT-REV", day=date(2026, 10, 12))
    item = alloc(db, item, receipt, "60")
    snapshot = service.snapshot(db, "c", actor, date(2026, 10, 13), "sale")
    reverse_journal(db, original, date(2026, 10, 15))
    replacement = replace(db, original)
    assert revisions.candidates(db, "c", actor, item["id"])["items"][0]["amount"] == "80"
    with pytest.raises(DomainError) as error:
        adopt(db, item, replacement)
    assert error.value.code == "native_invoice_release_old_allocations"
    item = service.reverse_allocation(
        db, "c", actor, item["id"], item["allocations"][0]["id"], "آزادسازی برای اصلاح", item["version"]
    )
    item = adopt(db, item, replacement)
    assert item["amount"] == item["remaining"] == "80" and item["status"] == "available"
    assert item["date"] == "2026-10-01" and item["source"]["date"] == "2026-10-15"
    assert item["source_history"][0]["effective_date"] == service._today(db, "c").isoformat()
    assert item["original_source"] == original == db.get(NativeInvoice, item["id"]).source
    assert service.detail(db, "c", actor, item["id"], date(2026, 10, 13))["remaining"] == "40"
    assert service.detail(db, "c", actor, item["id"], date(2026, 10, 20))["remaining"] is None
    assert db.get(NativeInvoiceSnapshot, snapshot["id"]).payload["items"][0]["remaining"] == "40"
    item = alloc(db, item, receipt, "40")
    assert item["remaining"] == "40"
    # Today's corrected reallocation cannot overlap its old historical allocation.
    assert service.detail(db, "c", actor, item["id"], date(2026, 10, 13))["remaining"] == "40"
    assert item["allocations"][-1]["allocation_effective_date"] == service._today(db, "c").isoformat()
    assert (
        service.snapshot(db, "c", actor, service._today(db, "c"), "sale")["payload"]["items"][0]["remaining"]
        == "40"
    )
    assert service.reminder(db, "c", actor, item["id"])["delivery"] == "local_draft"
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == 4


def test_receipt_replacement_needs_explicit_old_capacity_release_and_foreign_lineage_rejected(book):
    db = book
    actor = db.get(m.User, "advisor")
    original = posted(db)
    item = invoice(db, original)
    receipt = posted(db, "receipt", "60", "RCPT-LINK", day=date(2026, 10, 12))
    item = alloc(db, item, receipt, "60")
    reverse_journal(db, receipt, date(2026, 10, 20))
    replacement = replace(db, receipt, "70")
    assert service.candidates(db, "c", actor, "receipt")["items"] == []
    with pytest.raises(DomainError) as error:
        service.allocate(
            db,
            "c",
            actor,
            item["id"],
            dict(
                operation_id=receipt["operation_id"],
                journal_id=replacement["id"],
                journal_digest=replacement["digest"],
                amount="60",
            ),
            item["version"],
        )
    assert error.value.code == "native_invoice_unavailable"
    item = service.reverse_allocation(
        db, "c", actor, item["id"], item["allocations"][0]["id"], "اصلاح دریافت", item["version"]
    )
    candidate = service.candidates(db, "c", actor, "receipt")["items"][0]
    assert candidate["journal_id"] == replacement["id"] and candidate["remaining_capacity"] == "70"
    item = service.allocate(
        db,
        "c",
        actor,
        item["id"],
        dict(
            operation_id=receipt["operation_id"],
            journal_id=replacement["id"],
            journal_digest=replacement["digest"],
            amount="60",
        ),
        item["version"],
    )
    assert item["remaining"] == "40"
    historical = service.detail(db, "c", actor, item["id"], date(2026, 10, 13))
    assert historical["remaining"] == "40" and len(historical["allocations"]) == 1
    other = posted(db, ref="UNRELATED")
    with pytest.raises(DomainError) as error:
        service._proof(db, "c", other["operation_id"], service._today(db, "c"), replacement["id"])
    assert error.value.code == "native_invoice_replacement_lineage"
    assert service.receipt_history(db, "c", actor, "customer", service._today(db, "c")) == []


def test_http_source_adoption_exact_proof_history_and_immutable_revision(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.operation_service import create
from didban.posting_service import preview,post_batch,create_reversal,create_replacement
from didban.posting_models import NativeJournal
from didban.native_invoice_models import NativeInvoiceSourceRevision
owner=client_for('owner');manager=client_for('finance_manager');advisor=client_for('advisor');viewer=client_for('viewer');outsider=client_for('outsider')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','rev')]);db.flush()
    actor=db.get(m.User,users['finance_manager'])
    op=create(db,'company-a',actor,{'kind':'sale_service','period_id':period_id,'date':date(2026,9,1),'description':'اصلی','source_reference':'INV-CORRECTION','unit':'IRR','party_id':'customer','accounts':{'trade_receivable':'ar','service_revenue':'rev'},'amounts':{'amount':'100'}})
    check=preview(db,'company-a',actor,op['draft']['id']);original=post_batch(db,'company-a',actor,[{k:check[k] for k in ('draft_id','expected_version','digest')}])['items'][0]
path=base+'/accounting/native-invoices'
item=command(advisor,'POST',path,{'operation_id':op['operation_id'],'journal_digest':original['digest'],'reference':'INV-CORRECTION','due_date':'2026-09-10','due_unknown':False,'expected_date':None,'expected_unknown':True}).json()
old=command(advisor,'POST',path+'/snapshots',{'as_of':'2026-09-15','direction':'sale'}).json()
with transaction('company-a') as db:
    actor=db.get(m.User,users['finance_manager'])
    draft=create_reversal(db,'company-a',actor,original['id'],{'period_id':period_id,'date':date(2026,9,20),'reason':'اصلاح'})
    check=preview(db,'company-a',actor,draft['id']);post_batch(db,'company-a',actor,[{k:check[k] for k in ('draft_id','expected_version','digest')}])
    draft=create_replacement(db,'company-a',actor,original['id'],{'period_id':period_id,'date':date(2026,9,20),'description':'جایگزین','reason':'مبلغ صحیح','unit':'IRR','lines':[{'account_id':'ar','party_id':'customer','debit':'80','credit':'0'},{'account_id':'rev','party_id':'customer','debit':'0','credit':'80'}]})
    check=preview(db,'company-a',actor,draft['id']);replacement=post_batch(db,'company-a',actor,[{k:check[k] for k in ('draft_id','expected_version','digest')}])['items'][0]
assert viewer.get(path+'/'+item['id']).json()['remaining'] is None
candidate=viewer.get(path+'/'+item['id']+'/source-candidates').json()['items'][0];assert candidate['amount']=='80'
payload={'journal_id':candidate['journal_id'],'journal_digest':candidate['journal_digest'],'approved_draft_version':candidate['approved_draft_version'],'reason':'پذیرش سند جایگزین'}
adopt_path=path+'/'+item['id']+'/source-revisions'
assert command(viewer,'POST',adopt_path,payload).status_code==403
assert command(outsider,'POST',adopt_path,payload).status_code==404
assert command(advisor,'POST',adopt_path,dict(payload,journal_digest='f'*64)).status_code==409
accepted=command(advisor,'POST',adopt_path,payload,key='adopt-source')
assert accepted.status_code==201,accepted.text
current=accepted.json();assert current['remaining']=='80' and current['unit']=='IRR' and current['date']=='2026-09-01' and current['source']['date']=='2026-09-20'
assert current['original_source']['journal_id']==original['id'] and current['source_history'][0]['source']['journal_id']==replacement['id']
assert command(advisor,'POST',adopt_path,payload,key='adopt-source').json()==current
assert command(advisor,'POST',adopt_path,payload,version=1).status_code==409
assert viewer.get(path+'/'+item['id'],params={'as_of':'2026-09-25'}).json()['remaining'] is None
assert viewer.get(path+'/snapshots/'+old['id']).json()['payload']['items'][0]['remaining']=='100'
assert command(advisor,'POST',path+'/snapshots',{'as_of':current['as_of'],'direction':'sale'}).status_code==201
try:
    with transaction('company-a') as db:db.execute(update(NativeInvoiceSourceRevision).values(reason='changed'))
except IntegrityError:pass
else:raise AssertionError('Source revisions must be immutable')
with transaction('company-a') as db:assert len(list(db.scalars(select(NativeJournal))))==3
""",
    )


def test_party_change_adoption_cannot_reassign_past_receipt_history_or_prior_invoice_balances(book):
    db = book
    actor = db.get(m.User, "advisor")
    original = posted(db)
    item = invoice(db, original)
    reverse_journal(db, original, date(2026, 10, 15))
    replacement = replace(db, original, "80", party="new-customer")
    item = adopt(db, item, replacement)
    assert item["party_id"] == "new-customer" and item["remaining"] == "80"
    receipt = posted(
        db, "receipt", "50", "NEW-CUSTOMER-RECEIPT", party="new-customer", day=date(2026, 10, 12)
    )
    item = alloc(db, item, receipt, "50")
    assert item["remaining"] == "30"
    historical = service.detail(db, "c", actor, item["id"], date(2026, 10, 13))
    assert (
        historical["party_id"] == "customer"
        and historical["remaining"] == "100"
        and historical["allocations"] == []
    )
    assert service.receipt_history(db, "c", actor, "new-customer", service._today(db, "c")) == []
