from datetime import date

import pytest
from sqlalchemy import func, select
from test_control import workspace as workspace

from didban import models as m
from didban.cheque_models import ChequeClearance, ChequeEvent
from didban.cheque_service import act, create
from didban.errors import DomainError
from didban.period_lock_models import PeriodLock


def data(number="001", **changes):
    return {
        "period_id": "p",
        "direction": "received",
        "number": number,
        "bank_name": "بانک آزمایشی",
        "bank_account": "drawer",
        "party_id": "customer",
        "amount": "6",
        "unit": "TOMAN",
        "issue_date": date(2026, 10, 1),
        "due_date": date(2026, 11, 1),
        **changes,
    }


def bank(db, **changes):
    value = {
        "id": "bank",
        "company_id": "c",
        "source_row_id": "r0",
        "session_id": "s",
        "original_unit": "IRR",
        "original_amount": "100",
        "account": "A",
        "date": date(2026, 10, 20),
        "amount": "100",
        "reference": "REAL",
        "kind": "movement",
        "party_id": "customer",
        **changes,
    }
    row = m.BankMovement(**value)
    db.add(row)
    db.flush()
    return row


def action(**changes):
    return {
        "action": "clear",
        "period_id": "p",
        "event_date": date(2026, 10, 20),
        "reason": "شاهد بانک بررسی شد",
        "bank_id": "bank",
        "endorsed_to": None,
        **changes,
    }


def test_clearance_exact_capacity_history_and_no_financial_effects(workspace):
    db = workspace
    user = db.get(m.User, "owner")
    bank(db)
    first = create(db, "c", user, data())
    second = create(db, "c", user, data("002"))
    result = act(db, "c", user, first["id"], action(), 1)
    assert result["state"] == "cleared" and result["amount"] == "60" and result["financial_effect"] is False
    with pytest.raises(DomainError) as error:
        act(db, "c", user, second["id"], action(), 1)
    assert error.value.code == "cheque_bank_capacity"
    act(db, "c", user, first["id"], action(action="return", bank_id=None), 2)
    with pytest.raises(DomainError):
        act(db, "c", user, second["id"], action(), 1)
    assert db.scalar(select(func.count()).select_from(ChequeClearance)) == 1
    assert db.scalar(select(func.count()).select_from(ChequeEvent)) == 4
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.Settlement.id)) is None
    assert db.get(m.Invoice, "i0").amount == "100"
    assert db.get(m.BankMovement, "bank").amount == "100"


def test_clearance_rejects_wrong_party_anchor_sign_company_and_stale_version(workspace):
    db = workspace
    user = db.get(m.User, "owner")
    evidence = bank(db, party_id="other")
    item = create(db, "c", user, data())
    with pytest.raises(DomainError) as error:
        act(db, "c", user, item["id"], action(), 1)
    assert error.value.code == "cheque_bank_party"
    evidence.party_id = "customer"
    evidence.amount = "-100"
    with pytest.raises(DomainError):
        act(db, "c", user, item["id"], action(), 1)
    evidence.amount = "100"
    evidence.kind = "opening"
    with pytest.raises(DomainError):
        act(db, "c", user, item["id"], action(), 1)
    evidence.kind = "movement"
    with pytest.raises(DomainError):
        act(db, "c", user, item["id"], action(), 2)
    with pytest.raises(DomainError):
        act(db, "other", db.get(m.User, "outsider"), item["id"], action(), 1)
    with pytest.raises(DomainError):
        act(db, "c", db.get(m.User, "viewer"), item["id"], action(), 1)


@pytest.mark.parametrize(
    "patch",
    [
        {"amount": "0"},
        {"amount": "-1"},
        {"amount": "NaN"},
        {"due_date": date(2026, 9, 1)},
        {"issue_date": date(2027, 1, 1), "due_date": date(2027, 1, 2)},
    ],
)
def test_invalid_cheque_inputs(workspace, patch):
    db = workspace
    with pytest.raises((DomainError, ValueError)):
        create(db, "c", db.get(m.User, "owner"), data(**patch))


def test_operational_period_lock_and_source_unit_preservation(workspace):
    db = workspace
    user = db.get(m.User, "owner")
    item = create(db, "c", user, data(amount="9007199254740993123456789"))
    assert item["amount"] == "90071992547409931234567890" and item["original_unit"] == "TOMAN"
    db.add(PeriodLock(company_id="c", period_id="p", closed=True))
    db.flush()
    with pytest.raises(DomainError) as error:
        create(db, "c", user, data("another"))
    assert error.value.code == "period_closed"


def test_http_replay_live_authority_and_immutable_event(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.cheque_models import Cheque, ChequeEvent
owner=client_for("owner");viewer=client_for("viewer");outsider=client_for("outsider")
path=base+"/cheques"
body={"period_id":period_id,"direction":"received","number":"0001","bank_name":"آزمون","bank_account":"drawer","party_id":"customer","amount":"9007199254740993","unit":"TOMAN","issue_date":"2026-09-01","due_date":"2026-10-01"}
assert command(viewer,"POST",path,body).status_code==403
key=str(uuid4());created=command(owner,"POST",path,body,key=key)
assert created.status_code==201,created.text
item=created.json();assert item["amount"]=="90071992547409930"
assert command(owner,"POST",path,body,key=key).json()==item
assert outsider.get(path+"/"+item["id"]+"/events").status_code==404
payload={"action":"deposit","period_id":period_id,"event_date":"2026-09-02","reason":"تحویل آزمایشی"}
key=str(uuid4());result=command(owner,"POST",path+"/"+item["id"]+"/actions",payload,key=key)
assert result.status_code==200 and result.json()["state"]=="deposited",result.text
assert command(owner,"POST",path+"/"+item["id"]+"/actions",payload,key=key).json()==result.json()
assert command(owner,"POST",path+"/"+item["id"]+"/actions",payload).status_code==409
with transaction("company-a") as db:
    assert len(list(db.scalars(select(Cheque))))==1
    assert len(list(db.scalars(select(ChequeEvent))))==2
    assert db.scalar(select(m.JournalLine.id)) is None
    member=db.get(m.Membership,members["owner"]);member.role="viewer"
assert command(owner,"POST",path+"/"+item["id"]+"/actions",{**payload,"action":"return"},version=2).status_code==403
try:
    with transaction("company-a") as db:db.execute(update(ChequeEvent).values(reason="changed"))
except IntegrityError:pass
else:raise AssertionError("Cheque history must be immutable")
initialize()
""",
    )
