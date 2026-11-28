from copy import deepcopy

from didban.native_invoice_projection import invoice_rows


def saved():
    source = {
        "operation_id": "operation",
        "journal_id": "journal",
        "journal_digest": "a" * 64,
        "approved_draft_version": 2,
        "unit": "TOMAN",
    }
    terms = {
        "id": "term",
        "version": 1,
        "effective_date": "2026-10-01",
        "due_date": "2026-10-10",
        "due_unknown": False,
        "expected_date": None,
        "expected_unknown": True,
        "reason": "شرایط اولیه",
    }
    item = {
        "id": "invoice",
        "reference": "=SUM(1,2)",
        "party_id": "مشتری آزمایشی",
        "date": "2026-10-01",
        "amount": "90071992547409930001.000003",
        "remaining": "90071992547409930001.000001",
        "status": "available",
        "reason": None,
        "direction": "sale",
        "unit": "IRR",
        "original_unit": "TOMAN",
        "source": source,
        "terms": terms,
        "terms_history": [terms],
        "source_history": [],
        "allocations": [],
    }
    unknown = deepcopy(item) | {
        "id": "unknown",
        "reference": "نامعتبر",
        "amount": "100",
        "remaining": None,
        "status": "unavailable",
        "reason": "native_invoice_source_reversed",
        "direction": "purchase",
        "terms": dict(terms, due_date=None, due_unknown=True),
    }
    return {
        "id": "snapshot",
        "digest": "b" * 64,
        "payload": {"as_of": "2026-11-02", "direction": None, "items": [item, unknown]},
    }


def test_projection_preserves_exact_amounts_nulls_and_source_payload():
    snapshot = saved()
    before = deepcopy(snapshot)
    rows = invoice_rows(snapshot["payload"])
    assert rows[0]["paid"] == "0.000002" and rows[0]["amount"] == "90071992547409930001.000003"
    assert rows[0]["unit"] == "IRR" and rows[0]["original_unit"] == "TOMAN"
    assert rows[0]["direction"] == "sales" and rows[0]["overdue"] is True
    assert rows[1]["remaining"] is rows[1]["paid"] is rows[1]["overdue"] is None
    assert rows[1]["reason_codes"] == ["native_invoice_source_reversed"]
    assert rows[1]["direction"] == "purchases"
    assert snapshot == before
