import pytest
from sqlalchemy import select
from test_workflow import db as db
from test_workflow import seed, session_job, source

from didban import models as m
from didban.errors import DomainError
from didban.group_match_models import GroupMatchDecision
from didban.group_match_service import decide, proposals, propose_groups
from didban.reconciliation_service import _capacity, create_run
from didban.reconciliation_service import decide as decide_single
from didban.workflow import process


def records():
    return {
        "bank": [
            {
                "id": "b1",
                "source_row_id": "b1",
                "account": "A",
                "reference": "R",
                "amount": "10",
                "date": "2026-09-05",
            },
            {
                "id": "b2",
                "source_row_id": "b2",
                "account": "A",
                "reference": "R",
                "amount": "20",
                "date": "2026-09-05",
            },
        ],
        "ledger": [
            {
                "id": "l1",
                "source_row_id": "l1",
                "account": "1101",
                "reference": "R",
                "debit": "10",
                "credit": "0",
                "date": "2026-09-05",
            },
            {
                "id": "l2",
                "source_row_id": "l2",
                "account": "1101",
                "reference": "R",
                "debit": "20",
                "credit": "0",
                "date": "2026-09-05",
            },
        ],
    }


def test_exact_groups_do_not_search_subsets_or_net_opposite_directions():
    value = records()
    group = propose_groups(value, {"A": "1101"})[0]
    assert group["bank_total"] == group["ledger_total"] == "30" and group["can_accept"]
    assert group["requires_human_review"]
    value["bank"][1]["amount"] = "21"
    assert not propose_groups(value, {"A": "1101"})[0]["can_accept"]
    value["bank"][1]["amount"] = "-20"
    assert propose_groups(value, {"A": "1101"}) == []


def test_group_account_reference_dates_and_precision():
    value = records()
    value["bank"][1]["date"] = "2026-09-06"
    assert propose_groups(value, {"A": "1101"})[0]["reason_codes"] == ["date_mismatch"]
    value["ledger"][1]["account"] = "other"
    assert not propose_groups(value, {"A": "1101"})[0]["can_accept"]
    value = records()
    for side, field in [("bank", "amount"), ("ledger", "debit")]:
        value[side][0][field] = "99999999999999999999999999999"
        value[side][1][field] = "1"
    assert propose_groups(value, {"A": "1101"})[0]["bank_total"] == "100000000000000000000000000000"


def setup(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    rows = records()
    source(
        db,
        session,
        "bank",
        [
            {
                "account": "A",
                "reference": "OPEN",
                "date": "2026-09-01",
                "amount": "0",
                "balance": "100",
                "row_type": "opening",
                "anchor_cutoff": "start_of_day",
            },
            *[
                {
                    "account": "A",
                    "reference": row["id"],
                    "date": "2026-09-05",
                    "amount": row["amount"],
                    "balance": "",
                    "row_type": "movement",
                    "anchor_cutoff": "",
                }
                for row in rows["bank"]
            ],
        ],
    )
    source(
        db,
        session,
        "ledger",
        [
            *[
                {
                    **{k: v for k, v in row.items() if k not in ("id", "source_row_id")},
                    "entry_id": "J1",
                    "reference": row["id"].replace("l", "b"),
                    "role": "bank",
                    "entry_type": "regular",
                    "party_id": "",
                }
                for row in rows["ledger"]
            ],
            {
                "entry_id": "J1",
                "date": "2026-09-05",
                "account": "3101",
                "role": "capital",
                "entry_type": "regular",
                "party_id": "",
                "debit": "0",
                "credit": "30",
                "reference": "",
            },
        ],
    )
    process(db, job)
    db.flush()
    assert session.result_id, [(q.code, q.question) for q in db.scalars(select(m.ProcessingIssue))]
    run = create_run(db, company.id, user, session.result_id, {"A": "1101"})
    return user, company, run


def test_group_decision_capacity_both_directions_version_and_reversal(db):
    user, company, run = setup(db)
    candidate = proposals(db, company.id, user, run["id"])["items"][0]
    payload = {
        "run_id": run["id"],
        "expected_version": 1,
        "decision": "accepted",
        "reason": "جمع و مرجع بررسی شد",
    }
    first = decide(db, company.id, user, candidate["id"], payload)
    assert first["decision"] == "accepted"
    with pytest.raises(DomainError):
        decide(db, company.id, user, candidate["id"], payload)
    with pytest.raises(DomainError):
        _capacity(db, company.id, candidate["bank_ids"][0], candidate["ledger_ids"], {})
    decide(db, company.id, user, candidate["id"], payload | {"expected_version": 2, "decision": "rejected"})
    _capacity(db, company.id, candidate["bank_ids"][0], candidate["ledger_ids"], {})
    single = next(item for item in run["candidates"] if item["ledger_ids"])
    decide_single(
        db,
        company.id,
        user,
        single["id"],
        {
            "run_id": run["id"],
            "expected_version": single["version"],
            "decision": "accepted",
            "reason": "بررسی تکی",
        },
    )
    with pytest.raises(DomainError) as error:
        decide(db, company.id, user, candidate["id"], payload | {"expected_version": 3})
    assert error.value.code == "reconciliation_capacity"
    assert db.scalar(select(m.Allocation.id)) is None
    assert len(list(db.scalars(select(GroupMatchDecision)))) == 2


def test_daily_whole_account_fallback_keeps_unique_real_references_and_warns():
    original = records()
    for index, row in enumerate(original["bank"]):
        row["reference"] = "bank-unique-" + str(index)
    for index, row in enumerate(original["ledger"]):
        row["reference"] = "bank-unique-" + str(index)
    group = propose_groups(original, {"A": "1101"})[0]
    assert group["match_basis"] == "whole_account_day_review"
    assert group["reason_codes"] == ["shared_reference_missing"]
    assert set(group["bank_ids"]) == {"b1", "b2"}
    assert set(group["ledger_ids"]) == {"l1", "l2"}
    assert group["requires_human_review"] and group["can_accept"]
    assert [row["reference"] for row in original["bank"]] == ["bank-unique-0", "bank-unique-1"]
    original["ledger"].append({**original["ledger"][0], "id": "extra", "debit": "1"})
    assert not propose_groups(original, {"A": "1101"})[0]["can_accept"]


def test_http_groups_capacity_release_membership_and_immutable_history(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.group_match_models import GroupMatchDecision
with transaction("company-a") as db:
    s=m.ProcessingSession(company_id="company-a",period_id=period_id,actor_id=users["owner"],state="completed")
    db.add(s);db.flush()
    file=m.SourceFile(company_id="company-a",session_id=s.id,name="groups.csv",sha256="f"*64,size=100,storage_key="group-test",row_count=4,scan_status="test")
    db.add(file);db.flush(); row_ids=[]
    for side in ("bank","ledger"):
        for index,value in enumerate(("10","20")):
            row=m.SourceRow(company_id="company-a",file_id=file.id,sheet="منبع",row_number=len(row_ids)+2,values={})
            db.add(row);db.flush();row_ids.append(row.id)
            shared=dict(company_id="company-a",source_row_id=row.id,session_id=s.id,original_unit="IRR",original_amount=value,date=date(2026,9,5),reference="unique-"+str(index))
            fact=m.BankMovement(**shared,account="A",amount=value,kind="movement") if side=="bank" else m.JournalLine(**shared,entry_id="J",account="1101",role="bank",debit=value,credit="0",entry_type="regular")
            db.add(fact)
    manifest=m.ResultManifest(company_id="company-a",session_id=s.id,period_id=period_id,digest="g"*64,selection={"row_ids":row_ids},metrics=[],details={})
    db.add(manifest);db.flush();manifest_id=manifest.id
owner=client_for("owner");viewer=client_for("viewer");advisor=client_for("advisor");outsider=client_for("outsider")
run=command(owner,"POST",base+"/reconciliations",{"manifest_id":manifest_id,"bank_to_ledger":{"A":"1101"}})
assert run.status_code==201,run.text
run=run.json();single=run["candidates"][0]
listing=base+"/reconciliation-groups?run_id="+run["id"]
assert outsider.get(listing).status_code==404
candidate=viewer.get(listing).json()["items"][0]
assert candidate["reason_codes"]==["shared_reference_missing"]
path=base+"/reconciliation-groups/"+candidate["id"]+"/decisions"
data={"run_id":run["id"],"expected_version":1,"decision":"accepted","reason":"گروه کامل روز به‌صورت انسانی بررسی شد"}
assert command(viewer,"POST",path,data).status_code==403
key=str(uuid4());accepted=command(advisor,"POST",path,data,key=key)
assert accepted.status_code==201,accepted.text
assert command(advisor,"POST",path,data,key=key).json()["id"]==accepted.json()["id"]
assert command(owner,"POST",path,data).status_code==409
singlepath=base+"/reconciliation-proposals/"+single["id"]+"/decisions"
singledata={"run_id":run["id"],"expected_version":single["version"],"decision":"accepted","reason":"پذیرش مستقل"}
assert command(owner,"POST",singlepath,singledata).status_code==409
assert command(advisor,"POST",path,data|{"decision":"rejected","expected_version":2},version=2).status_code==201
assert command(owner,"POST",singlepath,singledata).status_code==201
assert command(owner,"POST",path,data|{"expected_version":3},version=3).status_code==409
with transaction("company-a") as db:
    assert len(list(db.scalars(select(GroupMatchDecision))))==2
    assert db.scalar(select(m.Allocation.id)) is None
    assert len(list(db.scalars(select(m.JournalLine))))==2
try:
    with transaction("company-a") as db:
        db.execute(update(GroupMatchDecision).values(reason="overwrite"))
except Exception as error:assert "immutable" in str(error)
else:raise AssertionError("Grouped decision history was editable")
with transaction("company-a") as db:
    db.get(m.Membership,members["advisor"]).active=False
assert command(advisor,"POST",path,data|{"decision":"rejected","expected_version":3},version=3).status_code==404
initialize()
""",
    )
