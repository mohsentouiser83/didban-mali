from datetime import date, timedelta

from didban.forecast_planning import POLICY_VERSION, plan_receipts

PERIOD = {"end": "2026-09-30"}
COVERAGE = {"settlements_complete": True}


def invoice(reference="I", party="C", due="2026-10-10", **extra):
    return {"id": reference, "reference": reference, "party_id": party, "direction": "sales", "date": "2026-09-01", "due_date": due, "amount": "100", "source_row_id": "row-"+reference, **extra}


def history(identity, lag, *, amount="100", paid="2026-09-15", party="C", invoice_ref=None, **extra):
    paid_on = date.fromisoformat(paid)
    return {"event_id": identity, "invoice_reference": invoice_ref or identity, "party_id": party, "due_date": (paid_on-timedelta(days=lag)).isoformat(), "paid_on": paid, "amount": amount, "role": "calibration_only", "source_row_id": "row-"+identity, **extra}


def test_three_dated_events_use_amount_weighted_median_not_simple_average():
    result = plan_receipts({"invoices": [invoice()], "history": [history("H1", 2), history("H2", 4), history("H3", 10, amount="500")]}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {"I": "2026-10-20"}
    assert result["issues"] == []
    assert result["policy_version"] == POLICY_VERSION == "forecast-3in180-v1"
    assert result["assumptions"][0]["history_event_count"] == 3
    assert result["assumptions"][0]["delay_days"] == 10


def test_lookback_includes_exact_180_day_boundary_and_excludes_future_and_older():
    as_of = date(2026, 9, 30)
    boundary = (as_of-timedelta(days=180)).isoformat()
    older = (as_of-timedelta(days=181)).isoformat()
    rows = [history("H1", 2, paid=boundary), history("H2", 3), history("H3", 4), history("OLD", 90, amount="999999", paid=older), history("FUTURE", 90, amount="999999", paid="2026-10-01")]
    result = plan_receipts({"invoices": [invoice()], "history": rows}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {"I": "2026-10-13"}
    assert result["assumptions"][0]["history_event_count"] == 3


def test_duplicate_rows_same_event_never_reach_minimum_three():
    row = history("H1", 2)
    result = plan_receipts({"invoices": [invoice()], "history": [row, dict(row), dict(row)]}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {}
    assert result["issues"][0]["reason_code"] == "receipt_history_insufficient"


def test_conflicting_same_event_id_forces_history_question_even_with_three_others():
    rows = [history("H1", 2), history("H2", 3), history("H3", 4), history("CONFLICT", 1), history("CONFLICT", 9)]
    result = plan_receipts({"invoices": [invoice()], "history": rows}, PERIOD, COVERAGE)
    assert result["issues"][0]["reason_code"] == "receipt_history_ambiguous"
    assert result["receipt_dates"] == {}


def test_real_equal_payments_with_distinct_ids_are_not_merged():
    rows = [history(identity, 3, invoice_ref="HISTORICAL-INVOICE") for identity in ("REAL1", "REAL2", "REAL3")]
    result = plan_receipts({"invoices": [invoice()], "history": rows}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {"I": "2026-10-13"}
    assert result["assumptions"][0]["history_event_count"] == 3


def test_early_payments_preserve_negative_delay():
    rows = [history("H1", -5), history("H2", -3), history("H3", -1)]
    result = plan_receipts({"invoices": [invoice()], "history": rows}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {"I": "2026-10-07"}
    assert result["assumptions"][0]["delay_days"] == -3


def test_questions_group_only_affected_invoices_by_customer():
    rows = [history("H1", 3), history("H2", 3), history("H3", 3)]
    invoices = [invoice("PAST", due="2026-09-01"), invoice("MISSING", due=None), invoice("VALID"), invoice("OTHER", party="OTHER")]
    result = plan_receipts({"invoices": invoices, "history": rows}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {"VALID": "2026-10-13"}
    grouped = {issue["party_id"]: issue for issue in result["issues"]}
    assert grouped["C"]["invoice_refs"] == ["PAST", "MISSING"]
    assert grouped["C"]["reason_codes"] == ["invoice_due_date_missing", "receipt_estimate_in_past"]
    assert grouped["OTHER"]["invoice_refs"] == ["OTHER"]


def test_actual_settlements_join_selected_invoice_and_calibration_duplicate_counts_once():
    historical = [invoice("S1", due="2026-09-01"), invoice("S2", due="2026-09-02"), invoice("S3", due="2026-09-03")]
    payments = [{"reference": "E"+str(index), "invoice_reference": source["reference"], "direction": "receipt", "date": "2026-09-"+str(index+3).zfill(2), "amount": "100", "source_row_id": "payment-"+str(index)} for index, source in enumerate(historical, 1)]
    duplicate = history("E1", 3, paid="2026-09-04", invoice_ref="S1")
    result = plan_receipts({"invoices": [*historical, invoice("OPEN")], "settlements": payments, "history": [duplicate]}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {"OPEN": "2026-10-13"}
    assert result["assumptions"][0]["history_event_count"] == 3
    assert "row-E1" in result["assumptions"][0]["evidence_refs"]
    assert "payment-1" in result["assumptions"][0]["evidence_refs"]


def test_different_ids_across_calibration_and_financial_sources_cannot_fake_count():
    historical = invoice("S1", due="2026-09-01")
    payment = {"reference": "ACTUAL", "invoice_reference": "S1", "direction": "receipt", "date": "2026-09-04", "amount": "100"}
    duplicate = history("DIFFERENT", 3, paid="2026-09-04", invoice_ref="S1")
    result = plan_receipts({"invoices": [historical, invoice("OPEN")], "settlements": [payment], "history": [duplicate, history("H2", 3), history("H3", 3)]}, PERIOD, COVERAGE)
    assert result["receipt_dates"] == {}
    assert result["issues"][0]["reason_code"] == "receipt_history_ambiguous"


def test_nonpositive_or_noncalibration_events_do_not_count():
    rows = [history("H1", 2), history("ZERO", 2, amount="0"), history("NEG", 2, amount="-10"), history("WRONG", 2, role="financial_settlement")]
    result = plan_receipts({"invoices": [invoice()], "history": rows}, PERIOD, COVERAGE)
    assert result["issues"][0]["reason_code"] == "receipt_history_insufficient"


def test_explicit_date_and_unknown_answers_do_not_mutate_due_or_repeat_question():
    sources = [invoice("DATE"), invoice("UNKNOWN")]
    result = plan_receipts({"invoices": sources}, PERIOD, {**COVERAGE, "receipt_dates": {"DATE": "2026-10-12", "UNKNOWN": None}})
    assert result["receipt_dates"] == {"DATE": "2026-10-12"}
    assert result["issues"] == []
    assert result["unavailable"] == [{"invoice_ref": "UNKNOWN", "reason_codes": ["receipt_date_unknown"]}]
    assert all(row["due_date"] == "2026-10-10" for row in sources)


def test_missing_payment_history_remains_local_unavailable_without_date_guess():
    result = plan_receipts({"invoices": [invoice()]}, PERIOD, {})
    assert result["issues"] == [] and result["receipt_dates"] == {}
    assert result["unavailable"] == [{"invoice_ref": "I", "reason_codes": ["payment_dates_missing"]}]
