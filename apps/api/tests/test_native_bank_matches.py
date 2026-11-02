from datetime import date

import pytest
from sqlalchemy import select
from test_posting import book as book
from test_workflow import session_job, source

from didban import models as m
from didban import native_bank_match_service as service
from didban.accounting_models import Account
from didban.accounting_service import save_draft
from didban.errors import DomainError
from didban.group_match_models import GroupMatchDecision
from didban.native_bank_match_models import NativeBankMatchPreview
from didban.native_ledger_source import statement_source
from didban.native_reporting_service import save_role, save_statement
from didban.posting_models import NativeJournal
from didban.posting_service import post_batch, preview
from didban.reconciliation_service import _capacity
from didban.workflow import process


def setup(db, company_id="c", period_id="p", user_id="finance_manager"):
    user = db.get(m.User, user_id)
    company = db.get(m.Company, company_id)
    period = db.get(m.Period, period_id)
    accounts = list(db.scalars(select(Account).where(Account.company_id == company_id).order_by(Account.code)))
    save_role(db, company_id, user, accounts[0].id, "bank", 1)
    save_role(db, company_id, user, accounts[1].id, "revenue", 1)
    for index, value in enumerate(("10", "20")):
        draft = save_draft(db, company_id, user, {"period_id": period_id, "description": "نمونه", "unit": "IRR", "date": date(2026, 9, 5 + index), "lines": [{"account_id": accounts[0].id, "party_id": "customer", "debit": value, "credit": "0"}, {"account_id": accounts[1].id, "party_id": "customer", "debit": "0", "credit": value}]})
        checked = preview(db, company_id, user, draft["id"])
        post_batch(db, company_id, user, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
    statement = save_statement(db, company_id, user, period_id, date(2026, 9, 30))
    session, job = session_job(db, user, company, period)
    source(
        db,
        session,
        "bank",
        [
            {
                "account": "A",
                "date": "2026-09-01",
                "amount": "0",
                "reference": "OPEN",
                "balance": "100",
                "row_type": "opening",
                "anchor_cutoff": "start_of_day",
            },
            *[
                {
                    "account": "A",
                    "date": f"2026-09-0{5 + index * 2}",
                    "amount": value,
                    "reference": f"BANK-{index}",
                    "balance": "",
                    "row_type": "movement",
                    "anchor_cutoff": "",
                }
                for index, value in enumerate(("10", "20"))
            ],
        ],
    )
    process(db, job)
    db.flush()
    assert session.result_id
    banks = list(
        db.scalars(
            select(m.BankMovement)
            .where(m.BankMovement.company_id == company_id, m.BankMovement.kind == "movement")
            .order_by(m.BankMovement.date)
        )
    )
    ledger = [row for row in statement_source(db, company_id, statement["id"])["rows"] if row.role == "bank"]
    return (
        user,
        accounts,
        statement,
        {
            "bank_manifest_id": session.result_id,
            "native_statement_id": statement["id"],
            "bank_account": "A",
            "ledger_account": accounts[0].code,
            "bank_ids": [row.id for row in banks],
            "ledger_ids": [row.id for row in ledger],
        },
    )


def decision(item, **patch):
    return {
        "expected_digest": item["digest"],
        "expected_version": item["version"],
        "decision": "accepted",
        "reason": "تاریخ و اصل دو مبنا بررسی شد",
        **patch,
    }


def test_native_book_and_imported_bank_exact_selection_shared_capacity_and_reversal(book):
    db = book
    user, accounts, statement, data = setup(db)
    options = service.sources(db, "c", user, statement["id"])
    assert options["bank_accounts"] == ["A"] and options["ledger_accounts"] == [accounts[0].code]
    assert service.selection_options(db, "c", user, statement["id"], "ledger", page=0)["total"] == 2
    item = service.create_preview(db, "c", user, data)
    assert (
        item["snapshot"]["basis"] == "native_book"
        and item["snapshot"]["bank_total"] == item["snapshot"]["ledger_total"] == "30"
    )
    accepted = service.decide(db, "c", user, item["id"], decision(item))
    assert accepted["status"] == "accepted" and accepted["version"] == 2
    with pytest.raises(DomainError):
        _capacity(db, "c", data["bank_ids"][0], [], {})
    subset = service.create_preview(
        db,
        "c",
        user,
        data
        | {
            "bank_ids": data["bank_ids"][:1],
            "ledger_ids": [row["id"] for row in item["snapshot"]["ledgers"] if row["amount"] == "10"],
        },
    )
    with pytest.raises(DomainError) as error:
        service.decide(db, "c", user, subset["id"], decision(subset))
    assert error.value.code == "reconciliation_capacity"
    service.decide(db, "c", user, item["id"], decision(accepted, decision="rejected"))
    assert service.decide(db, "c", user, subset["id"], decision(subset))["status"] == "accepted"
    assert db.scalar(select(m.JournalLine.id)) is None
    assert len(list(db.scalars(select(NativeJournal)))) == 2


def test_native_changed_roles_or_new_journal_require_new_statement_but_old_acceptance_can_release(book):
    db = book
    user, accounts, statement, data = setup(db)
    item = service.create_preview(db, "c", user, data)
    accepted = service.decide(db, "c", user, item["id"], decision(item))
    save_role(db, "c", user, accounts[0].id, "other_asset", 2)
    assert service.read(db, "c", user, item["id"])["current"] is False
    with pytest.raises(DomainError) as error:
        service.decide(db, "c", user, item["id"], decision(accepted))
    assert error.value.code == "stale_native_statement"
    assert (
        service.decide(db, "c", user, item["id"], decision(accepted, decision="rejected"))["status"]
        == "rejected"
    )
    assert next(row for row in statement["snapshot"]["role_assignments"] if row["account_id"] == accounts[0].id)["role"] == "bank"


def test_native_mismatch_stale_digest_permission_and_crosscompany_guards(book):
    db = book
    user, accounts, statement, data = setup(db)
    item = service.create_preview(db, "c", user, data | {"bank_ids": data["bank_ids"][:1]})
    assert item["snapshot"]["can_accept"] is False
    with pytest.raises(DomainError) as error:
        service.decide(db, "c", user, item["id"], decision(item))
    assert error.value.code == "group_mismatch"
    with pytest.raises(DomainError):
        service.decide(db, "c", user, item["id"], decision(item, expected_digest="0" * 64))
    with pytest.raises(DomainError):
        service.create_preview(db, "c", user, data | {"ledger_account": "wrong"})
    with pytest.raises(DomainError):
        service.create_preview(db, "c", user, data | {"bank_manifest_id": "foreign"})
    with pytest.raises(DomainError):
        service.read(db, "other", user, item["id"])
    db.get(m.Membership, "finance_manager").role = "viewer"
    db.flush()
    with pytest.raises(DomainError):
        service.decide(db, "c", user, item["id"], decision(item))
    assert db.scalar(select(GroupMatchDecision.id)) is None


def test_native_bank_preview_has_frozen_proofs_and_no_imported_ledger(book):
    db = book
    user, accounts, statement, data = setup(db)
    item = service.create_preview(db, "c", user, data)
    assert item["snapshot"]["native_statement_digest"] == statement["digest"]
    assert set(item["snapshot"]["ledger_ids"]) == {
        row.id for row in statement_source(db, "c", statement["id"])["rows"] if row.role == "bank"
    }
    assert all(
        row["journal_id"] and row["source_row_id"] == "native-statement:" + statement["id"]
        for row in item["snapshot"]["ledgers"]
    )
    assert service.read(db, "c", user, item["id"])["digest"] == item["digest"]
    assert len(list(db.scalars(select(NativeBankMatchPreview)))) == 1


def test_primary_readiness_requires_native_bank_proof_and_preserves_other_modules(book):
    from didban.module_service import module_state
    db = book
    before = module_state(db, "c", "reconciliation", {"bank", "ledger"})
    assert before["source_basis"] == "native_book"
    assert before["missing_sources"] == [["native_bank_ledger"]]
    user, accounts, statement, data = setup(db)
    assert module_state(db, "c", "reconciliation")["status"] == "available"
    assert module_state(db, "c", "receivables")["status"] == "waiting_sources"
    save_role(db, "c", user, accounts[0].id, "other_asset", 2)
    assert module_state(db, "c", "reconciliation")["missing_sources"] == [["native_bank_ledger"]]


def test_http_native_preview_exact_approval_replay_read_isolation_and_immutability(tmp_path):
    from test_api_delivery import scenario
    scenario(tmp_path, r"""
import sys
sys.path.insert(0,"apps/api/tests")
from test_native_bank_matches import setup,decision
from didban.accounting_service import save_account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_bank_match_models import NativeBankMatchPreview
from didban.group_match_models import GroupMatchDecision
advisor=client_for("advisor"); viewer=client_for("viewer"); outsider=client_for("outsider")
with transaction("company-a") as db:
    actor=db.get(m.User,users["advisor"])
    db.get(m.Membership,members["advisor"]).role="finance_manager"
    db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"));db.flush()
    for code in ("001","002"):save_account(db,"company-a",actor,{"code":code,"name":code,"active":True})
    user,accounts,statement,payload=setup(db,"company-a",period_id,actor.id)
prefix=base+"/reconciliation-native-groups"
assert outsider.get(prefix+"/sources").status_code==404
assert command(viewer,"POST",prefix+"/previews",payload).status_code==403
created=command(advisor,"POST",prefix+"/previews",payload)
assert created.status_code==201,created.text
item=created.json();key=str(uuid4());body=decision(item)
accepted=command(advisor,"POST",prefix+"/previews/"+item["id"]+"/decisions",body,key=key,version=1)
assert accepted.status_code==201,accepted.text
assert command(advisor,"POST",prefix+"/previews/"+item["id"]+"/decisions",body,key=key,version=1).json()==accepted.json()
with transaction("company-a") as db:
    assert len(list(db.scalars(select(GroupMatchDecision))))==1
    assert db.scalar(select(m.JournalLine.id)) is None
try:
    with transaction("company-a") as db:db.execute(update(NativeBankMatchPreview).values(digest="0"*64))
except IntegrityError:pass
else:raise AssertionError("Native bank preview was mutable")
with transaction("company-a") as db:
    db.get(m.Membership,members["advisor"]).role="viewer"
assert command(advisor,"POST",prefix+"/previews/"+item["id"]+"/decisions",body,key=key,version=1).status_code==403
initialize()
""")
