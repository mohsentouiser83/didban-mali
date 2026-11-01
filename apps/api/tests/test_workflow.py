from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from didban.errors import DomainError
from didban.models import (
    Allocation,
    BankMovement,
    Base,
    Company,
    Interpretation,
    Invoice,
    Job,
    Membership,
    Period,
    ProcessingIssue,
    ProcessingSession,
    ResultManifest,
    SourceFile,
    SourceRow,
    User,
    uid,
)
from didban.normalization import normalize
from didban.workflow import answer_issue, process


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    @event.listens_for(engine, "connect")
    def enable_fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


def seed(db):
    user = User(email="owner@example.test", name="مالک", password_hash="test", active=True)
    company = Company(name="شرکت آزمایشی")
    db.add_all([user, company])
    db.flush()
    db.add(Membership(company_id=company.id, user_id=user.id, role="owner", active=True))
    period = Period(company_id=company.id, name="شهریور", start=date(2026, 9, 1), end=date(2026, 9, 30))
    db.add(period)
    db.flush()
    return user, company, period


def session_job(db, user, company, period, *, parent=None, coverage=True):
    session = ProcessingSession(company_id=company.id, actor_id=user.id, period_id=period.id, parent_id=parent, state="sealed")
    db.add(session)
    db.flush()
    if coverage:
        db.add(ProcessingIssue(company_id=company.id, session_id=session.id, code="coverage", question="پوشش", choices=[], evidence={}, answer={"value": {"ledger_complete": True, "invoice_complete": True, "settlements_complete": True, "tax_complete": True, "bank_complete": True, "comparable_ar": True, "comparable_ap": True}}, answered_by=user.id))
    job = Job(company_id=company.id, session_id=session.id, generation=session.version)
    db.add(job)
    db.flush()
    return session, job


def source(db, session, family, rows, *, unit="IRR", sheet="حساب الف"):
    item = SourceFile(company_id=session.company_id, session_id=session.id, name=uid()+".csv", sha256=uid(), size=100, storage_key=uid(), state="ready", scan_status="development_unscanned", row_count=len(rows))
    db.add(item)
    db.flush()
    mapping = {key: key for row in rows for key in row}
    db.add(Interpretation(company_id=session.company_id, file_id=item.id, sheet=sheet, family=family, mapping=mapping, unit=unit, calendar="gregorian", provenance="validated_automatic", evidence={"headers": list(mapping), "sheet": sheet, "sample": rows[:1]}))
    for number, row in enumerate(rows, 2):
        db.add(SourceRow(company_id=session.company_id, file_id=item.id, sheet=sheet, row_number=number, values=row))
    db.flush()
    return item


def bank_rows(amount="30", reference="R"):
    return [
        {"date": "2026-09-01", "amount": "0", "reference": "OPEN", "balance": "100", "row_type": "opening", "anchor_cutoff": "start_of_day", "account": "A"},
        {"date": "2026-09-05", "amount": amount, "reference": reference, "balance": "", "row_type": "movement", "anchor_cutoff": "", "account": "A"},
    ]


def invoice_rows():
    return [{"invoice_id": "INV", "party_id": "C", "date": "2026-09-01", "due_date": "2026-09-20", "amount": "100", "tax": "0", "tax_id": "T"}]


def metric(manifest, key):
    return next(row for row in manifest.metrics if row["metric_key"] == key)


def test_question_barrier_prevents_all_facts_until_valid_answer_and_survives_commit(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    source(db, session, "bank", bank_rows(), unit=None)
    process(db, job)
    db.commit()
    assert session.state == "waiting_input"
    assert list(db.scalars(select(BankMovement))) == []
    question = db.scalar(select(ProcessingIssue).where(ProcessingIssue.answer.is_(None)))
    assert question.code.startswith("unit:")
    with pytest.raises(DomainError, match="سؤال تغییر کرده"):
        answer_issue(db, user, question, "IRR", question.version, session.version - 1)
    # No browser-close transition exists; reloading reads the same barrier.
    db.expire_all()
    assert db.get(ProcessingSession, session.id).state == "waiting_input"
    answer_issue(db, user, question, "IRR", question.version, session.version)
    db.flush()
    next_job = db.scalar(select(Job).where(Job.generation == session.version))
    process(db, next_job)
    db.commit()
    assert session.state == "completed_limited"
    manifest = db.get(ResultManifest, session.result_id)
    assert metric(manifest, "cash")["value"] == "130"
    assert isinstance(manifest.details["bank_transactions"][0]["date"], str)


def test_same_session_overlapping_reference_blocks_but_equal_distinct_payments_survive(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    first = source(db, session, "bank", [bank_rows()[1]])
    second = source(db, session, "bank", [{**bank_rows()[1], "amount": "31"}])
    process(db, job)
    assert session.state == "waiting_input"
    question = db.scalar(select(ProcessingIssue).where(ProcessingIssue.code == "overlap_current"))
    assert question is not None and question.file_id == second.id
    assert list(db.scalars(select(BankMovement))) == []
    answer_issue(db, user, question, "exclude", question.version, session.version)
    db.flush()
    next_job = db.scalar(select(Job).where(Job.session_id == session.id, Job.generation == session.version))
    process(db, next_job)
    db.flush()
    assert len(list(db.scalars(select(BankMovement)))) == 1
    assert db.get(SourceFile, first.id).state == "ready"
    separate, separate_job = session_job(db, user, company, period)
    source(db, separate, "bank", [{**bank_rows()[1], "reference": "REAL1"}, {**bank_rows()[1], "reference": "REAL2"}])
    process(db, separate_job)
    assert separate.result_id is not None
    result = db.get(ResultManifest, separate.result_id)
    assert result.details["cash_movements"]["external_in"] == "60"


def test_changed_amount_or_date_on_parent_bank_reference_opens_overlap(db):
    user, company, period = seed(db)
    original, job = session_job(db, user, company, period)
    original_file = source(db, original, "bank", bank_rows())
    process(db, job)
    db.flush()
    prior = db.get(ResultManifest, original.result_id)
    revision, next_job = session_job(db, user, company, period, parent=prior.id)
    source(db, revision, "bank", [{**bank_rows()[1], "date": "2026-09-06", "amount": "50"}])
    process(db, next_job)
    question = db.scalar(select(ProcessingIssue).where(ProcessingIssue.session_id == revision.id, ProcessingIssue.code == "overlap"))
    assert question is not None
    assert question.evidence["old_file_ids"] == [original_file.id]
    assert revision.state == "waiting_input" and revision.result_id is None
    assert metric(prior, "cash")["value"] == "130"
    assert len(list(db.scalars(select(BankMovement)))) == 2


def test_journal_imbalances_cannot_cancel_across_dates(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    row = {"entry_id": "E", "account": "A", "role": "capital", "entry_type": "regular", "date": "2026-09-01", "debit": "10", "credit": "0"}
    source_file = source(db, session, "ledger", [row, {**row, "date": "2026-09-02", "debit": "0", "credit": "10"}])
    process(db, job)
    question = db.scalar(select(ProcessingIssue).where(ProcessingIssue.code == "invalid_rows"))
    assert question.file_id == source_file.id
    assert len(question.evidence["unbalanced_entries"]) == 2
    assert session.result_id is None


def test_manual_allocation_uses_effective_bank_date_and_freezes_old_snapshot(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    source(db, session, "bank", bank_rows())
    source(db, session, "sales", invoice_rows(), sheet="فروش")
    process(db, job)
    db.flush()
    prior = db.get(ResultManifest, session.result_id)
    assert metric(prior, "ar_invoice")["value"] == "100"
    bank = db.scalar(select(BankMovement).where(BankMovement.reference == "R"))
    invoice = db.scalar(select(Invoice))
    db.add(Allocation(company_id=company.id, actor_id=user.id, bank_id=bank.id, invoice_id=invoice.id, amount="30"))
    db.flush()
    revision, revision_job = session_job(db, user, company, period, parent=prior.id)
    process(db, revision_job)
    db.commit()
    revised = db.get(ResultManifest, revision.result_id)
    assert metric(revised, "ar_invoice")["value"] == "70"
    assert metric(prior, "ar_invoice")["value"] == "100"
    assert revised.selection["allocations"][0]["date"] == "2026-09-05"
    assert {row["id"] for row in revised.selection["files"]} == {row["id"] for row in prior.selection["files"]}


def test_normalization_keeps_moadian_party_and_exact_plan_precision():
    ident = uid()
    row = SourceRow(id=ident, company_id="C", file_id="F", sheet="مؤدیان", row_number=2, values={"invoice_id": "I", "party_id": "P", "date": "2026-09-01", "amount": "100", "tax": "0", "tax_id": "T", "kind": "original"})
    interpretation = Interpretation(company_id="C", file_id="F", sheet="مؤدیان", family="moadian_sales", mapping={key: key for key in row.values}, unit="IRR", calendar="gregorian", provenance="human", evidence={})
    assert normalize(row, interpretation, "S").party_id == "P"
    row.values = {"plan_id": "P", "obligation_id": "O", "date": "2026-10-01", "total_obligation": "999999999999999999999999999999.123456", "paid_as_of": "0.000001", "confirmed": "true"}
    interpretation.family, interpretation.mapping = "plans", {key: key for key in row.values}
    plan = normalize(row, interpretation, "S")
    assert Decimal(plan.amount) == Decimal("999999999999999999999999999999.123455")


def next_answer_job(db, user, session, question, value):
    answer_issue(db, user, question, value, question.version, session.version)
    db.flush()
    job = db.scalar(select(Job).where(Job.session_id == session.id, Job.generation == session.version))
    process(db, job)
    db.flush()


def test_missing_bank_account_gets_focused_question_and_preserves_raw_values(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    raw_rows = [{key: value for key, value in row.items() if key != "account"} for row in bank_rows()]
    source(db, session, "bank", raw_rows, sheet="CSV")
    process(db, job)
    question = db.scalar(select(ProcessingIssue).where(ProcessingIssue.answer.is_(None)))
    assert question.code.startswith("bank_account:") and question.evidence["kind"] == "text"
    assert list(db.scalars(select(BankMovement))) == []
    with pytest.raises(DomainError, match="شناسه روشن"):
        answer_issue(db, user, question, "  ", question.version, session.version)
    next_answer_job(db, user, session, question, "حساب اصلی")
    result = db.get(ResultManifest, session.result_id)
    assert metric(result, "cash")["value"] == "130"
    assert result.details["bank_balances"][0]["account"] == "حساب اصلی"
    assert all("account" not in raw.values for raw in db.scalars(select(SourceRow)))
    human = db.scalar(select(Interpretation).where(Interpretation.provenance == "human"))
    assert human.evidence["account"] == "حساب اصلی"
    assert human.evidence["actor_id"] == user.id


def test_ambiguous_anchor_cutoff_is_answered_without_editing_source(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    rows = bank_rows()
    rows[0] = {**rows[0], "row_type": "anchor", "anchor_cutoff": "", "date": "2026-09-05"}
    source(db, session, "bank", rows)
    process(db, job)
    question = db.scalar(select(ProcessingIssue).where(ProcessingIssue.answer.is_(None)))
    assert question.code.startswith("anchor_cutoff:")
    assert {choice["value"] for choice in question.choices} == {"start_of_day", "end_of_day"}
    next_answer_job(db, user, session, question, "end_of_day")
    result = db.get(ResultManifest, session.result_id)
    assert metric(result, "cash")["value"] == "100"
    assert db.scalar(select(SourceRow).where(SourceRow.row_number == 2)).values["anchor_cutoff"] == ""


def test_account_role_ambiguity_is_human_interpretation_with_audited_scope(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    rows = [
        {"entry_id": "E", "account": "1201", "role": "unknown", "entry_type": "regular", "date": "2026-09-05", "debit": "100", "credit": "0", "party_id": "C"},
        {"entry_id": "E", "account": "3001", "role": "capital", "entry_type": "regular", "date": "2026-09-05", "debit": "0", "credit": "100", "party_id": ""},
    ]
    source(db, session, "ledger", rows, sheet="دفتر")
    process(db, job)
    question = db.scalar(select(ProcessingIssue).where(ProcessingIssue.answer.is_(None)))
    assert question.code.startswith("account_role:")
    assert question.evidence["account_code"] == "1201"
    assert list(db.scalars(select(BankMovement))) == []
    with pytest.raises(DomainError, match="نقش حساب"):
        answer_issue(db, user, question, {"role": "trade_ar"}, question.version, session.version)
    next_answer_job(db, user, session, question, "trade_ar")
    result = db.get(ResultManifest, session.result_id)
    assert metric(result, "ar_ledger")["value"] == "100"
    human = db.scalar(select(Interpretation).where(Interpretation.provenance == "human"))
    assert human.evidence["role_overrides"] == {"1201": "trade_ar"}
    assert human.evidence["role_decisions"]["1201"]["actor_id"] == user.id
    assert db.scalar(select(SourceRow).where(SourceRow.row_number == 2)).values["role"] == "unknown"


def test_invoice_missing_due_date_is_nullable_in_canonical_schema(db):
    assert Invoice.__table__.c.due_date.nullable is True
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    rows = [{key: value for key, value in invoice_rows()[0].items() if key != "due_date"}]
    source(db, session, "sales", rows, sheet="فروش")
    process(db, job)
    db.flush()
    result = db.get(ResultManifest, session.result_id)
    assert result.details["invoices"][0]["due_date"] is None
    assert result.details["invoices"][0]["overdue"] is None
