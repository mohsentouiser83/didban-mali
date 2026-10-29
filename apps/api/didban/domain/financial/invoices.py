from collections import Counter, defaultdict

from .common import (
    ZERO,
    UnsafeFinancialData,
    amount,
    coverage,
    coverage_reason,
    day,
    decimal_text,
    result,
    selected,
    usable,
)
from .types import FinancialRow, MetricResult, PeriodSpec


def invoice_metric(
    rows: list[FinancialRow], period: PeriodSpec, declarations: dict, kind: str
) -> MetricResult:
    source = selected(rows, kind)
    events = selected(rows, "settlements")
    errors = []
    key = "ar_invoice" if kind == "sales_invoices" else "ap_invoice"
    direction = "receipt" if kind == "sales_invoices" else "payment"
    if not source:
        errors.append("source_missing")
    issue = coverage_reason(kind, period.starts_on, period.cutoff, declarations)
    if issue:
        errors.append(issue)
    if declarations.get("invoice_openings_included") is not True:
        errors.append("invoice_openings_unknown")
    # Opening-invoice gross is the original invoice amount, not an assertion of
    # its remaining balance at the reporting-period start. Reconstructing it
    # therefore needs settlements from issue, unless a dated paid-total snapshot
    # supplies a later, explicit reconstruction anchor for that invoice.
    reconstruction_starts = []
    for row in source:
        try:
            issued = day(row.values.get("issued_on"))
            if issued > period.cutoff:
                continue
            start = issued
            snapshot = declarations.get("invoice_snapshots", {}).get(
                f"{kind}:{row.values.get('invoice_id')}"
            )
            if isinstance(snapshot, dict):
                snapshot_day = day(snapshot.get("as_of"))
                if issued <= snapshot_day <= period.cutoff:
                    start = snapshot_day
            reconstruction_starts.append(start)
        except UnsafeFinancialData:
            errors.append("payment_dates_missing")
    history_start = min(reconstruction_starts, default=period.starts_on)
    if declarations.get("settlements_complete") is not True or coverage_reason(
        "settlements", history_start, period.cutoff, declarations
    ):
        errors.append("settlement_coverage_unknown")
    relevant = []
    balances = {}
    gross_total = ZERO
    identities = Counter(r.values.get("invoice_id") for r in source)
    event_ids = Counter(r.values.get("event_id") for r in events)
    events_by_invoice = defaultdict(list)
    for event in events:
        event_direction = event.values.get("direction")
        if event_direction not in {"receipt", "payment"}:
            # An unknown direction may affect either balance. Rejecting its row
            # must not turn an unverified unpaid total into an available balance.
            try:
                if day(event.values.get("date")) <= period.cutoff:
                    errors.append("settlement_invalid")
            except UnsafeFinancialData:
                errors.append("payment_dates_missing")
            continue
        if event_direction != direction:
            continue
        events_by_invoice[event.values.get("invoice_id")].append(event)
        try:
            if (
                day(event.values.get("date")) <= period.cutoff
                and event.values.get("invoice_id") not in identities
            ):
                errors.append("settlement_invalid")
        except UnsafeFinancialData:
            errors.append("payment_dates_missing")
    for row in source:
        values = row.values
        try:
            if day(values.get("issued_on")) > period.cutoff:
                continue
            if (
                not usable(row)
                or not values.get("invoice_id")
                or not values.get("party_id")
            ):
                raise UnsafeFinancialData("invalid_rows")
            invoice_id = values["invoice_id"]
            if identities[invoice_id] > 1:
                raise UnsafeFinancialData("invoice_identity_ambiguous")
            gross = amount(values.get("gross"))
            if gross < ZERO or values.get("record_role", "invoice") not in {
                "invoice",
                "opening_invoice",
            }:
                raise UnsafeFinancialData("invalid_rows")
            paid = ZERO
            snapshot = declarations.get("invoice_snapshots", {}).get(
                f"{kind}:{invoice_id}"
            )
            snapshot_day = None
            included_ids = set()
            if snapshot is not None:
                if not isinstance(snapshot, dict):
                    raise UnsafeFinancialData("payment_dates_missing")
                snapshot_day = day(snapshot.get("as_of"))
                if snapshot_day > period.cutoff:
                    # A later paid-total snapshot cannot reconstruct an earlier balance.
                    raise UnsafeFinancialData("payment_dates_missing")
                paid = amount(snapshot.get("paid"))
                raw_ids = snapshot.get("included_event_ids")
                if not isinstance(raw_ids, list) or any(
                    not isinstance(item, str) for item in raw_ids
                ):
                    raise UnsafeFinancialData("payment_dates_missing")
                included_ids = set(raw_ids)
                if paid < ZERO or snapshot_day < day(values["issued_on"]):
                    raise UnsafeFinancialData("settlement_invalid")
            elif any(
                values.get(field) is not None
                for field in ("paid", "paid_amount", "paid_as_of")
            ):
                # Aggregate present-day paid amounts are not dated settlement history.
                raise UnsafeFinancialData("payment_dates_missing")
            relevant.append(row)
            included_observed = ZERO
            for event in events_by_invoice[invoice_id]:
                data = event.values
                event_day = day(data.get("date"))
                if event_day > period.cutoff:
                    continue
                if (
                    not usable(event)
                    or not data.get("event_id")
                    or event_ids[data["event_id"]] != 1
                ):
                    raise UnsafeFinancialData("settlement_invalid")
                value = amount(data.get("amount"))
                if value < ZERO or event_day < day(values["issued_on"]):
                    raise UnsafeFinancialData("settlement_invalid")
                if snapshot_day is not None and event_day <= snapshot_day:
                    if data["event_id"] not in included_ids:
                        raise UnsafeFinancialData("payment_dates_missing")
                    included_observed += value
                    relevant.append(event)
                    continue
                if data["event_id"] in included_ids:
                    raise UnsafeFinancialData("settlement_invalid")
                paid += value
                relevant.append(event)
            if snapshot is not None and included_observed > amount(snapshot["paid"]):
                raise UnsafeFinancialData("settlement_invalid")
            if paid > gross:
                raise UnsafeFinancialData("settlement_invalid")
            balances[invoice_id] = decimal_text(gross - paid)
            gross_total += gross - paid
        except UnsafeFinancialData as exc:
            errors.append(str(exc))
    return result(
        key,
        "invoice",
        None if errors else gross_total,
        relevant,
        errors,
        coverage(kind, period.starts_on, period.cutoff, declarations)
        + coverage("settlements", period.starts_on, period.cutoff, declarations),
        {"invoice_balances": balances},
    )
