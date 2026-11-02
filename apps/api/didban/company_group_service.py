"""Read each company under its own RLS context, restoring the anchor every time."""

import json
from contextlib import contextmanager
from copy import deepcopy
from hashlib import sha256

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import models as m
from .accounting_setup_models import CompanyAccountingSetup
from .company_group_models import CompanyComparisonRun, CompanyGroup
from .errors import require
from .native_ledger_source import statement_source
from .native_reporting_models import NativeStatementRun
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact

# Separate basis columns are never combined into a total.
COLUMNS = [
    ("revenue", "ledger", "درآمد دفتر"),
    ("expense", "ledger", "هزینه دفتر"),
    ("net_profit", "ledger", "سود خالص دفتر"),
    ("pre_tax_profit", "ledger", "سود پیش از مالیات دفتر"),
    ("ap_trade_ledger", "ledger", "بدهی تجاری دفتر"),
    ("cash", "bank", "نقد بانک"),
    ("ar_ledger", "ledger", "مطالبات دفتر"),
    ("ar_invoice", "invoice", "مطالبات فاکتور"),
    ("ap_invoice", "invoice", "بدهی فاکتور"),
]


@contextmanager
def selected_company(db: Session, anchor: str, company: str, user: m.User):
    postgres = db.get_bind().dialect.name == "postgresql"
    if postgres:
        db.execute(text("SELECT set_config('didban.company_id', :company, true)"), {"company": company})
    try:
        membership(db, company, user, "read")
        yield
    finally:
        if postgres:
            db.execute(text("SELECT set_config('didban.company_id', :company, true)"), {"company": anchor})


def authorize_all(db: Session, anchor: str, companies: list[str], user: m.User) -> None:
    for company in companies:
        with selected_company(db, anchor, company, user):
            pass


def save(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
    group_id: str | None = None,
    version: int | None = None,
) -> dict:
    membership(db, company, user, "owner")
    require(company in data["company_ids"], "anchor_required", "شرکت فعال باید در گروه باشد.")
    authorize_all(db, company, data["company_ids"], user)
    item = (
        get_entity(db, CompanyGroup, company, group_id)
        if group_id
        else CompanyGroup(company_id=company, actor_id=user.id)
    )
    if group_id:
        check_version(item, version)
        item.version += 1
    item.name, item.company_ids = data["name"], data["company_ids"]
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "company_group.saved",
        item.id,
        {"companies": item.company_ids, "version": item.version},
    )
    return serialize_fact(item)


def public_group(db: Session, company: str, user: m.User, item: CompanyGroup) -> dict:
    authorize_all(db, company, item.company_ids, user)
    return serialize_fact(item)


def compare(db: Session, company: str, user: m.User, group_id: str, period_id: str, version: int) -> dict:
    group = get_entity(db, CompanyGroup, company, group_id)
    check_version(group, version)
    period = get_entity(db, m.Period, company, period_id)
    rows = []
    for selected in group.company_ids:
        with selected_company(db, company, selected, user):
            name = db.get(m.Company, selected).name
            exact_period = db.scalar(
                select(m.Period)
                .where(
                    m.Period.company_id == selected,
                    m.Period.start == period.start,
                    m.Period.end == period.end,
                )
                .order_by(m.Period.created_at.desc(), m.Period.id.desc())
                .limit(1)
            )
            manifest = (
                db.scalar(
                    select(m.ResultManifest)
                    .where(
                        m.ResultManifest.company_id == selected, m.ResultManifest.period_id == exact_period.id
                    )
                    .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
                    .limit(1)
                )
                if exact_period
                else None
            )
            setup = db.get(CompanyAccountingSetup, selected)
            native = bool(setup and setup.mode == "primary")
            native_run = (
                db.scalar(
                    select(NativeStatementRun)
                    .where(
                        NativeStatementRun.company_id == selected,
                        NativeStatementRun.snapshot["period_id"].as_string() == exact_period.id,
                        NativeStatementRun.snapshot["as_of"].as_string() == period.end.isoformat(),
                        NativeStatementRun.snapshot["period"]["start"].as_string()
                        == period.start.isoformat(),
                        NativeStatementRun.snapshot["period"]["end"].as_string() == period.end.isoformat(),
                    )
                    .order_by(NativeStatementRun.created_at.desc(), NativeStatementRun.id.desc())
                    .limit(1)
                )
                if native and exact_period
                else None
            )
            native_metrics = statement_source(db, selected, native_run.id)["metrics"] if native_run else []
            if native:
                manifest = None
            values = []
            for key, basis, label in COLUMNS:
                source = (
                    next(
                        (
                            metric
                            for metric in (native_metrics if native else manifest.metrics)
                            if metric["metric_key"] == key
                            and (metric.get("basis") == basis or (native and key == "cash"))
                        ),
                        None,
                    )
                    if manifest or native_run
                    else None
                )
                values.append(
                    deepcopy(source)
                    | {
                        "label": source.get("label", label) if native else label,
                        "basis": "native_book" if native else source.get("basis"),
                    }
                    if source
                    else {
                        "metric_key": key,
                        "basis": basis,
                        "label": label,
                        "value": None,
                        "status": "unavailable",
                        "reason": "گزارش ثابت دفتر اصلی تا پایان دوره برای این شاخص موجود نیست."
                        if native
                        else "گزارش هم‌دوره برای این شاخص موجود نیست.",
                        "unit": "IRR",
                        "evidence_refs": [],
                    }
                )
            rows.append(
                {
                    "company_id": selected,
                    "name": name,
                    "source": "native_statement" if native else "imported_manifest",
                    "native_statement_id": native_run.id if native_run else None,
                    "as_of": period.end.isoformat() if native_run else None,
                    "manifest_id": manifest.id if manifest else None,
                    "metrics": values,
                }
            )
    snapshot = {
        "title": group.name,
        "company_ids": list(group.company_ids),
        "period": {"start": period.start.isoformat(), "end": period.end.isoformat()},
        "companies": rows,
        "kind": "comparison",
        "elimination_state": "pending_review",
        "limitation": "این گزارش مقایسه‌ای است؛ معاملات درون‌گروهی حذف نشده‌اند.",
    }
    digest = sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    run = CompanyComparisonRun(
        company_id=company,
        group_id=group.id,
        group_version=group.version,
        snapshot=snapshot,
        actor_id=user.id,
        digest=digest,
    )
    db.add(run)
    db.flush()
    audit(db, company, user.id, "company_group.compared", run.id, {"group_id": group.id, "digest": digest})
    return serialize_fact(run)


def read_run(db: Session, company: str, user: m.User, run_id: str) -> dict:
    item = get_entity(db, CompanyComparisonRun, company, run_id)
    authorize_all(db, company, item.snapshot["company_ids"], user)
    return serialize_fact(item)
