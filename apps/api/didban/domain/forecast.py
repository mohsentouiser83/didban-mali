"""Thirty-day cash forecast with explicit assumptions and non-overlapping obligations."""

from __future__ import annotations
from datetime import date, timedelta
from collections import Counter
from decimal import Decimal, localcontext
from .financial.common import amount, decimal_text, LIMIT
from .settlements import weighted_delay


def forecast(
    cash: str | None,
    as_of: date,
    invoices: list[dict],
    plans: list[dict],
    history: list[dict],
    answers: dict,
    minimum_events: int = 3,
    lookback_days: int = 180,
) -> tuple[list[dict], list[dict], list[str]]:
    questions, reasons, incoming, outgoing = [], [], {}, {}
    horizon = as_of + timedelta(days=30)

    def schedule(key, text, proposed, value, target):
        known = answers.get(key, "__missing__")
        if known == "__missing__" and (proposed is None or proposed <= as_of):
            questions.append({"key": key, "text": text, "kind": "date"})
            return
        if known is None:
            reasons.append("expected_date_unknown")
            return
        when = date.fromisoformat(known) if known != "__missing__" else proposed
        if when is None or when <= as_of:
            raise ValueError("forecast_date_not_future")
        if when <= horizon:
            target[when] = target.get(when, Decimal(0)) + value

    with localcontext() as ctx:
        ctx.prec = 96
        planned_invoice_ids = set()
        duplicate_invoices = Counter(
            p["invoice_id"]
            for p in plans
            if p.get("invoice_id") and p.get("state") == "confirmed"
        )
        duplicate_obligations = Counter(
            p["obligation_id"] for p in plans if p.get("state") == "confirmed"
        )
        for plan in plans:
            if plan.get("state") != "confirmed":
                continue
            invoice_id = plan.get("invoice_id")
            if duplicate_obligations[plan["obligation_id"]] > 1 or (
                invoice_id and duplicate_invoices[invoice_id] > 1
            ):
                reasons.append("obligation_overlap")
                continue
            if invoice_id:
                if invoice_id in planned_invoice_ids:
                    reasons.append("obligation_overlap")
                    continue
                planned_invoice_ids.add(invoice_id)
            if plan.get("remaining_amount") is None:
                reasons.append("payment_history_unknown")
                continue
            value = amount(plan["remaining_amount"])
            if value <= 0:
                continue
            schedule(
                "payment|" + plan["obligation_id"],
                "این تعهد چه تاریخی پرداخت می‌شود؟ " + plan["title"],
                date.fromisoformat(plan["scheduled_on"]),
                value,
                outgoing,
            )
        for invoice in invoices:
            if invoice.get("remaining_as_of") is None:
                reasons.append("invoice_balance_unknown")
                continue
            value = amount(invoice["remaining_as_of"])
            if value <= 0:
                continue
            key = "receipt|" if invoice["direction"] == "sales" else "payment|invoice|"
            if (
                invoice["direction"] == "purchase"
                and invoice["invoice_id"] in planned_invoice_ids
            ):
                continue
            proposed = (
                date.fromisoformat(invoice["due_on"]) if invoice.get("due_on") else None
            )
            if invoice["direction"] == "sales":
                customer_history = [
                    e for e in history if e["party_id"] == invoice["party_id"]
                ]
                delay = weighted_delay(
                    customer_history, as_of, lookback_days, minimum_events
                )
                proposed = (
                    proposed + timedelta(days=delay)
                    if proposed and delay is not None
                    else None
                )
            schedule(
                key + invoice["invoice_id"],
                "تاریخ مورد انتظار "
                + ("وصول" if invoice["direction"] == "sales" else "پرداخت")
                + " فاکتور "
                + invoice["source_invoice_id"]
                + " چیست؟",
                proposed,
                value,
                incoming if invoice["direction"] == "sales" else outgoing,
            )
        if cash is None:
            reasons.append("balance_anchor_missing")
        days, balance = [], amount(cash) if cash is not None else None
        for offset in range(1, 31):
            when = as_of + timedelta(days=offset)
            inc, out = incoming.get(when, Decimal(0)), outgoing.get(when, Decimal(0))
            opening = balance
            balance = balance + inc - out if balance is not None else None
            if any(abs(v) >= LIMIT for v in (inc, out, balance) if v is not None):
                balance = None
                reasons.append("aggregate_out_of_range")
            days.append(
                {
                    "date": str(when),
                    "opening": decimal_text(opening) if opening is not None else None,
                    "expected_in": decimal_text(inc) if abs(inc) < LIMIT else None,
                    "expected_out": decimal_text(out) if abs(out) < LIMIT else None,
                    "closing": decimal_text(balance) if balance is not None else None,
                    "status": "unavailable"
                    if cash is None or balance is None
                    else "limited"
                    if reasons
                    else "estimated",
                    "reason_codes": list(dict.fromkeys(reasons)),
                }
            )
    return days, questions, list(dict.fromkeys(reasons))


def forecast_summary(days):
    with localcontext() as context:
        context.prec = 96
        values = [d for d in days if d["closing"] is not None]
        minimum = min(values, key=lambda d: amount(d["closing"])) if values else None

        def total(key):
            if any(d[key] is None for d in days):
                return None
            value = sum((amount(d[key]) for d in days), Decimal(0))
            return decimal_text(value) if abs(value) < LIMIT else None

        return {
            "ending": days[-1]["closing"] if days else None,
            "minimum": minimum["closing"] if minimum else None,
            "minimum_on": minimum["date"] if minimum else None,
            "expected_in": total("expected_in"),
            "expected_out": total("expected_out"),
        }
