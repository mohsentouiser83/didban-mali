"""D09 receipt timing: three dated payments within the preceding 180 days.

This module proposes dates only. It never creates a settlement or changes the
invoice due date. Necessary questions are returned to the shared session barrier.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import localcontext

from .finance import SALES_DIRECTIONS, ZERO, amount, day, invoice_remaining, text_amount

POLICY_VERSION = "forecast-3in180-v1"
MINIMUM_EVENTS = 3
LOOKBACK_DAYS = 180


def _event(row: dict, family: str, invoices: dict[str, dict]) -> dict | None:
    """Resolve a payment's own party and due date without inventing a join."""
    if family == "history":
        if row.get("role") != "calibration_only":
            return None
        invoice_ref = str(row.get("invoice_reference") or row.get("invoice_id") or "")
        party = str(row.get("party_id") or "")
        due, paid = row.get("due_date") or row.get("due_on"), row.get("paid_on")
    else:
        if row.get("direction") != "receipt":
            return None
        invoice_ref = str(row.get("invoice_reference") or row.get("invoice_id") or "")
        invoice = invoices.get(invoice_ref)
        if not invoice:
            return None
        party = str(invoice.get("party_id") or "")
        due, paid = invoice.get("due_date"), row.get("date")
    identity = str(row.get("event_id") or row.get("reference") or row.get("id") or "")
    try:
        value = amount(row["amount"])
        if not party or not identity or not due or not paid or value <= ZERO:
            return None
        due_date, paid_on = day(due), day(paid)
    except (ValueError, KeyError, TypeError, ArithmeticError):
        return None
    return {"event_id": identity, "invoice_reference": invoice_ref, "party_id": party, "due_date": due_date, "paid_on": paid_on, "amount": value, "family": family, "evidence_refs": [str(row["source_row_id"])] if row.get("source_row_id") else []}


def _fingerprint(event: dict) -> tuple:
    return event["party_id"], event["invoice_reference"], event["due_date"], event["paid_on"], event["amount"]


def _history(records: dict, as_of: date) -> tuple[dict[str, list[dict]], set[str]]:
    invoices = {str(row["reference"]): row for row in records.get("invoices", []) if row.get("direction") in SALES_DIRECTIONS}
    by_identity: dict[str, list[dict]] = defaultdict(list)
    start = as_of - timedelta(days=LOOKBACK_DAYS)
    for family in ("history", "settlements"):
        for row in records.get(family, []):
            event = _event(row, family, invoices)
            if event and start <= event["paid_on"] <= as_of:
                by_identity[event["event_id"]].append(event)
    events: dict[str, list[dict]] = defaultdict(list)
    ambiguous = set()
    cross_source: dict[tuple, list[dict]] = defaultdict(list)
    for versions in by_identity.values():
        if len({_fingerprint(event) for event in versions}) != 1:
            ambiguous.update(event["party_id"] for event in versions)
            continue
        # Repeated rows and the same payment in calibration/financial files count once.
        selected = dict(versions[0])
        selected["evidence_refs"] = sorted({ref for version in versions for ref in version["evidence_refs"]})
        events[selected["party_id"]].append(selected)
        cross_source[_fingerprint(selected)].append(selected)
    for versions in cross_source.values():
        families = {event["family"] for event in versions}
        if len(versions) > 1 and len(families) > 1:
            # Different IDs across two source families do not prove two real payments.
            ambiguous.update(event["party_id"] for event in versions)
    return dict(events), ambiguous


def weighted_median_delay(events: list[dict]) -> int:
    """Use the first observed integer delay reaching half the positive paid mass."""
    with localcontext() as context:
        context.prec = 50
        ordered = sorted(events, key=lambda event: (event["paid_on"] - event["due_date"]).days)
        total = sum((event["amount"] for event in ordered), ZERO)
        if total <= 0:
            raise ValueError("Positive payment history is required")
        running = ZERO
        for event in ordered:
            running += event["amount"]
            if running * 2 >= total:
                return (event["paid_on"] - event["due_date"]).days
    raise ValueError("Payment history is empty")


def plan_receipts(records: dict, period: dict, coverage: dict) -> dict:
    """Return dated estimates and necessary questions grouped by customer.

    Explicit unknown answers suppress a repeated date question and keep that
    invoice unavailable. Missing balance history is a local data limitation,
    not an excuse to invent a balance or ask for a meaningless timing estimate.
    """
    as_of = day(period["end"])
    histories, ambiguous = _history(records, as_of)
    receipt_dates: dict[str, str] = {}
    grouped: dict[str, dict] = {}
    assumptions = []
    unavailable = []
    manual = coverage.get("receipt_dates", {})
    allocations = records.get("allocations", [])

    def question(invoice: dict, reason: str, refs: list[str]) -> None:
        party = str(invoice.get("party_id") or "")
        item = grouped.setdefault(party, {"party_id": party, "invoice_refs": [], "title": "زمان وصول این مشتری چه تاریخی است؟", "reason_code": reason, "reason_codes": [], "evidence_refs": []})
        item["invoice_refs"].append(str(invoice["reference"]))
        item["reason_codes"] = sorted(set([*item["reason_codes"], reason]))
        item["evidence_refs"] = sorted(set([*item["evidence_refs"], *refs]))

    for invoice in records.get("invoices", []):
        if invoice.get("direction") not in SALES_DIRECTIONS or day(invoice["date"]) > as_of:
            continue
        reference = str(invoice["reference"])
        remaining, _paid, balance_reasons = invoice_remaining(invoice, records.get("settlements", []), as_of, history_complete=coverage.get("settlements_complete") is True, allocations=allocations)
        if remaining is None:
            unavailable.append({"invoice_ref": reference, "reason_codes": balance_reasons})
            continue
        if remaining <= 0:
            continue
        refs = [str(invoice["source_row_id"])] if invoice.get("source_row_id") else []
        if reference in manual:
            expected = manual[reference]
            if expected is None or expected == "unknown":
                unavailable.append({"invoice_ref": reference, "reason_codes": ["receipt_date_unknown"]})
                continue
            try:
                expected = day(expected)
            except (ValueError, TypeError):
                question(invoice, "receipt_date_invalid", refs)
                continue
            if expected <= as_of:
                question(invoice, "receipt_estimate_in_past", refs)
            else:
                receipt_dates[reference] = expected.isoformat()
                assumptions.append({"invoice_ref": reference, "basis": "human_expected_date", "expected_date": expected.isoformat(), "evidence_refs": refs})
            continue
        party = str(invoice.get("party_id") or "")
        history = histories.get(party, [])
        history_refs = sorted({ref for event in history for ref in event["evidence_refs"]})
        if not invoice.get("due_date"):
            question(invoice, "invoice_due_date_missing", refs)
        elif party in ambiguous:
            question(invoice, "receipt_history_ambiguous", [*refs, *history_refs])
        elif len(history) < MINIMUM_EVENTS:
            question(invoice, "receipt_history_insufficient", [*refs, *history_refs])
        else:
            lag = weighted_median_delay(history)
            try:
                expected = day(invoice["due_date"]) + timedelta(days=lag)
            except (OverflowError, ValueError):
                question(invoice, "receipt_date_out_of_range", [*refs, *history_refs])
                continue
            if expected <= as_of:
                question(invoice, "receipt_estimate_in_past", [*refs, *history_refs])
            else:
                receipt_dates[reference] = expected.isoformat()
                assumptions.append({"invoice_ref": reference, "party_id": party, "basis": "amount_weighted_median_delay", "history_event_count": len(history), "history_window_start": (as_of - timedelta(days=LOOKBACK_DAYS)).isoformat(), "history_window_end": as_of.isoformat(), "delay_days": lag, "expected_date": expected.isoformat(), "remaining": text_amount(remaining), "evidence_refs": sorted(set([*refs, *history_refs]))})
    return {"receipt_dates": receipt_dates, "issues": list(grouped.values()), "assumptions": assumptions, "unavailable": unavailable, "policy_version": POLICY_VERSION}
