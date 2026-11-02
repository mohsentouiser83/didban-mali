"""D09 native forecasts: pinned cash, invoice terms, actual events and human answers."""

import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .finance import day
from .forecast_planning import POLICY_VERSION
from .native_forecast_evaluation import evaluate as evaluate
from .native_forecast_models import NativeForecastPlan, NativeForecastRun
from .native_forecast_planning import prepare as prepare
from .native_forecast_planning import today
from .native_forecast_scope import projection
from .native_reporting_models import NativeStatementRun
from .native_scenario_service import _cash
from .scenario_engine import path
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _digest(value: dict) -> str:
    return sha256(
        json.dumps(
            jsonable_encoder(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
    ).hexdigest()


def _require_cash_current(db: Session, company: str, user: m.User, report: NativeStatementRun) -> None:
    from .native_period_readiness import _source_signature
    from .native_reporting_service import build_statement

    snapshot = report.snapshot
    live = build_statement(db, company, user, snapshot["period_id"], day(snapshot["as_of"]))
    require(
        _source_signature(live) == _source_signature(snapshot),
        "native_forecast_cash_stale",
        "مبنای ماندهٔ نقد تغییر کرده؛ گزارش مالی تازه ذخیره کنید.",
        409,
    )


def _capture(db: Session, company: str, user: m.User, statement_id: str) -> dict:
    from .native_invoice_service import current, receipt_history

    report = get_entity(db, NativeStatementRun, company, statement_id)
    opening = _cash(report)
    as_of = day(report.snapshot["as_of"])
    require(as_of <= today(), "native_forecast_future_as_of", "تاریخ گزارش مبنا نباید در آینده باشد.", 409)
    _require_cash_current(db, company, user, report)
    invoices = current(db, company, user, as_of)["items"]
    parties = sorted({item["party_id"] for item in invoices if item["direction"] == "sale"})
    histories = {party: receipt_history(db, company, user, party, as_of) for party in parties}
    plans = [
        serialize_fact(row)
        for row in db.scalars(
            select(m.PlannedPayment)
            .where(
                m.PlannedPayment.company_id == company,
                m.PlannedPayment.state == "confirmed",
                m.PlannedPayment.source_row_id.is_(None),
                m.PlannedPayment.session_id.is_(None),
            )
            .order_by(m.PlannedPayment.id)
        )
    ]
    return jsonable_encoder(
        {
            "native_statement_id": report.id,
            "cash_digest": report.digest,
            "as_of": as_of,
            "start": as_of + timedelta(days=1),
            "end": as_of + timedelta(days=30),
            "opening": opening,
            "bank_scope": [
                row for row in report.snapshot.get("role_assignments", []) if row["role"] == "bank"
            ],
            "invoices": invoices,
            "receipt_history": histories,
            "manual_plans": plans,
            "basis": "native_book",
            "policy_version": POLICY_VERSION,
        },
        custom_encoder={datetime: lambda stamp: stamp.replace(tzinfo=timezone.utc).isoformat()},
    )


def public_run(run: NativeForecastRun) -> dict:
    # Stored snapshots and their original digest remain untouched, including legacy limited runs.
    return serialize_fact(run) | {"projection": projection(run.snapshot)}


def public(db: Session, company: str, user: m.User, item: NativeForecastPlan) -> dict:
    membership(db, company, user)
    require(item.company_id == company, "not_found", "برنامه پیدا نشد.", 404)
    require(
        _digest(item.snapshot) == item.source_digest,
        "native_forecast_snapshot_changed",
        "مبنای برنامه تغییر کرده؛ برنامهٔ تازه بسازید.",
        409,
    )
    prepared = prepare(item.snapshot, item.answers)
    return serialize_fact(item) | {
        "questions": prepared["questions"],
        "forecast": public_run(get_entity(db, NativeForecastRun, company, item.forecast_run_id))
        if item.forecast_run_id
        else None,
    }


def _finish(db: Session, company: str, user: m.User, plan: NativeForecastPlan) -> None:
    require(
        _digest(plan.snapshot) == plan.source_digest,
        "native_forecast_snapshot_changed",
        "مبنای برنامه تغییر کرده؛ برنامهٔ تازه بسازید.",
        409,
    )
    prepared = prepare(plan.snapshot, plan.answers)
    if prepared["questions"]:
        return
    baseline = {key: plan.snapshot[key] for key in ("start", "end", "opening")} | {
        "as_of_date": plan.snapshot["as_of"]
    }
    result = path(baseline, prepared["events"])
    reasons = sorted({row["reason_code"] for row in prepared["unavailable"]})
    if not plan.obligations_complete:
        reasons.append("future_obligations_not_declared_complete")
    snapshot = deepcopy(plan.snapshot) | {
        "source_type": "native_forecast",
        "as_of_date": plan.snapshot["as_of"],
        "native_statement_id": plan.native_statement_id,
        "source_digest": plan.source_digest,
        "answers": plan.answers,
        "events": prepared["events"],
        "assumptions": prepared["assumptions"],
        "unavailable": prepared["unavailable"],
        "obligations_complete": plan.obligations_complete,
        "status": "limited" if reasons else "estimated",
        "reason_codes": reasons,
        "financial_effect": False,
        "receipt_dates_inferred_from_journal": False,
        **result,
    }
    snapshot.update(projection(snapshot))
    run = NativeForecastRun(
        company_id=company,
        plan_id=plan.id,
        native_statement_id=plan.native_statement_id,
        actor_id=user.id,
        snapshot=snapshot,
        digest=_digest(snapshot),
    )
    db.add(run)
    db.flush()
    plan.state = "completed_limited" if reasons else "completed"
    plan.forecast_run_id = run.id
    audit(
        db,
        company,
        user.id,
        "native_forecast.published",
        run.id,
        {"plan_id": plan.id, "digest": run.digest, "source_digest": plan.source_digest},
    )


def create(db: Session, company: str, user: m.User, statement_id: str, complete: bool) -> dict:
    membership(db, company, user, "write")
    snapshot = _capture(db, company, user, statement_id)
    plan = NativeForecastPlan(
        company_id=company,
        native_statement_id=statement_id,
        actor_id=user.id,
        source_digest=_digest(snapshot),
        snapshot=snapshot,
        answers={},
        obligations_complete=complete,
    )
    db.add(plan)
    db.flush()
    _finish(db, company, user, plan)
    audit(
        db,
        company,
        user.id,
        "native_forecast.plan_created",
        plan.id,
        {"source_digest": plan.source_digest, "obligations_complete": complete},
    )
    return public(db, company, user, plan)


def answer(db: Session, company: str, user: m.User, plan_id: str, version: int, data: dict) -> dict:
    membership(db, company, user, "write")
    plan = get_entity(db, NativeForecastPlan, company, plan_id)
    require(plan.version == version, "version_conflict", "نسخهٔ برنامه تغییر کرده؛ تازه کنید.", 409)
    require(
        plan.state == "waiting_input",
        "native_forecast_plan_complete",
        "این پیش‌بینی منتشر شده است؛ برنامهٔ تازه بسازید.",
        409,
    )
    require(
        _digest(_capture(db, company, user, plan.native_statement_id)) == plan.source_digest,
        "native_forecast_source_changed",
        "فاکتور، برنامه پرداخت یا تخصیص تغییر کرده؛ برنامهٔ تازه بسازید.",
        409,
    )
    question = next(
        (
            row
            for row in prepare(plan.snapshot, plan.answers)["questions"]
            if row["id"] == data["question_id"]
        ),
        None,
    )
    require(
        question is not None, "native_forecast_question_changed", "پرسش معتبر نیست؛ برنامه را تازه کنید.", 409
    )
    expected = data.get("expected_date")
    choice = data.get("choice")
    require(
        (bool(choice) and not data["unknown"] and expected is None)
        if question.get("kind") == "choice"
        else (not choice and data["unknown"] != (expected is not None)),
        "forecast_answer_invalid",
        "پاسخ با نوع پرسش یکسان نیست.",
    )
    require(
        expected is None or day(expected) > day(plan.snapshot["as_of"]),
        "forecast_answer_past",
        "تاریخ مورد انتظار باید پس از تاریخ مبنا باشد.",
    )
    decision = jsonable_encoder(
        {
            "question_id": question["id"],
            "unknown": data["unknown"],
            "expected_date": expected,
            "choice": choice,
            "actor_id": user.id,
            "answered_at": m.now(),
            "plan_version": plan.version,
            "source_digest": plan.source_digest,
        }
    )
    plan.answers = {**plan.answers, question["key"]: decision}
    plan.version += 1
    audit(db, company, user.id, "native_forecast.answer_submitted", plan.id, decision)
    _finish(db, company, user, plan)
    return public(db, company, user, plan)
