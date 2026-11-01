from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select
from test_workflow import bank_rows, invoice_rows, next_answer_job, seed, session_job, source
from test_workflow import db as db

from didban.errors import DomainError
from didban.ingestion import interpret, read_file
from didban.models import (
    BankMovement,
    Interpretation,
    Invoice,
    JournalLine,
    PlannedPayment,
    ProcessingIssue,
    ResultManifest,
    Settlement,
    SourceFile,
    SourceRow,
    uid,
)
from didban.services import create_revision
from didban.workflow import process


@pytest.fixture
def forecast_session(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    coverage = db.scalar(select(ProcessingIssue).where(ProcessingIssue.session_id == session.id, ProcessingIssue.code == "coverage"))
    coverage.answer = {"value": coverage.answer["value"] | {"future_payments_complete": True}}
    db.flush()
    return user, company, period, session, job


def pending(db, session):
    return db.scalar(select(ProcessingIssue).where(ProcessingIssue.session_id == session.id, ProcessingIssue.answer.is_(None)))


def assert_no_financial_facts(db):
    for cls in (BankMovement, Invoice, JournalLine, Settlement):
        assert not list(db.scalars(select(cls)))


def add_baseline_sources(db, session):
    base = Path(__file__).resolve().parents[3] / "docs/validation/rebuild-v1/inputs/baseline"
    for path in sorted(base.iterdir()):
        sheets = read_file(path.name, path.read_bytes())
        file = SourceFile(company_id=session.company_id, session_id=session.id, name=path.name, sha256=uid(), size=path.stat().st_size, storage_key=uid(), state="ready", scan_status="development_unscanned", row_count=sum(len(sheet.rows) for sheet in sheets))
        db.add(file)
        db.flush()
        for sheet in sheets:
            db.add(Interpretation(company_id=session.company_id, file_id=file.id, sheet=sheet.name, provenance="validated_header_rules", **interpret(sheet, path.name)))
            db.add_all(SourceRow(company_id=session.company_id, file_id=file.id, sheet=sheet.name, row_number=number, values=values) for number, values in sheet.rows)
    db.flush()


def test_d09_reference_forecast_pauses_before_all_facts_then_publishes_exact_snapshot(db, forecast_session):
    user, _company, _period, session, job = forecast_session
    add_baseline_sources(db, session)
    process(db, job)
    db.commit()
    assert session.state == "waiting_input" and session.result_id is None
    assert_no_financial_facts(db)
    question = pending(db, session)
    assert question.code.startswith("receipt_date:")
    assert question.evidence["invoice_refs"] == ["S001"]
    assert question.evidence["reason_code"] == "receipt_estimate_in_past"
    with pytest.raises(DomainError, match="پس از پایان دوره"):
        next_answer_job(db, user, session, question, "2026-09-30")
    next_answer_job(db, user, session, question, "2026-10-05")
    db.commit()
    report = db.get(ResultManifest, session.result_id)
    forecast = report.details["forecast"]
    assert forecast["status"] == "estimated"
    assert forecast["policy_version"] == "forecast-3in180-v1"
    assert forecast["opening"] == "2798" and forecast["closing"] == "2628"
    assert sum(int(row["amount"]) for row in forecast["events"] if row["direction"] == "receipt") == 600
    assert sum(int(row["amount"]) for row in forecast["events"] if row["direction"] == "payment") == 770
    assert len(forecast["days"]) == 30
    assert any(item["code"].startswith("receipt_date:") and item["actor_id"] == user.id and item["answer_event_id"] for item in report.selection["decisions"])
    assert report.selection["interpretation_ids"]
    # History calibrates timing without creating additional financial settlements.
    assert len(list(db.scalars(select(Settlement)))) == 5


def test_unknown_receipt_resumes_with_local_unavailable_forecast(db, forecast_session):
    user, _company, _period, session, job = forecast_session
    source(db, session, "bank", bank_rows())
    source(db, session, "sales", invoice_rows(), sheet="فروش")
    process(db, job)
    question = pending(db, session)
    assert question.code.startswith("receipt_date:")
    assert_no_financial_facts(db)
    next_answer_job(db, user, session, question, "unknown")
    assert session.state == "completed_limited"
    report = db.get(ResultManifest, session.result_id)
    assert report.details["forecast"]["status"] == "unavailable"
    assert report.selection["coverage"]["receipt_dates"] == {"INV": None}
    assert next(item for item in report.metrics if item["metric_key"] == "ar_invoice")["value"] == "100"
    assert pending(db, session) is None


def test_expected_payment_changes_forecast_copy_only_and_same_period_revision_keeps_answers(db, forecast_session):
    user, company, _period, session, job = forecast_session
    source(db, session, "bank", bank_rows())
    source(db, session, "sales", invoice_rows(), sheet="فروش")
    plan = PlannedPayment(company_id=company.id, label="برنامه", amount="20", due_date=date(2026, 9, 20), obligation_id="O", state="confirmed")
    db.add(plan)
    db.flush()
    process(db, job)
    next_answer_job(db, user, session, pending(db, session), "2026-10-05")
    payment_question = pending(db, session)
    assert payment_question.code.startswith("payment_date:")
    assert_no_financial_facts(db)
    next_answer_job(db, user, session, payment_question, "2026-10-12")
    prior = db.get(ResultManifest, session.result_id)
    assert prior.details["forecast"]["closing"] == "210"
    assert plan.due_date == date(2026, 9, 20)
    assert prior.selection["plans"][0]["due_date"] == "2026-09-20"
    assert prior.selection["forecast_plans"][0]["due_date"] == "2026-10-12"
    db.add(PlannedPayment(company_id=company.id, label="برنامه دوم", amount="10", due_date=date(2026, 10, 15), obligation_id="O2", state="confirmed"))
    revision = create_revision(db, company.id, user)
    db.flush()
    from didban.models import Job
    revision_job = db.scalar(select(Job).where(Job.session_id == revision.id))
    process(db, revision_job)
    db.commit()
    assert pending(db, revision) is None
    revised = db.get(ResultManifest, revision.result_id)
    assert revised.details["forecast"]["closing"] == "200"
    assert prior.details["forecast"]["closing"] == "210"
    assert len(revised.selection["decisions"]) > len(prior.selection["decisions"])


def test_changed_plan_version_invalidates_only_its_expected_payment_date(db, forecast_session):
    user, company, _period, session, job = forecast_session
    source(db, session, "bank", bank_rows())
    source(db, session, "sales", invoice_rows(), sheet="فروش")
    plan = PlannedPayment(company_id=company.id, label="برنامه", amount="20", due_date=date(2026, 9, 20), obligation_id="O", state="confirmed")
    db.add(plan)
    db.flush()
    process(db, job)
    next_answer_job(db, user, session, pending(db, session), "2026-10-05")
    next_answer_job(db, user, session, pending(db, session), "2026-10-12")
    prior = db.get(ResultManifest, session.result_id)
    plan.amount, plan.due_date, plan.version = "30", date(2026, 9, 21), plan.version + 1
    revision = create_revision(db, company.id, user)
    db.flush()
    from didban.models import Job
    process(db, db.scalar(select(Job).where(Job.session_id == revision.id)))
    question = pending(db, revision)
    assert question.code.startswith("payment_date:")
    assert question.evidence["amount"] == "30"
    assert prior.details["forecast"]["closing"] == "210"
    next_answer_job(db, user, revision, question, "2026-10-15")
    updated = db.get(ResultManifest, revision.result_id)
    assert updated.details["forecast"]["closing"] == "200"
    assert plan.due_date == date(2026, 9, 21)


def test_new_sufficient_history_replaces_inherited_unknown_without_fabricating_human_provenance(db, forecast_session):
    user, company, period, session, job = forecast_session
    source(db, session, "bank", bank_rows())
    source(db, session, "sales", [{**invoice_rows()[0], "due_date": "2026-10-10"}], sheet="فروش")
    process(db, job)
    next_answer_job(db, user, session, pending(db, session), "unknown")
    prior = db.get(ResultManifest, session.result_id)
    assert prior.details["forecast"]["status"] == "unavailable"
    revision, revision_job = session_job(db, user, company, period, parent=prior.id)
    coverage = db.scalar(select(ProcessingIssue).where(ProcessingIssue.session_id == revision.id, ProcessingIssue.code == "coverage"))
    coverage.answer = {"value": prior.selection["coverage"]}
    rows = [
        {"event_id": "H1", "invoice_id": "OLD1", "party_id": "C", "due_date": "2026-09-10", "paid_on": "2026-09-12", "amount": "100", "role": "calibration_only"},
        {"event_id": "H2", "invoice_id": "OLD2", "party_id": "C", "due_date": "2026-09-11", "paid_on": "2026-09-14", "amount": "100", "role": "calibration_only"},
        {"event_id": "H3", "invoice_id": "OLD3", "party_id": "C", "due_date": "2026-09-12", "paid_on": "2026-09-16", "amount": "100", "role": "calibration_only"},
    ]
    source(db, revision, "history", rows, sheet="سابقه")
    process(db, revision_job)
    db.flush()
    assert pending(db, revision) is None
    updated = db.get(ResultManifest, revision.result_id)
    assert updated.details["forecast"]["status"] == "estimated"
    assert updated.selection["coverage"]["receipt_dates"] == {"INV": "2026-10-13"}
    assert updated.details["forecast"]["assumptions"][0]["basis"] == "amount_weighted_median_delay"
    assert prior.details["forecast"]["status"] == "unavailable"
    third = create_revision(db, company.id, user)
    db.flush()
    from didban.models import Job
    process(db, db.scalar(select(Job).where(Job.session_id == third.id)))
    db.flush()
    assert db.get(ResultManifest, third.result_id).details["forecast"]["assumptions"][0]["basis"] == "amount_weighted_median_delay"
