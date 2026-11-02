from datetime import date

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from didban import models as m
from didban.company_group_models import CompanyComparisonRun
from didban.company_group_service import compare, read_run, save
from didban.errors import DomainError


@pytest.fixture
def workspace():
    engine = create_engine("sqlite://")
    m.Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        user = m.User(id="u", email="group@example.test", name="مالک", password_hash="unused")
        db.add(user)
        db.add_all([m.Company(id=key, name=key) for key in ("a", "b", "c")])
        db.flush()
        for company in ("a", "b", "c"):
            db.add(
                m.Membership(company_id=company, user_id="u", role="owner" if company == "a" else "viewer")
            )
        db.add_all(
            [
                m.Period(
                    id=key + "p", company_id=key, name="دوره", start=date(2026, 1, 1), end=date(2026, 1, 31)
                )
                for key in ("a", "b")
            ]
        )
        db.flush()
        for company, value in [("a", "900719925474099312345"), ("b", "0")]:
            db.add(
                m.ProcessingSession(
                    id=company + "s",
                    company_id=company,
                    period_id=company + "p",
                    actor_id="u",
                    state="completed",
                )
            )
            db.flush()
            db.add(
                m.ResultManifest(
                    id=company + "m",
                    company_id=company,
                    session_id=company + "s",
                    period_id=company + "p",
                    digest=company,
                    selection={},
                    metrics=[
                        {
                            "metric_key": "revenue",
                            "basis": "ledger",
                            "value": value,
                            "status": "available",
                            "unit": "IRR",
                        }
                    ],
                    details={},
                )
            )
        db.flush()
        yield db, user


def test_comparison_exact_zero_missing_period_and_no_totals(workspace):
    db, user = workspace
    group = save(db, "a", user, {"name": "گروه", "company_ids": ["a", "b", "c"]})
    result = compare(db, "a", user, group["id"], "ap", 1)
    companies = result["snapshot"]["companies"]
    assert companies[0]["metrics"][0]["value"] == "900719925474099312345"
    assert companies[1]["metrics"][0]["value"] == "0"
    assert companies[2]["manifest_id"] is None
    assert companies[2]["metrics"][0]["value"] is None
    assert result["snapshot"]["kind"] == "comparison" and "total" not in result["snapshot"]
    assert db.scalar(select(m.JournalLine.id)) is None


def test_historical_run_rechecks_original_membership_after_group_edit(workspace):
    db, user = workspace
    group = save(db, "a", user, {"name": "گروه", "company_ids": ["a", "b"]})
    result = compare(db, "a", user, group["id"], "ap", 1)
    save(db, "a", user, {"name": "تازه", "company_ids": ["a", "c"]}, group["id"], 1)
    member = db.scalar(select(m.Membership).where(m.Membership.company_id == "b"))
    member.active = False
    with pytest.raises(DomainError):
        read_run(db, "a", user, result["id"])


def test_groups_require_owner_all_company_memberships_and_versions(workspace):
    db, user = workspace
    with pytest.raises(DomainError):
        save(db, "b", user, {"name": "گروه", "company_ids": ["a", "b"]})
    with pytest.raises(DomainError):
        save(db, "a", user, {"name": "گروه", "company_ids": ["a", "missing"]})
    with pytest.raises(DomainError):
        save(db, "a", user, {"name": "گروه", "company_ids": ["b", "c"]})
    group = save(db, "a", user, {"name": "گروه", "company_ids": ["a", "b"]})
    with pytest.raises(DomainError):
        compare(db, "a", user, group["id"], "ap", 9)
    with pytest.raises(DomainError):
        compare(db, "b", user, group["id"], "bp", 1)


def test_run_is_immutable_under_actual_trigger(workspace):
    db, user = workspace
    db.execute(
        text(
            "CREATE TRIGGER immutable_comparison BEFORE UPDATE ON company_comparison_runs BEGIN SELECT RAISE(ABORT,'immutable'); END"
        )
    )
    group = save(db, "a", user, {"name": "گروه", "company_ids": ["a", "b"]})
    result = compare(db, "a", user, group["id"], "ap", 1)
    run = db.get(CompanyComparisonRun, result["id"])
    run.digest = "changed"
    with pytest.raises(IntegrityError):
        db.flush()


def test_primary_comparison_uses_only_exact_native_period_end_and_pins_source(workspace):
    from didban.accounting_setup_models import CompanyAccountingSetup
    from didban.native_reporting_models import NativeStatementRun

    db, user = workspace
    db.add(CompanyAccountingSetup(company_id="a", mode="primary"))

    def native(identifier, cutoff, value):
        return NativeStatementRun(
            id=identifier,
            company_id="a",
            actor_id=user.id,
            digest=identifier,
            snapshot={
                "basis": "native_book",
                "period_id": "ap",
                "period": {"start": "2026-01-01", "end": "2026-01-31"},
                "as_of": cutoff,
                "journal_ids": [],
                "profit_journal_ids": [],
                "movement_journal_ids": [],
                "role_assignments": [],
                "metrics": [{"metric_key": "revenue", "value": value, "status": "available", "unit": "IRR"}],
            },
        )

    db.add(native("early-native", "2026-01-15", "7"))
    db.flush()
    group = save(db, "a", user, {"name": "مبنای مستقل", "company_ids": ["a", "b"]})
    early = compare(db, "a", user, group["id"], "ap", 1)
    first = early["snapshot"]["companies"][0]
    assert first["source"] == "native_statement" and first["manifest_id"] is None
    assert next(metric for metric in first["metrics"] if metric["metric_key"] == "revenue")["value"] is None
    db.add(native("complete-native", "2026-01-31", "90071992547409930001"))
    db.flush()
    full = compare(db, "a", user, group["id"], "ap", 1)
    selected = full["snapshot"]["companies"][0]
    assert selected["native_statement_id"] == "complete-native"
    revenue = next(metric for metric in selected["metrics"] if metric["metric_key"] == "revenue")
    assert revenue["value"] == "90071992547409930001" and revenue["basis"] == "native_book"
    assert early["snapshot"]["companies"][0]["native_statement_id"] is None
    assert full["snapshot"]["companies"][1]["manifest_id"] == "bm"
