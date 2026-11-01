import pytest
from sqlalchemy import select
from test_workflow import bank_rows, seed, session_job, source
from test_workflow import db as db

from didban.errors import DomainError
from didban.models import Company, ReconciliationDecision, ResultManifest
from didban.reconciliation_service import create_run, decide, options
from didban.workflow import process


def setup_run(db):
    user, company, period = seed(db)
    session, job = session_job(db, user, company, period)
    source(
        db,
        session,
        "bank",
        bank_rows()
        + [
            {
                "account": "A",
                "date": "2026-09-06",
                "amount": "25",
                "reference": "XYZ",
                "balance": "",
                "row_type": "movement",
                "anchor_cutoff": "",
            }
        ],
        sheet="حساب الف",
    )
    source(
        db,
        session,
        "ledger",
        [
            {
                "entry_id": "J1",
                "date": "2026-09-05",
                "account": "1101",
                "role": "bank",
                "party_id": "C",
                "debit": "30",
                "credit": "0",
                "entry_type": "regular",
                "reference": "R",
            },
            {
                "entry_id": "J1",
                "date": "2026-09-05",
                "account": "3101",
                "role": "capital",
                "party_id": "",
                "debit": "0",
                "credit": "30",
                "entry_type": "regular",
                "reference": "",
            },
        ],
    )
    process(db, job)
    manifest = db.get(ResultManifest, session.result_id)
    assert manifest is not None
    return user, company, manifest


def test_exact_reconciliation_is_auto_accepted_with_controls_and_replay_preserves_human(db):
    user, company, manifest = setup_run(db)
    choices = options(db, company.id)
    assert choices["bank_accounts"] == ["A"]
    run = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    candidate = next(c for c in run["candidates"] if c["reference"] == "R")
    assert candidate["status"] == "accepted" and candidate["provenance"] == "validated_automatic"
    decision = db.scalar(select(ReconciliationDecision))
    assert decision.actor_id is None and decision.controls["unique_candidate"]
    result = decide(
        db,
        company.id,
        user,
        candidate["id"],
        {
            "run_id": run["id"],
            "decision": "rejected",
            "reason": "ثبت نیازمند بررسی دوباره است",
            "expected_version": candidate["version"],
        },
    )
    assert result["status"] == "rejected"
    replay = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    assert next(c for c in replay["candidates"] if c["id"] == candidate["id"])["status"] == "rejected"
    with pytest.raises(DomainError, match="تغییر"):
        decide(
            db,
            company.id,
            user,
            candidate["id"],
            {
                "run_id": run["id"],
                "decision": "accepted",
                "reason": "stale",
                "expected_version": candidate["version"],
            },
        )


def test_reconciliation_mapping_cannot_point_to_nonbank_or_another_company(db):
    user, company, manifest = setup_run(db)
    with pytest.raises(DomainError):
        create_run(db, company.id, user, manifest.id, {"A": "3101"})
    other_company = Company(name="شرکت دیگر")
    db.add(other_company)
    db.flush()
    with pytest.raises(DomainError):
        create_run(db, other_company.id, user, manifest.id, {"A": "1101"})


def test_unmapped_or_missing_ledger_candidate_cannot_be_accepted(db):
    user, company, manifest = setup_run(db)
    # A valid selected bank account mapping still produces no false match if the reference is absent.
    run = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    unmatched = next(c for c in run["candidates"] if c["reference"] == "XYZ")
    assert unmatched["status"] == "needs_review" and unmatched["ledger_ids"] == []
    with pytest.raises(DomainError, match="مشخص نیست"):
        decide(
            db,
            company.id,
            user,
            unmatched["id"],
            {
                "run_id": run["id"],
                "decision": "accepted",
                "reason": "بررسی",
                "expected_version": unmatched["version"],
            },
        )


def test_bank_decision_version_does_not_reset_for_another_run_proposal(db):
    user, company, manifest = setup_run(db)
    run = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    first = next(c for c in run["candidates"] if c["reference"] == "R")
    # A different proposal for the same bank must share its decision clock.
    from didban.models import ReconciliationRun

    candidate = {**first, "id": "different-proposal", "status": "needs_review"}
    other = ReconciliationRun(
        company_id=company.id,
        actor_id=user.id,
        manifest_id=manifest.id,
        bank_to_ledger={"A": "1101"},
        candidates=[candidate],
    )
    db.add(other)
    db.flush()
    old_version = first["version"]
    decide(
        db,
        company.id,
        user,
        first["id"],
        {
            "run_id": run["id"],
            "decision": "rejected",
            "reason": "بررسی مجدد",
            "expected_version": old_version,
        },
    )
    with pytest.raises(DomainError, match="تغییر"):
        decide(
            db,
            company.id,
            user,
            candidate["id"],
            {
                "run_id": other.id,
                "decision": "accepted",
                "reason": "پاسخ منسوخ",
                "expected_version": old_version,
            },
        )
