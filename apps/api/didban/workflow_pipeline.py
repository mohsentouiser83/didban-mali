"""Pipeline stages for processing session execution, normalization, and publication."""

import json
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from .errors import DomainError, require
from .models import (
    Allocation,
    Finding,
    JournalLine,
    Membership,
    Notification,
    Period,
    PlannedPayment,
    ProcessingIssue,
    ProcessingSession,
    Report,
    ResultManifest,
    SourceFile,
    SourceRow,
    User,
)
from .normalization import ROLES, journal_entry_type_key, normalize


def validate_session_preconditions(
    db: Session,
    session: ProcessingSession,
    open_issues_fn,
    issue_fn,
) -> bool:
    """Validate permissions, active state, and period selection. Return False if execution should halt."""
    if session.result_id or session.state in ("cancelled", "completed", "completed_limited"):
        return False

    member = db.scalar(
        select(Membership).where(
            Membership.company_id == session.company_id,
            Membership.user_id == session.actor_id,
            Membership.active.is_(True),
        )
    )
    actor = db.get(User, session.actor_id)
    if not member or member.role == "viewer" or not actor or not actor.active:
        session.state, session.error_code, session.error_message = (
            "failed",
            "permission_revoked",
            "دسترسی پردازش لغو شده است.",
        )
        return False

    if open_issues_fn(db, session):
        session.state = "waiting_input"
        return False

    require(
        session.state in ("sealed", "processing", "waiting_dependency"),
        "invalid_session_state",
        "وضعیت پردازش معتبر نیست.",
        409,
    )
    session.state = "processing"

    if not session.period_id:
        periods = list(
            db.scalars(
                select(Period).where(Period.company_id == session.company_id).order_by(Period.start.desc())
            )
        )
        issue_fn(
            db,
            session,
            "period",
            "این نوبت مربوط به کدام دوره است؟",
            [{"value": p.id, "label": p.name} for p in periods],
            {"action": "/settings/periods"},
        )
        return False

    return True


def resolve_session_coverage(
    db: Session,
    session: ProcessingSession,
    coverage_fields: list[dict],
    issue_fn,
) -> dict | None:
    """Ensure explicit coverage declaration exists. If missing, open coverage issue and return None."""
    coverage_answer = db.scalar(
        select(ProcessingIssue).where(
            ProcessingIssue.company_id == session.company_id,
            ProcessingIssue.session_id == session.id,
            ProcessingIssue.code == "coverage",
        )
    )
    if not coverage_answer:
        issue_fn(db, session, "coverage", "کدام بخش از پوشش منابع تأیید می‌شود؟", [], {"fields": coverage_fields})
        return None
    return dict(coverage_answer.answer["value"]) if coverage_answer.answer else {}


def extract_and_normalize_candidates(
    db: Session,
    session: ProcessingSession,
    files: list[SourceFile],
    latest_interpretations_fn,
    question_code_fn,
    issue_fn,
    role_labels: dict,
) -> tuple[list, list[str]] | None:
    """Normalize rows for non-excluded files. Raise domain issues on ambiguity. Return None if halted."""
    candidates, selected_rows = [], []
    for source in files:
        if source.state == "excluded_overlap":
            continue
        interpretations = {i.sheet: i for i in latest_interpretations_fn(db, session.company_id, source.id)}
        rows = db.scalars(
            select(SourceRow)
            .where(SourceRow.company_id == session.company_id, SourceRow.file_id == source.id)
            .order_by(SourceRow.row_number)
        )
        for row in rows:
            try:
                item = normalize(row, interpretations[row.sheet], session.id)
                if item is not None:
                    candidates.append(item)
                selected_rows.append(row.id)
            except DomainError as error:
                evidence = {
                    "filename": source.name,
                    "sheet": row.sheet,
                    "row_number": row.row_number,
                    "sample": [row.values],
                    "reason_code": error.code,
                }
                if error.code == "bank_account_ambiguous":
                    issue_fn(
                        db,
                        session,
                        question_code_fn("bank_account", row.sheet),
                        "این شیت مربوط به کدام حساب بانکی است؟",
                        [],
                        {**evidence, "kind": "text", "label": "شناسه حساب بانکی"},
                        source.id,
                    )
                elif error.code == "anchor_cutoff_ambiguous":
                    issue_fn(
                        db,
                        session,
                        question_code_fn("anchor_cutoff", row.sheet),
                        "مانده مبنا مربوط به چه زمانی از روز است؟",
                        [
                            {"value": "start_of_day", "label": "ابتدای روز"},
                            {"value": "end_of_day", "label": "پایان روز"},
                        ],
                        evidence,
                        source.id,
                    )
                elif error.code == "account_role_ambiguous":
                    account_column = interpretations[row.sheet].mapping.get("account", "")
                    account = str(row.values.get(account_column, "")).strip()
                    role_column = interpretations[row.sheet].mapping.get("role", "")
                    issue_fn(
                        db,
                        session,
                        question_code_fn("account_role", account),
                        "نقش این حساب چیست؟",
                        [{"value": role, "label": role_labels[role]} for role in sorted(ROLES)],
                        {**evidence, "account_code": account, "raw_role": row.values.get(role_column)},
                        source.id,
                    )
                elif error.code == "entry_type_ambiguous":
                    current = interpretations[row.sheet]
                    entry_id = str(row.values.get(current.mapping.get("entry_id", ""), "")).strip()
                    from .ingestion import parsed_date

                    entry_date = parsed_date(
                        row.values.get(current.mapping.get("date", ""), ""), current.calendar
                    ).isoformat()
                    entry_key = journal_entry_type_key(entry_id, entry_date, row.id)
                    labels = {
                        "regular": "سند عادی",
                        "opening": "افتتاحیه",
                        "closing": "اختتامیه",
                        "profit_transfer": "انتقال سود و زیان",
                        "closing_transfer": "انتقال اختتامیه",
                        "balance_transfer": "انتقال مانده",
                        "adjustment": "تعدیل واقعی",
                        "real_cogs_adjustment": "تعدیل واقعی بهای تمام‌شده",
                    }
                    issue_fn(
                        db,
                        session,
                        question_code_fn("entry_type", entry_key),
                        "نوع این سند چیست؟" if entry_id else "نوع ثبت این ردیف چیست؟",
                        [{"value": key, "label": label} for key, label in labels.items()],
                        {**evidence, "entry_id": entry_id, "entry_date": entry_date, "entry_key": entry_key},
                        source.id,
                    )
                else:
                    issue_fn(
                        db,
                        session,
                        "invalid_rows",
                        error.message,
                        [
                            {"value": "exclude", "label": "ادامه بدون این فایل"},
                            {"value": "cancel", "label": "لغو نوبت"},
                        ],
                        {**evidence, "impact": "اثر مبلغ ردیف نامعتبر مشخص نیست؛ فایل از نتیجه کنار می‌رود."},
                        source.id,
                    )
                return None
    return candidates, selected_rows


def validate_intra_session_overlap(
    db: Session,
    session: ProcessingSession,
    candidates: list,
    current_rows: dict[str, SourceRow],
    logical_key_fn,
    issue_fn,
) -> bool:
    """Check for cross-file document collisions or duplicated keys in current batch. Return False if halted."""
    seen = {}
    journal_sources = {}
    journal_files_by_date = {}
    unnumbered_files_by_date = {}
    for item in candidates:
        if isinstance(item, JournalLine):
            source = current_rows[item.source_row_id]
            identity = (item.entry_id, item.date)
            previous_file = journal_sources.get(identity) if item.entry_id else None
            same_document = previous_file and previous_file != source.file_id
            possible_overlap = unnumbered_files_by_date if item.entry_id else journal_files_by_date
            other_files = possible_overlap.get(item.date, set()) - {source.file_id}
            if same_document or other_files:
                issue_fn(
                    db,
                    session,
                    "overlap_current",
                    "شماره سند در دو فایل این نوبت مشترک است."
                    if same_document else "فایل‌های دفتر در یک تاریخ مشترک‌اند و بعضی ردیف‌ها شماره سند ندارند.",
                    [
                        {"value": "exclude", "label": "ادامه بدون این فایل"},
                        {"value": "cancel", "label": "لغو نوبت"},
                    ],
                    {
                        "filename": db.get(SourceFile, source.file_id).name,
                        "conflicting_file_id": previous_file if same_document else min(other_files),
                        "entry_id": item.entry_id,
                        "date": item.date.isoformat(),
                    },
                    source.file_id,
                )
                return False
            journal_files_by_date.setdefault(item.date, set()).add(source.file_id)
            if item.entry_id:
                journal_sources[identity] = source.file_id
            else:
                unnumbered_files_by_date.setdefault(item.date, set()).add(source.file_id)
            continue

        key = logical_key_fn(item)
        source = current_rows[item.source_row_id]
        if key in seen:
            previous = current_rows[seen[key].source_row_id]
            code = "overlap_current" if previous.file_id != source.file_id else "invalid_rows"
            issue_fn(
                db,
                session,
                code,
                "شناسه مالی در فایل‌های این نوبت تکرار شده است.",
                [
                    {"value": "exclude", "label": "ادامه بدون این فایل"},
                    {"value": "cancel", "label": "لغو نوبت"},
                ],
                {
                    "filename": db.get(SourceFile, source.file_id).name,
                    "conflicting_file_id": previous.file_id,
                    "sheet": source.sheet,
                    "row_number": source.row_number,
                    "reason_code": "financial_identity_ambiguous",
                },
                source.file_id,
            )
            return False
        seen[key] = item
    return True


def validate_inter_session_overlap(
    db: Session,
    session: ProcessingSession,
    candidates: list,
    current_rows: dict[str, SourceRow],
    parent: ResultManifest | None,
    logical_key_fn,
    records_for_fn,
    source_rows_for_fn,
    issue_fn,
    facts_map: dict,
) -> tuple[bool, list[str]]:
    """Check for overlap against parent manifest facts. Return (is_valid, parent_rows)."""
    parent_rows = list(parent.selection.get("row_ids", [])) if parent else []
    parent_row_map = source_rows_for_fn(db, session.company_id, parent_rows)
    old_records = records_for_fn(db, session.company_id, parent_rows)
    old_keys = {}
    old_journal_rows_by_date = {}
    old_unnumbered_rows_by_date = {}
    for key, cls in facts_map.items():
        for values in old_records[key]:
            item = cls(**values)
            if isinstance(item, JournalLine):
                old_journal_rows_by_date.setdefault(item.date, set()).add(item.source_row_id)
                if not item.entry_id:
                    old_unnumbered_rows_by_date.setdefault(item.date, set()).add(item.source_row_id)
            identity = (
                ("journal_document", item.entry_id, item.date)
                if isinstance(item, JournalLine)
                else logical_key_fn(item)
            )
            old_keys.setdefault(identity, set()).add(values["source_row_id"])

    old_plans = []
    for start in range(0, len(parent_rows), 500):
        old_plans.extend(
            db.scalars(
                select(PlannedPayment).where(
                    PlannedPayment.company_id == session.company_id,
                    PlannedPayment.source_row_id.in_(parent_rows[start : start + 500]),
                )
            )
        )
    for plan in old_plans:
        old_keys.setdefault(logical_key_fn(plan), set()).add(plan.source_row_id)

    overlap_files = {}
    for item in candidates:
        identity = (
            ("journal_document", item.entry_id, item.date)
            if isinstance(item, JournalLine)
            else logical_key_fn(item)
        )
        matching_rows = old_keys.get(identity, set())
        if isinstance(item, JournalLine):
            by_date = old_unnumbered_rows_by_date if item.entry_id else old_journal_rows_by_date
            matching_rows = matching_rows | by_date.get(item.date, set())
        if matching_rows:
            source = current_rows[item.source_row_id]
            overlap_files.setdefault(source.file_id, set()).update(matching_rows)

    for file_id, old_row_ids in overlap_files.items():
        answer = db.scalar(
            select(ProcessingIssue).where(
                ProcessingIssue.company_id == session.company_id,
                ProcessingIssue.session_id == session.id,
                ProcessingIssue.file_id == file_id,
                ProcessingIssue.code == "overlap",
            )
        )
        if not answer:
            old_file_ids = sorted({parent_row_map[row_id].file_id for row_id in old_row_ids})
            old_affected_rows = {
                row_id for row_id, row in parent_row_map.items() if row.file_id in old_file_ids
            }
            affected_bank_ids = {
                row["id"] for row in old_records["bank"] if row["source_row_id"] in old_affected_rows
            }
            affected_invoice_ids = {
                row["id"] for row in old_records["invoices"] if row["source_row_id"] in old_affected_rows
            }
            dependent_allocations = [
                a.id
                for a in db.scalars(
                    select(Allocation).where(
                        Allocation.company_id == session.company_id, Allocation.reversed_at.is_(None)
                    )
                )
                if a.bank_id in affected_bank_ids or a.invoice_id in affected_invoice_ids
            ]
            choices = [{"value": "exclude", "label": "حفظ نسخه قبلی؛ کنارگذاشتن فایل تازه"}]
            if not dependent_allocations:
                choices.append({"value": "replace", "label": "جایگزینی کامل فایل قبلی با فایل تازه"})
            else:
                choices.append({"value": "cancel", "label": "لغو نوبت و بررسی تخصیص‌های قبلی"})
            issue_fn(
                db,
                session,
                "overlap",
                "این فایل با نسخه قبلی هم‌پوشانی دارد.",
                choices,
                {
                    "old_file_ids": old_file_ids,
                    "overlap_rows": len(old_row_ids),
                    "dependent_allocation_ids": dependent_allocations,
                    "replacement_scope": "تمام ردیف‌های فایل‌های قبلی از نسخه تازه کنار می‌روند؛ گزارش قبلی محفوظ می‌ماند.",
                },
                file_id,
            )
            return False, parent_rows

        if answer.answer and answer.answer["value"] == "replace":
            old_files = answer.evidence["old_file_ids"]
            parent_rows = [rid for rid in parent_rows if parent_row_map[rid].file_id not in old_files]

    return True, parent_rows


def validate_journal_balance(
    db: Session,
    session: ProcessingSession,
    candidates: list,
    current_rows: dict[str, SourceRow],
    issue_fn,
) -> bool:
    """Ensure that debit equals credit for each numbered entry in every file. Return False if unbalanced."""
    journals = [v for v in candidates if isinstance(v, JournalLine) and v.entry_id]
    entries = {}
    with localcontext() as context:
        context.prec = 50
        for line in journals:
            source = current_rows[line.source_row_id]
            key = (source.file_id, line.date, line.entry_id)
            entries[key] = entries.get(key, Decimal(0)) + Decimal(line.debit) - Decimal(line.credit)
    failing = [(key, value) for key, value in entries.items() if value]
    if failing:
        file_id, entry_date, entry_id = failing[0][0]
        source_file = db.get(SourceFile, file_id)
        issue_fn(
            db,
            session,
            "invalid_rows",
            "اسناد دفتر تراز نیستند.",
            [{"value": "exclude", "label": "ادامه بدون این فایل"}, {"value": "cancel", "label": "لغو نوبت"}],
            {
                "unbalanced_entries": [
                    {"entry_id": key[2], "date": key[1].isoformat()}
                    for key, _ in failing
                    if key[0] == file_id
                ],
                "filename": source_file.name,
            },
            file_id,
        )
        return False
    return True


def apply_excluded_source_coverage_drops(
    db: Session,
    session: ProcessingSession,
    files: list[SourceFile],
    coverage: dict,
    latest_interpretations_fn,
    coverage_fields: list[dict],
) -> None:
    """Excluding a source invalidates its completeness declaration."""
    family_coverage = {
        "ledger": ["ledger_complete", "tax_complete", "comparable_ar", "comparable_ap"],
        "bank": ["bank_complete"],
        "sales": ["invoice_complete", "comparable_ar"],
        "purchases": ["invoice_complete", "comparable_ap"],
        "settlements": ["settlements_complete", "comparable_ar", "comparable_ap"],
    }
    for source in files:
        if source.state == "excluded_overlap":
            for interpretation in latest_interpretations_fn(db, session.company_id, source.id):
                overlap_answer = db.scalar(
                    select(ProcessingIssue).where(
                        ProcessingIssue.company_id == session.company_id,
                        ProcessingIssue.session_id == session.id,
                        ProcessingIssue.file_id == source.id,
                        ProcessingIssue.code.in_(["overlap", "overlap_current"]),
                        ProcessingIssue.answer.is_not(None),
                    )
                )
                if not overlap_answer:
                    for field in family_coverage.get(
                        interpretation.family,
                        [f["key"] for f in coverage_fields] if interpretation.family == "unknown" else [],
                    ):
                        coverage[field] = False


def publish_manifest_and_findings(
    db: Session,
    session: ProcessingSession,
    period: Period,
    result: dict,
    records: dict,
    coverage: dict,
    row_ids: list[str],
    files: list[SourceFile],
    parent: ResultManifest | None,
    previous_manifest: ResultManifest | None,
    forecast_context: dict,
    allocations: list,
    plans: list,
    source_rows_for_fn,
    latest_interpretations_fn,
    audit_fn,
) -> ResultManifest:
    """Freeze deterministic manifest, findings, and notifications."""
    selected_file_ids = {row.file_id for row in source_rows_for_fn(db, session.company_id, row_ids).values()}
    selected_files = [db.get(SourceFile, file_id) for file_id in sorted(selected_file_ids)]
    selection = {
        "row_ids": row_ids,
        "files": [{"id": f.id, "sha256": f.sha256, "scan_status": f.scan_status} for f in selected_files],
        "excluded_files": [{"id": f.id, "state": f.state} for f in files if f.state == "excluded_overlap"],
        "coverage": coverage,
        "period": {
            "id": period.id,
            "name": period.name,
            "start": period.start.isoformat(),
            "end": period.end.isoformat(),
        },
        "policy_version": session.policy_version,
        "parent_id": session.parent_id,
        "comparison_manifest_id": previous_manifest.id if previous_manifest else None,
        "allocations": allocations,
        "plans": plans,
        "forecast_plans": forecast_context["plans"],
        "decisions": forecast_context["decisions"],
        "interpretation_ids": [
            item.id
            for source in selected_files
            for item in latest_interpretations_fn(db, session.company_id, source.id)
        ],
    }

    def encode(value):
        return value.isoformat() if hasattr(value, "isoformat") else str(value)

    selection = json.loads(json.dumps(selection, default=encode))
    result = json.loads(json.dumps(result, default=encode))
    digest = sha256(json.dumps(selection, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    manifest = ResultManifest(
        company_id=session.company_id,
        session_id=session.id,
        period_id=period.id,
        digest=digest,
        selection=selection,
        metrics=result["metrics"],
        details=result["details"],
    )
    db.add(manifest)
    db.flush()
    db.add(Report(company_id=session.company_id, manifest_id=manifest.id, title=f"گزارش مالی {period.name}"))
    for metric in result["metrics"]:
        if metric["status"] in ("unavailable", "limited"):
            db.add(
                Finding(
                    company_id=session.company_id,
                    manifest_id=manifest.id,
                    code=(metric.get("reason_codes") or ["incomplete_scope"])[0],
                    title=metric.get("label", metric["metric_key"]),
                    evidence=metric.get("evidence_refs", []),
                )
            )

    reporting_scope = {
        "financial_metrics": all(item["status"] == "available" for item in result["metrics"]),
        "forecast": result["details"].get("forecast", {}).get("status") in ("available", "estimated"),
        "moadian_sales": any(item["direction"] == "sales" for item in records["moadian"]),
        "moadian_purchases": any(item["direction"] == "purchases" for item in records["moadian"]),
    }
    for _direction, items in result["details"].get("moadian", {}).items():
        for item in items:
            if item["status"] != "matched":
                titles = {
                    "amount_mismatch": "مبلغ صورتحساب مؤدیان با فاکتور متفاوت است",
                    "tax_mismatch": "مالیات صورتحساب مؤدیان متفاوت است",
                    "date_mismatch": "تاریخ صورتحساب مؤدیان متفاوت است",
                    "party_mismatch": "طرف حساب صورتحساب مؤدیان متفاوت است",
                    "portal_only": "صورتحساب فقط در فایل مؤدیان موجود است",
                    "internal_only": "فاکتور فقط در فایل داخلی موجود است",
                    "needs_review": "صورتحساب مؤدیان نیازمند بررسی است",
                }
                db.add(
                    Finding(
                        company_id=session.company_id,
                        manifest_id=manifest.id,
                        code="moadian_" + item["status"],
                        title=titles.get(item["status"], "صورتحساب مؤدیان نیازمند بررسی است"),
                        evidence=item.get("evidence_refs", []),
                    )
                )

    forecast_result = result["details"].get("forecast", {})
    if not reporting_scope["forecast"]:
        db.add(
            Finding(
                company_id=session.company_id,
                manifest_id=manifest.id,
                code=(forecast_result.get("reason_codes") or ["forecast_unavailable"])[0],
                title=forecast_result.get("reason") or "پیش‌بینی قابل محاسبه نیست",
                evidence=[],
            )
        )

    session.result_id = manifest.id
    session.state = "completed" if all(reporting_scope.values()) else "completed_limited"
    session.completed_steps, session.version = 4, session.version + 1
    db.add(Notification(company_id=session.company_id, title="گزارش تازه آماده است", href="/reports"))
    from .automation_service import on_manifest

    on_manifest(db, session.company_id, manifest)
    audit_fn(
        db,
        session.company_id,
        None,
        "report.generated",
        manifest.id,
        {"digest": digest, "state": session.state, "row_count": len(row_ids)},
    )
    return manifest
