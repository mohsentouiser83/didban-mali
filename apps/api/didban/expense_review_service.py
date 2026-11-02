"""Comparative expense changes are evidence, not calibrated anomaly/fraud scores."""

from collections import defaultdict
from decimal import Decimal, localcontext
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .finance import EXPENSE_ROLES, NON_FLOW_ENTRIES, text_amount
from .services import get_entity


def _expense_metric(manifest: m.ResultManifest) -> dict | None:
    return next((metric for metric in manifest.metrics if metric.get("metric_key") == "expense"), None)


def _scope(manifest: m.ResultManifest) -> tuple | None:
    metric = _expense_metric(manifest)
    if not metric or metric.get("status") != "available" or metric.get("value") is None:
        return None
    coverage = manifest.selection.get("coverage", {})
    if coverage.get("ledger_complete") is not True:
        return None
    if metric.get("basis") != "ledger" or metric.get("scope") != "company" or metric.get("unit") != "IRR":
        return None
    return ("ledger", "company", metric.get("unit", "IRR"))


def _accounts(db: Session, company: str, manifest: m.ResultManifest, period: m.Period) -> dict[str, dict]:
    buckets: dict[str, dict] = defaultdict(lambda: {"amount": Decimal(0), "evidence_refs": []})
    ids = manifest.selection.get("row_ids", [])
    for offset in range(0, len(ids), 500):
        for row in db.scalars(
            select(m.JournalLine).where(
                m.JournalLine.company_id == company,
                m.JournalLine.source_row_id.in_(ids[offset : offset + 500]),
                m.JournalLine.date >= period.start,
                m.JournalLine.date <= period.end,
            )
        ):
            if row.role not in EXPENSE_ROLES or row.entry_type in NON_FLOW_ENTRIES:
                continue
            buckets[row.account]["amount"] += Decimal(row.debit) - Decimal(row.credit)
            buckets[row.account]["evidence_refs"].append(row.source_row_id)
    return dict(buckets)


def compare(db: Session, company: str, manifest_id: str) -> dict[str, Any]:
    current = get_entity(db, m.ResultManifest, company, manifest_id)
    period = get_entity(db, m.Period, company, current.period_id)
    base = {
        "manifest_id": current.id,
        "previous_manifest_id": None,
        "current_period": {
            "name": period.name,
            "start": period.start.isoformat(),
            "end": period.end.isoformat(),
        },
        "previous_period": None,
        "basis": "ledger",
        "unit": "IRR",
        "status": "unavailable",
        "reason": None,
        "current_total": None,
        "previous_total": None,
        "difference": None,
        "rows": [],
        "risk_assessment": "not_calibrated",
    }
    if _scope(current) is None:
        return base | {"reason": "پوشش معتبر و کامل دفتر این دوره برای مقایسه موجود نیست."}
    base["current_total"] = str(_expense_metric(current)["value"])
    if not period.previous_period_id:
        return base | {"reason": "دورهٔ قبل برای این دوره تعیین نشده است."}
    previous_period = get_entity(db, m.Period, company, period.previous_period_id)
    base["previous_period"] = {
        "name": previous_period.name,
        "start": previous_period.start.isoformat(),
        "end": previous_period.end.isoformat(),
    }
    pinned = current.selection.get("comparison_manifest_id")
    if pinned:
        previous = db.scalar(
            select(m.ResultManifest).where(
                m.ResultManifest.company_id == company,
                m.ResultManifest.id == pinned,
                m.ResultManifest.period_id == previous_period.id,
                m.ResultManifest.created_at <= current.created_at,
            )
        )
    else:
        previous = db.scalar(
            select(m.ResultManifest)
            .where(
                m.ResultManifest.company_id == company,
                m.ResultManifest.period_id == previous_period.id,
                m.ResultManifest.created_at <= current.created_at,
            )
            .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
            .limit(1)
        )
    if previous is None:
        return base | {"reason": "گزارش معتبر دورهٔ قبل در مبنای این نسخه موجود نیست."}
    base["previous_manifest_id"] = previous.id
    if _scope(previous) != _scope(current):
        return base | {"reason": "پوشش یا مبنای دفتر دو دوره قابل مقایسه نیست."}
    with localcontext() as context:
        context.prec = 60
        now = _accounts(db, company, current, period)
        before = _accounts(db, company, previous, previous_period)
        # Completeness permits account absence to mean zero; this is never done
        # for a missing period/report/coverage.
        total_now = sum((row["amount"] for row in now.values()), Decimal(0))
        total_before = sum((row["amount"] for row in before.values()), Decimal(0))
        if total_now != Decimal(str(_expense_metric(current)["value"])) or total_before != Decimal(
            str(_expense_metric(previous)["value"])
        ):
            return base | {"reason": "جمع ردیف‌های منتخب با هزینهٔ گزارش سازگار نیست."}
        rows = []
        for account in set(now) | set(before):
            left = now.get(account, {}).get("amount", Decimal(0))
            right = before.get(account, {}).get("amount", Decimal(0))
            change = left - right
            rows.append(
                {
                    "account": account,
                    "current": text_amount(left),
                    "previous": text_amount(right),
                    "difference": text_amount(change),
                    "percent": text_amount(change / abs(right) * 100) if right else None,
                    "percent_reason": "هزینهٔ دورهٔ قبل صفر است." if not right else None,
                    "current_evidence_refs": now.get(account, {}).get("evidence_refs", []),
                    "previous_evidence_refs": before.get(account, {}).get("evidence_refs", []),
                }
            )
        rows.sort(key=lambda row: (abs(Decimal(row["difference"])), row["account"]), reverse=True)
        return base | {
            "status": "available",
            "previous_total": text_amount(total_before),
            "difference": text_amount(total_now - total_before),
            "rows": rows,
        }
