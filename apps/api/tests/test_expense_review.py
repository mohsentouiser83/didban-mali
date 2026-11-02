from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select
from test_control import workspace as workspace

from didban import models as m
from didban.errors import DomainError
from didban.expense_review_service import compare


def expense_metric(value):
    return {
        "metric_key": "expense",
        "basis": "ledger",
        "scope": "company",
        "unit": "IRR",
        "status": "available",
        "value": value,
    }


def prepare(db):
    current = db.get(m.ResultManifest, "manifest")
    period = db.get(m.Period, "p")
    period.start = date(2026, 10, 1)
    period.end = date(2026, 10, 31)
    previous = m.Period(
        id="before", company_id="c", name="قبل", start=date(2026, 9, 1), end=date(2026, 9, 30)
    )
    db.add(previous)
    db.flush()
    period.previous_period_id = "before"
    previous_session = m.ProcessingSession(
        id="before-session", company_id="c", period_id="before", actor_id="owner", state="completed"
    )
    db.add(previous_session)
    db.flush()
    row = m.SourceRow(id="r3", company_id="c", file_id="f", sheet="ledger", row_number=4, values={})
    db.add(row)
    db.flush()
    for ident, account, when, value in [
        ("r0", "5101", date(2026, 10, 5), "100"),
        ("r1", "5101", date(2026, 9, 5), "80"),
        ("r2", "5102", date(2026, 9, 5), "30"),
        ("r3", "5103", date(2026, 10, 5), "30"),
    ]:
        db.add(
            m.JournalLine(
                id="line-" + ident,
                company_id="c",
                source_row_id=ident,
                session_id="s",
                original_unit="IRR",
                original_amount=value,
                date=when,
                entry_id="J",
                account=account,
                role="operating_expense",
                debit=value,
                credit="0",
                entry_type="regular",
                reference="",
            )
        )
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    prior = m.ResultManifest(
        id="prior-report",
        company_id="c",
        session_id="before-session",
        period_id="before",
        digest="d" * 64,
        selection={"row_ids": ["r1", "r2"], "coverage": {"ledger_complete": True}},
        metrics=[expense_metric("110")],
        details={},
        created_at=now - timedelta(days=1),
    )
    db.add(prior)
    current.created_at = now
    current.selection = {
        "row_ids": ["r0", "r3"],
        "coverage": {"ledger_complete": True},
        "comparison_manifest_id": "prior-report",
    }
    current.metrics = [expense_metric("130")]
    db.flush()
    return current, prior


def test_expense_comparison_exact_dates_evidence_and_absence_zero(workspace):
    db = workspace
    current, prior = prepare(db)
    result = compare(db, "c", current.id)
    assert result["status"] == "available" and result["difference"] == "20"
    assert result["risk_assessment"] == "not_calibrated"
    rows = {row["account"]: row for row in result["rows"]}
    assert rows["5101"]["current"] == "100" and rows["5101"]["previous"] == "80"
    assert rows["5102"]["current"] == "0" and rows["5102"]["difference"] == "-30"
    assert rows["5103"]["previous"] == "0" and rows["5103"]["percent"] is None
    assert rows["5101"]["current_evidence_refs"] == ["r0"] and rows["5101"]["previous_evidence_refs"] == [
        "r1"
    ]
    assert abs(Decimal(result["rows"][0]["difference"])) == 30
    assert db.scalar(select(m.Allocation.id)) is None
    assert prior.metrics[0]["value"] == "110"


def test_missing_coverage_period_and_foreign_manifest_never_become_zero(workspace):
    db = workspace
    current, prior = prepare(db)
    prior.selection = {"row_ids": ["r1", "r2"], "coverage": {"ledger_complete": False}}
    result = compare(db, "c", current.id)
    assert result["status"] == "unavailable" and result["previous_total"] is None and result["rows"] == []
    with pytest.raises(DomainError):
        compare(db, "other", current.id)
    db.get(m.Period, "p").previous_period_id = None
    assert compare(db, "c", current.id)["previous_total"] is None


def test_pinned_revision_and_no_future_evidence_or_scope_guess(workspace):
    db = workspace
    current, prior = prepare(db)
    extra_session = m.ProcessingSession(
        id="future-s", company_id="c", period_id="before", actor_id="owner", state="completed"
    )
    db.add(extra_session)
    db.flush()
    future = m.ResultManifest(
        id="future-report",
        company_id="c",
        session_id="future-s",
        period_id="before",
        digest="e" * 64,
        selection={"row_ids": ["r1"], "coverage": {"ledger_complete": True}},
        metrics=[expense_metric("80")],
        details={},
        created_at=current.created_at + timedelta(days=1),
    )
    db.add(future)
    db.flush()
    assert compare(db, "c", current.id)["previous_manifest_id"] == "prior-report"
    current.selection = {**current.selection, "comparison_manifest_id": "future-report"}
    assert compare(db, "c", current.id)["previous_manifest_id"] is None
    current.selection = {**current.selection, "comparison_manifest_id": None}
    assert compare(db, "c", current.id)["previous_manifest_id"] == "prior-report"
    prior.metrics = [{**expense_metric("110"), "scope": "subset"}]
    assert compare(db, "c", current.id)["status"] == "unavailable"


def test_large_expense_delta_preserves_one_rial(workspace):
    db = workspace
    current, prior = prepare(db)
    db.get(m.JournalLine, "line-r0").debit = "99999999999999999999999999999"
    db.get(m.JournalLine, "line-r1").debit = "99999999999999999999999999998"
    current.selection = {**current.selection, "row_ids": ["r0"]}
    prior.selection = {**prior.selection, "row_ids": ["r1"]}
    current.metrics = [expense_metric("99999999999999999999999999999")]
    prior.metrics = [expense_metric("99999999999999999999999999998")]
    result = compare(db, "c", current.id)
    assert result["difference"] == "1" and result["rows"][0]["difference"] == "1"
    db.get(m.JournalLine, "line-r0").entry_type = "closing"
    assert compare(db, "c", current.id)["status"] == "unavailable"
