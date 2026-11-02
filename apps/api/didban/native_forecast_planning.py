"""D09 timing proposals and persistent question descriptions, without financial writes."""

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, localcontext
from hashlib import sha256
from zoneinfo import ZoneInfo

from .errors import require
from .finance import day
from .forecast_planning import LOOKBACK_DAYS, MINIMUM_EVENTS, weighted_median_delay


def today() -> date:
    return datetime.now(ZoneInfo("Asia/Tehran")).date()


def _dated_history(rows: list[dict], as_of: date) -> tuple[list[dict], bool]:
    grouped = defaultdict(list)
    for row in rows:
        paid = day(row.get("date") or row.get("paid_on"))
        if not as_of - timedelta(days=LOOKBACK_DAYS) <= paid <= min(as_of, today()):
            continue
        if not row.get("due_date") or Decimal(row["amount"]) <= 0:
            continue
        identity = row.get("journal_id") or row.get("payment_journal_id")
        require(bool(identity), "native_receipt_event_missing", "شناسهٔ سند وصول برای تاریخچه لازم است.", 409)
        grouped[identity].append(row)
    events = []
    ambiguous = False
    with localcontext() as context:
        context.prec = 60
        for identity, allocations in sorted(grouped.items()):
            dates = {
                (str(row["due_date"]), str(row.get("date") or row.get("paid_on"))) for row in allocations
            }
            if len(dates) != 1:
                ambiguous = True
                continue
            due, paid = next(iter(dates))
            events.append(
                {
                    "event_id": identity,
                    "due_date": day(due),
                    "paid_on": day(paid),
                    "amount": sum((Decimal(row["amount"]) for row in allocations), Decimal(0)),
                    "allocation_ids": sorted({row["allocation_id"] for row in allocations}),
                }
            )
    return events, ambiguous


def prepare(snapshot: dict, answers: dict) -> dict:
    as_of = day(snapshot["as_of"])
    questions, events, assumptions, unavailable = [], [], [], []

    def ask(key: str, label: str, reason: str, amount: str, reference: str):
        questions.append(
            {
                "id": sha256((key + ":" + reason).encode()).hexdigest()[:32],
                "key": key,
                "title": label,
                "reason_code": reason,
                "amount": amount,
                "reference": reference,
                "as_of": snapshot["as_of"],
            }
        )

    def expected(key: str, direction: str, value: str, terms: dict, reference: str, party: str | None = None):
        selected = answers.get(key)
        due = terms.get("due_date")
        reason = None
        timing_basis = None
        stamp = None
        if selected:
            stamp = selected.get("expected_date")
            if selected.get("unknown"):
                unavailable.append(
                    {
                        "key": key,
                        "reason_code": "receipt_date_unknown"
                        if direction == "receipt"
                        else "payment_date_unknown",
                    }
                )
                return
            timing_basis = "human_expected_date"
        elif terms.get("expected_unknown"):
            unavailable.append(
                {
                    "key": key,
                    "reason_code": "receipt_date_unknown"
                    if direction == "receipt"
                    else "payment_date_unknown",
                }
            )
            return
        elif terms.get("expected_date"):
            stamp = terms["expected_date"]
            timing_basis = "invoice_expected_date"
        elif direction == "receipt":
            history, ambiguous = _dated_history(snapshot["receipt_history"].get(party, []), as_of)
            if not due:
                reason = "invoice_due_date_missing"
            elif ambiguous:
                reason = "receipt_history_ambiguous"
            elif len(history) < MINIMUM_EVENTS:
                reason = "receipt_history_insufficient"
            else:
                lag = weighted_median_delay(history)
                try:
                    stamp = (day(due) + timedelta(days=lag)).isoformat()
                except (ValueError, OverflowError):
                    reason = "receipt_date_out_of_range"
                timing_basis = "amount_weighted_median_delay"
                assumptions.append(
                    {
                        "key": key,
                        "invoice_ref": reference,
                        "expected_date": stamp,
                        "basis": timing_basis,
                        "history_event_count": len(history),
                        "delay_days": lag,
                        "history_event_ids": [row["event_id"] for row in history],
                        "history_allocation_ids": sorted(
                            {identity for row in history for identity in row["allocation_ids"]}
                        ),
                    }
                )
        else:
            stamp = due
            timing_basis = "invoice_or_plan_due_date"
            if not stamp:
                reason = "payment_date_missing"
        if stamp and day(stamp) <= as_of:
            reason = "receipt_estimate_in_past" if direction == "receipt" else "payment_estimate_in_past"
        if reason:
            ask(
                key,
                "زمان مورد انتظار وصول؟" if direction == "receipt" else "زمان مورد انتظار پرداخت؟",
                reason,
                value,
                reference,
            )
            return
        require(stamp is not None, "forecast_date_missing", "تاریخ پیش‌بینی مشخص نیست.", 409)
        events.append(
            {
                "event_id": key,
                "obligation_id": reference,
                "date": stamp,
                "direction": direction,
                "amount": value,
                "basis": timing_basis,
                "evidence_refs": [key],
            }
        )

    for invoice in snapshot["invoices"]:
        key = "native-invoice:" + invoice["id"]
        if invoice.get("remaining") is None:
            unavailable.append(
                {
                    "key": key,
                    "reason_code": "native_invoice_balance_unavailable",
                    "reason": invoice.get("reason"),
                }
            )
            continue
        if Decimal(invoice["remaining"]) <= 0:
            continue
        expected(
            key,
            "receipt" if invoice["direction"] == "sale" else "payment",
            invoice["remaining"],
            invoice.get("terms") or {},
            invoice["reference"],
            invoice["party_id"],
        )
    for plan in snapshot["manual_plans"]:
        key = "manual-plan:" + plan["id"]
        if plan.get("invoice_reference") or any(
            invoice["reference"] == plan["obligation_id"] for invoice in snapshot["invoices"]
        ):
            link_key = "manual-plan-link:" + plan["id"]
            link_answer = answers.get(link_key, {}).get("choice")
            if not link_answer:
                ask(
                    link_key,
                    "این برنامه پرداخت در مبلغ فاکتور منظور شده است؟",
                    "manual_plan_invoice_link_unverified",
                    plan["amount"],
                    plan["label"],
                )
                questions[-1]["kind"] = "choice"
                continue
            if link_answer == "covered_by_invoice":
                continue
            if link_answer == "unknown":
                unavailable.append({"key": key, "reason_code": "manual_plan_invoice_link_unknown"})
                continue
        expected(key, "payment", plan["amount"], {"due_date": plan["due_date"]}, plan["label"])
    return {"questions": questions, "events": events, "assumptions": assumptions, "unavailable": unavailable}
