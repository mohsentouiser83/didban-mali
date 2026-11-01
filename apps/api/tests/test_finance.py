import csv
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import openpyxl
import pytest

from didban.errors import DomainError
from didban.finance import calculate, comparison, future_obligations, invoice_remaining
from didban.ingestion import money

PERIOD = {"id": "p", "start": "2026-09-01", "end": "2026-09-30"}
COMPLETE = {"ledger_complete": True, "invoice_complete": True, "settlements_complete": True, "tax_complete": True, "bank_complete": True, "comparable_ar": True, "comparable_ap": True}


def metrics(output):
    return {metric["metric_key"]: metric for metric in output["metrics"]}


def pair(role, value, *, debit=False, entry_type="regular", entry_id="E", when="2026-09-05", party="C"):
    value = str(value)
    return [
        {"entry_id": entry_id, "date": when, "entry_type": entry_type, "account": role, "role": role, "party_id": party, "debit": value if debit else "0", "credit": "0" if debit else value, "source_row_id": entry_id + "a"},
        {"entry_id": entry_id, "date": when, "entry_type": entry_type, "account": "equity", "role": "capital", "party_id": "", "debit": "0" if debit else value, "credit": value if debit else "0", "source_row_id": entry_id + "b"},
    ]


def bank_row(ident, value, *, when="2026-09-05", account="A", kind="movement", balance=None, cutoff=None, reference=None):
    return {"id": ident, "source_row_id": ident, "date": when, "amount": str(value), "account": account, "kind": kind, "reference": reference or ident, "balance": balance, "anchor_cutoff": cutoff}


def invoice(value="100", **extra):
    return {"id": "I", "reference": "INV", "party_id": "C", "direction": "sales", "date": "2026-09-01", "due_date": "2026-09-20", "amount": value, "source_row_id": "ir", "tax_id": "T", "tax": "0", **extra}


def test_f01_exact_toman_never_float_or_rounding():
    assert Decimal(money("۱۲۳٫۴", "تومان")) == Decimal("1234")
    assert Decimal(money("123456789012345678901234567890.123456", "IRR")) == Decimal("123456789012345678901234567890.123456")
    with pytest.raises(DomainError):
        money("100", "USD")
    with pytest.raises(DomainError):
        money("0.0000001", "IRR")


def test_f02_bank_receipts_and_loan_are_not_revenue():
    ledger = [*pair("revenue", 200, entry_id="sale"), *pair("loan_payable", 1000, entry_id="loan")]
    output = calculate({"ledger": ledger, "bank": [bank_row("loan", 1000), bank_row("receipt", 50)]}, PERIOD, COMPLETE)
    assert metrics(output)["revenue"]["value"] == "200"
    assert output["details"]["cash_movements"]["external_in"] == "1050"
    assert metrics(output)["cash"]["value"] is None


def test_f03_profit_requires_tax_completeness():
    ledger = [*pair("revenue", 1000, entry_id="r"), *pair("operating_expense", 600, debit=True, entry_id="e"), *pair("income_tax_expense", 50, debit=True, entry_id="t")]
    complete = metrics(calculate({"ledger": ledger}, PERIOD, COMPLETE))
    assert complete["net_profit"]["value"] == "350"
    assert complete["pre_tax_profit"]["value"] == "400"
    limited = metrics(calculate({"ledger": ledger}, PERIOD, {**COMPLETE, "tax_complete": False}))
    assert limited["net_profit"]["value"] is None
    assert limited["net_profit"]["reason_codes"] == ["income_tax_unknown"]
    assert limited["pre_tax_profit"]["value"] == "400"


def test_f04_opening_and_closing_transfers_are_not_period_income():
    ledger = [*pair("revenue", 100, entry_type="opening", entry_id="o"), *pair("revenue", 100, debit=True, entry_type="closing_transfer", entry_id="c"), *pair("revenue", 200, entry_id="r"), *pair("cogs", 60, debit=True, entry_type="real_cogs_adjustment", entry_id="a")]
    result = metrics(calculate({"ledger": ledger}, PERIOD, COMPLETE))
    assert result["revenue"]["value"] == "200"
    assert result["expense"]["value"] == "60"
    assert result["pre_tax_profit"]["value"] == "140"


def test_f05_end_of_day_anchor_does_not_repeat_same_day_movement():
    rows = [bank_row("anchor", 0, when="2026-09-01", kind="anchor", balance="100", cutoff="end_of_day"), bank_row("same", 20, when="2026-09-01"), bank_row("next", 10, when="2026-09-02")]
    result = calculate({"bank": rows}, {**PERIOD, "end": "2026-09-02"}, COMPLETE)
    assert metrics(result)["cash"]["value"] == "110"
    assert result["details"]["daily_cash"][0]["balance"] == "100"


def test_f06_confirmed_internal_pair_neutral_fee_external():
    rows = [bank_row("a", -40, account="A", kind="internal", reference="T"), bank_row("b", 40, account="B", kind="internal", reference="T"), bank_row("fee", -2, account="A", kind="fee")]
    movement = calculate({"bank": rows}, PERIOD, COMPLETE)["details"]["cash_movements"]
    assert movement == {"external_in": "0", "external_out": "2", "internal_in": "40", "internal_out": "40", "net": "-2", "total_in": "40", "total_out": "42"}
    # A similarly named unconfirmed transfer remains part of external movement.
    for row in rows:
        if row["kind"] == "internal":
            row["kind"] = "movement"
    assert calculate({"bank": rows}, PERIOD, COMPLETE)["details"]["cash_movements"]["external_out"] == "42"


def test_f07_future_settlement_does_not_change_historical_balance():
    payment = {"reference": "P", "invoice_reference": "INV", "direction": "receipt", "date": "2026-10-03", "amount": "30"}
    assert invoice_remaining(invoice(), [payment], date(2026, 9, 30), history_complete=True)[:2] == (Decimal("100"), Decimal("0"))
    assert invoice_remaining(invoice(), [payment], date(2026, 10, 3), history_complete=True)[:2] == (Decimal("70"), Decimal("30"))


def test_f08_snapshot_and_its_included_event_count_once():
    row = invoice(payment_snapshot={"as_of": "2026-09-30", "paid": "30", "included_events": ["E1"]})
    event = {"reference": "E1", "invoice_reference": "INV", "direction": "receipt", "date": "2026-09-15", "amount": "30"}
    remaining, paid, reasons = invoice_remaining(row, [event], date(2026, 9, 30), history_complete=False)
    assert (remaining, paid, reasons) == (Decimal("70"), Decimal("30"), [])
    # A snapshot from the future cannot reconstruct an earlier period.
    assert invoice_remaining(row, [], date(2026, 9, 20), history_complete=False)[2] == ["snapshot_cutoff_after_report"]


def test_f09_loan_excluded_from_commercial_invoice_difference():
    ledger = [*pair("trade_ap", 100, entry_id="a"), *pair("loan_payable", 50, entry_id="l")]
    result = metrics(calculate({"ledger": ledger, "invoices": [invoice("80", direction="purchases")]}, PERIOD, COMPLETE))
    assert result["debt_total_ledger"]["value"] == "150"
    assert result["ap_trade_ledger"]["value"] == "100"
    assert result["ap_invoice"]["value"] == "80"
    assert result["ap_difference"]["value"] == "20"
    result = metrics(calculate({"ledger": ledger, "invoices": [invoice("80", direction="purchases")]}, PERIOD, {**COMPLETE, "comparable_ap": False}))
    assert result["ap_difference"]["value"] is None


def test_f10_distinct_real_equal_amount_payments_remain_distinct():
    payments = [{"reference": ref, "invoice_reference": "INV", "direction": "receipt", "date": "2026-09-15", "amount": "20"} for ref in ("REAL1", "REAL2")]
    assert invoice_remaining(invoice(), payments, date(2026, 9, 30), history_complete=True)[0] == Decimal("60")
    duplicate = [payments[0], payments[0]]
    assert invoice_remaining(invoice(), duplicate, date(2026, 9, 30), history_complete=True)[2] == ["settlement_identity_ambiguous"]


def test_f11_historical_allocation_uses_bank_effective_date_and_reversal():
    future = {"invoice_id": "I", "amount": "30", "date": "2026-10-01"}
    reversed_allocation = {"invoice_id": "I", "amount": "20", "date": "2026-09-15", "reversed_at": "2026-09-20T00:00:00Z"}
    active = {"invoice_id": "I", "amount": "10", "date": "2026-09-15"}
    assert invoice_remaining(invoice(), [], date(2026, 9, 30), history_complete=True, allocations=[future, reversed_allocation, active])[0] == Decimal("90")


def test_f12_unknown_payment_dates_and_due_date_not_invented():
    result = calculate({"invoices": [invoice(due_date=None)]}, PERIOD, {**COMPLETE, "settlements_complete": False})
    row = result["details"]["invoices"][0]
    assert row["remaining"] is None and row["overdue"] is None
    assert row["reason_codes"] == ["payment_dates_missing", "due_date_missing"]
    assert metrics(result)["ar_invoice"]["value"] is None


def test_f13_confirmed_plan_represents_obligation_once_without_rededucting_paid():
    rows, reasons = future_obligations([
        {"id": "P", "obligation_id": "O", "invoice_reference": "INV", "due_date": "2026-10-10", "amount": "60", "state": "confirmed"},
        {"id": "U", "obligation_id": "unconfirmed", "due_date": "2026-10-11", "amount": "10", "state": "proposed"},
    ], [{"reference": "INV", "remaining": "60"}], date(2026, 9, 30))
    assert reasons == []
    assert len(rows) == 1 and rows[0]["amount"] == "60"


def test_f14_missing_tax_and_reference_chain_stay_unknown():
    rows = [
        {"reference": "T1", "tax_id": "T", "direction": "sales", "date": "2026-09-02", "amount": "100", "tax": None, "state": "original"},
        {"reference": "T2", "tax_id": "COR", "direction": "sales", "date": "2026-09-03", "amount": "90", "tax": "10", "state": "correction", "parent_reference": "MISSING"},
    ]
    result = calculate({"moadian": rows}, PERIOD, {})["details"]["moadian"]["sales"]
    first = next(row for row in result if row["tax_id"] == "T")
    correction = next(row for row in result if row["tax_id"] == "COR")
    assert first["tax"] is None and first["status"] == "needs_review" and "tax_missing" in first["reason_codes"]
    assert correction["financial_effect"] is None and "reference_missing" in correction["reason_codes"]


def test_f15_comparison_missing_zero_and_sign_change():
    assert comparison("50", None) == {"previous": None, "delta": None, "percent": None, "reason": "comparison_missing"}
    assert comparison("50", "0") == {"previous": "0", "delta": "50", "percent": None, "reason": "zero_denominator"}
    assert comparison("50", "25")["percent"] == "100"
    assert comparison("50", "-25")["percent"] is None


def test_missing_family_does_not_invalidate_independent_metric():
    rows = [bank_row("anchor", 0, when="2026-09-01", kind="opening", balance="100", cutoff="start_of_day"), bank_row("m", 5)]
    result = metrics(calculate({"bank": rows}, PERIOD, {"bank_complete": True}))
    assert result["cash"]["value"] == "105" and result["cash"]["status"] == "available"
    assert result["revenue"]["value"] is None and result["revenue"]["reason_codes"] == ["ledger_source_missing"]


def test_missing_bank_account_keeps_total_unknown_and_subset_visible():
    rows = [bank_row("a", 0, when="2026-09-01", kind="opening", balance="100", cutoff="start_of_day")]
    result = metrics(calculate({"bank": rows}, PERIOD, {"bank_complete": True, "bank_accounts": ["A", "B"]}))
    assert result["cash"]["value"] is None
    assert result["cash_subset"]["value"] == "100" and result["cash_subset"]["status"] == "limited"


def test_party_credit_is_not_offset_against_other_party_receivable():
    ledger = [*pair("trade_ar", 100, debit=True, entry_id="d", party="C1"), *pair("trade_ar", 30, entry_id="c", party="C2")]
    result = calculate({"ledger": ledger}, PERIOD, COMPLETE)
    assert metrics(result)["ar_ledger"]["value"] == "100"
    assert result["details"]["receivable_credit_balances"] == "30"


def test_unbalanced_journal_and_unknown_role_cannot_publish_profit():
    unbalanced = pair("revenue", 100)[:1]
    assert metrics(calculate({"ledger": unbalanced}, PERIOD, COMPLETE))["net_profit"]["value"] is None
    unknown = pair("unclassified", 100)
    assert metrics(calculate({"ledger": unknown}, PERIOD, COMPLETE))["revenue"]["reason_codes"] == ["ledger_role_unknown"]


def test_unapproved_forecast_threshold_is_not_a_production_policy():
    result = calculate({}, PERIOD, {"forecast_policy": {"version": "fixture-only-1", "production_approved": False, "minimum_events": 3}})
    assert result["details"]["forecast"]["status"] == "unavailable"
    assert result["details"]["forecast"]["days"] == []


def _fixture_records():
    base = Path(__file__).resolve().parents[3] / "docs/validation/rebuild-v1/inputs/baseline"
    result = {"ledger": [], "bank": [], "invoices": [], "settlements": []}
    for filename in ("ledger", "bank", "invoices"):
        workbook = openpyxl.load_workbook(base / f"{filename}.xlsx", data_only=False)
        try:
            for sheet in workbook:
                values = iter(sheet.values)
                headers = next(values)
                for index, raw in enumerate(values, 2):
                    row = dict(zip(headers, raw, strict=True))
                    ident = f"{filename}!{sheet.title}:{index}"
                    if filename == "ledger":
                        result["ledger"].append({**row, "source_row_id": ident, "party_id": row["party_id"] or ""})
                    elif filename == "bank":
                        result["bank"].append({"id": ident, "source_row_id": ident, "date": row["date"], "account": sheet.title, "kind": row["row_type"], "amount": str(row["amount"]), "balance": str(row["balance"]), "reference": row["reference"], "anchor_cutoff": "start_of_day" if row["row_type"] == "opening" else None})
                    else:
                        result["invoices"].append({"id": ident, "source_row_id": ident, "reference": row["invoice_id"], "party_id": row["party_id"], "date": row["issued_on"], "due_date": row["due_on"], "amount": str(row["gross"]), "tax": str(row["vat"]), "tax_id": row["tax_id"], "direction": "sales" if sheet.title == "فروش" else "purchases"})
        finally:
            workbook.close()
    with (base / "settlements.csv").open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            result["settlements"].append({**row, "reference": row["event_id"], "invoice_reference": row["invoice_id"]})
    return result


def test_synthetic_reference_financial_amounts_match_golden_after_explicit_coverage():
    records = _fixture_records()
    output = calculate(records, PERIOD, {**COMPLETE, "confirmed_internal_references": ["TRANSFER1"]})
    actual = metrics(output)
    expected_path = Path(__file__).resolve().parents[3] / "docs/validation/rebuild-v1/expected/baseline.json"
    expected = json.loads(expected_path.read_text())
    for key, values in expected["metrics"].items():
        assert actual[key]["value"] == values["current"], key
    assert {key: output["details"]["cash_movements"][key] for key in expected["cash_movements"]} == expected["cash_movements"]
    assert output["details"]["cash_movements"]["total_in"] == "1600"
    assert output["details"]["cash_movements"]["total_out"] == "702"
    assert {row["reference"]: row["remaining"] for row in output["details"]["invoices"]} == expected["invoice_remaining"]
    assert actual["ar_difference"]["value"] == "0" and actual["ap_difference"]["value"] == "0"
