"""Explicit source-backed attribution with preserved totals and unassigned scope."""

from datetime import date
from decimal import Decimal, localcontext
from types import SimpleNamespace
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .dimensions_models import (
    Dimension,
    DimensionAllocation,
    DimensionReportRun,
    NativeDimensionAllocation,
    NativeDimensionReportRun,
)
from .errors import require
from .finance import EXPENSE_ROLES, NON_FLOW_ENTRIES, REVENUE_ROLES, text_amount
from .money_type import canonical_money
from .native_ledger_source import statement_source
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def save_dimension(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
    identifier: str | None = None,
    version: int | None = None,
) -> dict:
    membership(db, company, user, "write")
    item = get_entity(db, Dimension, company, identifier) if identifier else Dimension(company_id=company)
    if identifier:
        check_version(item, version)
        require(item.kind == data["kind"], "dimension_kind_immutable", "نوع بُعد قابل تغییر نیست.", 409)
        item.version += 1
    for key, value in data.items():
        setattr(item, key, value)
    db.add(item)
    db.flush()
    audit(db, company, user.id, "dimension.saved", item.id, {"version": item.version, "active": item.active})
    return serialize_fact(item)


def selected_lines(
    db: Session, company: str, manifest_id: str | None, native_statement_id: str | None = None
) -> tuple[Any, list[Any]]:
    require(bool(manifest_id) != bool(native_statement_id), "dimension_source", "فقط یک منبع انتخاب کنید.")
    if native_statement_id:
        source = statement_source(db, company, native_statement_id)
        proxy = SimpleNamespace(
            id=native_statement_id,
            period_id=source["snapshot"]["period_id"],
            metrics=source["metrics"],
            native_source=source,
        )
        return proxy, [
            line
            for line in source["rows"]
            if line.role in REVENUE_ROLES | EXPENSE_ROLES and line.entry_type not in NON_FLOW_ENTRIES
        ]
    manifest = get_entity(db, m.ResultManifest, company, manifest_id)
    period = get_entity(db, m.Period, company, manifest.period_id)
    lines = list(
        db.scalars(
            select(m.JournalLine).where(
                m.JournalLine.company_id == company,
                m.JournalLine.source_row_id.in_(manifest.selection.get("row_ids", [])),
                m.JournalLine.date >= period.start,
                m.JournalLine.date <= period.end,
            )
        )
    )
    return manifest, [
        line
        for line in lines
        if line.role in REVENUE_ROLES | EXPENSE_ROLES and line.entry_type not in NON_FLOW_ENTRIES
    ]


def latest_allocations(db: Session, company: str, kind: str, native: bool = False) -> dict[str, Any]:
    model = NativeDimensionAllocation if native else DimensionAllocation
    rows = db.scalars(
        select(model).where(model.company_id == company, model.kind == kind).order_by(model.version)
    )
    return {row.line_id: row for row in rows}


def line_amount(line: m.JournalLine) -> Decimal:
    return (
        Decimal(line.credit) - Decimal(line.debit)
        if line.role in REVENUE_ROLES
        else Decimal(line.debit) - Decimal(line.credit)
    )


def assign(db: Session, company: str, user: m.User, data: dict, version: int) -> dict:
    membership(db, company, user, "write")
    native_id = data.get("native_statement_id")
    _, lines = selected_lines(db, company, data.get("manifest_id"), native_id)
    line = next((line for line in lines if line.id == data["line_id"]), None)
    require(line is not None, "line_not_in_report", "ردیف درآمد یا هزینه را از گزارش انتخاب کنید.", 409)
    previous = latest_allocations(db, company, data["kind"], bool(native_id)).get(line.id)
    require(
        version == (previous.version if previous else 1),
        "version_conflict",
        "تخصیص تغییر کرده؛ صفحه را تازه کنید.",
        409,
    )
    shares = []
    with localcontext() as context:
        context.prec = 60
        total = Decimal(0)
        original = line_amount(line)
        require(
            len({s["dimension_id"] for s in data["shares"]}) == len(data["shares"]),
            "duplicate_dimension",
            "هر بُعد فقط یک بار انتخاب شود.",
        )
        for share in data["shares"]:
            dimension = get_entity(db, Dimension, company, share["dimension_id"])
            require(
                dimension.active and dimension.kind == data["kind"],
                "invalid_dimension",
                "بُعد فعال و هم‌نوع انتخاب کنید.",
            )
            percent = Decimal(canonical_money(share["percent"]))
            require(0 < percent <= 100, "invalid_weight", "سهم باید مثبت و حداکثر ۱۰۰ باشد.")
            value = original * percent / 100
            try:
                amount = canonical_money(value)
            except ValueError:
                require(False, "allocation_precision", "سهم‌ها باید مبلغ دقیق با حداکثر ۶ رقم اعشار بسازند.")
            shares.append(
                {
                    "dimension_id": dimension.id,
                    "code": dimension.code,
                    "name": dimension.name,
                    "percent": str(percent),
                    "amount": amount,
                }
            )
            total += percent
        require(total == 100, "allocation_total", "جمع سهم‌ها باید دقیقاً ۱۰۰ درصد باشد.")
        require(
            data["method"] != "direct" or len(shares) == 1,
            "direct_single_dimension",
            "تخصیص مستقیم فقط یک بُعد دارد.",
        )
        require(
            sum((Decimal(s["amount"]) for s in shares), Decimal(0)) == original,
            "allocation_total",
            "مجموع تخصیص با مبلغ منبع برابر نیست.",
        )
    model = NativeDimensionAllocation if native_id else DimensionAllocation
    source_fields = (
        {
            "native_statement_id": native_id,
            "journal_id": line.journal_id,
            "line_index": line.line_index,
            "source_role": line.role,
        }
        if native_id
        else {"manifest_id": data["manifest_id"]}
    )
    item = model(
        **source_fields,
        company_id=company,
        line_id=line.id,
        kind=data["kind"],
        method=data["method"],
        version=previous.version + 1 if previous else 1,
        shares=shares,
        review_reason=data["review_reason"],
        actor_id=user.id,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "dimension.allocation_reviewed",
        item.id,
        {"line_id": line.id, "version": item.version, "reason": item.review_reason},
    )
    return serialize_fact(item)


def report(
    db: Session, company: str, manifest_id: str | None, kind: str, native_statement_id: str | None = None
) -> dict[str, Any]:
    manifest, lines = selected_lines(db, company, manifest_id, native_statement_id)
    period = get_entity(db, m.Period, company, manifest.period_id)
    if native_statement_id:
        bounds = manifest.native_source["period"]
        period = SimpleNamespace(
            name=bounds.get("name", "دوره"),
            start=date.fromisoformat(bounds["start"]),
            end=manifest.native_source["end"],
        )
    allocations = latest_allocations(db, company, kind, bool(native_statement_id))
    buckets = {}
    unassigned = {"revenue": Decimal(0), "expense": Decimal(0), "line_count": 0}
    rows = []
    with localcontext() as context:
        context.prec = 60
        for line in lines:
            category = "revenue" if line.role in REVENUE_ROLES else "expense"
            allocation = allocations.get(line.id)
            if allocation and native_statement_id and allocation.source_role != line.role:
                # Reclassification changes the meaning/sign; old allocation is retained but not silently reused.
                allocation = None
            rows.append(
                {
                    "id": line.id,
                    "date": line.date.isoformat(),
                    "account": line.account,
                    "role": line.role,
                    "category": category,
                    "amount": text_amount(line_amount(line)),
                    "source_row_id": line.source_row_id,
                    "allocation": jsonable_encoder(serialize_fact(allocation)) if allocation else None,
                    "allocation_version": allocations[line.id].version if line.id in allocations else 1,
                }
            )
            if not allocation:
                unassigned[category] += line_amount(line)
                unassigned["line_count"] += 1
                continue
            for share in allocation.shares:
                bucket = buckets.setdefault(
                    share["dimension_id"],
                    {
                        "id": share["dimension_id"],
                        "name": share["name"],
                        "code": share["code"],
                        "revenue": Decimal(0),
                        "expense": Decimal(0),
                        "evidence_refs": [],
                    },
                )
                bucket[category] += Decimal(share["amount"])
                bucket["evidence_refs"].append(line.source_row_id)
        coverage = (
            all(
                metric.get("status") == "available"
                for metric in manifest.metrics
                if metric.get("metric_key") in ("revenue", "expense")
            )
            and any(metric.get("metric_key") == "revenue" for metric in manifest.metrics)
            and any(metric.get("metric_key") == "expense" for metric in manifest.metrics)
        )
        complete = coverage and unassigned["line_count"] == 0
        for bucket in buckets.values():
            bucket["assigned_net"] = text_amount(bucket["revenue"] - bucket["expense"])
            bucket["profit"] = bucket["assigned_net"] if complete else None
            for category in ("revenue", "expense"):
                bucket[category] = text_amount(bucket[category])
        return {
            "manifest_id": None if native_statement_id else manifest.id,
            "native_statement_id": native_statement_id,
            "source_digest": manifest.native_source["digest"] if native_statement_id else manifest.digest,
            "source": "native_statement" if native_statement_id else "imported_manifest",
            "kind": kind,
            "period": {"name": period.name, "start": period.start.isoformat(), "end": period.end.isoformat()},
            "status": "available" if complete else "limited" if lines else "unavailable",
            "reason": None
            if complete
            else "مانده‌های تخصیص‌نیافته یا پوشش ناقص دفتر، سود کامل هر بُعد را نامشخص می‌کند.",
            "buckets": list(buckets.values()),
            "unassigned": {
                **unassigned,
                "revenue": text_amount(unassigned["revenue"]),
                "expense": text_amount(unassigned["expense"]),
            },
            "lines": rows,
        }


def save_report(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    native_id = data.get("native_statement_id")
    snapshot = report(db, company, data.get("manifest_id"), data["kind"], native_id)
    model = NativeDimensionReportRun if native_id else DimensionReportRun
    source_fields = {"native_statement_id": native_id} if native_id else {"manifest_id": data["manifest_id"]}
    run = model(
        **source_fields,
        company_id=company,
        kind=data["kind"],
        actor_id=user.id,
        snapshot=snapshot,
    )
    db.add(run)
    db.flush()
    audit(db, company, user.id, "dimension.report_saved", run.id)
    return serialize_fact(run)


def export_report(db: Session, company: str, user: m.User, identifier: str, output_format: str) -> bytes:
    from .exports import pdf_report, xlsx_report

    membership(db, company, user)
    run = db.scalar(
        select(DimensionReportRun).where(
            DimensionReportRun.company_id == company, DimensionReportRun.id == identifier
        )
    )
    if run is None:
        run = get_entity(db, NativeDimensionReportRun, company, identifier)
    snapshot = run.snapshot
    metrics = []
    labels = {
        "revenue": "درآمد تخصیص‌یافته",
        "expense": "هزینه تخصیص‌یافته",
        "assigned_net": "خالص تخصیص‌یافته",
        "profit": "سود کامل",
    }
    for bucket in snapshot["buckets"]:
        for key, label in labels.items():
            value = bucket[key]
            metrics.append(
                {
                    "metric_key": bucket["id"] + ":" + key,
                    "label": bucket["name"] + "؛ " + label,
                    "basis": "ledger_dimension",
                    "scope": run.kind,
                    "value": value,
                    "unit": "IRR",
                    "status": "available" if value is not None else "unavailable",
                    "reason": snapshot["reason"] if value is None else None,
                    "evidence_refs": bucket["evidence_refs"],
                }
            )
    for key in ("revenue", "expense"):
        metrics.append(
            {
                "metric_key": "unassigned:" + key,
                "label": ("درآمد" if key == "revenue" else "هزینه") + " تخصیص‌نیافته",
                "basis": "ledger_dimension",
                "scope": run.kind,
                "value": snapshot["unassigned"][key],
                "unit": "IRR",
                "status": snapshot["status"],
                "reason": snapshot["reason"],
            }
        )
    manifest = {
        "id": getattr(run, "native_statement_id", None) or getattr(run, "manifest_id", None),
        "metrics": metrics,
        "period": snapshot["period"],
        "details": {"dimensions": snapshot},
        "selection": {"row_ids": [line["source_row_id"] for line in snapshot["lines"]]},
    }
    descriptor = {"id": run.id, "title": "گزارش ابعاد؛ " + snapshot["period"]["name"], "version": 1}
    name = db.get(m.Company, company).name
    audit(db, company, user.id, "dimension.report_downloaded", run.id, {"format": output_format})
    return (
        pdf_report(manifest, descriptor, name)
        if output_format == "pdf"
        else xlsx_report(manifest, descriptor, name)
    )


def current_report(
    db: Session,
    company: str,
    kind: str,
    manifest_id: str | None = None,
    native_statement_id: str | None = None,
    native_period_id: str | None = None,
) -> dict:
    if native_period_id:
        from .native_reporting_models import NativeStatementRun

        require(not manifest_id and not native_statement_id, "dimension_source", "فقط یک منبع انتخاب کنید.")
        get_entity(db, m.Period, company, native_period_id)
        row = db.scalar(
            select(NativeStatementRun)
            .where(
                NativeStatementRun.company_id == company,
                NativeStatementRun.snapshot["period_id"].as_string() == native_period_id,
            )
            .order_by(NativeStatementRun.created_at.desc(), NativeStatementRun.id.desc())
            .limit(1)
        )
        require(
            row is not None,
            "native_statement_missing",
            "گزارش مالی ثابت دفتر اصلی برای این دوره ذخیره نشده است.",
            404,
        )
        native_statement_id = row.id
    return report(db, company, manifest_id, kind, native_statement_id)
