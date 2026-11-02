"""Primary-book close readiness uses native evidence and exact warning acceptance."""

import pytest
from sqlalchemy import select
from test_posting import approval, data
from test_posting import book as book

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_service import save_draft
from didban.errors import DomainError
from didban.native_reporting_service import (
    declare_zero_opening,
    revoke_zero_opening,
    save_role,
    save_statement,
)
from didban.native_statement_approval_service import approve_statement
from didban.period_lock_models import PeriodLockEvent
from didban.period_lock_service import checklist, transition
from didban.posting_models import NativeJournal
from didban.posting_service import post_batch


def setup(db):
    user = db.get(m.User, "finance_manager")
    accounts = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    save_role(db, "c", user, accounts[0].id, "bank", 1)
    save_role(db, "c", user, accounts[1].id, "revenue", 1)
    zero = declare_zero_opening(db, "c", user, "p", "آغاز بدون مانده")
    draft = save_draft(db, "c", user, {**data(db, "100"), "unit": "IRR"})
    journal = post_batch(db, "c", user, [approval(db, draft)])["items"][0]
    report = save_statement(db, "c", user, "p")
    approve_statement(db, "c", user, report["id"], report["digest"])
    return user, accounts, zero, journal, report


def test_native_report_is_recognized_and_imported_errors_do_not_block_primary_book(book):
    db = book
    user, _accounts, _zero, _journal, report = setup(db)
    db.add(
        m.ProcessingSession(
            id="external", company_id="c", period_id="p", actor_id=user.id, state="completed_limited"
        )
    )
    db.flush()
    db.add(
        m.ResultManifest(
            id="external-report",
            company_id="c",
            session_id="external",
            period_id="p",
            digest="a" * 64,
            selection={},
            metrics=[],
            details={},
        )
    )
    db.flush()
    db.add(
        m.Finding(
            company_id="c",
            manifest_id="external-report",
            code="ledger_unbalanced",
            title="دفتر خارجی نامتوازن",
            evidence=[],
        )
    )
    db.flush()
    current = checklist(db, "c", "p", user)
    assert current["manifest_id"] is None and current["native_statement_id"] == report["id"]
    assert current["reporting_basis"] == "native_book" and current["errors"] == []
    assert current["native_report_approval_ids"]
    assert "native_period_report_missing" not in {row["code"] for row in current["warnings"]}
    assert "native_nominal_unclosed" in {row["code"] for row in current["warnings"]}
    assert current["ready_to_close"] is True


def test_source_or_opening_changes_require_new_checklist_acceptance_and_never_rewrite_saved_report(book):
    db = book
    user, _accounts, zero, _journal, report = setup(db)
    old = checklist(db, "c", "p", user)
    revoke_zero_opening(db, "c", user, zero["id"], "اصلاح مبنا")
    changed = checklist(db, "c", "p", user)
    codes = {row["code"] for row in changed["warnings"]}
    assert "native_period_report_stale" in codes and "opening_evidence_missing" in codes
    assert changed["checklist_digest"] != old["checklist_digest"]
    with pytest.raises(DomainError) as error:
        transition(db, "c", user, "p", True, "قبول هشدار قبلی", True, 1, old["checklist_digest"])
    assert error.value.code == "period_checklist_changed"
    assert db.scalar(select(PeriodLockEvent.id)) is None
    accepted = transition(
        db, "c", user, "p", True, "پذیرش محدودیت جاری", True, 1, changed["checklist_digest"]
    )
    assert accepted["closed"] is True
    event = db.scalar(select(PeriodLockEvent))
    assert event.checklist["native_statement_id"] == report["id"]
    assert event.checklist["checklist_digest"] == changed["checklist_digest"]
    assert report["snapshot"]["opening_evidence"]["status"] == "available"


def test_stale_roles_or_new_journals_and_partial_report_are_specific_warnings(book):
    db = book
    user, accounts, _zero, _journal, _report = setup(db)
    save_role(db, "c", user, accounts[1].id, "expense", 2)
    assert "native_period_report_stale" in {row["code"] for row in checklist(db, "c", "p", user)["warnings"]}
    from datetime import date

    save_statement(db, "c", user, "p", date(2026, 11, 1))
    codes = {row["code"] for row in checklist(db, "c", "p", user)["warnings"]}
    assert "native_period_report_cutoff" in codes and "native_period_report_unapproved" in codes


def test_native_invalid_journal_or_pending_draft_remain_hard_barriers(book):
    db = book
    user, _accounts, _zero, journal, _report = setup(db)
    pending = save_draft(db, "c", user, {**data(db, "20"), "unit": "IRR"})
    current = checklist(db, "c", "p", user)
    assert current["draft_count"] == 1 and not current["ready_to_close"]
    with pytest.raises(DomainError) as error:
        transition(db, "c", user, "p", True, "قبول", True, 1, current["checklist_digest"])
    assert error.value.code == "period_close_blocked"
    from didban.posting_service import discard_draft

    discard_draft(db, "c", user, pending["id"], "کنار گذاشتن", 1)
    # Historical invalid fixture; the initialized application forbids journal edits.
    row = db.get(NativeJournal, journal["id"])
    row.snapshot = {**row.snapshot, "lines": [{**line, "credit": "0"} for line in row.snapshot["lines"]]}
    db.flush()
    invalid = checklist(db, "c", "p", user)
    assert invalid["errors"][0]["code"] == "native_journal_invalid" and not invalid["ready_to_close"]
    with pytest.raises(DomainError):
        transition(db, "c", user, "p", True, "قبول", True, 1, invalid["checklist_digest"])


def test_native_controls_are_recomputed_as_review_warnings_without_saving_a_control_run(book):
    from didban.native_control_models import NativeControlRun

    db = book
    user, _accounts, _zero, _journal, _report = setup(db)
    draft = save_draft(db, "c", user, {**data(db, "100"), "unit": "IRR"})
    post_batch(db, "c", user, [approval(db, draft)])
    existing = list(db.scalars(select(NativeControlRun.id)))
    current = checklist(db, "c", "p", user)
    assert any(row["code"] == "native_similar_journals" for row in current["warnings"])
    assert current["errors"] == [] and current["native_controls"]["basis"] == "native_book"
    assert list(db.scalars(select(NativeControlRun.id))) == existing
    assert checklist(db, "c", "p", user)["checklist_digest"] == current["checklist_digest"]
