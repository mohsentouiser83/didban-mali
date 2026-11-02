from datetime import date

from sqlalchemy import func, select
from test_native_invoices import alloc, invoice, posted
from test_posting import book as book

from didban import models as m
from didban import native_collection_priority as service
from didban.posting_models import NativeJournal


def test_real_native_history_priority_uses_three_distinct_receipt_journals_and_exact_amounts(book, monkeypatch):
    db = book
    actor = db.get(m.User, "advisor")
    for index in range(3):
        source = posted(db, amount="100", ref=f"PAID-{index}", day=date(2026, 9, 1 + index), party="regular")
        item = invoice(db, source, date(2026, 9, 5 + index))
        receipt = posted(db, kind="receipt", amount="100", ref=f"RCPT-{index}", day=date(2026, 9, 14 + index), party="regular")
        alloc(db, item, receipt, "100")
    known = invoice(db, posted(db, amount="9007199254740993", ref="OPEN-REGULAR", party="regular"), date(2026, 10, 10))
    weak = invoice(db, posted(db, amount="9007199254740994", ref="OPEN-WEAK", party="weak"), None)
    lone = invoice(db, posted(db, amount="100", ref="WEAK-PAID", party="weak"), date(2026, 10, 10))
    alloc(db, lone, posted(db, kind="receipt", amount="100", ref="WEAK-RCPT", party="weak", day=date(2026, 10, 11)), "100")
    count = db.scalar(select(func.count()).select_from(NativeJournal))
    original = service.receipt_history
    def with_outside_window(db, company, user, party, as_of):
        rows = original(db, company, user, party, as_of)
        if party == "regular":
            rows += [dict(rows[0], journal_id="future", allocation_id="future", date="2026-12-01", amount="999999999999999999999"), dict(rows[0], journal_id="old", allocation_id="old", date="2026-01-01")]
        return rows
    monkeypatch.setattr(service, "receipt_history", with_outside_window)
    report = service.queue(db, "c", actor, date(2026, 11, 1), "history")
    assert [row["id"] for row in report["items"]] == [known["id"], weak["id"]]
    first, second = report["items"]
    assert first["history_event_count"] == 3 and first["history_lag_days"] == 9
    assert len(set(first["history_event_ids"])) == 3 and first["history_reason"] is None
    assert second["history_event_count"] == 1 and second["history_lag_days"] is None
    assert second["history_reason"] == "receipt_history_insufficient" and second["overdue_days"] is None
    assert service.queue(db, "c", actor, date(2026, 11, 1), "amount")["items"][0]["id"] == weak["id"]
    assert report["history_policy"]["future_evidence_excluded"] is True
    assert db.scalar(select(func.count()).select_from(NativeJournal)) == count
    assert db.scalar(select(m.Invoice.id)) is None
