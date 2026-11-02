"""Saved revisions and evidence-limited forecast evaluation; no ledger writes."""

from decimal import Decimal, localcontext
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .finance import _account_balance, day
from .money_type import canonical_money
from .scenario_engine import freeze, simulate
from .scenario_models import CashScenario
from .services import get_entity
from .workflow import audit, records_for, serialize_fact


def baseline(db: Session, company: str, manifest_id: str) -> dict:
    return freeze(get_entity(db, m.ResultManifest, company, manifest_id))


def save(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
    item_id: str | None = None,
    version: int | None = None,
) -> dict:
    previous = get_entity(db, CashScenario, company, item_id) if item_id else None
    if previous:
        latest = db.scalar(
            select(func.max(CashScenario.version)).where(
                CashScenario.company_id == company, CashScenario.series_id == previous.series_id
            )
        )
        require(
            version == previous.version == latest,
            "version_conflict",
            "سناریو تغییر کرده؛ نسخه تازه را باز کنید.",
            409,
        )
        require(
            data["manifest_id"] == previous.manifest_id,
            "baseline_immutable",
            "مبنای سناریو قابل تغییر نیست؛ سناریوی تازه بسازید.",
            409,
        )
        frozen = previous.baseline
    else:
        frozen = baseline(db, company, data["manifest_id"])
    changes = {key: data[key] for key in ("shifts", "hypothetical")}
    comparison = simulate(frozen, changes)
    item = CashScenario(
        company_id=company,
        series_id=previous.series_id if previous else m.uid(),
        version=previous.version + 1 if previous else 1,
        name=data["name"],
        manifest_id=data["manifest_id"],
        actor_id=user.id,
        baseline=frozen,
        changes=changes,
        comparison=comparison,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "cash_scenario.revised" if previous else "cash_scenario.created",
        item.id,
        {"series_id": item.series_id, "version": item.version, "manifest_id": item.manifest_id},
    )
    return serialize_fact(item)


def listing(db: Session, company: str, limit: int = 25, cursor: str | None = None) -> dict:
    from .http import paginate

    # Every row is an immutable revision; list revisions explicitly rather than
    # silently replacing old assumptions or reports.
    return paginate(db, CashScenario, company, limit, cursor)


def evaluate(db: Session, company: str, item_id: str, actual_manifest_id: str) -> dict[str, Any]:
    item = get_entity(db, CashScenario, company, item_id)
    actual = get_entity(db, m.ResultManifest, company, actual_manifest_id)
    frozen = item.baseline
    unavailable = {
        "status": "unavailable",
        "actual_manifest_id": actual.id,
        "baseline_manifest_id": item.manifest_id,
        "closing_error": None,
        "mean_absolute_balance_error": None,
        "days": [],
    }
    coverage = actual.details.get("coverage", actual.selection.get("coverage", {}))
    end = frozen["end"]
    actual_end = actual.details.get("as_of_date") or actual.details.get("period", {}).get("end")
    if not actual_end or day(actual_end) < day(end):
        return unavailable | {
            "reason": "گردش واقعی تا پایان افق موجود نیست.",
            "reason_code": "actual_horizon_incomplete",
        }
    accounts = frozen.get("accounts", [])
    actual_accounts = sorted(row["account"] for row in actual.details.get("bank_balances", []))
    if not accounts or accounts != actual_accounts or coverage.get("bank_complete") is not True:
        return unavailable | {
            "reason": "حساب‌ها یا پوشش گردش بانک با مبنا یکسان نیست.",
            "reason_code": "bank_scope_incomparable",
        }
    records = records_for(db, company, actual.selection["row_ids"])["bank"]
    refs = set()

    def balance_on(target):
        with localcontext() as context:
            context.prec = 60
            total = Decimal(0)
            for account in accounts:
                value, _reason, evidence = _account_balance(
                    [row for row in records if row["account"] == account], target, coverage, account
                )
                if value is None:
                    return None
                total += value
                refs.update(evidence)
            return total

    opening = balance_on(day(frozen["as_of_date"]))
    if opening is None or opening != Decimal(frozen["opening"]):
        return unavailable | {
            "reason": "مانده و تاریخ برش مبنا با شواهد جدید قابل تطبیق نیست.",
            "reason_code": "opening_incomparable",
        }
    predicted = item.comparison["baseline"]["days"]
    comparisons = []
    with localcontext() as context:
        context.prec = 60
        total_error = Decimal(0)
        for row in predicted:
            value = balance_on(day(row["date"]))
            if value is None:
                return unavailable | {
                    "reason": "مانده واقعی برخی روزها قابل محاسبه نیست.",
                    "reason_code": "actual_balance_unavailable",
                }
            difference = value - Decimal(row["balance"])
            total_error += abs(difference)
            comparisons.append(
                {
                    "date": row["date"],
                    "predicted": row["balance"],
                    "actual": canonical_money(value),
                    "error": canonical_money(difference),
                }
            )
        # Keep the exact rational average: do not silently round a repeating value.
        average = {"numerator": canonical_money(total_error), "denominator": len(comparisons)}
    return {
        "status": "available",
        "actual_manifest_id": actual.id,
        "baseline_manifest_id": item.manifest_id,
        "closing_error": comparisons[-1]["error"],
        "mean_absolute_balance_error": average,
        "days": comparisons,
        "evidence_refs": sorted(refs),
        "reason": None,
    }
