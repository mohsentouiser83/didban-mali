"""Native rules are previewed exact, scoped and financially inert."""

from datetime import date

import pytest
from sqlalchemy import func, select
from test_posting import book as book
from test_posting import data

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_service import save_draft
from didban.automation_models import AutomationRule
from didban.automation_schemas import RuleDefinition
from didban.automation_service import save_rule
from didban.document_thread_models import (
    NativeDocumentActivity as DocumentActivity,
)
from didban.document_thread_models import (
    NativeDocumentThread as DocumentThread,
)
from didban.errors import DomainError
from didban.native_automation_models import NativeAutomationRun
from didban.native_automation_service import execute, save_preview
from didban.native_automation_service import preview as native_preview
from didban.operation_service import create
from didban.posting_models import NativeJournal
from didban.posting_service import post_batch, preview


def post(db, amount="20"):
    actor = db.get(m.User, "finance_manager")
    body = data(db, amount)
    body["unit"] = "IRR"
    draft = save_draft(db, "c", actor, body)
    checked = preview(db, "c", actor, draft["id"])
    return post_batch(
        db, "c", actor, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}]
    )["items"][0]


def spec(db, **changes):
    account = db.scalar(select(Account).where(Account.company_id == "c").order_by(Account.code))
    return {
        "scope": "native_journal",
        "period_id": "p",
        "metric_key": "",
        "conditions": [
            {"field": "amount", "op": "gt", "value": "10"},
            {"field": "account_id", "op": "eq", "value": account.id},
            {"field": "date", "op": "gte", "value": "2026-11-01"},
            {"field": "status", "op": "eq", "value": "posted"},
            {"field": "party_id", "op": "eq", "value": "customer"},
        ],
        "action": "notify",
        **changes,
    }


def enabled(db, definition, actor="owner"):
    user = db.get(m.User, actor)
    checked = save_preview(db, "c", user, definition)
    saved = save_rule(
        db,
        "c",
        user,
        {
            "name": "قاعده دفتر اصلی",
            "enabled": True,
            "definition": definition,
            "preview_id": checked["preview_id"],
        },
    )
    return db.get(AutomationRule, saved["id"])


def test_native_rule_preview_trigger_and_retries_never_make_journals_or_duplicate_notices(book):
    db = book
    first = post(db)
    definition = spec(db)
    checked = native_preview(db, "c", definition)
    assert checked["matches"][0]["value"] == "20" and checked["matches"][0]["matching_line_indices"] == [0]
    assert db.scalar(select(m.Notification.id)) is None
    rule = enabled(db, definition)
    result = execute(db, "c", rule)
    assert result["action_count"] == 1
    assert execute(db, "c", rule)["action_count"] == 0
    second = post(db, "30")
    assert db.scalar(select(func.count()).select_from(m.Notification)) == 2
    execute(db, "c", rule)
    assert db.scalar(select(func.count()).select_from(NativeAutomationRun)) == 2
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == 2
    assert db.scalar(select(m.JournalLine.id)) is None
    assert first["id"] != second["id"]


def test_activation_rejects_stale_source_and_foreign_accounts(book):
    db = book
    post(db)
    user = db.get(m.User, "owner")
    definition = spec(db)
    checked = save_preview(db, "c", user, definition)
    post(db, "30")
    with pytest.raises(DomainError) as error:
        save_rule(
            db,
            "c",
            user,
            {"name": "قدیمی", "enabled": True, "definition": definition, "preview_id": checked["preview_id"]},
        )
    assert error.value.code == "rule_preview_stale"
    db.add(Account(id="foreign", company_id="other", code="X", name="حساب دیگر"))
    db.flush()
    wrong = spec(db, conditions=[{"field": "account_id", "op": "eq", "value": "foreign"}])
    with pytest.raises(DomainError):
        save_preview(db, "c", user, wrong)


def test_revoked_rule_actor_does_not_act_on_new_posting(book):
    db = book
    post(db)
    enabled(db, spec(db))
    db.get(m.Membership, "owner").role = "viewer"
    db.flush()
    post(db, "30")
    assert db.scalar(select(m.Notification.id)) is None
    row = db.scalar(select(NativeAutomationRun))
    assert row.result["action_state"] == "actor_access_revoked" and row.result["action_count"] == 0


def test_native_followup_uses_shared_document_thread_and_is_idempotent(book):
    db = book
    post(db)
    rule = enabled(db, spec(db, action="followup"))
    execute(db, "c", rule)
    execute(db, "c", rule)
    assert db.scalar(select(func.count()).select_from(DocumentThread)) == 1
    assert db.scalar(select(func.count()).select_from(DocumentActivity)) == 1
    thread = db.scalar(select(DocumentThread))
    assert thread.next_action == rule.name and thread.state == "open"
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == 1


def test_unknown_reference_is_recorded_and_module_disabled_blocks_native_source(book):
    db = book
    actor = db.get(m.User, "finance_manager")
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    operation = create(
        db,
        "c",
        actor,
        {
            "kind": "sale_service",
            "period_id": "p",
            "date": date(2026, 11, 1),
            "description": "خدمات",
            "source_reference": "KNOWN",
            "unit": "IRR",
            "party_id": "customer",
            "accounts": {"trade_receivable": accounts[0].id, "service_revenue": accounts[1].id},
            "amounts": {"amount": "20"},
        },
    )
    checked = preview(db, "c", actor, operation["draft"]["id"])
    post_batch(db, "c", actor, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
    rule = enabled(db, spec(db, conditions=[{"field": "reference", "op": "eq", "value": "KNOWN"}]))
    post(db, "30")
    row = db.scalar(select(NativeAutomationRun))
    assert row.result["action_state"] == "missing_condition_data"
    assert row.result["source"]["missing_fields"] == ["reference"]
    assert db.scalar(select(m.Notification.id)) is None
    db.add(m.CompanyModule(company_id="c", key="receivables", enabled=False))
    db.flush()
    execute(db, "c", rule)
    assert any(
        row.result["action_state"] == "module_disabled" for row in db.scalars(select(NativeAutomationRun))
    )
    assert db.scalar(select(m.Notification.id)) is None


def test_scope_fields_dates_and_status_are_explicit():
    for definition in [
        {
            "scope": "invoice",
            "metric_key": "",
            "conditions": [{"field": "account_id", "op": "eq", "value": "A"}],
            "action": "notify",
        },
        {
            "scope": "native_journal",
            "period_id": "p",
            "conditions": [{"field": "date", "op": "gte", "value": "2026-02-30"}],
            "action": "notify",
        },
        {
            "scope": "native_journal",
            "period_id": "p",
            "conditions": [{"field": "status", "op": "eq", "value": "paid"}],
            "action": "notify",
        },
    ]:
        with pytest.raises(ValueError):
            RuleDefinition.model_validate(definition)


def test_http_native_rule_exact_preview_and_immutable_receipts_with_live_revocation(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_automation_models import NativeAutomationPreview,NativeAutomationRun
owner=client_for('owner');manager=client_for('finance_manager');viewer=client_for('viewer');outsider=client_for('outsider')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','rev')])
def post(amount):
    draft=command(manager,'POST',base+'/accounting/drafts',{'period_id':period_id,'date':'2026-09-01','description':'خدمات','unit':'IRR','lines':[{'account_id':'ar','party_id':'customer','debit':amount,'credit':'0'},{'account_id':'rev','party_id':'customer','debit':'0','credit':amount}]})
    assert draft.status_code==201,draft.text
    checked=manager.get(base+'/accounting/drafts/'+draft.json()['id']+'/posting-preview').json()
    result=command(manager,'POST',base+'/accounting/postings',{'items':[{key:checked[key] for key in ('draft_id','expected_version','digest')}]})
    assert result.status_code==201,result.text
post('20')
definition={'scope':'native_journal','period_id':period_id,'conditions':[{'field':'account_id','op':'eq','value':'ar'},{'field':'amount','op':'gt','value':'10'},{'field':'date','op':'gte','value':'2026-09-01'},{'field':'status','op':'eq','value':'posted'}],'action':'notify'}
path=base+'/automation'
checked=command(owner,'POST',path+'/native-preview',{'definition':definition})
assert checked.status_code==200,checked.text
assert checked.json()['financial_effect'] is False and checked.json()['matches'][0]['value']=='20'
body={'name':'کنترل دفتر اصلی','enabled':True,'definition':definition,'preview_id':checked.json()['preview_id']}
rule=command(owner,'POST',path+'/rules',body);assert rule.status_code==201,rule.text
key=str(uuid4());executed=command(owner,'POST',path+'/rules/'+rule.json()['id']+'/execute',{},key=key)
assert executed.status_code==200 and executed.json()['action_count']==1,executed.text
assert command(owner,'POST',path+'/rules/'+rule.json()['id']+'/execute',{},key=key).json()==executed.json()
assert command(owner,'POST',path+'/rules/'+rule.json()['id']+'/execute',{}).json()['action_count']==0
post('30')
assert len(viewer.get(path+'/native-runs').json()['items'])==2
assert outsider.get(path+'/native-runs').status_code==404
assert command(owner,'POST',path+'/rules',body).status_code==409
for table in (NativeAutomationPreview,NativeAutomationRun):
    try:
        with transaction('company-a') as db:db.execute(update(table).values(definition={}))
    except IntegrityError:pass
    else:raise AssertionError('Native rule evidence must be immutable')
with transaction('company-a') as db:
    member=db.get(m.Membership,members['owner']);member.role='viewer'
post('40')
with transaction('company-a') as db:
    assert len(list(db.scalars(select(m.Notification))))==2
    assert db.scalar(select(m.JournalLine.id)) is None
    assert any(row.result['action_state']=='actor_access_revoked' for row in db.scalars(select(NativeAutomationRun)))
""",
    )
