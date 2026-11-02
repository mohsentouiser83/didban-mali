"""Exact, versioned and financially inert cash scenarios."""

from copy import deepcopy
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from test_workflow import bank_rows, seed, session_job, source
from test_workflow import db as db

from didban import models as m
from didban.errors import DomainError
from didban.scenario_engine import freeze, simulate
from didban.scenario_models import CashScenario
from didban.scenario_service import evaluate, save
from didban.workflow import process


def forecast(opening="100"):
    return {
        "status": "estimated",
        "opening": opening,
        "days": [{"date": "2026-10-01"}, {"date": "2026-10-02"}],
        "events": [
            {"date": "2026-10-01", "direction": "receipt", "amount": "30", "obligation_id": "INV1"},
            {"date": "2026-10-02", "direction": "payment", "amount": "80", "obligation_id": "PAY1"},
        ],
        "assumptions": ["فرض آزمون"],
        "policy_version": "forecast-3in180-v1",
    }


def frozen(opening="100"):
    return freeze(
        SimpleNamespace(id="m", details={"forecast": forecast(opening), "bank_balances": [{"account": "A"}]})
    )


def test_shift_exact_events_and_outside_horizon_do_not_mutate_baseline():
    baseline = frozen()
    before = deepcopy(baseline)
    result = simulate(
        baseline,
        {
            "shifts": [{"event_id": baseline["events"][0]["event_id"], "date": "2026-10-03"}],
            "hypothetical": [],
        },
    )
    assert result["baseline"]["closing"] == "50"
    assert result["scenario"]["closing"] == "20"
    assert len(result["scenario"]["excluded_events"]) == 1
    assert baseline == before
    with pytest.raises(DomainError):
        simulate(baseline, {"shifts": [{"event_id": "unknown", "date": "2026-10-01"}], "hypothetical": []})
    with pytest.raises(DomainError):
        simulate(
            baseline,
            {
                "shifts": [{"event_id": baseline["events"][0]["event_id"], "date": "2026-10-01"}] * 2,
                "hypothetical": [],
            },
        )


def test_large_exact_toman_and_first_deficit():
    result = simulate(
        frozen("99999999999999999999999999999"),
        {
            "shifts": [],
            "hypothetical": [
                {
                    "date": "2026-10-01",
                    "label": "فرض",
                    "direction": "payment",
                    "amount": "10000000000000000000000000000",
                    "unit": "TOMAN",
                }
            ],
        },
    )
    assert result["scenario"]["closing"] == "-51"
    assert result["scenario"]["first_deficit"] == "2026-10-02"
    assert result["closing_difference"] == "-100000000000000000000000000000"


@pytest.mark.parametrize("value", ["NaN", "Infinity", "1e32", "0", "-1", "0.0000001", True, 1.2])
def test_invalid_hypothetical_amount_rejected(value):
    with pytest.raises(DomainError):
        simulate(
            frozen(),
            {
                "shifts": [],
                "hypothetical": [
                    {
                        "date": "2026-10-01",
                        "label": "فرض",
                        "direction": "payment",
                        "amount": value,
                        "unit": "IRR",
                    }
                ],
            },
        )


def test_unavailable_baseline_never_invented():
    with pytest.raises(DomainError) as error:
        freeze(SimpleNamespace(id="m", details={"forecast": {"status": "unavailable", "days": []}}))
    assert error.value.code == "forecast_unavailable"


def scenario_fixture(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    source(db, session, "bank", bank_rows())
    process(db, job)
    manifest = db.get(m.ResultManifest, session.result_id)
    # Synthetic frozen forecast attached before persistence in a real fixture;
    # this test database only has create_all and deliberately no immutable trigger.
    manifest.details = {**manifest.details, "forecast": forecast("130")}
    db.flush()
    return user, company, manifest


def test_revisions_preserve_baseline_and_no_financial_effect(db):
    user, company, manifest = scenario_fixture(db)
    data = {"name": "فرض اول", "manifest_id": manifest.id, "shifts": [], "hypothetical": []}
    rows = list(db.scalars(select(m.BankMovement)))
    snapshots = [(row.id, row.amount) for row in rows]
    first = save(db, company.id, user, data)
    second = save(db, company.id, user, data | {"name": "فرض دوم"}, first["id"], 1)
    assert second["version"] == 2 and first["id"] != second["id"]
    assert db.get(CashScenario, first["id"]).name == "فرض اول"
    assert db.get(CashScenario, first["id"]).baseline == second["baseline"]
    with pytest.raises(DomainError) as error:
        save(db, company.id, user, data, first["id"], 1)
    assert error.value.code == "version_conflict"
    with pytest.raises(DomainError):
        save(db, "other-company", user, data, second["id"], 2)
    assert [(row.id, row.amount) for row in db.scalars(select(m.BankMovement))] == snapshots
    assert db.scalar(select(m.JournalLine)) is None
    assert db.scalar(select(m.PlannedPayment)) is None
    assert db.scalar(select(m.Allocation)) is None


def test_evaluation_requires_later_same_scope_evidence(db):
    user, company, manifest = scenario_fixture(db)
    item = save(
        db, company.id, user, {"name": "فرض", "manifest_id": manifest.id, "shifts": [], "hypothetical": []}
    )
    result = evaluate(db, company.id, item["id"], manifest.id)
    assert result["status"] == "unavailable" and result["closing_error"] is None
    assert result["reason_code"] == "actual_horizon_incomplete"


def test_evaluation_uses_actual_bank_rows_and_preserves_exact_errors(db):
    from datetime import date

    user, company, manifest = scenario_fixture(db)
    item = save(
        db, company.id, user, {"name": "فرض", "manifest_id": manifest.id, "shifts": [], "hypothetical": []}
    )
    period = m.Period(
        company_id=company.id, name="واقعی بعدی", start=date(2026, 10, 1), end=date(2026, 10, 2)
    )
    db.add(period)
    db.flush()
    session, job = session_job(db, user, company, period)
    source(
        db,
        session,
        "bank",
        bank_rows()
        + [
            {
                "date": "2026-10-01",
                "amount": "-10",
                "reference": "ACTUAL1",
                "balance": "",
                "row_type": "movement",
                "anchor_cutoff": "",
                "account": "A",
            }
        ],
    )
    process(db, job)
    actual = db.get(m.ResultManifest, session.result_id)
    assert actual is not None
    result = evaluate(db, company.id, item["id"], actual.id)
    assert result["status"] == "available", result
    assert [row["actual"] for row in result["days"]] == ["120", "120"]
    assert result["closing_error"] == "40"
    assert result["mean_absolute_balance_error"] == {"numerator": "80", "denominator": 2}
    assert result["evidence_refs"]
    actual.details = {**actual.details, "bank_balances": [{"account": "OTHER"}]}
    db.flush()
    assert evaluate(db, company.id, item["id"], actual.id)["reason_code"] == "bank_scope_incomparable"


def test_http_scenario_replay_permissions_immutable_revisions(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.scenario_models import CashScenario
# Insert a fresh synthetic manifest; immutable historical rows are untouched.
with transaction("company-a") as db:
    session=m.ProcessingSession(company_id="company-a",period_id=period_id,actor_id=users["owner"],state="completed")
    db.add(session);db.flush()
    manifest=m.ResultManifest(company_id="company-a",period_id=period_id,session_id=session.id,digest="scenario",selection={"row_ids":[],"coverage":{}},metrics=[],details={"bank_balances":[{"account":"A"}],"forecast":{"status":"estimated","opening":"100","days":[{"date":"2026-10-01"},{"date":"2026-10-02"}],"events":[{"date":"2026-10-01","amount":"30","direction":"receipt","obligation_id":"I"}],"assumptions":[]}})
    db.add(manifest);db.flush();mid=manifest.id
owner=client_for("owner");viewer=client_for("viewer");outsider=client_for("outsider")
path=base+"/cashflow-scenarios"
data={"name":"فرض","manifest_id":mid,"shifts":[],"hypothetical":[]}
assert command(viewer,"POST",path,data).status_code==403
assert command(outsider,"POST",path,data).status_code==404
key=str(uuid4())
r=command(owner,"POST",path,data,key=key)
assert r.status_code==201,r.text
first=r.json()
assert command(owner,"POST",path,data,key=key).json()["id"]==first["id"]
r=command(owner,"PATCH",path+"/"+first["id"],data|{"name":"نسخه تازه"},version=1)
assert r.status_code==200,r.text
second=r.json()
assert second["id"]!=first["id"] and second["version"]==2
assert command(owner,"PATCH",path+"/"+first["id"],data,version=1).status_code==409
assert len(owner.get(path).json()["items"])==2
with transaction("company-a") as db:
    assert db.get(CashScenario,first["id"]).name=="فرض"
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.PlannedPayment.id)) is None
try:
    with transaction("company-a") as db:
        db.get(CashScenario,first["id"]).name="illegal"
except IntegrityError:
    pass
else:
    raise AssertionError("Scenario revisions must be immutable")
""",
    )
