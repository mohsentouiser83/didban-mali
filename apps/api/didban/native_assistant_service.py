"""Read-only context selection; native statements never impersonate imported manifests."""

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_setup_models import CompanyAccountingSetup
from .native_reporting_models import NativeStatementRun
from .native_reporting_reasons import REASONS
from .security import membership
from .services import get_entity
from .workflow import serialize_fact

CORE_METRICS = (
    ("bank_balance", "cash", "نقد طبق دفتر اصلی"),
    ("revenue", "revenue", "درآمد طبق دفتر اصلی"),
    ("expense", "expense", "هزینه طبق دفتر اصلی"),
    ("profit_before_tax", "pre_tax_profit", "سود پیش از مالیات طبق دفتر اصلی"),
    ("trade_receivable_balance", "ar_ledger", "خالص مطالبات تجاری طبق دفتر اصلی"),
    ("trade_payable_balance", "ap_trade_ledger", "خالص بدهی تجاری طبق دفتر اصلی"),
)
MISSING_NATIVE = "هنوز گزارش مالی دفتر اصلی ذخیره نشده است؛ آن را از بخش گزارش‌ها ذخیره کنید."


def native_context(run: NativeStatementRun) -> dict:
    snapshot = run.snapshot
    evidence_ref = "native-statement:" + run.id
    metrics = []
    for source_key, target_key, label in CORE_METRICS:
        source = next(
            (item for item in snapshot.get("metrics", []) if item.get("metric_key") == source_key), None
        )
        reasons = list(source.get("reason_codes", [])) if source else ["native_metric_missing"]
        if source is None or source.get("value") is None:
            if not reasons:
                reasons = ["native_metric_unavailable"]
        action = None
        if reasons:
            action = "مبنای گزارش مالی را تکمیل و نسخهٔ تازه ذخیره کنید."
        metrics.append(
            {
                "metric_key": target_key,
                "label": label,
                "basis": "native_book",
                "scope": "frozen_native_statement",
                "value": source.get("value") if source else None,
                "status": source.get("status", "unavailable") if source else "unavailable",
                "unit": "IRR",
                "reason_codes": reasons,
                "reason": "؛ ".join(
                    REASONS.get(code, "اطلاعات مبنای این شاخص کامل نیست.") for code in reasons
                )
                or None,
                "action": action,
                "as_of_date": snapshot.get("as_of"),
                "period_id": snapshot.get("period_id"),
                "evidence_refs": [evidence_ref],
            }
        )
    return {
        "id": run.id,
        "context_type": "native_statement",
        "native_statement_id": run.id,
        "metrics": metrics,
        "details": {"as_of_date": snapshot.get("as_of")},
        "selection": {},
    }


def select_context(
    db: Session,
    company: str,
    user: m.User,
    *,
    context_type: str | None = None,
    manifest_id: str | None = None,
    native_statement_id: str | None = None,
) -> dict:
    membership(db, company, user)
    pinned = context_type is not None or manifest_id is not None or native_statement_id is not None
    kind = context_type or (
        "native_statement" if native_statement_id else "imported_manifest" if manifest_id else None
    )
    if kind is None:
        setup = db.get(CompanyAccountingSetup, company)
        kind = "native_statement" if setup and setup.mode == "primary" else "imported_manifest"
    if kind == "native_statement":
        run = (
            get_entity(db, NativeStatementRun, company, native_statement_id) if native_statement_id else None
        )
        if not pinned:
            run = db.scalar(
                select(NativeStatementRun)
                .where(NativeStatementRun.company_id == company)
                .order_by(NativeStatementRun.created_at.desc(), NativeStatementRun.id.desc())
                .limit(1)
            )
        descriptor = {
            "context_type": kind,
            "native_statement_id": run.id if run else None,
            "manifest_id": None,
            "available": run is not None,
            "reason_code": None if run else "native_statement_missing",
            "action": None if run else "گزارش مالی دفتر اصلی را ذخیره کنید.",
        }
        return {
            "descriptor": descriptor,
            "frozen": native_context(run) if run else None,
            "missing_answer": MISSING_NATIVE if not run else None,
        }
    manifest = get_entity(db, m.ResultManifest, company, manifest_id) if manifest_id else None
    if not pinned:
        manifest = db.scalar(
            select(m.ResultManifest)
            .where(m.ResultManifest.company_id == company)
            .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
            .limit(1)
        )
    descriptor = {
        "context_type": "imported_manifest",
        "native_statement_id": None,
        "manifest_id": manifest.id if manifest else None,
        "available": manifest is not None,
        "reason_code": None if manifest else "manifest_missing",
        "action": None if manifest else "اسناد را بارگذاری کنید.",
    }
    return {
        "descriptor": descriptor,
        "frozen": jsonable_encoder(serialize_fact(manifest)) if manifest else None,
        "missing_answer": None,
    }


def default_context_descriptor(db: Session, company: str, user: m.User) -> dict:
    """Discover an exact context ID without loading a potentially large report snapshot."""
    membership(db, company, user)
    setup = db.get(CompanyAccountingSetup, company)
    native = setup is not None and setup.mode == "primary"
    model = NativeStatementRun if native else m.ResultManifest
    identifier = db.scalar(
        select(model.id)
        .where(model.company_id == company)
        .order_by(model.created_at.desc(), model.id.desc())
        .limit(1)
    )
    return {
        "context_type": "native_statement" if native else "imported_manifest",
        "native_statement_id": identifier if native else None,
        "manifest_id": None if native else identifier,
        "available": identifier is not None,
        "reason_code": None if identifier else "native_statement_missing" if native else "manifest_missing",
        "action": None
        if identifier
        else "گزارش مالی دفتر اصلی را ذخیره کنید."
        if native
        else "اسناد را بارگذاری کنید.",
    }
