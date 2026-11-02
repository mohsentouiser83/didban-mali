"""Read-only native collection ranking using the same D09 events as forecasting."""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from . import models as m
from .collection_assistant_service import history_sort_key
from .errors import require
from .forecast_planning import LOOKBACK_DAYS, MINIMUM_EVENTS, POLICY_VERSION, weighted_median_delay
from .native_forecast_planning import _dated_history
from .native_invoice_service import current, receipt_history


def queue(db: Session, company: str, user: m.User, as_of: date, priority: str) -> dict:
    require(priority in {"amount", "history"}, "collection_priority", "ترتیب پیگیری معتبر نیست.")
    report = current(db, company, user, as_of, "sale")
    statistics = {}
    for party in {item["party_id"] for item in report["items"]}:
        events, ambiguous = _dated_history(receipt_history(db, company, user, party, as_of), as_of)
        reason = "receipt_history_ambiguous" if ambiguous else "receipt_history_insufficient" if len(events) < MINIMUM_EVENTS else None
        statistics[party] = {
            "history_lag_days": weighted_median_delay(events) if reason is None else None,
            "history_event_count": len(events),
            "history_reason": reason,
            "history_event_ids": [item["event_id"] for item in events],
            "history_allocation_ids": sorted({identity for item in events for identity in item["allocation_ids"]}),
        }
    items = []
    for item in report["items"]:
        if item["remaining"] is not None and Decimal(item["remaining"]) <= 0:
            continue
        due = (item.get("terms") or {}).get("due_date")
        overdue = max(0, (as_of - date.fromisoformat(due)).days) if due else None
        items.append(item | statistics[item["party_id"]] | {"overdue_days": overdue})
    if priority == "history":
        items.sort(key=history_sort_key, reverse=True)
    else:
        items.sort(key=lambda item: (
            item["remaining"] is not None,
            Decimal(item["remaining"]) if item["remaining"] is not None else Decimal(0),
            item["overdue_days"] is not None,
            item["overdue_days"] if item["overdue_days"] is not None else 0,
            item["id"],
        ), reverse=True)
    return report | {
        "items": items,
        "priority": priority,
        "priority_formula": "سابقه: تأخیر معمول بیشتر، سپس تأخیر فاکتور و مانده؛ مانده یا سابقهٔ نامعتبر در پایان." if priority == "history" else "ماندهٔ بیشتر، سپس تأخیر فاکتور؛ ماندهٔ نامعتبر در پایان.",
        "history_policy": {"version": POLICY_VERSION, "minimum_events": MINIMUM_EVENTS, "lookback_days": LOOKBACK_DAYS, "method": "amount_weighted_median_delay", "window_start": (as_of - timedelta(days=LOOKBACK_DAYS)).isoformat(), "window_end": as_of.isoformat(), "future_evidence_excluded": True},
    }
