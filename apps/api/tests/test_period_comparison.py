from datetime import date

import pytest
from sqlalchemy import select
from test_workflow import bank_rows, seed, session_job, source
from test_workflow import db as db

from didban.errors import DomainError
from didban.models import Job, Period, ProcessingIssue, ResultManifest
from didban.services import save_period
from didban.workflow import answer_issue, process


def test_prior_report_is_used_only_when_period_explicitly_selects_it(db):
    user, company, current = seed(db)
    previous = Period(company_id=company.id, name="دوره قبل", start=date(2026, 8, 1), end=date(2026, 8, 31))
    db.add(previous)
    db.flush()
    old_session, old_job = session_job(db, user, company, previous)
    old_rows = bank_rows("20", "AUG-PAY")
    for row in old_rows:
        row["date"] = row["date"].replace("2026-09", "2026-08")
    source(db, old_session, "bank", old_rows)
    process(db, old_job)
    old = db.get(ResultManifest, old_session.result_id)
    assert old
    # No implicit nearest-period comparison.
    first, job = session_job(db, user, company, current, parent=old.id)
    source(
        db,
        first,
        "bank",
        [
            {
                "account": "A",
                "date": "2026-09-05",
                "amount": "30",
                "reference": "SEP-PAY",
                "balance": "",
                "row_type": "movement",
                "anchor_cutoff": "",
            }
        ],
    )
    process(db, job)
    first_report = db.get(ResultManifest, first.result_id)
    assert (
        next(m for m in first_report.metrics if m["metric_key"] == "cash")["comparison"]["previous"] is None
    )
    current.previous_period_id = previous.id
    revision, job2 = session_job(db, user, company, current, parent=first_report.id)
    process(db, job2)
    report = db.get(ResultManifest, revision.result_id)
    observation = next(m for m in report.metrics if m["metric_key"] == "cash")
    assert observation["value"] == "150"
    assert observation["comparison"]["previous"] == "120"
    assert observation["comparison"]["delta"] == "30" and observation["comparison"]["percent"] == "25"
    assert observation["comparison"]["previous_manifest_id"] == old.id


def test_period_comparison_must_belong_to_company_and_precede_current_period(db):
    user, company, current = seed(db)
    with pytest.raises(DomainError):
        save_period(
            db,
            company.id,
            user,
            {
                "name": "دوره تازه",
                "start": date(2026, 8, 1),
                "end": date(2026, 8, 31),
                "previous_period_id": current.id,
            },
        )
    with pytest.raises(DomainError):
        save_period(
            db,
            company.id,
            user,
            {
                "name": "همان دوره",
                "start": current.start,
                "end": current.end,
                "previous_period_id": current.id,
            },
            current,
        )


def test_ledger_without_type_column_gets_persistent_scoped_type_question(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    source(
        db,
        session,
        "ledger",
        [
            {
                "entry_id": "J1",
                "date": "2026-09-05",
                "account": "BANK",
                "role": "bank",
                "debit": "100",
                "credit": "0",
            },
            {
                "entry_id": "J1",
                "date": "2026-09-05",
                "account": "CAPITAL",
                "role": "capital",
                "debit": "0",
                "credit": "100",
            },
        ],
    )
    process(db, job)
    question = db.scalar(
        select(ProcessingIssue).where(
            ProcessingIssue.session_id == session.id, ProcessingIssue.answer.is_(None)
        )
    )
    assert question.code.startswith("entry_type:") and session.state == "waiting_input"
    answer_issue(db, user, question, "opening", question.version, session.version)
    db.flush()
    nextjob = db.scalar(select(Job).where(Job.session_id == session.id, Job.generation == session.version))
    process(db, nextjob)
    assert session.result_id is not None
    report = db.get(ResultManifest, session.result_id)
    assert next(m for m in report.metrics if m["metric_key"] == "revenue")["value"] == "0"
