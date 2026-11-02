"""Score only elapsed, complete horizons with the same cash-account evidence scope."""

from datetime import timezone
from decimal import Decimal, localcontext
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .finance import day
from .money_type import aggregate_money
from .native_forecast_models import NativeForecastRun
from .native_forecast_planning import today
from .native_reporting_models import NativeStatementRun
from .native_scenario_service import _cash
from .scenario_engine import path
from .security import membership
from .services import get_entity


def evaluate(db: Session, company: str, user: m.User, run_id: str, actual_statement_id: str) -> dict:
    """Daily bank-role net movements only when exact source range and opening reconcile."""
    from .posting_models import NativeJournal

    membership(db, company, user)
    run = get_entity(db, NativeForecastRun, company, run_id)
    actual = get_entity(db, NativeStatementRun, company, actual_statement_id)
    forecast = run.snapshot
    created_day = run.created_at.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Asia/Tehran")).date()
    out_of_sample = created_day <= day(forecast["as_of"])
    result = {
        "timing_basis": "out_of_sample" if out_of_sample else "retrospective",
        "out_of_sample": out_of_sample,
        "status": "unavailable",
        "forecast_run_id": run.id,
        "actual_native_statement_id": actual.id,
        "closing_error": None,
        "days": [],
        "mean_absolute_balance_error": None,
        "evidence_refs": ["native-forecast:" + run.id, "native-statement:" + actual.id],
    }

    def unavailable(code: str, reason: str):
        return result | {"reason_code": code, "reason": reason}

    if forecast["status"] != "estimated":
        return unavailable("limited_forecast", "زمان یا پوشش پیش‌بینی کامل نیست؛ سنجش کل مسیر ممکن نیست.")
    if day(forecast["end"]) > today():
        return unavailable("forecast_horizon_not_elapsed", "افق پیش‌بینی هنوز پایان نیافته است.")
    if actual.snapshot["as_of"] != forecast["end"]:
        return unavailable("actual_date_mismatch", "گزارش واقعی باید دقیقاً در پایان افق باشد.")
    if day(actual.snapshot["period"]["start"]) > day(forecast["start"]):
        return unavailable("actual_range_incomplete", "گزارش واقعی تمام روزهای افق را پوشش نمی‌دهد.")
    from .errors import DomainError

    try:
        closing = _cash(actual)
    except DomainError:
        return unavailable("actual_cash_unavailable", "ماندهٔ نقد گزارش واقعی معتبر نیست.")
    bank_scope = [row for row in actual.snapshot.get("role_assignments", []) if row["role"] == "bank"]
    if bank_scope != forecast["bank_scope"] or not bank_scope:
        return unavailable("bank_scope_changed", "حساب‌های بانک و نسخهٔ نقش آن‌ها با مبنا یکسان نیستند.")
    bank_ids = {row["account_id"] for row in bank_scope}
    ids = actual.snapshot["journal_ids"]
    journals = []
    for offset in range(0, len(ids), 500):
        journals.extend(
            db.scalars(
                select(NativeJournal).where(
                    NativeJournal.company_id == company, NativeJournal.id.in_(ids[offset : offset + 500])
                )
            )
        )
    require(len(journals) == len(ids), "native_journal_missing", "شواهد گزارش واقعی کامل نیست.", 409)
    cash_events = []
    refs = []
    with localcontext() as context:
        context.prec = 60
        for journal in journals:
            if not day(forecast["start"]) <= journal.date <= day(forecast["end"]):
                continue
            value = sum(
                (
                    Decimal(line["debit"]) - Decimal(line["credit"])
                    for line in journal.snapshot["lines"]
                    if line["account_id"] in bank_ids
                ),
                Decimal(0),
            )
            if value:
                cash_events.append(
                    {
                        "event_id": journal.id,
                        "date": journal.date.isoformat(),
                        "amount": aggregate_money(abs(value)),
                        "direction": "receipt" if value > 0 else "payment",
                    }
                )
                refs.append({"journal_id": journal.id, "journal_digest": journal.digest})
        observed = path(
            {
                "start": forecast["start"],
                "end": forecast["end"],
                "opening": forecast["opening"],
                "as_of_date": forecast["as_of"],
            },
            cash_events,
        )
        if Decimal(observed["closing"]) != Decimal(closing):
            return unavailable(
                "actual_opening_or_source_mismatch", "ماندهٔ واقعی با افتتاحیه و گردش کامل افق سازگار نیست."
            )
        days = [
            {
                "date": predicted["date"],
                "predicted": predicted["balance"],
                "actual": real["balance"],
                "error": aggregate_money(Decimal(real["balance"]) - Decimal(predicted["balance"])),
            }
            for predicted, real in zip(forecast["days"], observed["days"], strict=True)
        ]
        error = aggregate_money(Decimal(closing) - Decimal(forecast["closing"]))
        mass = aggregate_money(sum((abs(Decimal(row["error"])) for row in days), Decimal(0)))
    return result | {
        "status": "available",
        "reason": None,
        "reason_code": None,
        "closing_error": error,
        "days": days,
        "mean_absolute_balance_error": {"numerator": mass, "denominator": len(days)},
        "actual_receipts_payments": cash_events,
        "actual_journal_refs": refs,
        "comparison_scope": "same_bank_roles_complete_horizon",
    }
