"""Evaluate allowlisted requests solely against a frozen financial manifest."""

import json
from copy import deepcopy
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .finance import REASONS
from .ingestion import normalized
from .native_assistant_service import native_context
from .native_invoice_models import NativeInvoiceSnapshot
from .native_reporting_models import NativeStatementRun
from .report_builder_models import (
    NativeBuilderRun,
    NativeInvoiceBuilderRun,
    SavedReportDefinition,
    SavedReportRun,
)
from .report_builder_schemas import ReportSpec, SaveReportInput
from .services import check_version, get_entity
from .workflow import audit, serialize_fact

COLUMN_LABELS = {
    "label": "شاخص",
    "value": "مبلغ",
    "unit": "واحد",
    "status": "وضعیت",
    "reason": "محدودیت",
    "reference": "فاکتور",
    "party_id": "طرف حساب",
    "date": "تاریخ",
    "due_date": "سررسید",
    "amount": "مبلغ فاکتور",
    "paid": "تسویه‌شده",
    "remaining": "مانده",
}


def latest_manifest(db: Session, company: str, period: str) -> m.ResultManifest:
    get_entity(db, m.Period, company, period)
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company, m.ResultManifest.period_id == period)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    require(manifest is not None, "no_result", "هنوز گزارشی برای این دوره موجود نیست.", 404)
    return manifest


def evaluate(manifest: m.ResultManifest, spec: ReportSpec, *, company_name: str) -> dict:
    require(
        manifest.period_id == spec.period_id, "report_period_mismatch", "دورهٔ نتیجه با گزارش یکسان نیست.", 409
    )
    require(manifest.company_id, "report_company_missing", "شرکت نتیجه مشخص نیست.")
    rows, evidence, limitations = [], [], []
    if spec.kind == "metrics":
        by_key = {item["metric_key"]: item for item in manifest.metrics if item.get("basis") == spec.basis}
        for key in spec.metric_keys:
            require(
                key in by_key,
                "metric_basis_unavailable",
                "شاخص انتخاب‌شده در این مبنا موجود نیست؛ شاخص یا مبنا را تغییر دهید.",
            )
            metric = deepcopy(by_key[key])
            rows.append({**metric, "label": metric.get("label") or key})
            evidence.extend(metric.get("evidence_refs", []))
    else:
        invoices = manifest.details.get("invoices")
        require(
            isinstance(invoices, list),
            "invoice_details_unavailable",
            "جزئیات فاکتورها در این نسخه موجود نیست.",
        )
        for invoice in invoices:
            if spec.filters.direction != "all" and invoice.get("direction") != spec.filters.direction:
                continue
            if spec.filters.party_id and str(invoice.get("party_id") or "") != spec.filters.party_id:
                continue
            if spec.filters.overdue_only and invoice.get("overdue") is not True:
                if invoice.get("overdue") is None:
                    limitations.append(
                        "سررسیدگذشتگی برخی فاکتورها نامشخص است؛ در فیلتر سررسیدگذشته وارد نشده‌اند."
                    )
                continue
            rows.append(deepcopy(invoice))
            evidence.extend(invoice.get("evidence_refs", []))
    for row in rows:
        for code in row.get("reason_codes", []):
            if code in REASONS:
                limitations.append(REASONS[code][0])
    return {
        "manifest_id": manifest.id,
        "manifest_created_at": manifest.created_at.isoformat() if manifest.created_at else None,
        "company_name": company_name,
        "spec": spec.model_dump(),
        "period": deepcopy(manifest.selection.get("period", {})),
        "columns": [{"key": key, "label": COLUMN_LABELS[key]} for key in spec.columns],
        "rows": rows,
        "row_count": len(rows),
        "evidence_refs": sorted(set(evidence)),
        "limitations": sorted(set(limitations)),
        "unit": "IRR",
    }


def evaluate_native(run: NativeStatementRun, spec: ReportSpec, *, company_name: str) -> dict:
    require(spec.source == "native_statement", "report_source_mismatch", "منبع گزارش یکسان نیست.", 409)
    snapshot = run.snapshot
    require(
        snapshot.get("period_id") == spec.period_id,
        "report_period_mismatch",
        "دورهٔ گزارش اصلی یکسان نیست.",
        409,
    )
    metrics = {item["metric_key"]: item for item in native_context(run)["metrics"]}
    rows = [deepcopy(metrics[key]) for key in spec.metric_keys]
    period = deepcopy(snapshot.get("period", {}))
    return {
        "source": "native_statement",
        "manifest_id": None,
        "native_statement_id": run.id,
        "source_digest": run.digest,
        "as_of": snapshot.get("as_of"),
        "company_name": company_name,
        "spec": spec.model_dump(),
        "period": period,
        "columns": [{"key": key, "label": COLUMN_LABELS[key]} for key in spec.columns],
        "rows": rows,
        "row_count": len(rows),
        "evidence_refs": ["native-statement:" + run.id],
        "limitations": sorted({item["reason"] for item in rows if item.get("reason")}),
        "unit": "IRR",
    }


def preview(
    db: Session,
    company: str,
    spec: ReportSpec,
    manifest_id: str | None = None,
    native_statement_id: str | None = None,
    native_invoice_snapshot_id: str | None = None,
) -> dict:
    period = get_entity(db, m.Period, company, spec.period_id)
    if spec.source == "native_invoice":
        require(
            not manifest_id and not native_statement_id,
            "report_source_mismatch",
            "منبع گزارش یکسان نیست.",
            409,
        )
        row = (
            get_entity(db, NativeInvoiceSnapshot, company, native_invoice_snapshot_id)
            if native_invoice_snapshot_id
            else None
        )
        if row is None:
            from sqlalchemy import or_

            direction = {"all": None, "sales": "sale", "purchases": "purchase"}[spec.filters.direction]
            query = select(NativeInvoiceSnapshot).where(
                NativeInvoiceSnapshot.company_id == company,
                NativeInvoiceSnapshot.as_of >= period.start,
                NativeInvoiceSnapshot.as_of <= period.end,
            )
            scope = NativeInvoiceSnapshot.payload["direction"].as_string()
            query = (
                query.where(or_(scope.is_(None), scope == direction))
                if direction
                else query.where(scope.is_(None))
            )
            row = db.scalar(
                query.order_by(
                    NativeInvoiceSnapshot.created_at.desc(), NativeInvoiceSnapshot.id.desc()
                ).limit(1)
            )
        require(
            row is not None,
            "native_invoice_snapshot_missing",
            "نسخهٔ ثابت فاکتورهای همین دامنه و دوره را ذخیره کنید.",
            404,
        )
        return evaluate_native_invoices(
            row,
            spec,
            company_name=db.get(m.Company, company).name,
            period={
                "id": period.id,
                "name": period.name,
                "start": period.start.isoformat(),
                "end": period.end.isoformat(),
            },
        )
    require(not native_invoice_snapshot_id, "report_source_mismatch", "منبع گزارش یکسان نیست.", 409)
    if spec.source == "native_statement":
        require(not manifest_id, "report_source_mismatch", "منبع گزارش یکسان نیست.", 409)
        run = (
            get_entity(db, NativeStatementRun, company, native_statement_id)
            if native_statement_id
            else db.scalar(
                select(NativeStatementRun)
                .where(
                    NativeStatementRun.company_id == company,
                    NativeStatementRun.snapshot["period_id"].as_string() == spec.period_id,
                )
                .order_by(NativeStatementRun.created_at.desc(), NativeStatementRun.id.desc())
                .limit(1)
            )
        )
        require(
            run is not None,
            "native_statement_missing",
            "گزارش مالی ثابت دفتر اصلی برای این دوره ذخیره نشده است.",
            404,
        )
        result = evaluate_native(run, spec, company_name=db.get(m.Company, company).name)
        # Historical snapshots pin their own period bounds; never substitute today's edited range.
        if not result["period"]:
            result["period"] = {
                "id": period.id,
                "start": period.start.isoformat(),
                "end": period.end.isoformat(),
            }
        return result
    require(not native_statement_id, "report_source_mismatch", "منبع گزارش یکسان نیست.", 409)
    manifest = (
        get_entity(db, m.ResultManifest, company, manifest_id)
        if manifest_id
        else latest_manifest(db, company, spec.period_id)
    )
    return evaluate(manifest, spec, company_name=db.get(m.Company, company).name) | {
        "source": "imported_manifest",
        "native_statement_id": None,
    }


def _freeze_run(
    db: Session, company: str, user: m.User, definition: SavedReportDefinition, snapshot: dict
) -> dict:
    frozen = deepcopy(snapshot) | {"title": definition.name, "definition_version": definition.version}
    digest = sha256(
        json.dumps(frozen, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    source = snapshot.get("source", "imported_manifest")
    model = (
        NativeBuilderRun
        if source == "native_statement"
        else NativeInvoiceBuilderRun
        if source == "native_invoice"
        else SavedReportRun
    )
    source_fields = (
        {"native_statement_id": snapshot["native_statement_id"]}
        if source == "native_statement"
        else {"native_invoice_snapshot_id": snapshot["native_invoice_snapshot_id"]}
        if source == "native_invoice"
        else {"manifest_id": snapshot["manifest_id"]}
    )
    run = model(
        **source_fields,
        company_id=company,
        definition_id=definition.id,
        definition_version=definition.version,
        actor_id=user.id,
        snapshot=frozen,
        digest=digest,
    )
    db.add(run)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "report_builder.run_created",
        run.id,
        {"definition_id": definition.id, "source": source, **source_fields, "digest": digest},
    )
    return serialize_fact(run)


def save(
    db: Session,
    company: str,
    user: m.User,
    data: SaveReportInput,
    definition_id: str | None = None,
    version: int | None = None,
) -> dict:
    snapshot = preview(
        db,
        company,
        data.spec,
        data.preview_manifest_id,
        data.preview_native_statement_id,
        data.preview_native_invoice_snapshot_id,
    )
    if definition_id:
        definition = get_entity(db, SavedReportDefinition, company, definition_id)
        check_version(definition, version)
        definition.name, definition.spec = data.name, data.spec.model_dump()
        definition.version += 1
    else:
        definition = SavedReportDefinition(
            company_id=company, name=data.name, spec=data.spec.model_dump(), actor_id=user.id
        )
        db.add(definition)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "report_builder.definition_saved",
        definition.id,
        {"version": definition.version},
    )
    return {
        "definition": serialize_fact(definition),
        "run": _freeze_run(db, company, user, definition, snapshot),
    }


def rerun(db: Session, company: str, user: m.User, definition_id: str, version: int) -> dict:
    definition = get_entity(db, SavedReportDefinition, company, definition_id)
    check_version(definition, version)
    return _freeze_run(
        db, company, user, definition, preview(db, company, ReportSpec.model_validate(definition.spec))
    )


def _interpret_imported(question: str, period_id: str) -> dict:
    text = normalized(question)
    # Only narrowly supported utterances are accepted. Company/period/party never inferred.
    if any(
        word in text
        for word in ("مشتری", "طرف حساب", "پروژه", "شعبه", "مالیات", "کارمند", "حقوق", "ماه قبل", "سال قبل")
    ):
        return {
            "status": "needs_selection",
            "choices": ["شاخص‌های مالی", "فاکتورهای فروش", "فاکتورهای خرید"],
            "message": "نوع گزارش و فیلتر طرف حساب را از کنترل‌ها انتخاب کنید.",
        }
    allowed = {
        "گزارش",
        "فاکتور",
        "فاکتورها",
        "فاکتورهای",
        "مطالبات",
        "بدهی",
        "بدهیها",
        "فروش",
        "خرید",
        "سررسیدگذشته",
        "سررسید",
        "گذشته",
        "این",
        "دوره",
        "درآمد",
        "هزینه",
        "سود",
        "خالص",
        "و",
        "نقد",
        "مانده",
        "بانک",
        "ها",
        "را",
        "رو",
        "نشان",
        "بده",
        "بدهید",
    }
    if any(word not in allowed for word in text.split()):
        return {
            "status": "needs_selection",
            "choices": ["شاخص‌های مالی", "فاکتورهای فروش", "فاکتورهای خرید"],
            "message": "برای این درخواست، نوع گزارش و فیلترها را مشخص کنید.",
        }
    ledger_requested = any(word in text for word in ("درآمد", "هزینه", "سود"))
    bank_requested = "نقد" in text or "بانک" in text
    invoice_requested = "فاکتور" in text
    if (
        sum((ledger_requested, bank_requested, invoice_requested)) > 1
        or ("سود" in text and "سود خالص" not in text)
        or (not invoice_requested and "سررسید" in text)
    ):
        return {
            "status": "needs_selection",
            "choices": ["شاخص‌های دفتر", "مانده بانک", "فاکتورهای فروش", "فاکتورهای خرید"],
            "message": "نوع گزارش و مبنای آن را از کنترل‌ها مشخص کنید.",
        }
    if (("مطالبات" in text or "بدهی" in text) and "فاکتور" not in text) or (
        "فروش" in text and "خرید" in text
    ):
        return {
            "status": "needs_selection",
            "choices": ["مطالبات دفتر", "مطالبات فاکتور", "بدهی دفتر", "بدهی فاکتور"],
            "message": "مبنای دفتر یا فاکتور را از کنترل‌ها مشخص کنید.",
        }
    if "فاکتور" in text:
        direction = (
            "sales"
            if "فروش" in text or "مطالبات" in text
            else "purchases"
            if "خرید" in text or "بدهی" in text
            else "all"
        )
        spec = ReportSpec(
            period_id=period_id,
            kind="invoices",
            basis="invoice",
            metric_keys=[],
            columns=["reference", "party_id", "amount", "remaining", "status"],
            filters={"direction": direction, "overdue_only": "سررسیدگذشته" in text or "سررسید گذشته" in text},
        )
        return {"status": "proposed", "spec": spec.model_dump()}
    matched = [
        key
        for words, key in [(("درآمد",), "revenue"), (("هزینه",), "expense"), (("سود خالص",), "net_profit")]
        if any(word in text for word in words)
    ]
    if matched:
        return {
            "status": "proposed",
            "spec": ReportSpec(period_id=period_id, metric_keys=matched).model_dump(),
        }
    if text in ("نقد", "مانده بانک", "مانده بانک ها", "گزارش نقد"):
        return {
            "status": "proposed",
            "spec": ReportSpec(period_id=period_id, basis="bank", metric_keys=["cash"]).model_dump(),
        }
    return {
        "status": "needs_selection",
        "choices": ["شاخص‌های مالی", "فاکتورهای فروش", "فاکتورهای خرید"],
        "message": "این درخواست پشتیبانی نمی‌شود؛ نوع گزارش را انتخاب کنید.",
    }


def interpret(question: str, period_id: str, source: str = "imported_manifest") -> dict:
    if source in ("imported_manifest", "native_invoice"):
        proposal = _interpret_imported(question, period_id)
        if source == "native_invoice" and proposal.get("status") == "proposed":
            if proposal["spec"]["kind"] != "invoices":
                return {"status": "needs_selection", "message": "ستون‌ها و فیلتر فاکتور بومی را انتخاب کنید."}
            proposal["spec"]["source"] = "native_invoice"
        return proposal
    text = normalized(question)
    if text in ("سود پیش از مالیات", "گزارش سود پیش از مالیات"):
        keys = ["pre_tax_profit"]
    elif text in ("مطالبات", "گزارش مطالبات", "مطالبات دفتر"):
        keys = ["ar_ledger"]
    elif text in ("بدهی", "بدهی دفتر", "گزارش بدهی"):
        keys = ["ap_trade_ledger"]
    elif text in ("نقد", "مانده بانک", "گزارش نقد"):
        keys = ["cash"]
    else:
        proposal = _interpret_imported(question, period_id)
        if proposal.get("status") != "proposed":
            return proposal
        candidate = proposal["spec"]
        if candidate["kind"] != "metrics" or not set(candidate["metric_keys"]) <= {"revenue", "expense"}:
            return {"status": "needs_selection", "message": "شاخص‌های گزارش مالی دفتر اصلی را انتخاب کنید."}
        keys = candidate["metric_keys"]
    return {
        "status": "proposed",
        "spec": ReportSpec(period_id=period_id, source="native_statement", metric_keys=keys).model_dump(),
    }


def get_run(
    db: Session, company: str, identifier: str
) -> SavedReportRun | NativeBuilderRun | NativeInvoiceBuilderRun:
    for model in (SavedReportRun, NativeBuilderRun, NativeInvoiceBuilderRun):
        run = db.scalar(select(model).where(model.company_id == company, model.id == identifier))
        if run is not None:
            return run
    require(False, "not_found", "اطلاعات یافت نشد.", 404)


def evaluate_native_invoices(
    run: NativeInvoiceSnapshot, spec: ReportSpec, *, company_name: str, period: dict
) -> dict:
    from .native_invoice_exports import invoice_rows

    require(
        spec.source == "native_invoice" and spec.kind == "invoices",
        "report_source_mismatch",
        "منبع گزارش یکسان نیست.",
        409,
    )
    require(
        period["start"] <= run.as_of.isoformat() <= period["end"],
        "report_period_mismatch",
        "تاریخ نسخهٔ فاکتور در دورهٔ انتخابی نیست.",
        409,
    )
    actual = run.payload.get("direction")
    requested = {"all": None, "sales": "sale", "purchases": "purchase"}[spec.filters.direction]
    require(
        actual is None or actual == requested,
        "invoice_snapshot_scope",
        "دامنهٔ نسخهٔ ثابت، فیلتر انتخابی را پوشش نمی‌دهد.",
        409,
    )
    rows, limitations = [], []
    for item in invoice_rows(run.payload):
        if spec.filters.direction != "all" and item["direction"] != spec.filters.direction:
            continue
        if spec.filters.party_id and item["party_id"] != spec.filters.party_id:
            continue
        if spec.filters.overdue_only and item.get("overdue") is not True:
            if item.get("overdue") is None:
                limitations.append(
                    "فاکتور بدون سررسید در فیلتر سررسیدگذشته وارد نشده است."
                    if item.get("due_date") is None
                    else "فاکتور با ماندهٔ نامعتبر در فیلتر سررسیدگذشته وارد نشده است."
                )
                if item.get("reason"):
                    limitations.append(item["reason"])
            continue
        rows.append(item)
        if item.get("reason"):
            limitations.append(item["reason"])
    return {
        "source": "native_invoice",
        "manifest_id": None,
        "native_statement_id": None,
        "native_invoice_snapshot_id": run.id,
        "source_digest": run.digest,
        "as_of": run.as_of.isoformat(),
        "company_name": company_name,
        "spec": spec.model_dump(),
        "period": period,
        "columns": [{"key": key, "label": COLUMN_LABELS[key]} for key in spec.columns],
        "rows": rows,
        "row_count": len(rows),
        "evidence_refs": ["native-invoice-snapshot:" + run.id],
        "limitations": sorted(set(limitations)),
        "unit": "IRR",
    }
