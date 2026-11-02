from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from test_posting import book as book

from didban import models as m
from didban import native_invoice_service as service
from didban.accounting_models import Account
from didban.errors import DomainError
from didban.native_invoice_models import NativeInvoiceSnapshot, NativeInvoiceTerms
from didban.operation_service import create as operation
from didban.posting_models import NativeJournal
from didban.posting_service import create_reversal, post_batch, preview


def posted(
    db,
    kind="sale_service",
    amount="100",
    ref="INV",
    party="customer",
    day=date(2026, 10, 1),
    unit="IRR",
    mapping=None,
):
    actor = db.get(m.User, "finance_manager")
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    roles = {
        "sale_service": ("trade_receivable", "service_revenue"),
        "purchase_service": ("service_expense", "trade_payable"),
        "receipt": ("bank_a", "trade_receivable"),
        "payment": ("trade_payable", "bank_a"),
    }[kind]
    created = operation(
        db,
        "c",
        actor,
        {
            "kind": kind,
            "period_id": "p",
            "date": day,
            "description": ref,
            "source_reference": ref,
            "unit": unit,
            "party_id": party,
            "accounts": mapping or dict(zip(roles, [a.id for a in accounts], strict=True)),
            "amounts": {"amount": amount},
        },
    )
    check = preview(db, "c", actor, created["draft"]["id"])
    post_batch(db, "c", actor, [{k: check[k] for k in ("draft_id", "expected_version", "digest")}])
    return service._proof(db, "c", created["operation_id"], service._today(db, "c"))


def invoice(db, source, due=date(2026, 10, 10)):
    return service.create(
        db,
        "c",
        db.get(m.User, "advisor"),
        {
            "operation_id": source["operation_id"],
            "journal_digest": source["journal_digest"],
            "reference": source["reference"],
            "due_date": due,
            "due_unknown": due is None,
            "expected_date": None,
            "expected_unknown": True,
        },
    )


def alloc(db, item, source, amount):
    return service.allocate(
        db,
        "c",
        db.get(m.User, "advisor"),
        item["id"],
        {
            "operation_id": source["operation_id"],
            "journal_digest": source["journal_digest"],
            "amount": amount,
        },
        item["version"],
    )


def reverse_journal(db, source, day=date(2026, 11, 2)):
    actor = db.get(m.User, "finance_manager")
    draft = create_reversal(
        db, "c", actor, source["journal_id"], {"period_id": "p", "date": day, "reason": "اصلاح منبع"}
    )
    check = preview(db, "c", actor, draft["id"])
    post_batch(db, "c", actor, [{k: check[k] for k in ("draft_id", "expected_version", "digest")}])


def test_invoice_metadata_exact_toman_immutable_snapshots_and_terms_asof(book):
    db = book
    source = posted(db, amount="9007199254740993", unit="TOMAN")
    item = invoice(db, source)
    assert item["amount"] == item["remaining"] == "90071992547409930"
    assert item["basis"] == "native_invoice" and item["unit"] == "IRR" and item["original_unit"] == "TOMAN"
    old = service.snapshot(db, "c", db.get(m.User, "advisor"), date(2026, 10, 15), "sale")
    item = service.update_terms(
        db,
        "c",
        db.get(m.User, "advisor"),
        item["id"],
        {
            "due_date": date(2026, 10, 20),
            "due_unknown": False,
            "expected_date": None,
            "expected_unknown": True,
            "effective_date": date(2026, 10, 16),
            "reason": "تمدید",
        },
        item["version"],
    )
    assert item["version"] == 2 and len(item["terms_history"]) == 2
    historical = service.detail(db, "c", db.get(m.User, "viewer"), item["id"], date(2026, 10, 15))
    assert historical["terms"]["due_date"] == "2026-10-10" and len(historical["terms_history"]) == 1
    assert db.get(NativeInvoiceSnapshot, old["id"]).payload["items"][0]["terms"]["due_date"] == "2026-10-10"
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == 1
    assert db.scalar(select(m.Invoice.id)) is None
    with pytest.raises(DomainError):
        invoice(db, source)
    with pytest.raises(DomainError):
        service.update_terms(
            db,
            "c",
            db.get(m.User, "advisor"),
            item["id"],
            {
                "due_date": None,
                "due_unknown": True,
                "expected_date": None,
                "expected_unknown": True,
                "effective_date": date(2026, 10, 17),
                "reason": "اصلاح",
            },
            1,
        )


def test_shared_receipt_capacity_party_direction_reversal_and_no_future_evidence(book):
    db = book
    first = invoice(db, posted(db, ref="INV1"))
    second = invoice(db, posted(db, ref="INV2"))
    receipt = posted(db, "receipt", "120", "REC", day=date(2026, 10, 12))
    first = alloc(db, first, receipt, "80")
    with pytest.raises(DomainError) as error:
        alloc(db, second, receipt, "41")
    assert error.value.code == "native_invoice_capacity"
    second = alloc(db, second, receipt, "40")
    history = service.receipt_history(db, "c", db.get(m.User, "viewer"), "customer", date(2026, 10, 20))
    assert len(history) == 2 and len({r["journal_id"] for r in history}) == 1
    assert sum(Decimal(r["amount"]) for r in history) == 120
    assert all(r["due_date"] == "2026-10-10" for r in history)
    assert (
        service.detail(db, "c", db.get(m.User, "viewer"), first["id"], date(2026, 10, 11))["remaining"]
        == "100"
    )
    first = service.reverse_allocation(
        db,
        "c",
        db.get(m.User, "advisor"),
        first["id"],
        first["allocations"][0]["id"],
        "اصلاح تخصیص",
        first["version"],
    )
    assert first["remaining"] == "100" and first["allocations"][0]["reversed"]
    other = posted(db, "receipt", "50", "OTHER", party="another", day=date(2026, 10, 12))
    with pytest.raises(DomainError):
        alloc(db, first, other, "10")
    future = service._today(db, "c") + timedelta(days=1)
    with pytest.raises(DomainError):
        posted(db, "receipt", "50", "FUTURE", day=future)
    reverse_journal(db, receipt)
    current = service.detail(db, "c", db.get(m.User, "viewer"), second["id"])
    assert current["remaining"] is None and current["reason"] == "native_invoice_allocation_source_invalid"
    assert service.receipt_history(db, "c", db.get(m.User, "viewer"), "customer", date(2026, 11, 2)) == []
    assert (
        service.detail(db, "c", db.get(m.User, "viewer"), second["id"], date(2026, 10, 20))["remaining"]
        == "60"
    )


def test_reversed_invoice_unavailable_purchase_and_current_authority(book):
    db = book
    source = posted(db, "purchase_service", "100", "BUY")
    item = invoice(db, source, None)
    payment = posted(db, "payment", "60", "PAY", day=date(2026, 10, 12))
    item = alloc(db, item, payment, "60")
    assert item["direction"] == "purchase" and item["remaining"] == "40"
    with pytest.raises(DomainError):
        service.detail(db, "other", db.get(m.User, "outsider"), item["id"])
    with pytest.raises(DomainError):
        service.update_terms(
            db,
            "c",
            db.get(m.User, "viewer"),
            item["id"],
            {
                "due_date": None,
                "due_unknown": True,
                "expected_date": None,
                "expected_unknown": True,
                "effective_date": date(2026, 10, 17),
                "reason": "x",
            },
            item["version"],
        )
    reverse_journal(db, source)
    current = service.detail(db, "c", db.get(m.User, "viewer"), item["id"])
    assert current["remaining"] is None and current["reason"] == "native_invoice_source_reversed"
    assert db.scalar(select(func.count()).select_from(NativeInvoiceTerms)) == 1


def test_http_invoice_lifecycle_idempotency_history_company_isolation_and_immutable_evidence(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_invoice_models import NativeInvoice,NativeInvoiceTerms,NativeInvoiceAllocation,NativeInvoiceSnapshot
from didban.posting_models import NativeJournal
owner=client_for('owner');manager=client_for('finance_manager');advisor=client_for('advisor');viewer=client_for('viewer');outsider=client_for('outsider')
with transaction('company-a') as db:
    db.add(CompanyAccountingSetup(company_id='company-a',mode='primary'))
    db.add_all([Account(id=key,company_id='company-a',code=key,name=key) for key in ('ar','rev','bank')])
def posted(kind,ref,amount,day):
    roles={'sale_service':{'trade_receivable':'ar','service_revenue':'rev'},'receipt':{'bank_a':'bank','trade_receivable':'ar'}}[kind]
    response=command(advisor,'POST',base+'/accounting/operations',{'kind':kind,'period_id':period_id,'date':day,'description':ref,'source_reference':ref,'unit':'IRR','party_id':'customer','accounts':roles,'amounts':{'amount':amount}})
    assert response.status_code==201,response.text
    draft=response.json();check=manager.get(base+'/accounting/drafts/'+draft['draft']['id']+'/posting-preview').json()
    response=command(manager,'POST',base+'/accounting/postings',{'items':[{k:check[k] for k in ('draft_id','expected_version','digest')}]})
    assert response.status_code==201,response.text
    return draft['operation_id'],response.json()['items'][0]['digest']
sale,digest=posted('sale_service','INV-native','100','2026-09-01')
receipt,receipt_digest=posted('receipt','REC-native','80','2026-09-15')
path=base+'/accounting/native-invoices'
assert viewer.get(path+'/candidates',params={'kind':'sale_service'}).json()['items'][0]['operation_id']==sale
payload={'operation_id':sale,'journal_digest':digest,'reference':'INV-native','due_date':'2026-09-10','due_unknown':False,'expected_date':None,'expected_unknown':True}
assert command(viewer,'POST',path,payload).status_code==403
response=command(advisor,'POST',path,payload);assert response.status_code==201,response.text
item=response.json();assert item['remaining']=='100'
assert outsider.get(path+'/'+item['id']).status_code==404
allocation={'operation_id':receipt,'journal_digest':receipt_digest,'amount':'60'}
allocated=command(advisor,'POST',path+'/'+item['id']+'/allocations',allocation,version=1,key='native-allocation')
assert allocated.status_code==201,allocated.text
assert command(advisor,'POST',path+'/'+item['id']+'/allocations',allocation,version=1,key='native-allocation').json()==allocated.json()
assert command(advisor,'POST',path+'/'+item['id']+'/allocations',allocation,version=1).status_code==409
current=allocated.json();assert current['remaining']=='40'
snap=command(advisor,'POST',path+'/snapshots',{'as_of':'2026-09-20','direction':'sale'});assert snap.status_code==201,snap.text
reverse=command(advisor,'POST',path+'/'+item['id']+'/allocations/'+current['allocations'][0]['id']+'/reversal',{'reason':'اصلاح مبلغ تخصیص'},version=2)
assert reverse.status_code==201 and reverse.json()['remaining']=='100',reverse.text
reallocate=command(advisor,'POST',path+'/'+item['id']+'/allocations',dict(allocation,amount='50'),version=3)
assert reallocate.status_code==201 and reallocate.json()['remaining']=='50',reallocate.text
assert viewer.get(path+'/snapshots/'+snap.json()['id']).json()['payload']['items'][0]['remaining']=='40'
try:
    with transaction('company-a') as db:db.execute(update(NativeInvoice).values(source={'amount':'999'}))
except IntegrityError:pass
else:raise AssertionError('Native invoice pinned source must be immutable')
for model in (NativeInvoiceTerms,NativeInvoiceAllocation,NativeInvoiceSnapshot):
    try:
        with transaction('company-a') as db:db.execute(update(model).values(actor_id='changed'))
    except IntegrityError:pass
    else:raise AssertionError('Native invoice evidence must be immutable')
with transaction('company-a') as db:
    assert len(list(db.scalars(select(NativeJournal))))==2
    assert db.scalar(select(m.Invoice.id)) is None
    db.get(m.Membership,members['advisor']).active=False
assert command(advisor,'POST',path+'/snapshots',{'as_of':'2026-09-20'}).status_code==404
""",
    )


def test_only_account_correction_preserves_invoice_financial_identity(book):
    from didban.accounting_service import save_draft
    from didban.operation_models import OperationDraft

    db = book
    actor = db.get(m.User, "finance_manager")
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    for ref, edited_amount, expected in (("ACCOUNT-EDIT", "100", True), ("AMOUNT-EDIT", "101", False)):
        result = operation(
            db,
            "c",
            actor,
            {
                "kind": "sale_service",
                "period_id": "p",
                "date": date(2026, 10, 1),
                "description": ref,
                "source_reference": ref,
                "unit": "IRR",
                "party_id": "customer",
                "accounts": {"trade_receivable": accounts[0].id, "service_revenue": accounts[1].id},
                "amounts": {"amount": "100"},
            },
        )
        value = {
            "period_id": "p",
            "date": date(2026, 10, 1),
            "description": ref,
            "unit": "IRR",
            "lines": [
                {"account_id": accounts[1].id, "party_id": "customer", "debit": edited_amount, "credit": "0"},
                {"account_id": accounts[0].id, "party_id": "customer", "debit": "0", "credit": edited_amount},
            ],
        }
        saved = save_draft(db, "c", actor, value, result["draft"]["id"], 1)
        checked = preview(db, "c", actor, saved["id"])
        post_batch(db, "c", actor, [{k: checked[k] for k in ("draft_id", "expected_version", "digest")}])
        if expected:
            proof = service._proof(db, "c", result["operation_id"], service._today(db, "c"))
            assert invoice(db, proof)["amount"] == "100"
        else:
            with pytest.raises(DomainError) as error:
                service._proof(db, "c", result["operation_id"], service._today(db, "c"))
            assert error.value.code == "native_invoice_source_changed"
    assert db.scalar(select(func.count()).select_from(OperationDraft)) == 2


def test_expected_date_modes_are_distinct_and_persisted_without_estimating(book):
    from pydantic import ValidationError

    from didban.native_invoice_schemas import TermsInput

    base = {"due_date": None, "due_unknown": True}
    assert TermsInput(**base, expected_date=None, expected_unknown=False).expected_unknown is False
    assert TermsInput(**base, expected_date=None, expected_unknown=True).expected_unknown is True
    assert TermsInput(**base, expected_date=date(2026, 11, 5), expected_unknown=False).expected_date == date(
        2026, 11, 5
    )
    with pytest.raises(ValidationError):
        TermsInput(**base, expected_date=date(2026, 11, 5), expected_unknown=True)
    with pytest.raises(ValidationError):
        TermsInput(due_date=None, due_unknown=False, expected_date=None, expected_unknown=False)
    source = posted(book, ref="HISTORY-MODE")
    result = service.create(
        book,
        "c",
        book.get(m.User, "advisor"),
        {
            "operation_id": source["operation_id"],
            "journal_digest": source["journal_digest"],
            "reference": source["reference"],
            "due_date": date(2026, 10, 10),
            "due_unknown": False,
            "expected_date": None,
            "expected_unknown": False,
        },
    )
    assert result["terms"]["expected_date"] is None and result["terms"]["expected_unknown"] is False


def test_known_account_role_contradictions_block_receipts_and_current_history(book):
    from didban.native_roles_service import save_role

    db = book
    actor = db.get(m.User, "finance_manager")
    source = posted(db)
    item = invoice(db, source)
    receivable = db.scalar(select(Account).where(Account.company_id == "c").order_by(Account.code))
    bank = Account(company_id="c", code="003", name="بانک عملیات")
    db.add(bank)
    db.flush()
    receipt = posted(
        db,
        "receipt",
        "60",
        "RECEIPT-ROLE",
        day=date(2026, 10, 12),
        mapping={"bank_a": bank.id, "trade_receivable": receivable.id},
    )
    item = alloc(db, item, receipt, "60")
    old = service.snapshot(db, "c", actor, date(2026, 10, 20), "sale")
    assert len(service.receipt_history(db, "c", actor, "customer", date(2026, 10, 20))) == 1
    # The invoice receivable remains valid; only its receipt bank acquires
    # a contradictory explicit expense role.
    save_role(db, "c", actor, bank.id, "expense", 1)
    with pytest.raises(DomainError) as error:
        service._proof(db, "c", receipt["operation_id"], date(2026, 10, 20))
    assert error.value.code == "native_invoice_role_conflict"
    current = service.detail(db, "c", actor, item["id"])
    assert current["remaining"] is None and current["reason"] == "native_invoice_allocation_source_invalid"
    assert service.receipt_history(db, "c", actor, "customer", date(2026, 10, 20)) == []
    assert service.candidates(db, "c", actor, "receipt")["items"] == []
    assert db.get(NativeInvoiceSnapshot, old["id"]).payload["items"][0]["remaining"] == "40"


def test_account_only_corrected_source_uses_posted_accounts_for_semantic_role_guard(book):
    from didban.accounting_service import save_draft
    from didban.native_roles_service import save_role

    db = book
    actor = db.get(m.User, "finance_manager")
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    result = operation(
        db,
        "c",
        actor,
        {
            "kind": "sale_service",
            "period_id": "p",
            "date": date(2026, 10, 1),
            "description": "CORRECTED-ROLE",
            "source_reference": "CORRECTED-ROLE",
            "unit": "IRR",
            "party_id": "customer",
            "accounts": {"trade_receivable": accounts[0].id, "service_revenue": accounts[1].id},
            "amounts": {"amount": "100"},
        },
    )
    saved = save_draft(
        db,
        "c",
        actor,
        {
            "period_id": "p",
            "date": date(2026, 10, 1),
            "description": "CORRECTED-ROLE",
            "unit": "IRR",
            "lines": [
                {"account_id": accounts[1].id, "party_id": "customer", "debit": "100", "credit": "0"},
                {"account_id": accounts[0].id, "party_id": "customer", "debit": "0", "credit": "100"},
            ],
        },
        result["draft"]["id"],
        1,
    )
    checked = preview(db, "c", actor, saved["id"])
    post_batch(db, "c", actor, [{k: checked[k] for k in ("draft_id", "expected_version", "digest")}])
    # Original mapping is semantically correct; approved account-only swap is not.
    save_role(db, "c", actor, accounts[0].id, "trade_receivable", 1)
    save_role(db, "c", actor, accounts[1].id, "revenue", 1)
    with pytest.raises(DomainError) as error:
        service._proof(db, "c", result["operation_id"], date(2026, 10, 20))
    assert error.value.code == "native_invoice_role_conflict"


def test_module_disable_preserves_financial_evidence_but_blocks_authoring_and_mode_change_keeps_snapshots(
    book,
):
    from didban.accounting_setup_models import CompanyAccountingSetup

    db = book
    actor = db.get(m.User, "advisor")
    source = posted(db)
    item = invoice(db, source)
    receipt = posted(db, "receipt", "100", "MODULE-RECEIPT", day=date(2026, 10, 12))
    item = alloc(db, item, receipt, "100")
    snapshot = service.snapshot(db, "c", actor, date(2026, 10, 20), "sale")
    db.add(m.CompanyModule(company_id="c", key="settlements", enabled=False))
    db.flush()
    assert service.detail(db, "c", actor, item["id"])["remaining"] == "0"
    assert len(service.receipt_history(db, "c", actor, "customer", date(2026, 10, 20))) == 1
    with pytest.raises(DomainError):
        alloc(db, item, receipt, "1")
    with pytest.raises(DomainError):
        service.candidates(db, "c", actor, "receipt")
    db.add(m.CompanyModule(company_id="c", key="receivables", enabled=False))
    db.flush()
    assert service.current(db, "c", actor, date(2026, 10, 20))["items"][0]["remaining"] == "0"
    assert len(service.receipt_history(db, "c", actor, "customer", date(2026, 10, 20))) == 1
    with pytest.raises(DomainError):
        service.update_terms(
            db,
            "c",
            actor,
            item["id"],
            {
                "due_date": None,
                "due_unknown": True,
                "expected_date": None,
                "expected_unknown": True,
                "effective_date": date(2026, 10, 20),
                "reason": "تغییر",
            },
            item["version"],
        )
    db.get(CompanyAccountingSetup, "c").mode = "analysis"
    db.flush()
    assert service.current(db, "c", actor, date(2026, 10, 20))["items"][0]["remaining"] == "0"
    assert db.get(NativeInvoiceSnapshot, snapshot["id"]).payload["items"][0]["remaining"] == "0"
    with pytest.raises(DomainError):
        service.candidates(db, "c", actor, "sale_service")
