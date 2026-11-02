from datetime import date

import pytest
from sqlalchemy import select
from test_group_matches import setup
from test_workflow import db as db

from didban import models as m
from didban.errors import DomainError
from didban.group_match_models import GroupMatchDecision
from didban.group_match_service import decide as decide_auto
from didban.group_match_service import proposals
from didban.manual_group_models import ManualGroupPreview
from didban.manual_group_service import create_preview, decide, read, selection_options
from didban.reconciliation_service import _capacity, create_run
from didban.reconciliation_service import decide as decide_single
from didban.workflow import serialize_fact


def selected(db):
    user, company, run = setup(db)
    banks = list(
        db.scalars(
            select(m.BankMovement)
            .where(m.BankMovement.company_id == company.id, m.BankMovement.kind == "movement")
            .order_by(m.BankMovement.amount)
        )
    )
    ledgers = list(
        db.scalars(
            select(m.JournalLine)
            .where(m.JournalLine.company_id == company.id, m.JournalLine.role == "bank")
            .order_by(m.JournalLine.debit)
        )
    )
    return user, company, run, banks, ledgers


def preview(db, user, company, run, banks, ledgers):
    return create_preview(
        db,
        company.id,
        user,
        {"run_id": run["id"], "bank_ids": [r.id for r in banks], "ledger_ids": [r.id for r in ledgers]},
    )


def decision(item, **patch):
    return {
        "expected_digest": item["digest"],
        "expected_version": item["version"],
        "decision": "accepted",
        "reason": "ارتباط ردیف‌های منتخب بررسی شد",
        **patch,
    }


def test_cross_date_reference_manual_selection_exact_review_and_shared_capacity(db):
    user, company, run, banks, ledgers = selected(db)
    banks[1].date = date(2026, 9, 7)
    ledgers[0].reference = "different-reference"
    db.flush()
    before = [serialize_fact(row) for row in [*banks, *ledgers]]
    item = preview(db, user, company, run, banks, ledgers)
    assert item["snapshot"]["can_accept"] and item["snapshot"]["bank_total"] == "30"
    assert {"date_mismatch", "shared_reference_missing", "party_missing"} <= set(
        item["snapshot"]["reason_codes"]
    )
    accepted = decide(db, company.id, user, item["id"], decision(item))
    assert accepted["status"] == "accepted" and accepted["version"] == 2
    with pytest.raises(DomainError):
        _capacity(db, company.id, banks[0].id, [ledgers[0].id], {})
    with pytest.raises(DomainError):
        decide(db, company.id, user, item["id"], decision(item))
    released = decide(db, company.id, user, item["id"], decision(accepted, decision="rejected"))
    assert released["status"] == "rejected"
    _capacity(db, company.id, banks[0].id, [ledgers[0].id], {})
    assert before == [serialize_fact(row) for row in [*banks, *ledgers]]
    assert len(list(db.scalars(select(GroupMatchDecision)))) == 2
    assert db.scalar(select(m.Allocation.id)) is None


def test_mismatch_never_assumes_fee_and_known_party_conflict_rejected(db):
    user, company, run, banks, ledgers = selected(db)
    banks[0].amount = "11"
    db.flush()
    item = preview(db, user, company, run, banks, ledgers)
    assert item["snapshot"]["difference"] == "1" and item["snapshot"]["can_accept"] is False
    with pytest.raises(DomainError) as error:
        decide(db, company.id, user, item["id"], decision(item))
    assert error.value.code == "group_mismatch"
    banks[0].party_id = "customer-a"
    ledgers[0].party_id = "customer-b"
    db.flush()
    with pytest.raises(DomainError) as error:
        preview(db, user, company, run, banks, ledgers)
    assert error.value.code == "manual_group_party"


@pytest.mark.parametrize(
    "kind", ["duplicate", "one_to_one", "opposite", "account", "anchor", "unmapped_role"]
)
def test_rejects_invalid_manual_evidence_and_selection(db, kind):
    user, company, run, banks, ledgers = selected(db)
    if kind == "duplicate":
        banks = [banks[0], banks[0]]
    elif kind == "one_to_one":
        banks = banks[:1]
        ledgers = ledgers[:1]
    elif kind == "opposite":
        banks[0].amount = "-10"
    elif kind == "account":
        ledgers[0].account = "other"
    elif kind == "anchor":
        banks[0].kind = "opening"
    elif kind == "unmapped_role":
        ledgers[0].role = "operating_expense"
    db.flush()
    with pytest.raises(DomainError):
        preview(db, user, company, run, banks, ledgers)


def test_auto_and_single_acceptances_block_manual_and_manual_blocks_auto(db):
    user, company, run, banks, ledgers = selected(db)
    manual = preview(db, user, company, run, banks, ledgers)
    automatic = proposals(db, company.id, user, run["id"])["items"][0]
    auto_data = {
        "run_id": run["id"],
        "expected_version": 1,
        "decision": "accepted",
        "reason": "گروه روز بررسی شد",
    }
    decide_auto(db, company.id, user, automatic["id"], auto_data)
    with pytest.raises(DomainError) as error:
        decide(db, company.id, user, manual["id"], decision(manual))
    assert error.value.code == "reconciliation_capacity"
    decide_auto(
        db, company.id, user, automatic["id"], auto_data | {"expected_version": 2, "decision": "rejected"}
    )
    single = next(row for row in run["candidates"] if row["ledger_ids"])
    single_data = {
        "run_id": run["id"],
        "expected_version": single["version"],
        "decision": "accepted",
        "reason": "تطبیق تکی",
    }
    decide_single(db, company.id, user, single["id"], single_data)
    with pytest.raises(DomainError):
        decide(db, company.id, user, manual["id"], decision(manual))
    decide_single(
        db, company.id, user, single["id"], single_data | {"expected_version": 2, "decision": "rejected"}
    )
    decide(db, company.id, user, manual["id"], decision(manual))
    with pytest.raises(DomainError):
        decide_auto(db, company.id, user, automatic["id"], auto_data | {"expected_version": 3})


def test_stale_run_cannot_accept_but_can_release_historical_capacity(db):
    user, company, run, banks, ledgers = selected(db)
    item = preview(db, user, company, run, banks, ledgers)
    accepted = decide(db, company.id, user, item["id"], decision(item))
    create_run(db, company.id, user, run["manifest_id"], {"A": "1101"})
    assert read(db, company.id, user, item["id"])["current"] is False
    with pytest.raises(DomainError):
        decide(db, company.id, user, item["id"], decision(accepted))
    released = decide(db, company.id, user, item["id"], decision(accepted, decision="rejected"))
    assert released["status"] == "rejected"
    _capacity(db, company.id, banks[0].id, [ledgers[0].id], {})


def test_options_paginate_filter_and_current_company_role_guards(db):
    user, company, run, banks, ledgers = selected(db)
    first = selection_options(db, company.id, user, run["id"], "bank", limit=1)
    assert len(first["items"]) == 1 and first["next_cursor"]
    second = selection_options(db, company.id, user, run["id"], "bank", limit=1, cursor=first["next_cursor"])
    assert second["items"][0]["id"] != first["items"][0]["id"]
    assert selection_options(db, company.id, user, run["id"], "ledger", q="1101")["items"]
    assert selection_options(db, company.id, user, run["id"], "bank", q="unmatched")["items"] == []
    item = preview(db, user, company, run, banks, ledgers)
    with pytest.raises(DomainError):
        decide(db, company.id, user, item["id"], decision(item, expected_digest="0" * 64))
    member = db.scalar(
        select(m.Membership).where(m.Membership.company_id == company.id, m.Membership.user_id == user.id)
    )
    member.role = "viewer"
    db.flush()
    with pytest.raises(DomainError):
        decide(db, company.id, user, item["id"], decision(item))
    with pytest.raises(DomainError):
        read(db, "other", user, item["id"])
    assert len(list(db.scalars(select(ManualGroupPreview)))) == 1


def test_http_manual_preview_decision_replay_immutable_and_shared_capacity(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.manual_group_models import ManualGroupPreview
from didban.group_match_models import GroupMatchDecision
with transaction("company-a") as db:
    session=m.ProcessingSession(company_id="company-a",period_id=period_id,actor_id=users["owner"],state="completed")
    db.add(session);db.flush()
    file=m.SourceFile(company_id="company-a",session_id=session.id,name="manual.csv",sha256="f"*64,size=100,storage_key="manual-test",row_count=4,scan_status="test")
    db.add(file);db.flush();rows=[];banks=[];ledgers=[]
    for side in ("bank","ledger"):
        for index,value in enumerate(("10","20")):
            row=m.SourceRow(company_id="company-a",file_id=file.id,sheet="منبع",row_number=len(rows)+2,values={})
            db.add(row);db.flush();rows.append(row.id)
            shared=dict(company_id="company-a",source_row_id=row.id,session_id=session.id,original_unit="IRR",original_amount=value,date=date(2026,9,5+index),reference=side+str(index),party_id="customer")
            fact=m.BankMovement(**shared,account="A",amount=value,kind="movement") if side=="bank" else m.JournalLine(**shared,entry_id="J",account="1101",role="bank",debit=value,credit="0",entry_type="regular")
            db.add(fact);db.flush();(banks if side=="bank" else ledgers).append(fact.id)
    manifest=m.ResultManifest(company_id="company-a",session_id=session.id,period_id=period_id,digest="g"*64,selection={"row_ids":rows},metrics=[],details={})
    db.add(manifest);db.flush();manifest_id=manifest.id
owner=client_for("owner");viewer=client_for("viewer");advisor=client_for("advisor");outsider=client_for("outsider")
run=command(owner,"POST",base+"/reconciliations",{"manifest_id":manifest_id,"bank_to_ledger":{"A":"1101"}}).json()
prefix=base+"/reconciliation-manual-groups"
selection={"run_id":run["id"],"bank_ids":banks,"ledger_ids":ledgers}
assert command(viewer,"POST",prefix+"/previews",selection).status_code==403
assert outsider.get(prefix+"/options",params={"run_id":run["id"],"side":"bank"}).status_code==404
options=owner.get(prefix+"/options",params={"run_id":run["id"],"side":"bank","limit":1}).json();assert options["next_cursor"]
key=str(uuid4());response=command(advisor,"POST",prefix+"/previews",selection,key=key)
assert response.status_code==201,response.text
preview=response.json();assert preview["snapshot"]["can_accept"] and preview["snapshot"]["difference"]=="0"
assert command(advisor,"POST",prefix+"/previews",selection,key=key).json()==preview
path=prefix+"/previews/"+preview["id"]+"/decisions"
body={"expected_digest":preview["digest"],"expected_version":1,"decision":"accepted","reason":"تفاوت تاریخ و مرجع بررسی شد"}
key=str(uuid4());accepted=command(advisor,"POST",path,body,key=key)
assert accepted.status_code==201,accepted.text
assert command(advisor,"POST",path,body,key=key).json()==accepted.json()
assert command(owner,"POST",path,body).status_code==409
assert owner.get(prefix+"/previews/"+preview["id"]).json()["status"]=="accepted"
assert all(row["status"]=="accepted_in_group" and row["group_decision_id"] for row in owner.get(base+"/reconciliations/latest").json()["candidates"])
assert outsider.get(prefix+"/previews/"+preview["id"]).status_code==404
try:
    with transaction("company-a") as db:db.execute(update(ManualGroupPreview).values(digest="changed"))
except IntegrityError:pass
else:raise AssertionError("Manual preview was editable")
with transaction("company-a") as db:
    assert len(list(db.scalars(select(ManualGroupPreview))))==1
    assert len(list(db.scalars(select(GroupMatchDecision))))==1
    assert len(list(db.scalars(select(m.BankMovement))))==2
    assert len(list(db.scalars(select(m.JournalLine))))==2
    assert db.scalar(select(m.Allocation.id)) is None
    member=db.get(m.Membership,members["advisor"]);member.role="viewer"
assert command(advisor,"POST",path,body|{"decision":"rejected","expected_version":2},version=2).status_code==403
assert command(owner,"POST",path,body|{"decision":"rejected","expected_version":2},version=2).status_code==201
assert all("group_decision_id" not in row for row in owner.get(base+"/reconciliations/latest").json()["candidates"])
initialize()
""",
    )


@pytest.mark.parametrize("single_side", ["bank", "ledger"])
def test_explicit_one_to_many_is_supported_without_subset_search(db, single_side):
    user, company, run, banks, ledgers = selected(db)
    if single_side == "bank":
        banks = banks[:1]
        banks[0].amount = "30"
    else:
        ledgers = ledgers[:1]
        ledgers[0].debit = "30"
    db.flush()
    item = preview(db, user, company, run, banks, ledgers)
    assert item["snapshot"]["bank_total"] == item["snapshot"]["ledger_total"] == "30"
    assert len(item["snapshot"]["bank_ids"]) == (1 if single_side == "bank" else 2)
    assert len(item["snapshot"]["ledger_ids"]) == (2 if single_side == "bank" else 1)
    assert decide(db, company.id, user, item["id"], decision(item))["status"] == "accepted"


@pytest.mark.parametrize("source", ["manual", "automatic"])
def test_parent_candidate_projection_tracks_group_acceptance_and_release_without_mutation(db, source):
    from copy import deepcopy

    from didban.reconciliation_service import public_run

    user, company, run, banks, ledgers = selected(db)
    frozen = db.get(m.ReconciliationRun, run["id"])
    original = deepcopy(frozen.candidates)
    if source == "manual":
        item = preview(db, user, company, run, banks, ledgers)
        accepted = decide(db, company.id, user, item["id"], decision(item))
    else:
        item = proposals(db, company.id, user, run["id"])["items"][0]
        payload = {"run_id": run["id"], "expected_version": 1, "decision": "accepted", "reason": "بررسی روز"}
        decide_auto(db, company.id, user, item["id"], payload)
    projected = public_run(db, frozen)
    assert all(row["status"] == "accepted_in_group" for row in projected["candidates"])
    assert all(
        row["group_state"] == "accepted" and row["group_decision_id"] and row["group_version"] == 1
        for row in projected["candidates"]
    )
    assert [row["single_status"] for row in projected["candidates"]] == [row["status"] for row in original]
    assert frozen.candidates == original
    if source == "manual":
        decide(db, company.id, user, item["id"], decision(accepted, decision="rejected"))
    else:
        decide_auto(
            db, company.id, user, item["id"], payload | {"decision": "rejected", "expected_version": 2}
        )
    released = public_run(db, frozen)
    assert all("group_decision_id" not in row for row in released["candidates"])
    assert [row["status"] for row in released["candidates"]] == [row["status"] for row in original]
    assert frozen.candidates == original
