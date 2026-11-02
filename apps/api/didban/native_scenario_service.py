"""Manual native scenarios do not infer payment dates or create financial effects."""

from copy import deepcopy
from datetime import timedelta
from decimal import Decimal, InvalidOperation, localcontext

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as m
from .errors import DomainError, require
from .finance import day
from .native_reporting_models import NativeStatementRun
from .native_scenario_models import NativeCashScenario
from .posting_service import _aggregate
from .scenario_engine import simulate
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _cash(report: NativeStatementRun) -> str:
    cash = next(
        (
            metric
            for metric in report.snapshot.get("metrics", [])
            if metric.get("metric_key") == "bank_balance"
        ),
        None,
    )
    require(
        cash is not None
        and cash.get("value") is not None
        and cash.get("status") == "available"
        and report.snapshot.get("opening_evidence", {}).get("status") == "available",
        "native_scenario_cash_unavailable",
        "برای سناریو، گزارش ثابت با ماندهٔ نقد معتبر ذخیره کنید.",
        409,
    )
    try:
        require(
            isinstance(cash["value"], str), "native_scenario_cash_invalid", "مبلغ نقد مبنا معتبر نیست.", 409
        )
        value = Decimal(cash["value"])
        require(
            value.is_finite() and value.as_tuple().exponent >= -6 and value.copy_abs() < Decimal("1e50"),
            "native_scenario_cash_invalid",
            "مبلغ نقد مبنا خارج از ظرفیت محاسبه است.",
            409,
        )
    except (TypeError, ValueError, InvalidOperation) as error:
        raise DomainError("native_scenario_cash_invalid", "مبلغ نقد مبنا معتبر نیست.", 409) from error
    return _aggregate(value)


def baseline(db: Session, company: str, user: m.User, statement_id: str, horizon_days: int = 30) -> dict:
    membership(db, company, user)
    require(1 <= horizon_days <= 366, "scenario_horizon_invalid", "افق سناریو باید بین ۱ تا ۳۶۶ روز باشد.")
    report = get_entity(db, NativeStatementRun, company, statement_id)
    opening = _cash(report)
    require(
        report.snapshot.get("basis") == "native_book",
        "native_scenario_basis_invalid",
        "مبنای گزارش باید دفتر اصلی دیدبان باشد.",
        409,
    )
    try:
        stamp = day(report.snapshot["as_of"])
    except (KeyError, TypeError, ValueError) as error:
        raise DomainError("native_scenario_date_invalid", "تاریخ مبنای گزارش مشخص نیست.", 409) from error
    return {
        "source_type": "native_statement",
        "native_statement_id": report.id,
        "source_digest": report.digest,
        "as_of_date": stamp.isoformat(),
        "start": (stamp + timedelta(days=1)).isoformat(),
        "end": (stamp + timedelta(days=horizon_days)).isoformat(),
        "horizon_days": horizon_days,
        "opening": opening,
        "events": [],
        "assumptions": [],
        "policy_version": "native-manual-cash-scenario-1",
        "bank_scope": [
            {"account_id": role["account_id"], "assignment_version": role["assignment_version"]}
            for role in report.snapshot.get("role_assignments", [])
            if role.get("role") == "bank"
        ],
        "evidence_refs": ["native-statement:" + report.id],
        "receipt_dates_inferred": False,
        "baseline_kind": "no_new_flows",
        "financial_effect": False,
    }


def forecast_baseline(db: Session, company: str, user: m.User, forecast_id: str) -> dict:
    from .native_forecast_models import NativeForecastRun

    membership(db, company, user)
    run = get_entity(db, NativeForecastRun, company, forecast_id)
    source = run.snapshot
    return {
        "source_type": "native_forecast",
        "forecast_run_id": run.id,
        "forecast_digest": run.digest,
        "native_statement_id": run.native_statement_id,
        "source_digest": source["cash_digest"],
        "as_of_date": source["as_of"],
        "start": source["start"],
        "end": source["end"],
        "horizon_days": 30,
        "opening": source["opening"],
        "events": deepcopy(source["events"]),
        "assumptions": deepcopy(source["assumptions"]),
        "policy_version": source["policy_version"],
        "bank_scope": [
            {"account_id": row["account_id"], "assignment_version": row["assignment_version"]}
            for row in source["bank_scope"]
        ],
        "evidence_refs": ["native-forecast:" + run.id, "native-statement:" + run.native_statement_id],
        "source_status": source["status"],
        "reason_codes": source["reason_codes"],
        "receipt_dates_inferred": False,
        "baseline_kind": "native_invoice_forecast",
        "financial_effect": False,
    }


def public_scenario(item: NativeCashScenario) -> dict:
    result = serialize_fact(item)
    if item.comparison.get("status") == "limited":
        from .native_forecast_scope import projection

        result = result | {
            "comparison_projection": {
                "projection_scope": "known_dated_flows",
                "closing_difference": None,
                "known_dated_closing_difference": item.comparison.get(
                    "known_dated_closing_difference", item.comparison.get("closing_difference")
                ),
                **{
                    key: projection(item.comparison[key] | {"status": "limited"})
                    for key in ("baseline", "scenario")
                },
            }
        }
    return result


def save(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
    item_id: str | None = None,
    version: int | None = None,
) -> dict:
    membership(db, company, user, "write")
    previous = get_entity(db, NativeCashScenario, company, item_id) if item_id else None
    if previous:
        latest = db.scalar(
            select(func.max(NativeCashScenario.version)).where(
                NativeCashScenario.company_id == company, NativeCashScenario.series_id == previous.series_id
            )
        )
        require(
            version == previous.version == latest,
            "version_conflict",
            "نسخهٔ سناریو تغییر کرده؛ تازه کنید.",
            409,
        )
        require(
            data["native_statement_id"] == previous.native_statement_id
            and data["horizon_days"] == previous.baseline["horizon_days"]
            and data.get("forecast_run_id") == previous.baseline.get("forecast_run_id"),
            "baseline_immutable",
            "مبنای نسخه ثابت است؛ برای تغییر مبنا سناریوی تازه بسازید.",
            409,
        )
        frozen = deepcopy(previous.baseline)
    else:
        frozen = (
            forecast_baseline(db, company, user, data["forecast_run_id"])
            if data.get("forecast_run_id")
            else baseline(db, company, user, data["native_statement_id"], data["horizon_days"])
        )
        require(
            frozen["native_statement_id"] == data["native_statement_id"]
            and frozen["horizon_days"] == data["horizon_days"],
            "baseline_immutable",
            "گزارش و افق باید با پیش‌بینی مبنا یکسان باشند.",
            409,
        )
    changes = {"shifts": data.get("shifts", []), "hypothetical": data["hypothetical"]}
    result = simulate(frozen, changes)
    if frozen.get("source_status") == "limited":
        from .native_forecast_scope import scoped_path

        result["status"] = "limited"
        result["projection_scope"] = "known_dated_flows"
        result["baseline"] = scoped_path(result["baseline"], True)
        result["scenario"] = scoped_path(result["scenario"], True)
        result["known_dated_closing_difference"] = result["closing_difference"]
        result["closing_difference"] = None
    item = NativeCashScenario(
        company_id=company,
        series_id=previous.series_id if previous else m.uid(),
        version=previous.version + 1 if previous else 1,
        name=data["name"],
        native_statement_id=data["native_statement_id"],
        actor_id=user.id,
        baseline=frozen,
        changes=changes,
        comparison=result,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "cash_scenario.native_revised" if previous else "cash_scenario.native_created",
        item.id,
        {
            "series_id": item.series_id,
            "version": item.version,
            "native_statement_id": item.native_statement_id,
            "financial_effect": False,
        },
    )
    return public_scenario(item)


def evaluate(db: Session, company: str, user: m.User, item_id: str, actual_statement_id: str) -> dict:
    membership(db, company, user)
    item = get_entity(db, NativeCashScenario, company, item_id)
    actual = get_entity(db, NativeStatementRun, company, actual_statement_id)
    result = {
        "status": "unavailable",
        "baseline_native_statement_id": item.native_statement_id,
        "actual_native_statement_id": actual.id,
        "closing_error": None,
        "baseline_closing_error": None,
        "actual_closing": None,
        "comparison_scope": "closing_only",
        "actual_as_of": actual.snapshot.get("as_of"),
        "evidence_refs": ["native-statement:" + item.native_statement_id, "native-statement:" + actual.id],
        "days": [],
    }
    if item.baseline.get("source_status") == "limited":
        return result | {
            "reason_code": "limited_forecast",
            "reason": "زمان یا پوشش پیش‌بینی مبنا کامل نیست؛ سنجش کامل ممکن نیست.",
        }
    if actual.snapshot.get("as_of") != item.baseline["end"]:
        return result | {
            "reason_code": "actual_date_mismatch",
            "reason": "گزارش واقعی باید دقیقاً در پایان افق سناریو باشد.",
        }
    try:
        actual_cash = _cash(actual)
    except DomainError:
        return result | {
            "reason_code": "actual_cash_unavailable",
            "reason": "ماندهٔ نقد در گزارش واقعی معتبر نیست.",
        }
    actual_scope = [
        {"account_id": role["account_id"], "assignment_version": role["assignment_version"]}
        for role in actual.snapshot.get("role_assignments", [])
        if role.get("role") == "bank"
    ]
    if not item.baseline["bank_scope"] or actual_scope != item.baseline["bank_scope"]:
        return result | {
            "reason_code": "native_bank_scope_incomparable",
            "reason": "حساب‌های بانک یا نقش آن‌ها با مبنا یکسان نیستند.",
        }
    with localcontext() as context:
        context.prec = 60
        difference = _aggregate(Decimal(actual_cash) - Decimal(item.comparison["scenario"]["closing"]))
        base_difference = _aggregate(Decimal(actual_cash) - Decimal(item.comparison["baseline"]["closing"]))
    return result | {
        "status": "available",
        "reason": None,
        "reason_code": None,
        "actual_closing": actual_cash,
        "closing_error": difference,
        "baseline_closing_error": base_difference,
        "evidence_refs": ["native-statement:" + item.native_statement_id, "native-statement:" + actual.id],
    }
