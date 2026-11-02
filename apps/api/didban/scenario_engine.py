"""Deterministic exact scenario arithmetic on a frozen forecast."""

import json
from copy import deepcopy
from datetime import timedelta
from decimal import Decimal, localcontext
from hashlib import sha256
from typing import Any

from .errors import DomainError, require
from .finance import day
from .money_type import aggregate_money, canonical_money


def freeze(manifest: Any) -> dict:
    forecast = deepcopy(manifest.details.get("forecast", {}))
    require(
        forecast.get("status") == "estimated"
        and forecast.get("opening") is not None
        and bool(forecast.get("days")),
        "forecast_unavailable",
        "پیش‌بینی معتبر برای ساخت سناریو موجود نیست.",
        409,
    )
    start = day(forecast["days"][0]["date"])
    end = day(forecast["days"][-1]["date"])
    require(start <= end, "forecast_invalid", "افق پیش‌بینی معتبر نیست.", 409)
    events = []
    for index, event in enumerate(forecast.get("events", [])):
        identity = sha256(json.dumps([manifest.id, index, event], sort_keys=True).encode()).hexdigest()[:32]
        events.append(deepcopy(event) | {"event_id": identity})
    return {
        "manifest_id": manifest.id,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "opening": canonical_money(forecast["opening"]),
        "events": events,
        "assumptions": forecast.get("assumptions", []),
        "policy_version": forecast.get("policy_version"),
        "accounts": sorted(row["account"] for row in manifest.details.get("bank_balances", [])),
        "as_of_date": (start - timedelta(days=1)).isoformat(),
    }


def path(baseline: dict, events: list[dict]) -> dict:
    start, end = day(baseline["start"]), day(baseline["end"])
    require((end - start).days <= 366, "forecast_invalid", "افق پیش‌بینی معتبر نیست.", 409)
    days, excluded = [], []
    with localcontext() as context:
        context.prec = 60
        balance = Decimal(baseline["opening"])
        minimum = balance
        first_deficit = baseline["as_of_date"] if balance < 0 else None
        for event in events:
            require(
                event["direction"] in ("receipt", "payment"),
                "forecast_invalid",
                "جهت رویداد معتبر نیست.",
                409,
            )
            if not start <= day(event["date"]) <= end:
                excluded.append(event)
        for offset in range((end - start).days + 1):
            target = start + timedelta(days=offset)
            selected = [event for event in events if day(event["date"]) == target]
            receipts = sum(
                (Decimal(event["amount"]) for event in selected if event["direction"] == "receipt"),
                Decimal(0),
            )
            payments = sum(
                (Decimal(event["amount"]) for event in selected if event["direction"] == "payment"),
                Decimal(0),
            )
            balance += receipts - payments
            minimum = min(minimum, balance)
            if balance < 0 and first_deficit is None:
                first_deficit = target.isoformat()
            days.append(
                {
                    "date": target.isoformat(),
                    "receipts": aggregate_money(receipts),
                    "payments": aggregate_money(payments),
                    "balance": aggregate_money(balance),
                }
            )
    return {
        "opening": baseline["opening"],
        "closing": aggregate_money(balance),
        "minimum": aggregate_money(minimum),
        "first_deficit": first_deficit,
        "days": days,
        "excluded_events": excluded,
        "events": events,
    }


def simulate(baseline: dict, changes: dict) -> dict:
    ids = {item["event_id"] for item in baseline["events"]}
    shifts = changes.get("shifts", [])
    require(
        len({item["event_id"] for item in shifts}) == len(shifts),
        "duplicate_shift",
        "تاریخ هر رویداد را یک‌بار تعیین کنید.",
    )
    require(all(item["event_id"] in ids for item in shifts), "unknown_event", "رویداد در نسخه مبنا نیست.")
    shifted = {item["event_id"]: str(item["date"]) for item in shifts}
    events = [
        deepcopy(item) | {"date": shifted.get(item["event_id"], item["date"])} for item in baseline["events"]
    ]
    for index, item in enumerate(changes.get("hypothetical", [])):
        try:
            with localcontext() as context:
                context.prec = 60
                value = Decimal(canonical_money(item["amount"]))
                require(value > 0, "invalid_amount", "مبلغ فرضی باید مثبت باشد.")
                value = canonical_money(value * (10 if item["unit"] == "TOMAN" else 1))
        except ValueError as error:
            raise DomainError("invalid_amount", "مبلغ فرضی معتبر نیست.") from error
        events.append(
            {
                "event_id": f"hypothetical:{index}",
                "label": item["label"],
                "date": str(item["date"]),
                "direction": item["direction"],
                "amount": value,
                "hypothetical": True,
                "original_amount": item["amount"],
                "original_unit": item["unit"],
            }
        )
    original = path(baseline, baseline["events"])
    scenario = path(baseline, events)
    with localcontext() as context:
        context.prec = 60
        delta = aggregate_money(Decimal(scenario["closing"]) - Decimal(original["closing"]))
    return {"baseline": original, "scenario": scenario, "closing_difference": delta, "status": "estimated"}
