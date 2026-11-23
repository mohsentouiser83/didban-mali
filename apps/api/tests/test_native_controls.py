"""Native period warnings use only current posted evidence."""

from datetime import date

from test_posting import book as book
from test_posting import data

from didban import models as m
from didban.accounting_service import save_draft
from didban.native_control_service import build
from didban.posting_service import create_reversal, post_batch, preview


def post(db, *, amount="10", period_id="p", day=date(2026, 11, 1)):
    actor = db.get(m.User, "finance_manager")
    value = data(db, amount)
    value.update(period_id=period_id, date=day, unit="IRR")
    draft = save_draft(db, "c", actor, value)
    checked = preview(db, "c", actor, draft["id"])
    return post_batch(
        db, "c", actor, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}]
    )["items"][0]


def test_same_financial_profiles_are_review_only_and_reversed_sources_leave_current_group(book):
    db = book
    actor = db.get(m.User, "finance_manager")
    first = post(db, amount="9007199254740993")
    post(db, amount="9007199254740993")
    snapshot = build(db, "c", actor, "p")
    similar = next(row for row in snapshot["findings"] if row["code"] == "native_similar_journals")
    assert similar["classification"] == "review" and similar["amount"] == "18014398509481986"
    assert len(similar["journal_refs"]) == 2 and snapshot["risk_assessment"] == "not_calibrated"
    reverse = create_reversal(
        db, "c", actor, first["id"], {"period_id": "p", "date": date(2026, 11, 2), "reason": "اصلاح سند"}
    )
    checked = preview(db, "c", actor, reverse["id"])
    post_batch(db, "c", actor, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
    assert not any(row["code"] == "native_similar_journals" for row in build(db, "c", actor, "p")["findings"])
