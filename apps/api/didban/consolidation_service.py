"""Exact, reviewable intercompany proposals in a declared 100%-ownership scope."""

import json
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .company_group_models import CompanyComparisonRun, CompanyGroup
from .company_group_service import authorize_all, selected_company
from .company_group_service import read_run as read_comparison
from .consolidation_models import DraftConsolidationRun, IntercompanyMapping
from .errors import require
from .finance import NON_FLOW_ENTRIES, TRADE_AP_ROLES, TRADE_AR_ROLES, text_amount
from .native_ledger_source import statement_source
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact

METRICS = {
    "revenue": ("company", "درآمد دفتر"),
    "expense": ("company", "هزینه دفتر"),
    "ar_ledger": ("commercial_receivables", "مطالبات تجاری دفتر"),
    "ap_trade_ledger": ("commercial_payables", "بدهی تجاری دفتر"),
    "net_profit": ("company", "سود خالص دفتر"),
    "pre_tax_profit": ("company", "سود پیش از مالیات دفتر"),
}


def mapping_public(db: Session, company: str, user: m.User, item: IntercompanyMapping) -> dict:
    authorize_all(db, company, [company, item.left_company, item.right_company], user)
    return serialize_fact(item)


def mappings(db: Session, company: str, user: m.User, group_id: str) -> dict:
    group = get_entity(db, CompanyGroup, company, group_id)
    authorize_all(db, company, group.company_ids, user)
    rows = db.scalars(
        select(IntercompanyMapping)
        .where(IntercompanyMapping.company_id == company, IntercompanyMapping.group_id == group.id)
        .order_by(IntercompanyMapping.created_at.desc())
    )
    return {"items": [mapping_public(db, company, user, item) for item in rows]}


def save_mapping(db: Session, company: str, user: m.User, data: dict, version: int) -> dict:
    membership(db, company, user, "owner")
    group = get_entity(db, CompanyGroup, company, data["group_id"])
    authorize_all(db, company, group.company_ids, user)
    require(
        data["left_company"] != data["right_company"]
        and {data["left_company"], data["right_company"]} <= set(group.company_ids),
        "mapping_company_scope",
        "دو شرکت متفاوت از همین گروه انتخاب کنید.",
    )
    require(
        data.get("ownership_100") is True,
        "ownership_scope",
        "فقط دامنهٔ مالکیت کامل تأییدشده توسط کاربر مجاز است.",
    )
    prior = db.scalar(
        select(IntercompanyMapping)
        .where(
            IntercompanyMapping.company_id == company,
            IntercompanyMapping.group_id == group.id,
            IntercompanyMapping.left_company == data["left_company"],
            IntercompanyMapping.right_company == data["right_company"],
        )
        .order_by(IntercompanyMapping.version.desc())
        .limit(1)
    )
    require(version == (prior.version if prior else 1), "version_conflict", "نسخهٔ نگاشت تغییر کرده است.", 409)
    item = IntercompanyMapping(
        company_id=company,
        group_id=group.id,
        version=prior.version + 1 if prior else 1,
        left_company=data["left_company"],
        right_company=data["right_company"],
        left_party_id=data["left_party_id"],
        right_party_id=data["right_party_id"],
        ownership_declaration={
            "percent": "100",
            "provenance": "user_declaration",
            "independently_verified": False,
            "note": data["ownership_note"],
            "actor_id": user.id,
        },
        actor_id=user.id,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "consolidation.mapping_declared",
        item.id,
        {"group_id": group.id, "version": item.version, "ownership_provenance": "user_declaration"},
    )
    return serialize_fact(item)


def _source(
    db: Session,
    anchor: str,
    company: str,
    user: m.User,
    manifest_id: str,
    start: str,
    end: str,
    source_kind: str = "imported_manifest",
) -> dict:
    with selected_company(db, anchor, company, user):
        if source_kind == "native_statement":
            source = statement_source(db, company, manifest_id)
            require(
                source["start"].isoformat() == start and source["end"].isoformat() == end,
                "period_scope",
                "گزارش ثابت دفتر اصلی باید تا پایان همین دوره باشد.",
                409,
            )
            snapshot = source["snapshot"]
            require(
                not snapshot.get("unknown_profit_account_ids")
                and not snapshot.get("unknown_balance_account_ids")
                and not snapshot.get("period_accounting_role_conflict_ids"),
                "ledger_controls",
                "نقش‌های حساب و اسناد دوره باید کامل باشند.",
                409,
            )
            return source
        manifest = get_entity(db, m.ResultManifest, company, manifest_id)
        period = get_entity(db, m.Period, company, manifest.period_id)
        require(
            period.start.isoformat() == start and period.end.isoformat() == end,
            "period_scope",
            "دوره‌های گزارش یکسان نیستند.",
            409,
        )
        coverage = manifest.selection.get("coverage", {})
        require(
            coverage.get("ledger_complete") is True,
            "ledger_coverage",
            "پوشش کامل دفتر برای پیشنهاد حذف لازم است.",
            409,
        )
        controls = manifest.details.get("ledger_controls", {})
        require(
            controls.get("balanced") is True and not controls.get("unknown_role_rows"),
            "ledger_controls",
            "کنترل مستقل تراز و نقش حساب‌ها لازم است.",
            409,
        )
        rows = []
        ids = manifest.selection.get("row_ids", [])
        for offset in range(0, len(ids), 500):
            rows.extend(
                db.scalars(
                    select(m.JournalLine).where(
                        m.JournalLine.company_id == company,
                        m.JournalLine.source_row_id.in_(ids[offset : offset + 500]),
                        m.JournalLine.date <= period.end,
                    )
                )
            )
        return {
            "manifest_id": manifest.id,
            "company_id": company,
            "metrics": manifest.metrics,
            "rows": rows,
            "start": period.start,
            "end": period.end,
        }


def sources(db: Session, company: str, user: m.User, comparison_id: str) -> dict:
    comparison = read_comparison(db, company, user, comparison_id)["snapshot"]
    rows = []
    unavailable = []
    for item in comparison["companies"]:
        if not (item.get("native_statement_id") or item.get("manifest_id")):
            unavailable.append({"company_id": item["company_id"], "reason": "گزارش هم‌دوره موجود نیست."})
            continue
        from .errors import DomainError

        try:
            source = _source(
                db,
                company,
                item["company_id"],
                user,
                item.get("native_statement_id") or item["manifest_id"],
                comparison["period"]["start"],
                comparison["period"]["end"],
                item.get("source", "imported_manifest"),
            )
        except DomainError as error:
            if error.code in ("ledger_coverage", "ledger_controls", "period_scope"):
                unavailable.append({"company_id": item["company_id"], "reason": error.message})
                continue
            raise
        for line in source["rows"]:
            if (
                source["start"] <= line.date <= source["end"]
                and line.entry_type not in NON_FLOW_ENTRIES
                and (
                    line.role in TRADE_AR_ROLES | TRADE_AP_ROLES
                    or line.role in ("revenue", "operating_expense")
                )
            ):
                rows.append(
                    {
                        "id": line.id,
                        "company_id": item["company_id"],
                        "company_name": item["name"],
                        "account": line.account,
                        "party_id": line.party_id,
                        "role": line.role,
                        "reference": line.reference,
                        "date": line.date.isoformat(),
                        "debit": str(line.debit),
                        "credit": str(line.credit),
                        "source_row_id": line.source_row_id,
                    }
                )
    return {
        "comparison_id": comparison_id,
        "companies": comparison["companies"],
        "period": comparison["period"],
        "rows": rows,
        "unavailable": unavailable,
        "approval_available": True,
        "approval_reason": "exact_snapshot_report_review",
    }


def _metric_totals(all_sources: dict[str, dict]) -> list[dict]:
    result = []
    for key, (scope, label) in METRICS.items():
        values = []
        for source in all_sources.values():
            metric = next(
                (
                    item
                    for item in source["metrics"]
                    if item.get("metric_key") == key
                    and item.get("basis") == "ledger"
                    and item.get("scope") == scope
                    and item.get("unit") == "IRR"
                    and item.get("status") == "available"
                    and item.get("value") is not None
                ),
                None,
            )
            if metric:
                values.append(Decimal(metric["value"]))
        valid = len(values) == len(all_sources)
        result.append(
            {
                "metric_key": key,
                "label": label,
                "basis": "ledger",
                "scope": scope,
                "before": text_amount(sum(values, Decimal(0))) if valid else None,
                "after": None,
                "adjustment": "0",
                "status": "draft" if valid else "unavailable",
                "reason": None if valid else "شاخص معتبر و هم‌مبنا برای همهٔ شرکت‌ها موجود نیست.",
            }
        )
    return result


def _services_amount(line: m.JournalLine, source: dict) -> Decimal:
    def signed(item):
        return (
            Decimal(item.credit) - Decimal(item.debit)
            if line.role == "revenue"
            else Decimal(item.debit) - Decimal(item.credit)
        )

    rows = [
        item
        for item in source["rows"]
        if item.account == line.account
        and item.party_id == line.party_id
        and item.role == line.role
        and source["start"] <= item.date <= source["end"]
        and item.entry_type not in NON_FLOW_ENTRIES
    ]
    require(
        not any(signed(item) < 0 and item.reference != line.reference for item in rows),
        "services_reference_ambiguous",
        "برگشت یا تعدیل این طرف، مرجع متفاوت دارد؛ اثر خدمات مستقل احراز نشده است.",
        409,
    )
    total = sum((signed(item) for item in rows if item.reference == line.reference), Decimal(0))
    require(
        total == signed(line), "services_net_mismatch", "اثر خالص مرجع خدمات با ردیف منتخب برابر نیست.", 409
    )
    return total


def _ownership_declarations(db: Session, company: str, group_id: str, company_ids: list[str]) -> list[dict]:
    # Scope declarations are distinct from selected financial pairs; a subsidiary
    # with no intercompany flow can be covered without inventing a transaction.
    latest = {}
    for mapping in db.scalars(
        select(IntercompanyMapping)
        .where(IntercompanyMapping.company_id == company, IntercompanyMapping.group_id == group_id)
        .order_by(IntercompanyMapping.version)
    ):
        key = (mapping.left_company, mapping.right_company)
        latest[key] = mapping
    relevant = [
        item
        for item in latest.values()
        if {item.left_company, item.right_company} <= set(company_ids)
        and item.ownership_declaration.get("percent") == "100"
    ]
    covered = {company}
    while True:
        before = set(covered)
        for item in relevant:
            if item.left_company in covered or item.right_company in covered:
                covered.update((item.left_company, item.right_company))
        if covered == before:
            break
    require(
        set(company_ids) <= covered,
        "ownership_scope_incomplete",
        "اظهار دامنهٔ مالکیت کامل برای همهٔ شرکت‌های گروه لازم است.",
        409,
    )
    return [
        {
            "mapping_id": item.id,
            "version": item.version,
            "left_company": item.left_company,
            "right_company": item.right_company,
            "declaration": item.ownership_declaration,
        }
        for item in relevant
    ]


def create_draft(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    run = get_entity(db, CompanyComparisonRun, company, data["comparison_id"])
    comparison = read_comparison(db, company, user, run.id)["snapshot"]
    ownership_declarations = _ownership_declarations(db, company, run.group_id, comparison["company_ids"])
    all_sources = {}
    for item in comparison["companies"]:
        require(
            bool(item.get("native_statement_id") or item.get("manifest_id")),
            "source_missing",
            "همهٔ شرکت‌ها باید گزارش هم‌دوره داشته باشند.",
            409,
        )
        all_sources[item["company_id"]] = _source(
            db,
            company,
            item["company_id"],
            user,
            item.get("native_statement_id") or item["manifest_id"],
            comparison["period"]["start"],
            comparison["period"]["end"],
            item.get("source", "imported_manifest"),
        )
    require(
        len({item.get("source", "imported_manifest") for item in all_sources.values()}) == 1,
        "mixed_book_basis",
        "برای تلفیق، مبنای همهٔ شرکت‌ها باید دفتر اصلی یا دفتر واردشده باشد.",
        409,
    )
    rows = []
    used = set()
    mapping_snapshots = {}
    with localcontext() as context:
        context.prec = 60
        service_amount = Decimal(0)
        balance_amount = Decimal(0)
        for requested in data["pairs"]:
            mapping = get_entity(db, IntercompanyMapping, company, requested["mapping_id"])
            require(
                mapping.group_id == run.group_id
                and {mapping.left_company, mapping.right_company} <= set(all_sources),
                "mapping_company_scope",
                "نگاشت متعلق به این گروه و شرکت‌ها نیست.",
                409,
            )
            newest = db.scalar(
                select(IntercompanyMapping.version)
                .where(
                    IntercompanyMapping.company_id == company,
                    IntercompanyMapping.group_id == mapping.group_id,
                    IntercompanyMapping.left_company == mapping.left_company,
                    IntercompanyMapping.right_company == mapping.right_company,
                )
                .order_by(IntercompanyMapping.version.desc())
                .limit(1)
            )
            require(
                mapping.version == newest, "stale_mapping", "نگاشت تغییر کرده؛ نسخهٔ جدید را بررسی کنید.", 409
            )
            left_source, right_source = all_sources[mapping.left_company], all_sources[mapping.right_company]
            left = next((line for line in left_source["rows"] if line.id == requested["left_line_id"]), None)
            right = next(
                (line for line in right_source["rows"] if line.id == requested["right_line_id"]), None
            )
            require(
                left is not None and right is not None,
                "source_scope",
                "ردیف‌های منتخب متعلق به این شرکت‌ها و گزارش نیستند.",
                409,
            )
            require(
                left.id not in used and right.id not in used,
                "double_elimination",
                "هر ردیف فقط در یک حذف پیشنهادی استفاده شود.",
                409,
            )
            require(
                left.party_id == mapping.left_party_id and right.party_id == mapping.right_party_id,
                "party_mapping",
                "طرف حساب ردیف‌ها با نگاشت متقابل یکسان نیست.",
                409,
            )
            require(
                left.reference and left.reference == right.reference and left.date == right.date,
                "shared_evidence",
                "مرجع غیرخالی و تاریخ دقیق دو طرف باید یکسان باشد.",
                409,
            )
            require(
                left_source["start"] <= left.date <= left_source["end"]
                and right_source["start"] <= right.date <= right_source["end"]
                and left.entry_type not in NON_FLOW_ENTRIES
                and right.entry_type not in NON_FLOW_ENTRIES,
                "entry_scope",
                "ردیف باید عملیات جاری همین دوره باشد.",
                409,
            )
            if requested["kind"] == "services":
                require(
                    {left.role, right.role} == {"revenue", "operating_expense"},
                    "unsupported_elimination",
                    "فقط درآمد و هزینهٔ خدمات جاری قابل پیشنهاد است.",
                    409,
                )
                left_value = _services_amount(left, left_source)
                right_value = _services_amount(right, right_source)
            else:
                require(
                    (left.role in TRADE_AR_ROLES and right.role in TRADE_AP_ROLES)
                    or (right.role in TRADE_AR_ROLES and left.role in TRADE_AP_ROLES),
                    "unsupported_elimination",
                    "فقط مطالبات و بدهی تجاری متناظر قابل پیشنهاد است.",
                    409,
                )

                def outstanding(line, source):
                    if source.get("source") == "native_statement":
                        require(
                            source["snapshot"]["opening_evidence"]["status"] == "available",
                            "native_opening_missing",
                            "مبنای افتتاحیه برای حذف ماندهٔ دفتر اصلی لازم است.",
                            409,
                        )
                    role_set = TRADE_AR_ROLES if line.role in TRADE_AR_ROLES else TRADE_AP_ROLES
                    signed = (
                        (lambda item: Decimal(item.debit) - Decimal(item.credit))
                        if line.role in TRADE_AR_ROLES
                        else (lambda item: Decimal(item.credit) - Decimal(item.debit))
                    )
                    require(
                        not any(
                            item.account == line.account
                            and item.party_id == line.party_id
                            and item.role in role_set
                            and item.reference != line.reference
                            and signed(item) != 0
                            for item in source["rows"]
                        ),
                        "balance_reference_ambiguous",
                        "گردش دیگری در حساب این طرف وجود دارد؛ ماندهٔ این فاکتور مستقل احراز نشده است.",
                        409,
                    )
                    total = sum(
                        (
                            signed(item)
                            for item in source["rows"]
                            if item.account == line.account
                            and item.party_id == line.party_id
                            and item.reference == line.reference
                            and item.role in role_set
                            and item.entry_type
                            not in {"closing", "closing_transfer", "profit_transfer", "balance_transfer"}
                        ),
                        Decimal(0),
                    )
                    require(
                        total == signed(line),
                        "partial_balance",
                        "ماندهٔ مرجع با مبلغ ردیف یکی نیست؛ وصول یا پرداخت جزئی باید جدا بررسی شود.",
                        409,
                    )
                    return total

                left_value, right_value = outstanding(left, left_source), outstanding(right, right_source)
            require(
                left_value > 0 and right_value == left_value,
                "elimination_amount",
                "مبلغ و جهت دو طرف باید دقیقاً برابر و مثبت باشند.",
                409,
            )
            used.update([left.id, right.id])
            if requested["kind"] == "services":
                service_amount += left_value
            else:
                balance_amount += left_value
            mapping_snapshots[mapping.id] = mapping_public(db, company, user, mapping)
            rows.append(
                {
                    "kind": requested["kind"],
                    "amount": text_amount(left_value),
                    "reference": left.reference,
                    "date": left.date.isoformat(),
                    "left_company": mapping.left_company,
                    "right_company": mapping.right_company,
                    "left_line_id": left.id,
                    "right_line_id": right.id,
                    "left_evidence_refs": [left.source_row_id],
                    "right_evidence_refs": [right.source_row_id],
                    "mapping_id": mapping.id,
                    "mapping_version": mapping.version,
                    "review_reason": requested["review_reason"],
                }
            )
        metrics = _metric_totals(all_sources)
        for metric in metrics:
            adjustment = (
                -service_amount
                if metric["metric_key"] in ("revenue", "expense")
                else -balance_amount
                if metric["metric_key"] in ("ar_ledger", "ap_trade_ledger")
                else Decimal(0)
            )
            metric["adjustment"] = text_amount(adjustment)
            metric["after"] = (
                text_amount(Decimal(metric["before"]) + adjustment) if metric["before"] is not None else None
            )
        from fastapi.encoders import jsonable_encoder

        snapshot = jsonable_encoder(
            {
                "title": comparison["title"],
                "company_ids": comparison["company_ids"],
                "comparison_id": run.id,
                "period": comparison["period"],
                "source_basis": next(iter(all_sources.values())).get("source", "imported_manifest"),
                "manifests": {key: item["manifest_id"] for key, item in all_sources.items()},
                "native_statements": {
                    key: item.get("native_statement_id") for key, item in all_sources.items()
                },
                "ownership_scope": "user_declared_100_percent_only",
                "ownership_declarations": ownership_declarations,
                "mappings": list(mapping_snapshots.values()),
                "pairs": rows,
                "metrics": metrics,
                "approval_available": True,
                "approval_reason": "exact_snapshot_report_review",
                "status": "draft",
                "limitation": "فقط حذف‌های انتخاب‌شده؛ مالکیت اظهار کاربر است و پوشش همهٔ معاملات یا گواهی قانونی احراز نشده است.",
            }
        )
    digest = sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    draft = DraftConsolidationRun(
        company_id=company, comparison_id=run.id, actor_id=user.id, snapshot=snapshot, digest=digest
    )
    db.add(draft)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "consolidation.draft_created",
        draft.id,
        {"comparison_id": run.id, "digest": digest},
    )
    return read_draft(db, company, user, draft.id)


def read_draft(db: Session, company: str, user: m.User, identifier: str) -> dict:
    draft = get_entity(db, DraftConsolidationRun, company, identifier)
    authorize_all(db, company, draft.snapshot["company_ids"], user)
    from .consolidation_approval_service import summary

    return serialize_fact(draft) | summary(db, company, user, draft)
