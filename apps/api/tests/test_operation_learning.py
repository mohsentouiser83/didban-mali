"""Learning is an explicit account proposal from exact posted operation evidence."""

from datetime import date

import pytest
from sqlalchemy import func, select
from test_accounting import workspace as workspace

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_service import save_draft
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.errors import DomainError
from didban.operation_learning_models import OperationLearningEvent
from didban.operation_learning_service import suggestions, update
from didban.operation_service import create
from didban.posting_models import NativeJournal
from didban.posting_service import create_reversal, post_batch, preview


def source(db, *, reference="SALE", party="customer", post=True, changed=False):
    if not db.get(CompanyAccountingSetup, "c"):
        db.add(CompanyAccountingSetup(company_id="c", mode="primary"))
        db.add_all(
            [
                Account(id="ar", company_id="c", code="AR", name="مطالبات"),
                Account(id="rev", company_id="c", code="REV", name="درآمد"),
            ]
        )
        db.flush()
    data = dict(
        kind="sale_service",
        period_id="p",
        date=date(2026, 11, 2),
        description="فروش خدمات",
        source_reference=reference,
        unit="TOMAN",
        party_id=party,
        accounts={"trade_receivable": "ar", "service_revenue": "rev"},
        amounts={"amount": "12"},
    )
    result = create(db, "c", db.get(m.User, "advisor"), data)
    if changed:
        save_draft(
            db,
            "c",
            db.get(m.User, "advisor"),
            dict(
                period_id="p",
                date=date(2026, 11, 2),
                description="اصلاح دستی",
                unit="TOMAN",
                lines=[
                    {"account_id": "ar", "party_id": party, "debit": "13", "credit": "0"},
                    {"account_id": "rev", "party_id": party, "debit": "0", "credit": "13"},
                ],
            ),
            result["draft"]["id"],
            1,
        )
    journal = None
    if post:
        checked = preview(db, "c", db.get(m.User, "finance_manager"), result["draft"]["id"])
        journal = post_batch(
            db,
            "c",
            db.get(m.User, "finance_manager"),
            [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}],
        )["items"][0]
    return result, journal


def test_proposals_are_company_kind_and_party_scoped_and_only_exact_posted_sources(workspace):
    db = workspace
    result, journal = source(db)
    source(db, reference="UNPOSTED", post=False)
    source(db, reference="CHANGED", changed=True)
    source(db, reference="OTHERPARTY", party="different")
    user = db.get(m.User, "advisor")
    response = suggestions(db, "c", user, "sale_service", "customer")
    assert len(response["items"]) == 1 and response["financial_effect"] is False
    item = response["items"][0]
    assert item["operation_id"] == result["operation_id"]
    assert item["journal_digest"] == journal["digest"] and item["approved_draft_version"] == 1
    assert item["accounts"]["trade_receivable"]["id"] == "ar"
    assert not any(key in item for key in ("amount", "party_id", "description", "payload", "lines"))
    assert not response["can_manage"]
    assert suggestions(db, "c", user, "receipt", "customer")["items"] == []
    assert suggestions(db, "c", user, "sale_service", "missing")["items"] == []
    with pytest.raises(DomainError):
        suggestions(db, "other", user, "sale_service", "customer")
    with pytest.raises(DomainError):
        suggestions(db, "c", db.get(m.User, "viewer"), "sale_service", "customer")
    for kind in ("payroll", "payroll_payment", "cheque_endorsed"):
        with pytest.raises(DomainError):
            suggestions(db, "c", user, kind, "customer")
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == 3


def test_disable_rename_enable_versions_and_audited_provenance(workspace):
    db = workspace
    result, journal = source(db)
    owner = db.get(m.User, "owner")
    item = update(db, "c", owner, result["operation_id"], {"name": "الگوی خدمات", "enabled": False}, 1)
    assert item["version"] == 2
    response = suggestions(db, "c", db.get(m.User, "advisor"), "sale_service", "customer")
    assert response["items"][0]["enabled"] is False and response["items"][0]["name"] == "الگوی خدمات"
    with pytest.raises(DomainError):
        update(db, "c", owner, result["operation_id"], {"name": "قدیمی", "enabled": True}, 1)
    with pytest.raises(DomainError):
        update(
            db,
            "c",
            db.get(m.User, "advisor"),
            result["operation_id"],
            {"name": "غیرمجاز", "enabled": True},
            2,
        )
    update(db, "c", owner, result["operation_id"], {"name": "بازبینی‌شده", "enabled": True}, 2)
    events = list(db.scalars(select(OperationLearningEvent)))
    assert len(events) == 2 and events[0].source_proof["journal_digest"] == journal["digest"]
    member = db.scalar(
        select(m.Membership).where(m.Membership.company_id == "c", m.Membership.user_id == owner.id)
    )
    member.role = "viewer"
    db.flush()
    with pytest.raises(DomainError):
        update(db, "c", owner, result["operation_id"], {"name": "لغوشده", "enabled": False}, 3)


def test_reversal_and_inactive_account_cannot_reenter_suggestions(workspace):
    db = workspace
    result, journal = source(db)
    manager = db.get(m.User, "finance_manager")
    reversal = create_reversal(
        db, "c", manager, journal["id"], {"period_id": "p", "date": date(2026, 11, 2), "reason": "اصلاح"}
    )
    checked = preview(db, "c", manager, reversal["id"])
    post_batch(db, "c", manager, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
    assert suggestions(db, "c", manager, "sale_service", "customer")["items"] == []
    with pytest.raises(DomainError):
        update(db, "c", manager, result["operation_id"], {"name": "نامعتبر", "enabled": True}, 1)
    source(db, reference="NEW")
    db.get(Account, "ar").active = False
    db.flush()
    assert suggestions(db, "c", manager, "sale_service", "customer")["items"] == []


def test_http_source_proposal_revocation_and_immutable_pattern_events(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.operation_learning_models import OperationLearningEvent
owner=client_for('owner');manager=client_for('finance_manager');advisor=client_for('advisor');viewer=client_for('viewer');outsider=client_for('outsider')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','rev')])
body={'kind':'sale_service','period_id':period_id,'date':'2026-09-01','description':'فروش','source_reference':'LEARN1','unit':'IRR','party_id':'customer','accounts':{'trade_receivable':'ar','service_revenue':'rev'},'amounts':{'amount':'300'}}
created=command(owner,'POST',base+'/accounting/operations',body);assert created.status_code==201,created.text
origin=created.json()['operation_id'];draft=created.json()['draft']
path=base+'/accounting/operation-learning';params={'kind':'sale_service','party_id':'customer'}
assert advisor.get(path,params=params).json()['items']==[]
checked=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
posted=command(manager,'POST',base+'/accounting/postings',{'items':[{key:checked[key] for key in ('draft_id','expected_version','digest')}]});assert posted.status_code==201,posted.text
journal=posted.json()['items'][0]
response=advisor.get(path,params=params);assert response.status_code==200,response.text
item=response.json()['items'][0];assert item['operation_id']==origin and item['journal_digest']==journal['digest']
assert 'amount' not in item and 'payload' not in item and 'party_id' not in item
assert viewer.get(path,params=params).status_code==403
assert outsider.get(path,params=params).status_code==404
assert advisor.get(path+'/'+origin,params={**params,'party_id':'another'}).status_code==409
assert advisor.get(path+'/'+origin,params=params).status_code==200
assert command(advisor,'PATCH',path+'/'+origin,{'name':'غیرمجاز','enabled':False}).status_code==403
key=str(uuid4());disabled=command(owner,'PATCH',path+'/'+origin,{'name':'پیشنهاد خدمات','enabled':False},key=key)
assert disabled.status_code==200 and disabled.json()['version']==2,disabled.text
assert command(owner,'PATCH',path+'/'+origin,{'name':'پیشنهاد خدمات','enabled':False},key=key).json()==disabled.json()
assert advisor.get(path+'/'+origin,params=params).status_code==409
assert command(owner,'PATCH',path+'/'+origin,{'name':'خدمات','enabled':True}).status_code==409
assert command(owner,'PATCH',path+'/'+origin,{'name':'خدمات','enabled':True},version=2).status_code==200
reversed_draft=command(manager,'POST',base+'/accounting/journals/'+journal['id']+'/reversal-draft',{'period_id':period_id,'date':'2026-09-02','reason':'اصلاح'});assert reversed_draft.status_code==201,reversed_draft.text
checked=manager.get(base+'/accounting/drafts/'+reversed_draft.json()['id']+'/posting-preview').json()
assert command(manager,'POST',base+'/accounting/postings',{'items':[{key:checked[key] for key in ('draft_id','expected_version','digest')}]}).status_code==201
assert advisor.get(path,params=params).json()['items']==[]
assert advisor.get(path+'/'+origin,params=params).status_code==409
with transaction('company-a') as db:
    assert len(list(db.scalars(select(OperationLearningEvent))))==2
    member=db.get(m.Membership,members['advisor']);member.active=False
assert advisor.get(path,params=params).status_code==404
try:
    with transaction('company-a') as db:db.execute(update(OperationLearningEvent).values(actor_id=users['owner']))
except IntegrityError:pass
else:raise AssertionError('Learning provenance must be immutable')
initialize()
""",
    )


def test_changed_account_version_or_conflicting_current_role_excludes_proposal(workspace):
    from didban.native_reporting_models import NativeAccountRole

    db = workspace
    source(db)
    manager = db.get(m.User, "finance_manager")
    db.add(NativeAccountRole(company_id="c", account_id="ar", role="expense", actor_id=manager.id))
    db.flush()
    assert suggestions(db, "c", manager, "sale_service", "customer")["items"] == []
    assigned = db.scalar(select(NativeAccountRole).where(NativeAccountRole.account_id == "ar"))
    assigned.role = "trade_receivable"
    assigned.version += 1
    db.flush()
    assert len(suggestions(db, "c", manager, "sale_service", "customer")["items"]) == 1
    db.get(Account, "ar").name = "حساب با کاربرد تازه"
    db.get(Account, "ar").version += 1
    db.flush()
    assert suggestions(db, "c", manager, "sale_service", "customer")["items"] == []


def test_explicit_account_only_correction_adoption_learns_the_approved_new_map(workspace):
    from didban.operation_learning_corrections import adopt, candidates
    from didban.operation_learning_models import OperationLearningCorrection

    db = workspace
    result, _ = source(db, post=False)
    db.add(Account(id="new-rev", company_id="c", code="REV2", name="درآمد صحیح"))
    db.flush()
    save_draft(
        db,
        "c",
        db.get(m.User, "advisor"),
        dict(
            period_id="p",
            date=date(2026, 11, 2),
            description="اصلاح انتخاب حساب",
            unit="TOMAN",
            lines=[
                {"account_id": "ar", "party_id": "customer", "debit": "12", "credit": "0"},
                {"account_id": "new-rev", "party_id": "customer", "debit": "0", "credit": "12"},
            ],
        ),
        result["draft"]["id"],
        1,
    )
    manager = db.get(m.User, "finance_manager")
    checked = preview(db, "c", manager, result["draft"]["id"])
    post_batch(db, "c", manager, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
    assert suggestions(db, "c", manager, "sale_service", "customer")["items"] == []
    item = candidates(db, "c", manager, "sale_service", "customer")["items"][0]
    assert item["approved_draft_version"] == 2 and not any("amount" in key for key in item)
    data = {
        "journal_id": item["journal_id"],
        "journal_digest": item["journal_digest"],
        "approved_draft_version": item["approved_draft_version"],
        "accounts": {"trade_receivable": "ar", "service_revenue": "new-rev"},
        "reason": "انتخاب اصلاح‌شده حساب از سند ثبت‌شده بررسی شد",
    }
    with pytest.raises(DomainError):
        adopt(
            db,
            "c",
            manager,
            result["operation_id"],
            {**data, "accounts": {"trade_receivable": "new-rev", "service_revenue": "ar"}},
        )
    with pytest.raises(DomainError):
        adopt(db, "other", manager, result["operation_id"], data)
    with pytest.raises(DomainError):
        adopt(db, "c", db.get(m.User, "viewer"), result["operation_id"], data)
    adopted = adopt(db, "c", manager, result["operation_id"], data)
    assert adopted["financial_effect"] is False
    learned = suggestions(db, "c", manager, "sale_service", "customer")["items"][0]
    assert (
        learned["learning_basis"] == "human_corrected_accounts"
        and learned["correction_id"] == adopted["correction_id"]
    )
    assert learned["accounts"]["service_revenue"]["id"] == "new-rev"
    assert candidates(db, "c", manager, "sale_service", "customer")["items"] == []
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == 1
    assert db.scalar(select(func.count()).select_from(OperationLearningCorrection)) == 1
    with pytest.raises(DomainError):
        adopt(db, "c", manager, result["operation_id"], data)
    reversal = create_reversal(
        db, "c", manager, item["journal_id"], {"period_id": "p", "date": date(2026, 11, 2), "reason": "برگشت"}
    )
    checked = preview(db, "c", manager, reversal["id"])
    post_batch(db, "c", manager, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
    assert suggestions(db, "c", manager, "sale_service", "customer")["items"] == []


def test_http_correction_adoption_is_exact_and_immutable_without_financial_reposting(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.operation_learning_models import OperationLearningCorrection
from didban.posting_models import NativeJournal
owner=client_for('owner');manager=client_for('finance_manager');advisor=client_for('advisor')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','rev','correct-rev')])
created=command(owner,'POST',base+'/accounting/operations',{'kind':'sale_service','period_id':period_id,'date':'2026-09-01','description':'فروش','source_reference':'ACCOUNT-CORRECTION','unit':'IRR','party_id':'customer','accounts':{'trade_receivable':'ar','service_revenue':'rev'},'amounts':{'amount':'300'}})
assert created.status_code==201,created.text
origin=created.json()['operation_id'];draft=created.json()['draft']
changed=command(owner,'PATCH',base+'/accounting/drafts/'+draft['id'],{'period_id':period_id,'date':'2026-09-01','description':'اصلاح حساب درآمد','unit':'IRR','lines':[{'account_id':'ar','party_id':'customer','debit':'300','credit':'0'},{'account_id':'correct-rev','party_id':'customer','debit':'0','credit':'300'}]})
assert changed.status_code==200,changed.text
checked=manager.get(base+'/accounting/drafts/'+draft['id']+'/posting-preview').json()
posted=command(manager,'POST',base+'/accounting/postings',{'items':[{key:checked[key] for key in ('draft_id','expected_version','digest')}]});assert posted.status_code==201,posted.text
path=base+'/accounting/operation-learning';params={'kind':'sale_service','party_id':'customer'}
candidates=advisor.get(path+'/corrections/candidates',params=params)
assert candidates.status_code==200,candidates.text
item=candidates.json()['items'][0]
body={key:item[key] for key in ('journal_id','journal_digest','approved_draft_version')}
body.update(accounts={'trade_receivable':'ar','service_revenue':'correct-rev'},reason='نقش حساب اصلاح‌شده بررسی شد')
assert command(advisor,'POST',path+'/'+origin+'/correction',{**body,'journal_digest':'0'*64}).status_code==409
key=str(uuid4());adopted=command(advisor,'POST',path+'/'+origin+'/correction',body,key=key)
assert adopted.status_code==201 and adopted.json()['financial_effect'] is False,adopted.text
assert command(advisor,'POST',path+'/'+origin+'/correction',body,key=key).json()==adopted.json()
assert command(advisor,'POST',path+'/'+origin+'/correction',body).status_code==409
learned=advisor.get(path,params=params).json()['items'][0]
assert learned['learning_basis']=='human_corrected_accounts' and learned['accounts']['service_revenue']['id']=='correct-rev'
with transaction('company-a') as db:
    assert len(list(db.scalars(select(OperationLearningCorrection))))==1
    assert len(list(db.scalars(select(NativeJournal))))==1
try:
    with transaction('company-a') as db:db.execute(update(OperationLearningCorrection).values(reason='changed'))
except IntegrityError:pass
else:raise AssertionError('Correction learning provenance must be immutable')
""",
    )
