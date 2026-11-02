from copy import deepcopy

import pytest
from sqlalchemy import select
from test_posting import book as book

from didban import models as m
from didban.errors import DomainError
from didban.native_reporting_models import NativeStatementRun
from didban.native_scenario_models import NativeCashScenario
from didban.native_scenario_service import baseline, evaluate, save
from didban.posting_models import NativeJournal


def report(db, identifier="native", stamp="2026-11-01", value="100", **patch):
    item = NativeStatementRun(
        id=identifier,
        company_id="c",
        actor_id="finance_manager",
        digest=identifier.ljust(64, "a"),
        snapshot={
            "basis": "native_book",
            "as_of": stamp,
            "opening_evidence": {"status": "available"},
            "metrics": [{"metric_key": "bank_balance", "value": value, "status": "available"}],
            "role_assignments": [{"account_id": "bank", "role": "bank", "assignment_version": 1}],
            **patch,
        },
    )
    db.add(item)
    db.flush()
    return item


def data(**patch):
    return {
        "name": "فرض پرداخت",
        "native_statement_id": "native",
        "horizon_days": 30,
        "hypothetical": [
            {
                "label": "خرید فرضی",
                "amount": "3",
                "unit": "TOMAN",
                "direction": "payment",
                "date": "2026-11-02",
            }
        ],
        **patch,
    }


def test_native_source_frozen_revision_explicit_dates_and_no_financial_effect(book):
    db = book
    user = db.get(m.User, "finance_manager")
    source = report(db)
    frozen = deepcopy(source.snapshot)
    item = save(db, "c", user, data())
    assert item["baseline"]["receipt_dates_inferred"] is False
    assert item["baseline"]["events"] == [] and item["baseline"]["opening"] == "100"
    assert item["comparison"]["baseline"]["closing"] == "100"
    assert item["comparison"]["scenario"]["closing"] == "70"
    assert item["comparison"]["scenario"]["events"][0]["date"] == "2026-11-02"
    revised = save(db, "c", user, data(name="نسخه تازه", hypothetical=[]), item["id"], 1)
    assert revised["version"] == 2 and revised["baseline"] == item["baseline"]
    assert db.get(NativeCashScenario, item["id"]).comparison["scenario"]["closing"] == "70"
    assert source.snapshot == frozen
    assert db.scalar(select(NativeJournal.id)) is None
    with pytest.raises(DomainError):
        save(db, "c", user, data(), item["id"], 1)
    with pytest.raises(DomainError):
        save(db, "c", user, data(horizon_days=5), revised["id"], 2)
    db.get(m.Membership, "finance_manager").role = "viewer"
    with pytest.raises(DomainError):
        save(db, "c", user, data())


def test_missing_native_cash_cross_company_and_imported_manifest_not_accepted(book):
    db = book
    user = db.get(m.User, "finance_manager")
    report(db, opening_evidence={"status": "unavailable"})
    with pytest.raises(DomainError) as error:
        baseline(db, "c", user, "native")
    assert error.value.code == "native_scenario_cash_unavailable"
    with pytest.raises(DomainError):
        baseline(db, "other", user, "native")
    with pytest.raises(DomainError):
        baseline(db, "c", user, "imported-manifest")
    report(db, "null", value=None)
    with pytest.raises(DomainError):
        baseline(db, "c", user, "null")


def test_actual_is_exact_end_scope_and_closing_only(book):
    db = book
    user = db.get(m.User, "finance_manager")
    report(db)
    item = save(db, "c", user, data())
    report(db, "wrongdate", "2026-11-30", "75")
    assert evaluate(db, "c", user, item["id"], "wrongdate")["reason_code"] == "actual_date_mismatch"
    report(db, "actual", "2026-12-01", "75")
    result = evaluate(db, "c", user, item["id"], "actual")
    assert result["status"] == "available" and result["closing_error"] == "5"
    assert result["baseline_closing_error"] == "-25" and result["days"] == []
    report(
        db,
        "newscope",
        "2026-12-01",
        "75",
        role_assignments=[{"account_id": "bank", "role": "bank", "assignment_version": 2}],
    )
    assert evaluate(db, "c", user, item["id"], "newscope")["reason_code"] == "native_bank_scope_incomparable"


def test_native_aggregate_cash_can_exceed_single_journal_line_capacity(book):
    db = book
    user = db.get(m.User, "finance_manager")
    report(db, value="100000000000000000000000000000000")
    item = save(db, "c", user, data())
    assert item["comparison"]["scenario"]["closing"] == "99999999999999999999999999999970"
