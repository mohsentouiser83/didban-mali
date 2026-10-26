"""Exact, date-aware settlement math independent of persistence and UI."""

from __future__ import annotations
from datetime import date
from functools import wraps
from decimal import Decimal, localcontext
from .financial.common import amount, decimal_text, LIMIT


def invoice_aging(
    remaining_amount: str | None, due_on: str | None, cutoff: date
) -> tuple[int | None, list[str]]:
    """Unknown due dates cannot establish that a positive balance is current."""
    if remaining_amount is None:
        return None, []
    if amount(remaining_amount) <= 0:
        return 0, []
    if due_on is None:
        return None, ["due_date_missing"]
    return max(0, (cutoff - date.fromisoformat(due_on)).days), []


def remaining(gross: str, allocations: list[dict], cutoff: date) -> str:
    with localcontext() as ctx:
        ctx.prec = 96
        paid = sum(
            (
                amount(a["amount"])
                for a in allocations
                if not a.get("reversed") and date.fromisoformat(a["date"]) <= cutoff
            ),
            Decimal(0),
        )
        result = amount(gross) - paid
        if result < 0 or abs(result) >= LIMIT:
            raise ValueError("allocation_capacity_conflict")
        return decimal_text(result)


def weighted_delay(
    events: list[dict], cutoff: date, lookback_days: int, minimum_events: int
) -> int | None:
    """Amount-weighted median, dates as known at cutoff; no future leakage."""
    samples = []
    seen = {}
    for event in events:
        identity = event.get("event_id")
        if identity is not None:
            if identity in seen:
                if seen[identity] != event:
                    return None
                continue
            seen[identity] = event
        due, paid = (
            date.fromisoformat(event["due_on"]),
            date.fromisoformat(event["paid_on"]),
        )
        value = amount(event["amount"])
        if value > 0 and paid <= cutoff and 0 <= (cutoff - paid).days <= lookback_days:
            samples.append((max(0, (paid - due).days), value))
    if len(samples) < minimum_events:
        return None
    with localcontext() as ctx:
        ctx.prec = 96
        half = sum((v for _, v in samples), Decimal(0)) / 2
        cumulative = Decimal(0)
        for delay, value in sorted(samples):
            cumulative += value
            if cumulative >= half:
                return delay
    return None


def exact_context(function):
    @wraps(function)
    def scoped(*args, **kwargs):
        with localcontext() as context:
            context.prec = 96
            return function(*args, **kwargs)

    return scoped
