"""Accounting drafts preserve exact values and cannot bypass posting authority."""

from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from didban import models as m
from didban.accounting_models import Account, Draft
from didban.accounting_schemas import DraftInput
from didban.accounting_service import capabilities, grant, save_account, save_draft
from didban.errors import DomainError


@pytest.fixture
def workspace():
    engine = create_engine("sqlite://")
    m.Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([m.Company(id="c", name="شرکت"), m.Company(id="other", name="دیگر")])
        for role in ("owner", "finance_manager", "advisor", "viewer"):
            db.add(m.User(id=role, email=role + "@example.local", name=role, password_hash="unused"))
        db.flush()
        for role in ("owner", "finance_manager", "advisor", "viewer"):
            db.add(m.Membership(id=role, company_id="c", user_id=role, role=role))
        db.add(m.Period(id="p", company_id="c", name="دوره", start=date(2026, 1, 1), end=date(2026, 12, 31)))
        db.flush()
        for code in ("1", "2"):
            save_account(db, "c", db.get(m.User, "owner"), {"code": code, "name": code, "active": True})
        db.flush()
        yield db


def draft_data(db):
    accounts = list(db.scalars(select(Account).order_by(Account.code)))
    return {
        "period_id": "p",
        "date": date(2026, 11, 1),
        "description": "پیش نویس",
        "unit": "TOMAN",
        "lines": [
            {"account_id": accounts[0].id, "party_id": "", "debit": "9007199254740993", "credit": "0"},
            {"account_id": accounts[1].id, "party_id": "", "debit": "0", "credit": "9007199254740993"},
        ],
    }


def test_draft_exact_conversion_version_and_no_financial_effect(workspace):
    db = workspace
    user = db.get(m.User, "advisor")
    result = save_draft(db, "c", user, draft_data(db))
    assert result["lines"][0]["debit"] == "90071992547409930"
    assert result["posting_available"] is False
    assert db.scalar(select(m.JournalLine.id)) is None
    with pytest.raises(DomainError):
        save_draft(db, "c", user, draft_data(db), result["id"], 8)
    edited = save_draft(db, "c", user, draft_data(db), result["id"], 1)
    assert edited["version"] == 2


def test_invalid_balance_and_period(workspace):
    db = workspace
    data = draft_data(db)
    data["lines"][1]["credit"] = "1"
    with pytest.raises(DomainError) as error:
        save_draft(db, "c", db.get(m.User, "owner"), data)
    assert error.value.code == "journal_not_balanced"
    data = draft_data(db) | {"date": date(2027, 1, 1)}
    with pytest.raises(DomainError) as error:
        save_draft(db, "c", db.get(m.User, "owner"), data)
    assert error.value.code == "date_outside_period"


def test_owner_not_implicit_posting_and_owner_only_grant(workspace):
    db = workspace
    owner = db.get(m.User, "owner")
    finance = db.get(m.User, "finance_manager")
    assert capabilities(db, "c", owner)["can_post"] is False
    assert capabilities(db, "c", finance)["can_post"] is True
    with pytest.raises(DomainError):
        grant(db, "c", finance, "advisor", {"post_journal": True, "reopen_period": False}, 1)
    grant(db, "c", owner, "advisor", {"post_journal": True, "reopen_period": False}, 1)
    assert capabilities(db, "c", db.get(m.User, "advisor"))["can_post"] is True
    grant(db, "c", owner, "advisor", {"post_journal": False, "reopen_period": False}, 2)
    assert capabilities(db, "c", db.get(m.User, "advisor"))["can_post"] is False
    assert db.scalar(select(m.ReportApproval.id)) is None


def test_viewer_cannot_prepare_and_foreign_account_rejected(workspace):
    db = workspace
    with pytest.raises(DomainError):
        save_draft(db, "c", db.get(m.User, "viewer"), draft_data(db))
    data = draft_data(db)
    db.add(Account(id="foreign", company_id="other", code="1", name="حساب", active=True))
    db.flush()
    data["lines"][0]["account_id"] = "foreign"
    with pytest.raises(DomainError) as error:
        save_draft(db, "c", db.get(m.User, "owner"), data)
    assert error.value.status == 404
    assert db.scalar(select(Draft.id)) is None


def test_schema_rejects_float_unknown_unit_and_blank_description():
    from pydantic import ValidationError

    data = {
        "period_id": "p",
        "date": "2026-11-01",
        "description": "   ",
        "unit": "USD",
        "lines": [{"account_id": "1", "debit": 1.1, "credit": "0"}] * 2,
    }
    with pytest.raises(ValidationError):
        DraftInput.model_validate(data)


def test_http_drafts_csrf_replay_version_and_owner_permission(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_models import Draft
owner=client_for("owner"); advisor=client_for("advisor"); viewer=client_for("viewer"); outsider=client_for("outsider")
path=base+"/accounting"
assert outsider.get(path+"/accounts").status_code==404
accounts=[]
for code in ("100", "200"):
    response=command(owner,"POST",path+"/accounts",{"code":code,"name":"حساب آزمایشی","active":True})
    assert response.status_code==201,response.text
    accounts.append(response.json())
data={"period_id":period_id,"date":"2026-09-15","description":"پیش نویس آزمون","unit":"TOMAN","lines":[{"account_id":accounts[0]["id"],"debit":"10","credit":"0"},{"account_id":accounts[1]["id"],"debit":"0","credit":"10"}]}
assert command(viewer,"POST",path+"/drafts",data).status_code==403
key=str(uuid4())
response=command(advisor,"POST",path+"/drafts",data,key=key)
assert response.status_code==201,response.text
item=response.json()
assert item["lines"][0]["debit"]=="100"
assert command(advisor,"POST",path+"/drafts",data,key=key).json()["id"]==item["id"]
assert command(advisor,"PATCH",path+"/drafts/"+item["id"],data,version=8).status_code==409
assert command(advisor,"PATCH",path+"/drafts/"+item["id"],data,version=1).json()["version"]==2
assert owner.get(path+"/capabilities").json()["can_post"] is False
permission_path=path+"/permissions/"+members["advisor"]
assert command(advisor,"PATCH",permission_path,{"post_journal":True,"reopen_period":False}).status_code==403
response=command(owner,"PATCH",permission_path,{"post_journal":True,"reopen_period":False})
assert response.status_code==200,response.text
assert advisor.get(path+"/capabilities").json()["can_post"] is True
assert advisor.get(path+"/capabilities").json()["posting_available"] is False
csrf=owner.headers.pop("x-csrf-token")
assert command(owner,"POST",path+"/accounts",{"code":"300","name":"حساب"}).status_code==403
with transaction("company-a") as db:
    assert len(list(db.scalars(select(Draft))))==1
    assert db.scalar(select(m.JournalLine.id)) is None
initialize() # Additive initialization remains repeatable on an existing schema.
""",
    )


@pytest.mark.parametrize("value", ["NaN", "Infinity", "1e32", "0.0000001", True, 1.2])
def test_draft_rejects_invalid_exact_amounts(workspace, value):
    data = draft_data(workspace)
    data["lines"][0]["debit"] = value
    with pytest.raises(DomainError) as error:
        save_draft(workspace, "c", workspace.get(m.User, "owner"), data)
    assert error.value.code == "invalid_amount"


def test_large_amount_inactive_account_and_draft_period_guard(workspace):
    from didban.services import save_period

    db = workspace
    data = draft_data(db)
    for line in data["lines"]:
        line["debit"] = "12345678901234567890123456789" if line["debit"] != "0" else "0"
        line["credit"] = "12345678901234567890123456789" if line["credit"] != "0" else "0"
    result = save_draft(db, "c", db.get(m.User, "owner"), data)
    assert result["lines"][0]["debit"] == "123456789012345678901234567890"
    account = db.get(Account, data["lines"][0]["account_id"])
    account.active = False
    with pytest.raises(DomainError) as error:
        save_draft(db, "c", db.get(m.User, "owner"), data)
    assert error.value.code == "inactive_account"
    period = db.get(m.Period, "p")
    with pytest.raises(DomainError) as error:
        save_period(
            db,
            "c",
            db.get(m.User, "owner"),
            {"name": "دوره", "start": date(2026, 1, 1), "end": date(2026, 6, 1), "previous_period_id": None},
            period,
        )
    assert error.value.code == "period_in_use"


def test_viewer_downgrade_ignores_retained_grants_and_allows_revocation(workspace):
    db = workspace
    owner = db.get(m.User, "owner")
    advisor = db.get(m.User, "advisor")
    grant(db, "c", owner, "advisor", {"post_journal": True, "reopen_period": True}, 1)
    assert capabilities(db, "c", advisor)["can_post"] is True
    db.get(m.Membership, "advisor").role = "viewer"
    db.flush()
    caps = capabilities(db, "c", advisor)
    assert caps["can_post"] is False and caps["can_reopen"] is False
    with pytest.raises(DomainError) as error:
        grant(db, "c", owner, "advisor", {"post_journal": True, "reopen_period": False}, 2)
    assert error.value.code == "viewer_read_only"
    grant(db, "c", owner, "advisor", {"post_journal": False, "reopen_period": False}, 2)
    db.get(m.Membership, "advisor").active = False
    db.flush()
    with pytest.raises(DomainError) as error:
        grant(db, "c", owner, "advisor", {"post_journal": False, "reopen_period": False}, 3)
    assert error.value.code == "inactive_membership"


def test_owner_explicit_posting_permission_is_separate_and_revocable(workspace):
    db = workspace
    owner = db.get(m.User, "owner")
    assert capabilities(db, "c", owner)["can_post"] is False
    grant(db, "c", owner, "owner", {"post_journal": True, "reopen_period": True}, 1)
    assert capabilities(db, "c", owner)["can_post"] is True
    assert db.get(m.Membership, "owner").approve_financial_report is False
    grant(db, "c", owner, "owner", {"post_journal": False, "reopen_period": False}, 2)
    assert capabilities(db, "c", owner)["can_post"] is False
