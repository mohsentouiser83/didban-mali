import pytest
from sqlalchemy import select
from test_workflow import bank_rows, seed, session_job, source
from test_workflow import db as db

from didban.errors import DomainError
from didban.models import Company, ReconciliationDecision, ResultManifest
from didban.reconciliation_service import create_run, decide, options
from didban.workflow import process


def setup_run(db, aggregate=False):
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
                "debit": "10" if aggregate else "30",
                "credit": "0",
                "entry_type": "regular",
                "reference": "R",
            },
            *(
                [
                    {
                        "entry_id": "J1",
                        "date": "2026-09-05",
                        "account": "1101",
                        "role": "bank",
                        "party_id": "C",
                        "debit": "20",
                        "credit": "0",
                        "entry_type": "regular",
                        "reference": "R",
                    }
                ]
                if aggregate
                else []
            ),
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


def test_exact_reconciliation_requires_human_acceptance_and_replay_preserves_decision(db):
    user, company, manifest = setup_run(db)
    choices = options(db, company.id)
    assert choices["bank_accounts"] == ["A"]
    run = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    candidate = next(c for c in run["candidates"] if c["reference"] == "R")
    assert candidate["status"] == "exact_proposal" and candidate["requires_human_review"]
    assert run["policy_version"] == "reconciliation-human-reference-2"
    assert db.scalar(select(ReconciliationDecision)) is None
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


def test_aggregate_human_acceptance_replay_and_ledger_capacity(db):
    from didban.models import Allocation, BankMovement, JournalLine, ReconciliationRun
    from didban.workflow import serialize_fact

    user, company, manifest = setup_run(db, aggregate=True)
    run = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    candidate = next(item for item in run["candidates"] if item["reference"] == "R")
    assert candidate["match_kind"] == "reference_aggregate"
    assert len(candidate["ledger_ids"]) == 2
    assert candidate["ledger_total"] == "30"
    assert db.scalar(select(ReconciliationDecision)) is None
    lines_before = [serialize_fact(row) for row in db.scalars(select(JournalLine))]
    result = decide(
        db,
        company.id,
        user,
        candidate["id"],
        {
            "run_id": run["id"],
            "decision": "accepted",
            "reason": "بررسی دو ثبت",
            "expected_version": 1,
        },
    )
    assert result["status"] == "accepted" and result["version"] == 2
    decision = db.scalar(select(ReconciliationDecision))
    assert decision.provenance == "human" and decision.actor_id == user.id
    assert decision.controls["capacity_checked"] is True
    replay = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    accepted = next(item for item in replay["candidates"] if item["reference"] == "R")
    assert accepted["status"] == "accepted" and accepted["version"] == 2
    assert len(list(db.scalars(select(ReconciliationDecision)))) == 1
    # A competing bank proposal must not consume an accepted ledger line even
    # if a persisted candidate is made to claim the same ids.
    other_bank = db.scalar(select(BankMovement).where(BankMovement.reference == "XYZ"))
    competing = candidate | {"id": "competing", "bank_id": other_bank.id}
    other = ReconciliationRun(
        company_id=company.id,
        actor_id=user.id,
        manifest_id=manifest.id,
        bank_to_ledger={"A": "1101"},
        candidates=[competing],
    )
    db.add(other)
    db.flush()
    with pytest.raises(DomainError) as error:
        decide(
            db,
            company.id,
            user,
            "competing",
            {
                "run_id": other.id,
                "decision": "accepted",
                "reason": "رقیب",
                "expected_version": 1,
            },
        )
    assert error.value.code == "reconciliation_capacity"
    assert [serialize_fact(row) for row in db.scalars(select(JournalLine))] == lines_before
    assert db.scalar(select(Allocation)) is None


def test_aggregate_acceptance_rechecks_live_totals_and_manifest(db):
    from didban.models import ReconciliationRun

    user, company, manifest = setup_run(db, aggregate=True)
    run = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    candidate = next(item for item in run["candidates"] if item["reference"] == "R")
    # A tampered aggregate amount cannot authorize an incomplete set of lines.
    forged = candidate | {"id": "incomplete", "ledger_ids": candidate["ledger_ids"][:1]}
    other = ReconciliationRun(
        company_id=company.id,
        actor_id=user.id,
        manifest_id=manifest.id,
        bank_to_ledger={"A": "1101"},
        candidates=[forged],
    )
    db.add(other)
    db.flush()
    with pytest.raises(DomainError) as error:
        decide(
            db,
            company.id,
            user,
            "incomplete",
            {
                "run_id": other.id,
                "decision": "accepted",
                "reason": "ناقص",
                "expected_version": 1,
            },
        )
    assert error.value.code == "reconciliation_amount"
    assert db.scalar(select(ReconciliationDecision)) is None
    # Superseding the manifest invalidates every candidate from the older run.
    from didban.models import ProcessingSession

    new_session = ProcessingSession(
        company_id=company.id, period_id=manifest.period_id, actor_id=user.id, state="completed"
    )
    db.add(new_session)
    db.flush()
    newer = ResultManifest(
        company_id=company.id,
        session_id=new_session.id,
        period_id=manifest.period_id,
        digest="new",
        selection=manifest.selection,
        metrics=[],
        details={},
    )
    db.add(newer)
    db.flush()
    with pytest.raises(DomainError) as error:
        decide(
            db,
            company.id,
            user,
            candidate["id"],
            {
                "run_id": run["id"],
                "decision": "accepted",
                "reason": "قدیمی",
                "expected_version": 1,
            },
        )
    assert error.value.code == "stale_manifest"


def test_aggregate_run_creation_respects_database_immutability_triggers(db):
    from sqlalchemy import text

    user, company, manifest = setup_run(db, aggregate=True)
    # create_all alone does not install production initialize() invariants.
    # Exercise the same immutable-run guard that exposed a post-flush UPDATE.
    for operation in ("UPDATE", "DELETE"):
        db.execute(
            text(
                f"CREATE TRIGGER immutable_reconciliation_runs_{operation} "
                f"BEFORE {operation} ON reconciliation_runs "
                "BEGIN SELECT RAISE(ABORT, 'immutable fact'); END"
            )
        )
    run = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    db.flush()
    assert run["policy_version"] == "reconciliation-human-reference-2"
    candidate = next(item for item in run["candidates"] if item["reference"] == "R")
    assert candidate["match_kind"] == "reference_aggregate"
    assert candidate["status"] == "exact_proposal"
    result = decide(
        db,
        company.id,
        user,
        candidate["id"],
        {
            "run_id": run["id"],
            "decision": "accepted",
            "reason": "تأیید تجمیعی",
            "expected_version": 1,
        },
    )
    db.flush()
    assert result["status"] == "accepted"
    replay = create_run(db, company.id, user, manifest.id, {"A": "1101"})
    db.flush()
    assert next(item for item in replay["candidates"] if item["reference"] == "R")["status"] == "accepted"
    assert len(list(db.scalars(select(ReconciliationDecision)))) == 1
