"""Reference operations create exact drafts, never imported or final journal effects."""

import json
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select
from test_accounting import workspace as workspace

from didban import models as m
from didban.accounting_models import Account, Draft
from didban.errors import DomainError
from didban.operation_models import OperationDraft
from didban.operation_service import build, create


def test_reference_j01_to_j08_exact_template_lines(workspace):
    db = workspace
    db.add(m.CompanyModule(company_id="c", key="employees", enabled=True))
    ref = json.loads((Path(__file__).parents[3] / "docs/validation/accounting-v1/reference.json").read_text())
    for alias in ref["account_aliases"]:
        db.add(Account(company_id="c", code=alias["alias"], name=alias["label_fa"]))
    db.flush()
    accounts = {a.code: a.id for a in db.scalars(select(Account).where(Account.company_id == "c"))}
    cases = [
        ("sale_service", {"amount": "1000"}),
        ("purchase_service", {"amount": "400"}),
        ("receipt", {"amount": "600"}),
        ("payment", {"amount": "250"}),
        ("expense", {"amount": "12"}),
        ("transfer", {"amount": "200", "fee": "2"}),
        (
            "payroll",
            {
                "gross": "1000",
                "employee_insurance": "70",
                "employer_insurance": "230",
                "payroll_tax": "50",
                "other_deductions": "20",
                "net_pay": "860",
            },
        ),
        ("payroll_payment", {"amount": "860"}),
    ]
    from didban.operation_service import catalogue

    for index, (kind, amounts) in enumerate(cases):
        spec = next(item for item in catalogue()["items"] if item["kind"] == kind)
        mapping = {role["key"]: accounts[role["key"]] for role in spec["roles"]}
        # J05 names the specific expense; template uses any explicit expense account.
        if kind == "expense":
            mapping["service_expense"] = accounts["internet_expense"]
        result = create(
            db,
            "c",
            db.get(m.User, "advisor"),
            dict(
                kind=kind,
                period_id="p",
                date=date(2026, 11, 2),
                description=kind,
                source_reference=kind,
                unit="TOMAN" if index == 4 else "IRR",
                party_id="party",
                accounts=mapping,
                amounts=amounts,
                cheque_event_id=None,
            ),
        )
        rows = result["draft"]["lines"]
        expected = ref["journal_cases"][index]["lines"]
        actual = [
            (
                next(code for code, identifier in accounts.items() if identifier == line["account_id"]),
                line["debit"],
                line["credit"],
            )
            for line in rows
        ]
        assert actual == [(line["account"], line["debit"], line["credit"]) for line in expected]
        assert result["financial_effect"] is False
    assert len(list(db.scalars(select(OperationDraft)))) == 8
    assert len(list(db.scalars(select(Draft)))) == 8
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.Settlement.id)) is None


@pytest.mark.parametrize(
    "patch",
    [
        {"amounts": {"amount": "NaN"}},
        {"amounts": {"amount": "-1"}},
        {"amounts": {"amount": "0"}},
        {"accounts": {"trade_receivable": "a", "service_revenue": "a"}},
    ],
)
def test_bad_amounts_and_same_account_rejected(patch):
    with pytest.raises((DomainError, ValueError)):
        build(
            dict(
                kind="sale_service",
                party_id="p",
                accounts={"trade_receivable": "a", "service_revenue": "b"},
                amounts={"amount": "1"},
            )
            | patch
        )


def test_payroll_net_and_transfer_fee_validation():
    with pytest.raises(DomainError):
        build(
            dict(
                kind="payroll",
                party_id="p",
                accounts={},
                amounts={
                    "gross": "1000",
                    "employee_insurance": "70",
                    "employer_insurance": "230",
                    "payroll_tax": "50",
                    "other_deductions": "20",
                    "net_pay": "900",
                },
            )
        )
    lines = build(
        dict(
            kind="transfer",
            party_id="",
            accounts={"bank_b": "b", "bank_a": "a"},
            amounts={"amount": "9007199254740993", "fee": "0"},
        )
    )
    assert lines[0]["debit"] == "9007199254740993" and lines[1]["credit"] == "9007199254740993"


def test_http_operation_replay_scoped_authority_and_immutable_origin(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account,Draft
from didban.operation_models import OperationDraft
with transaction('company-a') as db:
    db.add_all([Account(id='ar',company_id='company-a',code='001',name='مطالبات'),Account(id='rev',company_id='company-a',code='002',name='درآمد')])
owner=client_for('owner');viewer=client_for('viewer');outsider=client_for('outsider')
path=base+'/accounting/operations'
body={'kind':'sale_service','period_id':period_id,'date':'2026-09-01','description':'فروش','source_reference':'INV-001','unit':'TOMAN','party_id':'client','accounts':{'trade_receivable':'ar','service_revenue':'rev'},'amounts':{'amount':'120'}}
assert command(viewer,'POST',path,body).status_code==403
assert command(outsider,'POST',path,body).status_code==404
key=str(uuid4());result=command(owner,'POST',path,body,key=key)
assert result.status_code==201,result.text
assert result.json()['draft']['lines'][0]['debit']=='1200'
assert command(owner,'POST',path,body,key=key).json()==result.json()
assert command(owner,'POST',path,body).status_code==409
with transaction('company-a') as db:
    assert len(list(db.scalars(select(OperationDraft))))==1
    assert len(list(db.scalars(select(Draft))))==1
    assert db.scalar(select(m.JournalLine.id)) is None
try:
    with transaction('company-a') as db:db.execute(update(OperationDraft).values(kind='expense'))
except IntegrityError:pass
else:raise AssertionError('Operation evidence must remain immutable')
""",
    )


def test_cheque_event_draft_requires_posted_origin_and_rejects_reuse(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.posting_models import NativeJournal
owner=client_for('owner');manager=client_for('finance_manager')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','notes','bank')])
cheque=command(owner,'POST',base+'/cheques',{'period_id':period_id,'direction':'received','number':'C1','bank_name':'بانک','bank_account':'drawer','party_id':'customer','amount':'300','unit':'IRR','issue_date':'2026-09-01','due_date':'2026-10-01'}).json()
event=owner.get(base+'/cheques/'+cheque['id']+'/events').json()['items'][0]
body={'kind':'cheque_received','period_id':period_id,'date':'2026-09-01','description':'دریافت چک','source_reference':'C1','unit':'IRR','party_id':'customer','accounts':{'notes_receivable':'notes','trade_receivable':'ar'},'amounts':{'amount':'300'},'cheque_event_id':event['id']}
result=command(owner,'POST',base+'/accounting/operations',body)
assert result.status_code==201,result.text
draft=result.json()['draft'];preview=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
assert command(manager,'POST',base+'/accounting/postings',{'items':[{key:preview[key] for key in ('draft_id','expected_version','digest')}]}).status_code==201
assert command(owner,'POST',base+'/accounting/operations',body).status_code==409
returned=command(owner,'POST',base+'/cheques/'+cheque['id']+'/actions',{'action':'return','period_id':period_id,'event_date':'2026-09-02','reason':'برگشت'},version=1)
assert returned.status_code==200,returned.text
latest=owner.get(base+'/cheques/'+cheque['id']+'/events').json()['items'][0]
result=command(owner,'POST',base+'/accounting/operations',{**body,'kind':'cheque_received_return','date':'2026-09-02','source_reference':'return','accounts':{'trade_receivable':'ar','notes_receivable':'notes'},'cheque_event_id':latest['id']})
assert result.status_code==201,result.text
draft=result.json()['draft'];preview=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
assert command(manager,'POST',base+'/accounting/postings',{'items':[{key:preview[key] for key in ('draft_id','expected_version','digest')}]}).status_code==201
with transaction('company-a') as db:
    journals=list(db.scalars(select(NativeJournal)))
    assert len(journals)==2
    assert db.scalar(select(m.Settlement.id)) is None
    assert db.scalar(select(m.JournalLine.id)) is None
""",
    )


def test_transfer_combined_amount_overflow_is_domain_validation():
    with pytest.raises(DomainError) as error:
        build(
            dict(
                kind="transfer",
                party_id="",
                accounts={"bank_a": "a", "bank_b": "b", "bank_fee_expense": "fee"},
                amounts={"amount": "99999999999999999999999999999999", "fee": "1"},
            )
        )
    assert error.value.code == "invalid_amount"


def test_endorsement_keeps_customer_and_creditor_separate_and_pins_reviewed_event(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.posting_models import NativeJournal
owner=client_for('owner');manager=client_for('finance_manager')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','notes','ap')])
def post(draft):
    view=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview')
    assert view.status_code==200,view.text
    preview=view.json()
    result=command(manager,'POST',base+'/accounting/postings',{'items':[{key:preview[key] for key in ('draft_id','expected_version','digest')}]})
    assert result.status_code==201,result.text
    return result.json()['items'][0]
cheque=command(owner,'POST',base+'/cheques',{'period_id':period_id,'direction':'received','number':'END1','bank_name':'بانک','bank_account':'drawer','party_id':'original-customer','amount':'300','unit':'IRR','issue_date':'2026-09-01','due_date':'2026-10-01'}).json()
event=owner.get(base+'/cheques/'+cheque['id']+'/events').json()['items'][0]
body={'kind':'cheque_received','period_id':period_id,'date':'2026-09-01','description':'دریافت چک','source_reference':'END1','unit':'IRR','party_id':'original-customer','accounts':{'notes_receivable':'notes','trade_receivable':'ar'},'amounts':{'amount':'300'},'cheque_event_id':event['id']}
created=command(owner,'POST',base+'/accounting/operations',body);assert created.status_code==201,created.text
post(created.json()['draft'])
act=command(owner,'POST',base+'/cheques/'+cheque['id']+'/actions',{'action':'endorse','period_id':period_id,'event_date':'2026-09-02','reason':'واگذاری بابت بدهی','endorsed_to':'creditor-one'},version=1)
assert act.status_code==200,act.text
first=owner.get(base+'/cheques/'+cheque['id']+'/events').json()['items'][0]
body={**body,'kind':'cheque_endorsed','date':'2026-09-02','source_reference':'endorsement','accounts':{'trade_payable':'ap','notes_receivable':'notes'},'amounts':{'amount':'300.000000'},'cheque_event_id':first['id'],'endorsee_party_id':'wrong-creditor'}
assert command(owner,'POST',base+'/accounting/operations',body).status_code==409
created=command(owner,'POST',base+'/accounting/operations',{**body,'endorsee_party_id':'creditor-one'})
assert created.status_code==201,created.text
draft=created.json()['draft']
assert draft['lines'][0]['party_id']=='creditor-one' and draft['lines'][1]['party_id']=='original-customer'
# Later lifecycle changes must not rewrite the already reviewed immutable origin.
assert command(owner,'POST',base+'/cheques/'+cheque['id']+'/actions',{'action':'return','period_id':period_id,'event_date':'2026-09-03','reason':'بازگشت از دارنده'},version=2).status_code==200
assert command(owner,'POST',base+'/cheques/'+cheque['id']+'/actions',{'action':'endorse','period_id':period_id,'event_date':'2026-09-04','reason':'واگذاری تازه','endorsed_to':'creditor-two'},version=3).status_code==200
options=owner.get(base+'/accounting/operations/cheque-options',params={'kind':'cheque_endorsed'})
assert options.status_code==200,options.text
items=options.json()['items']
assert next(row for row in items if row['id']==first['id'])['endorsee_party_id'] is None
assert items[0]['endorsee_party_id']=='creditor-two'
journal=post(draft)
assert journal['snapshot']['lines'][0]['party_id']=='creditor-one'
assert journal['snapshot']['lines'][1]['party_id']=='original-customer'
""",
    )


def test_cheque_posting_rejects_bank_proof_removed_by_new_manifest(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.posting_models import NativeJournal
owner=client_for('owner');manager=client_for('finance_manager')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','notes','bank')])
    db.add(m.SourceFile(id='bank-file',company_id='company-a',session_id=source_session,name='bank.csv',sha256='x',size=1,storage_key='unused',row_count=1,scan_status='test'));db.flush()
    db.add(m.SourceRow(id='bank-row',company_id='company-a',file_id='bank-file',sheet='bank',row_number=2,values={'amount':'300'}));db.flush()
    db.add(m.BankMovement(id='bank-proof',company_id='company-a',source_row_id='bank-row',session_id=source_session,original_unit='IRR',original_amount='300',account='real-bank',date=date(2026,9,2),amount='300',reference='REAL',kind='movement',party_id='customer'));db.flush()
    db.add(m.ProcessingSession(id='bank-source',company_id='company-a',period_id=period_id,actor_id=users['owner'],state='completed'));db.flush()
    db.add(m.ResultManifest(company_id='company-a',session_id='bank-source',period_id=period_id,digest='bank-valid',selection={'row_ids':['bank-row']},metrics=[],details={}))
cheque=command(owner,'POST',base+'/cheques',{'period_id':period_id,'direction':'received','number':'BANK1','bank_name':'بانک','bank_account':'drawer','party_id':'customer','amount':'300','unit':'IRR','issue_date':'2026-09-01','due_date':'2026-10-01'}).json()
event=owner.get(base+'/cheques/'+cheque['id']+'/events').json()['items'][0]
body={'kind':'cheque_received','period_id':period_id,'date':'2026-09-01','description':'دریافت چک','source_reference':'BANK1','unit':'IRR','party_id':'customer','accounts':{'notes_receivable':'notes','trade_receivable':'ar'},'amounts':{'amount':'300'},'cheque_event_id':event['id']}
created=command(owner,'POST',base+'/accounting/operations',body)
assert created.status_code==201,created.text
draft=created.json()['draft'];preview=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
assert command(manager,'POST',base+'/accounting/postings',{'items':[{key:preview[key] for key in ('draft_id','expected_version','digest')}]}).status_code==201
cleared=command(owner,'POST',base+'/cheques/'+cheque['id']+'/actions',{'action':'clear','period_id':period_id,'event_date':'2026-09-02','reason':'گردش بررسی شد','bank_id':'bank-proof'},version=1)
assert cleared.status_code==200,cleared.text
event=owner.get(base+'/cheques/'+cheque['id']+'/events').json()['items'][0]
created=command(owner,'POST',base+'/accounting/operations',{**body,'kind':'cheque_collected','date':'2026-09-02','source_reference':'clear','accounts':{'bank_a':'bank','notes_receivable':'notes'},'cheque_event_id':event['id']})
assert created.status_code==201,created.text
draft=created.json()['draft'];preview=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
# Source replacement after review must prevent financial posting of the old bank proof.
with transaction('company-a') as db:
    from didban.operation_service import validate_posting
    from didban.accounting_models import Draft
    # The bank amount is already fully reserved by operational clearance; this
    # check must accept it without attempting a second reservation.
    assert validate_posting(db,'company-a',db.get(Draft,draft['id']))==cheque['id']
with transaction('company-a') as db:
    db.add(m.ProcessingSession(id='new-source',company_id='company-a',period_id=period_id,actor_id=users['owner'],state='completed'));db.flush()
    db.add(m.ResultManifest(company_id='company-a',session_id='new-source',period_id=period_id,digest='bank-removed',selection={'row_ids':[]},metrics=[],details={}))
result=command(manager,'POST',base+'/accounting/postings',{'items':[{key:preview[key] for key in ('draft_id','expected_version','digest')}]})
assert result.status_code==409 and result.json()['code']=='cheque_inactive_bank_evidence',result.text
with transaction('company-a') as db:
    assert len(list(db.scalars(select(NativeJournal))))==1
    assert db.scalar(select(m.JournalLine.id)) is None
""",
    )


@pytest.mark.parametrize(
    "kind,module",
    [
        ("sale_service", "receivables"),
        ("purchase_service", "payables"),
        ("receipt", "settlements"),
        ("payment", "settlements"),
        ("expense", "settlements"),
        ("transfer", "settlements"),
        ("cheque_received", "settlements"),
        ("cheque_collected", "settlements"),
        ("cheque_endorsed", "settlements"),
        ("payroll", "payroll"),
        ("payroll_payment", "payroll"),
    ],
)
def test_disabled_operation_module_blocks_draft_preparation(workspace, kind, module):
    from didban.module_service import canonical_module

    db = workspace
    db.add(m.CompanyModule(company_id="c", key=canonical_module(module), enabled=False))
    db.flush()
    with pytest.raises(DomainError) as error:
        create(db, "c", db.get(m.User, "advisor"), {"kind": kind})
    assert error.value.code == "module_disabled"
    assert db.scalar(select(Draft.id)) is None


def test_module_disabled_after_posting_preview_blocks_operation_but_not_manual_journal(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.posting_models import NativeJournal
owner=client_for('owner');manager=client_for('finance_manager')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','rev')])
body={'kind':'sale_service','period_id':period_id,'date':'2026-09-01','description':'فروش','source_reference':'SALE','unit':'IRR','party_id':'customer','accounts':{'trade_receivable':'ar','service_revenue':'rev'},'amounts':{'amount':'300'}}
result=command(owner,'POST',base+'/accounting/operations',body)
assert result.status_code==201,result.text
draft=result.json()['draft'];preview=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
with transaction('company-a') as db:db.add(m.CompanyModule(company_id='company-a',key='receivables',enabled=False))
result=command(manager,'POST',base+'/accounting/postings',{'items':[{key:preview[key] for key in ('draft_id','expected_version','digest')}]})
assert result.status_code==403 and result.json()['code']=='module_disabled',result.text
# Generic manual journals retain their own independent posting authority.
manual=command(owner,'POST',base+'/accounting/drafts',{'period_id':period_id,'date':'2026-09-02','description':'ثبت دستی مستقل','unit':'IRR','lines':[{'account_id':'ar','party_id':'customer','debit':'100','credit':'0'},{'account_id':'rev','party_id':'customer','debit':'0','credit':'100'}]})
assert manual.status_code==201,manual.text
preview=manager.get(base+'/accounting/drafts/'+manual.json()['id']+'/posting-preview').json()
result=command(manager,'POST',base+'/accounting/postings',{'items':[{key:preview[key] for key in ('draft_id','expected_version','digest')}]})
assert result.status_code==201,result.text
with transaction('company-a') as db:assert len(list(db.scalars(select(NativeJournal))))==1
""",
    )
