"""Read-only receipt-history ranking and local reminder drafts; never sends messages."""

import json
from datetime import date, timedelta
from decimal import Decimal
from hashlib import sha256
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import DomainError, require
from .finance import SALES_DIRECTIONS, day
from .forecast_planning import LOOKBACK_DAYS, MINIMUM_EVENTS, POLICY_VERSION, _history, weighted_median_delay
from .ingestion import money, parsed_date
from .module_service import require_module
from .money_type import canonical_money
from .security import membership
from .services import get_entity
from .workflow import records_for, source_rows_for

HISTORY_FORMULA = "مانده معلوم؛ سابقه معتبر؛ تأخیر معمول بیشتر، سپس تأخیر فعلی بیشتر و مانده بیشتر. سابقه ناموجود در انتهاست؛ مبنا تاریخ گزارش است."


def _pinned_history(db: Session, company: str, manifest: m.ResultManifest) -> list[dict]:
    selected = manifest.selection.get("row_ids", [])
    ids = manifest.selection.get("interpretation_ids", [])
    mappings = {}
    for item in db.scalars(
        select(m.Interpretation).where(
            m.Interpretation.company_id == company,
            m.Interpretation.id.in_(ids),
            m.Interpretation.family == "history",
        )
    ):
        key = (item.file_id, item.sheet)
        require(
            key not in mappings,
            "receipt_history_mapping_ambiguous",
            "نگاشت سابقه وصول در نسخه گزارش مبهم است.",
            409,
        )
        mappings[key] = item
    history = []
    for row in source_rows_for(db, company, selected).values():
        interpretation = mappings.get((row.file_id, row.sheet))
        if interpretation is None:
            continue

        def value(field, selected_row=row, selected_interpretation=interpretation):
            return str(
                selected_row.values.get(selected_interpretation.mapping.get(field, ""), "") or ""
            ).strip()

        try:
            history.append(
                {
                    "event_id": value("event_id"),
                    "invoice_reference": value("invoice_id"),
                    "party_id": value("party_id"),
                    "due_date": parsed_date(value("due_date"), interpretation.calendar).isoformat(),
                    "paid_on": parsed_date(value("paid_on"), interpretation.calendar).isoformat(),
                    "amount": money(value("amount"), value("currency") or interpretation.unit),
                    "role": "calibration_only",
                    "source_row_id": row.id,
                }
            )
        except (DomainError, ValueError, TypeError):
            continue
    return history


def history_statistics(
    db: Session, company: str, manifest: m.ResultManifest | None, rows: list[dict]
) -> dict[str, dict]:
    parties = {str(row.get("party_id") or "") for row in rows}
    stats = {
        party: {
            "history_lag_days": None,
            "history_event_count": 0,
            "history_reason": "report_date_missing",
            "history_evidence_refs": [],
        }
        for party in parties
    }
    if manifest is None or not manifest.details.get("as_of_date"):
        return stats
    as_of = date.fromisoformat(manifest.details["as_of_date"])
    if as_of > m.now().astimezone(ZoneInfo("Asia/Tehran")).date():
        return {party: {**value, "history_reason": "report_date_future"} for party, value in stats.items()}
    records = records_for(db, company, manifest.selection.get("row_ids", []))
    try:
        records["history"] = _pinned_history(db, company, manifest)
    except DomainError as error:
        return {party: {**value, "history_reason": error.code} for party, value in stats.items()}
    # Receipt rows identify invoices by reference. Conflicting parties/due
    # dates must not be resolved by the helper's dictionary insertion order.
    by_reference = {}
    for invoice in records.get("invoices", []):
        if invoice.get("direction") in SALES_DIRECTIONS:
            by_reference.setdefault(str(invoice["reference"]), set()).add(
                (str(invoice.get("party_id") or ""), invoice.get("due_date"))
            )
    conflicts = {reference: values for reference, values in by_reference.items() if len(values) > 1}
    ambiguous_parties = set()
    safe_receipts = []
    for receipt in records.get("settlements", []):
        reference = str(receipt.get("invoice_reference") or receipt.get("invoice_id") or "")
        if receipt.get("direction") == "receipt" and reference in conflicts:
            paid_on = day(receipt["date"])
            if as_of - timedelta(days=LOOKBACK_DAYS) <= paid_on <= as_of:
                ambiguous_parties.update(party for party, _due in conflicts[reference])
        else:
            safe_receipts.append(receipt)
    records["settlements"] = safe_receipts
    histories, ambiguous = _history(records, as_of)
    ambiguous.update(ambiguous_parties)
    for party in parties:
        events = histories.get(party, [])
        reason = (
            "receipt_history_ambiguous"
            if party in ambiguous
            else "receipt_history_insufficient"
            if len(events) < MINIMUM_EVENTS
            else None
        )
        stats[party] = {
            "history_lag_days": weighted_median_delay(events) if reason is None else None,
            "history_event_count": len(events),
            "history_reason": reason,
            "history_evidence_refs": sorted({ref for event in events for ref in event["evidence_refs"]}),
        }
    return stats


def history_sort_key(item: dict) -> tuple:
    lag = item["history_lag_days"]
    overdue = item["overdue_days"]
    return (
        item["remaining"] is not None,
        lag is not None,
        lag if lag is not None else 0,
        overdue is not None,
        overdue if overdue is not None else 0,
        Decimal(item["remaining"]) if item["remaining"] is not None else Decimal(0),
        str(item["id"]),
    )


def queue(db: Session, company: str, user: m.User, page: int, q: str, priority: str) -> dict:
    from .control_service import collection

    return collection(db, company, user, page, q, priority=priority) | {
        "history_policy": {
            "version": POLICY_VERSION,
            "minimum_events": MINIMUM_EVENTS,
            "lookback_days": LOOKBACK_DAYS,
            "method": "amount_weighted_median_delay",
        }
    }


def _persian(value: str) -> str:
    return value.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def reminder(db: Session, company: str, user: m.User, invoice_id: str, manifest_id: str) -> dict:
    membership(db, company, user, "write")
    require_module(db, company, "receivables", ready=False)
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    require(
        manifest is not None and manifest.id == manifest_id,
        "collection_source_changed",
        "گزارش تغییر کرده؛ فاکتور را دوباره بررسی کنید.",
        409,
    )
    invoice = get_entity(db, m.Invoice, company, invoice_id)
    require(
        invoice.original_unit in ("IRR", "TOMAN"),
        "collection_unit_unknown",
        "واحد فاکتور مشخص نیست؛ متن یادآوری ساخته نشد.",
        409,
    )
    require(
        invoice.direction in SALES_DIRECTIONS
        and invoice.source_row_id in manifest.selection.get("row_ids", []),
        "collection_invoice_not_current",
        "فاکتور در نسخه جاری نیست.",
        409,
    )
    rows = [
        row
        for row in manifest.details.get("invoices", [])
        if row.get("id") == invoice_id and row.get("direction") == "sales"
    ]
    require(len(rows) == 1, "collection_invoice_ambiguous", "فاکتور در گزارش جاری مشخص نیست.", 409)
    row = rows[0]
    require(
        row.get("remaining") is not None,
        "collection_balance_unavailable",
        "مانده فاکتور مشخص نیست؛ متن یادآوری ساخته نشد.",
        409,
    )
    remaining = canonical_money(row["remaining"])
    require(Decimal(remaining) > 0, "collection_balance_not_positive", "فاکتور مانده مثبت ندارد.", 409)
    require(
        bool(row.get("party_id") and row.get("reference") and manifest.details.get("as_of_date")),
        "collection_details_missing",
        "طرف حساب، شماره یا تاریخ مبنای فاکتور مشخص نیست.",
        409,
    )
    snapshot = {
        "manifest_id": manifest.id,
        "invoice_id": invoice.id,
        "party_id": row["party_id"],
        "reference": row["reference"],
        "remaining": remaining,
        "due_date": row.get("due_date"),
        "as_of_date": manifest.details["as_of_date"],
    }
    digest = sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    text = f"سلام. مانده فاکتور {snapshot['reference']} برای {snapshot['party_id']} تا تاریخ {_persian(snapshot['as_of_date'])}، {_persian(remaining)} ریال است."
    if snapshot["due_date"]:
        text += f" سررسید: {_persian(snapshot['due_date'])}."
    text += " لطفاً زمان پرداخت را اعلام کنید."
    return {
        "snapshot": snapshot,
        "digest": digest,
        "text": text,
        "financial_effect": False,
        "external_send_available": False,
        "history_policy_version": POLICY_VERSION,
    }
