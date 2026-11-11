"""Durable session-wide question barrier and repeatable publication."""

from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from .errors import DomainError, require
from .ingestion import FAMILY_LABELS, REQUIRED, Sheet, interpret
from .models import (
    AuditEvent,
    BankMovement,
    Interpretation,
    Invoice,
    InvoiceSnapshot,
    Job,
    JournalLine,
    Notification,
    Period,
    PersonnelRecord,
    PlannedPayment,
    ProcessingIssue,
    ProcessingSession,
    ResultManifest,
    Settlement,
    SourceFile,
    SourceRow,
    User,
)
from .normalization import ENTRY_TYPES, ROLES

FACTS = {
    "personnel": PersonnelRecord,
    "ledger": JournalLine,
    "bank": BankMovement,
    "invoices": Invoice,
    "settlements": Settlement,
    "moadian": InvoiceSnapshot,
}
COVERAGE_FIELDS = [
    {"key": "ledger_complete", "label": "دفتر و افتتاحیه دوره کامل است"},
    {"key": "invoice_complete", "label": "فاکتورهای باز و دوره کامل است"},
    {"key": "settlements_complete", "label": "تاریخچه دریافت و پرداخت تا پایان دوره کامل است"},
    {"key": "tax_complete", "label": "ثبت مالیات عملکرد کامل است"},
    {"key": "bank_complete", "label": "همه حساب‌های بانکی موجود است"},
    {"key": "future_payments_complete", "label": "برنامه همه پرداخت‌های ۳۰ روز آینده کامل است"},
    {"key": "comparable_ar", "label": "دامنه تجاری و طرف حساب مطالبات دو مبنا یکسان است"},
    {"key": "comparable_ap", "label": "دامنه تجاری و طرف حساب بدهی دو مبنا یکسان است"},
]


ROLE_LABELS = {
    "revenue": "درآمد",
    "other_income": "سایر درآمدها",
    "operating_expense": "هزینه عملیاتی",
    "payroll_expense": "هزینه حقوق",
    "income_tax_expense": "هزینه مالیات عملکرد",
    "cogs": "بهای تمام‌شده",
    "bank_fee": "کارمزد بانک",
    "trade_ar": "دریافتنی تجاری",
    "other_ar": "سایر دریافتنی‌ها",
    "trade_ap": "پرداختنی تجاری",
    "loan_payable": "بدهی وام",
    "payroll_payable": "حقوق پرداختنی",
    "tax_payable": "مالیات پرداختنی",
    "other_payable": "سایر بدهی‌ها",
    "inventory": "موجودی کالا",
    "capital": "سرمایه",
    "asset": "دارایی",
    "cash": "صندوق",
    "bank": "بانک",
}


def question_code(prefix: str, key: str) -> str:
    """Keep arbitrarily named source sheets inside the database code length."""
    return prefix + ":" + sha256(key.encode()).hexdigest()[:16]


def audit(
    db: Session, company: str, actor: str | None, action: str, entity: str, details: dict | None = None
) -> None:
    db.add(
        AuditEvent(company_id=company, actor_id=actor, action=action, entity_id=entity, details=details or {})
    )


def enqueue(db: Session, session: ProcessingSession) -> None:
    db.add(Job(company_id=session.company_id, session_id=session.id, generation=session.version))


def issue(
    db: Session,
    session: ProcessingSession,
    code: str,
    question: str,
    choices: list,
    evidence: dict,
    file_id: str | None = None,
) -> ProcessingIssue:
    existing = db.scalar(
        select(ProcessingIssue).where(
            ProcessingIssue.company_id == session.company_id,
            ProcessingIssue.session_id == session.id,
            ProcessingIssue.code == code,
            ProcessingIssue.file_id == file_id,
        )
    )
    if existing:
        return existing
    item = ProcessingIssue(
        company_id=session.company_id,
        session_id=session.id,
        file_id=file_id,
        code=code,
        question=question,
        choices=choices,
        evidence=evidence,
    )
    db.add(item)
    db.flush()
    session.state = "waiting_input"
    session.version += 1
    db.add(Notification(company_id=session.company_id, title=question, href=f"/uploads/{session.id}"))
    audit(
        db,
        session.company_id,
        None,
        "processing.question_opened",
        item.id,
        {"code": code, "session_id": session.id},
    )
    return item


def open_issues(db: Session, session: ProcessingSession) -> list[ProcessingIssue]:
    return list(
        db.scalars(
            select(ProcessingIssue)
            .where(
                ProcessingIssue.company_id == session.company_id,
                ProcessingIssue.session_id == session.id,
                ProcessingIssue.answer.is_(None),
            )
            .order_by(ProcessingIssue.created_at, ProcessingIssue.id)
        )
    )


def latest_interpretations(db: Session, company: str, file: str) -> list[Interpretation]:
    all_versions = db.scalars(
        select(Interpretation)
        .where(Interpretation.company_id == company, Interpretation.file_id == file)
        .order_by(Interpretation.created_at, Interpretation.id)
    )
    latest = {}
    for item in all_versions:
        latest[item.sheet] = item
    return list(latest.values())


def processing_interpretations(db: Session, source: SourceFile) -> list[Interpretation]:
    """Recognize older uploads without changing their rows or earlier interpretations."""
    items = latest_interpretations(db, source.company_id, source.id)
    for index, current in enumerate(items):
        headers = current.evidence.get("headers", [])
        if (
            current.provenance != "validated_header_rules"
            or current.family != "unknown"
        ):
            continue
        detected = interpret(Sheet(current.sheet, headers, []), source.name)
        if detected["family"] not in {"ledger", "moadian_sales", "moadian_purchases"}:
            continue
        rows = db.execute(
            select(SourceRow.row_number, SourceRow.values)
            .where(
                SourceRow.company_id == source.company_id,
                SourceRow.file_id == source.id,
                SourceRow.sheet == current.sheet,
            )
            .order_by(SourceRow.row_number)
        ).all()
        proposal = interpret(Sheet(current.sheet, headers, [(number, values) for number, values in rows]), source.name)
        proposal["evidence"]["source_interpretation_id"] = current.id
        updated = Interpretation(
            company_id=source.company_id,
            file_id=source.id,
            sheet=current.sheet,
            provenance="validated_header_rules",
            **proposal,
        )
        db.add(updated)
        db.flush()
        items[index] = updated
    return items


def check_interpretations(db: Session, session: ProcessingSession, files: list[SourceFile]) -> bool:
    for source in files:
        if source.state == "excluded_overlap":
            continue
        for interpretation in processing_interpretations(db, source):
            family = interpretation.family
            evidence = {**interpretation.evidence, "filename": source.name, "sheet": interpretation.sheet}
            missing = [k for k in REQUIRED.get(family, []) if k not in interpretation.mapping]
            if family not in REQUIRED or missing:
                issue(
                    db,
                    session,
                    question_code("mapping", interpretation.sheet),
                    "این شیت چه اطلاعاتی دارد؟",
                    [{"value": k, "label": v} for k, v in FAMILY_LABELS.items()],
                    {
                        **evidence,
                        "required_by_family": REQUIRED,
                        "mapping": interpretation.mapping,
                        "family": family,
                    },
                    source.id,
                )
                return False
            if interpretation.family != "employees" and (not interpretation.unit or interpretation.unit == "unsupported"):
                if interpretation.unit == "unsupported":
                    issue(
                        db,
                        session,
                        question_code("unsupported_currency", interpretation.sheet),
                        "فایل ارزی خارج از دامنه است.",
                        [
                            {"value": "exclude", "label": "ادامه بدون این فایل"},
                            {"value": "cancel", "label": "لغو نوبت"},
                        ],
                        evidence,
                        source.id,
                    )
                else:
                    issue(
                        db,
                        session,
                        question_code("unit", interpretation.sheet),
                        "واحد مبلغ این شیت چیست؟",
                        [{"value": "IRR", "label": "ریال"}, {"value": "TOMAN", "label": "تومان"}],
                        evidence,
                        source.id,
                    )
                return False
            if not interpretation.calendar:
                issue(
                    db,
                    session,
                    question_code("calendar", interpretation.sheet),
                    "تقویم تاریخ‌های این شیت چیست؟",
                    [{"value": "jalali", "label": "شمسی"}, {"value": "gregorian", "label": "میلادی"}],
                    evidence,
                    source.id,
                )
                return False
    return True


def answer_issue(
    db: Session, user: User, question: ProcessingIssue, value, expected_version: int, session_version: int
) -> dict:
    session = db.get(ProcessingSession, question.session_id)
    assert session
    require(
        question.answer is None
        and question.version == expected_version
        and session.version == session_version
        and session.state == "waiting_input",
        "stale_question",
        "سؤال تغییر کرده؛ صفحه را تازه کنید.",
        409,
    )
    code = question.code.split(":")[0]
    if code == "period":
        period = db.get(Period, value) if isinstance(value, str) else None
        require(
            period is not None and period.company_id == session.company_id,
            "invalid_period",
            "یک دوره مالی شرکت را انتخاب کنید.",
        )
        from .period_lock_service import require_open_period

        require_open_period(db, session.company_id, period.id)
        session.period_id = period.id
    elif code == "coverage":
        require(
            isinstance(value, dict)
            and set(value) <= {f["key"] for f in COVERAGE_FIELDS}
            and all(type(v) is bool for v in value.values()),
            "invalid_coverage",
            "پوشش منابع را مشخص کنید.",
        )
        value = {f["key"]: value.get(f["key"], False) for f in COVERAGE_FIELDS}
    elif code in ("mapping", "unit", "calendar"):
        sheet = question.evidence["sheet"]
        current = next(
            v for v in latest_interpretations(db, session.company_id, question.file_id) if v.sheet == sheet
        )
        update = {
            "family": current.family,
            "mapping": current.mapping,
            "unit": current.unit,
            "calendar": current.calendar,
        }
        if code == "mapping":
            require(isinstance(value, dict), "invalid_mapping", "نوع منبع و ستون‌ها را انتخاب کنید.")
            family, mapping = value.get("family"), value.get("mapping")
            require(
                family in REQUIRED and isinstance(mapping, dict),
                "invalid_mapping",
                "نوع منبع و ستون‌ها را انتخاب کنید.",
            )
            require(
                set(REQUIRED[family]) <= set(mapping)
                and all(header in question.evidence["headers"] for header in mapping.values())
                and len(set(mapping.values())) == len(mapping),
                "invalid_mapping",
                "هر ستون باید به یک فیلد معتبر متصل باشد.",
            )
            require(
                set(mapping)
                <= set(current.mapping)
                | set(REQUIRED[family])
                | {
                    "entry_id",
                    "currency",
                    "tax",
                    "tax_id",
                    "due_date",
                    "party_id",
                    "reference",
                    "balance",
                    "row_type",
                    "anchor_cutoff",
                    "parent_reference",
                    "direction",
                    "bank_account",
                    "bank_reference",
                    "role",
                    "entry_type",
                },
                "invalid_mapping",
                "فیلد نگاشت معتبر نیست.",
            )
            update.update(family=family, mapping=mapping)
            if value.get("unit") in ("IRR", "TOMAN"):
                update["unit"] = value["unit"]
            if value.get("calendar") in ("jalali", "gregorian"):
                update["calendar"] = value["calendar"]
        else:
            choices = [v["value"] for v in question.choices]
            require(value in choices, "invalid_answer", "یکی از گزینه‌ها را انتخاب کنید.")
            update[code] = value
        db.add(
            Interpretation(
                company_id=session.company_id,
                file_id=question.file_id,
                sheet=sheet,
                provenance="human",
                evidence={**current.evidence, "question_id": question.id, "actor_id": user.id},
                **update,
            )
        )
    elif code in ("receipt_date", "payment_date"):
        from .ingestion import parsed_date

        require(
            isinstance(value, str),
            "invalid_expected_date",
            "تاریخ مورد انتظار یا زمان نامعلوم را انتخاب کنید.",
        )
        if value != "unknown":
            period = db.get(Period, session.period_id)
            expected_date = parsed_date(value, "gregorian")
            require(
                period is not None and expected_date > period.end,
                "expected_date_not_future",
                "تاریخ باید پس از پایان دوره باشد.",
            )
            value = expected_date.isoformat()
    elif code in ("bank_account", "anchor_cutoff", "account_role", "entry_type"):
        require(bool(question.file_id), "invalid_question_scope", "دامنه سؤال مشخص نیست.", 409)
        interpretations = latest_interpretations(db, session.company_id, question.file_id)
        if code == "bank_account":
            require(
                isinstance(value, str)
                and 0 < len(value.strip()) <= 100
                and value.strip().casefold() not in {"csv", "sheet", "sheet1", "شیت ۱", "شیت۱"},
                "invalid_bank_account",
                "شناسه روشن حساب بانکی را وارد کنید.",
            )
            value = value.strip()
        elif code == "anchor_cutoff":
            require(
                value in ("start_of_day", "end_of_day"),
                "invalid_anchor_cutoff",
                "برش ابتدا یا پایان روز را انتخاب کنید.",
            )
        elif code == "entry_type":
            require(
                isinstance(value, str) and value in ENTRY_TYPES,
                "invalid_entry_type",
                "نوع سند را انتخاب کنید.",
            )
        else:
            require(
                isinstance(value, str) and value in ROLES, "invalid_account_role", "نقش حساب را انتخاب کنید."
            )
        for current in interpretations:
            if code != "account_role" and current.sheet != question.evidence["sheet"]:
                continue
            if code == "account_role" and current.family != "ledger":
                continue
            evidence = dict(current.evidence)
            if code == "account_role":
                account = question.evidence["account_code"]
                evidence["role_overrides"] = {**evidence.get("role_overrides", {}), account: value}
                evidence["role_decisions"] = {
                    **evidence.get("role_decisions", {}),
                    account: {
                        "question_id": question.id,
                        "actor_id": user.id,
                        "policy_version": session.policy_version,
                        "scope": "file_account",
                    },
                }
            elif code == "entry_type":
                evidence["entry_type_overrides"] = {
                    **evidence.get("entry_type_overrides", {}),
                    question.evidence["entry_key"]: value,
                }
                evidence["entry_type_decisions"] = {
                    **evidence.get("entry_type_decisions", {}),
                    question.evidence["entry_key"]: {
                        "question_id": question.id,
                        "actor_id": user.id,
                        "policy_version": session.policy_version,
                    },
                }
            else:
                evidence["account" if code == "bank_account" else "anchor_cutoff"] = value
                evidence["question_id"] = question.id
                evidence["actor_id"] = user.id
            db.add(
                Interpretation(
                    company_id=session.company_id,
                    file_id=question.file_id,
                    sheet=current.sheet,
                    family=current.family,
                    mapping=current.mapping,
                    unit=current.unit,
                    calendar=current.calendar,
                    provenance="human",
                    evidence=evidence,
                )
            )
    elif code in ("invalid_rows", "unsupported_currency", "overlap", "overlap_current"):
        require(
            value in [v["value"] for v in question.choices],
            "invalid_answer",
            "یکی از گزینه‌ها را انتخاب کنید.",
        )
        if value == "cancel":
            session.state = "cancelled"
        elif value == "exclude":
            source = db.get(SourceFile, question.file_id)
            assert source
            source.state = "excluded_overlap"
    else:
        raise DomainError("unknown_question", "پاسخ این سؤال پشتیبانی نمی‌شود.")
    question.answer = {"value": value}
    question.answered_by = user.id
    question.version += 1
    session.version += 1
    audit(
        db,
        session.company_id,
        user.id,
        "processing.answer_submitted",
        question.id,
        {"value": value, "question_version": expected_version, "session_version": session_version},
    )
    db.flush()
    if session.state != "cancelled" and not open_issues(db, session):
        session.state = "sealed"
        enqueue(db, session)
    return {"session_id": session.id, "state": session.state, "version": session.version}


def serialize_fact(item) -> dict:
    return {column.name: getattr(item, column.name) for column in item.__table__.columns}


def records_for(db: Session, company: str, row_ids: list[str]) -> dict:
    # Chunk IN clauses for SQLite, retaining exact manifest row selection.
    records = {key: [] for key in FACTS}
    for start in range(0, len(row_ids), 500):
        for key, cls in FACTS.items():
            records[key].extend(
                serialize_fact(item)
                for item in db.scalars(
                    select(cls).where(
                        cls.company_id == company, cls.source_row_id.in_(row_ids[start : start + 500])
                    )
                )
            )
    return records


def source_rows_for(db: Session, company: str, row_ids: list[str]) -> dict[str, SourceRow]:
    result = {}
    for start in range(0, len(row_ids), 500):
        for row in db.scalars(
            select(SourceRow).where(
                SourceRow.company_id == company, SourceRow.id.in_(row_ids[start : start + 500])
            )
        ):
            result[row.id] = row
    return result


def logical_key(item) -> tuple:
    if isinstance(item, PersonnelRecord):
        return (item.__tablename__, item.kind, item.employee_id, item.date)
    if isinstance(item, JournalLine):
        return (
            item.__tablename__,
            item.entry_id,
            item.date,
            item.account,
            item.debit,
            item.credit,
            item.party_id,
        )
    if isinstance(item, BankMovement):
        if item.kind in {"opening", "anchor", "snapshot", "balance_anchor"}:
            return (item.__tablename__, item.account, "anchor", item.date, item.anchor_cutoff)
        return (
            (item.__tablename__, item.account, "reference", item.reference)
            if item.reference
            else (
                item.__tablename__,
                item.account,
                "unreferenced_fingerprint",
                item.date,
                item.amount,
                item.party_id,
                item.kind,
            )
        )
    if isinstance(item, Invoice):
        return (item.__tablename__, item.direction, item.reference)
    if isinstance(item, Settlement):
        return (item.__tablename__, item.reference)
    if isinstance(item, InvoiceSnapshot):
        return (item.__tablename__, item.direction, item.tax_id)
    return ("plan", item.obligation_id)


def process(db: Session, job: Job) -> None:
    from .finance import calculate, comparison
    from .forecast_workflow import prepare_forecast
    from .models import Allocation
    from .period_lock_service import require_open_period
    from .workflow_pipeline import (
        apply_excluded_source_coverage_drops,
        extract_and_normalize_candidates,
        publish_manifest_and_findings,
        resolve_session_coverage,
        validate_inter_session_overlap,
        validate_intra_session_overlap,
        validate_journal_balance,
        validate_session_preconditions,
    )

    session = db.get(ProcessingSession, job.session_id)
    assert session
    if not validate_session_preconditions(db, session, open_issues, issue):
        job.state = "done"
        return

    files = list(
        db.scalars(
            select(SourceFile)
            .where(SourceFile.company_id == session.company_id, SourceFile.session_id == session.id)
            .order_by(SourceFile.created_at, SourceFile.id)
        )
    )
    if not check_interpretations(db, session, files):
        job.state = "done"
        return

    coverage = resolve_session_coverage(db, session, COVERAGE_FIELDS, issue)
    if coverage is None:
        job.state = "done"
        return

    extracted = extract_and_normalize_candidates(
        db, session, files, latest_interpretations, question_code, issue, ROLE_LABELS
    )
    if extracted is None:
        job.state = "done"
        return
    candidates, selected_rows = extracted

    current_rows = source_rows_for(db, session.company_id, selected_rows)
    if not validate_intra_session_overlap(db, session, candidates, current_rows, logical_key, issue):
        job.state = "done"
        return

    parent = db.get(ResultManifest, session.parent_id) if session.parent_id else None
    require(not parent or parent.company_id == session.company_id, "not_found", "نسخه مبنا پیدا نشد.", 404)

    is_inter_valid, parent_rows = validate_inter_session_overlap(
        db, session, candidates, current_rows, parent, logical_key, records_for, source_rows_for, issue, FACTS
    )
    if not is_inter_valid:
        job.state = "done"
        return

    if not validate_journal_balance(db, session, candidates, current_rows, issue):
        job.state = "done"
        return

    apply_excluded_source_coverage_drops(db, session, files, coverage, latest_interpretations, COVERAGE_FIELDS)

    row_ids = list(dict.fromkeys(parent_rows + selected_rows))
    period = db.get(Period, session.period_id)
    assert period
    require_open_period(db, session.company_id, period.id)

    period_values = {"id": period.id, "start": period.start.isoformat(), "end": period.end.isoformat()}
    forecast_context = prepare_forecast(db, session, period_values, coverage, row_ids, candidates, parent)
    if forecast_context["blocked"]:
        job.state = "done"
        return

    coverage = forecast_context["coverage"]
    db.add_all(candidates)
    db.flush()
    records = records_for(db, session.company_id, row_ids)
    coverage["bank_accounts"] = sorted({r["account"] for r in records["bank"]})

    banks_by_id = {row["id"]: row for row in records["bank"]}
    invoice_ids = {row["id"] for row in records["invoices"]}
    allocations = [
        {**serialize_fact(v), "date": banks_by_id[v.bank_id]["date"]}
        for v in db.scalars(
            select(Allocation).where(
                Allocation.company_id == session.company_id, Allocation.reversed_at.is_(None)
            )
        )
        if v.bank_id in banks_by_id and v.invoice_id in invoice_ids
    ]
    plans = [
        serialize_fact(v)
        for v in db.scalars(
            select(PlannedPayment).where(
                PlannedPayment.company_id == session.company_id, PlannedPayment.state == "confirmed"
            )
        )
        if not v.source_row_id or v.source_row_id in row_ids
    ]
    result = calculate(
        records,
        {"id": period.id, "start": period.start.isoformat(), "end": period.end.isoformat()},
        coverage,
        allocations=allocations,
        plans=forecast_context["plans"],
    )
    result["details"]["forecast"]["assumptions"] = forecast_context["assumptions"]
    result["details"]["forecast"]["history_event_count"] = len(forecast_context["history"])

    previous_period = (
        db.scalar(
            select(Period).where(
                Period.company_id == session.company_id, Period.id == period.previous_period_id
            )
        )
        if period.previous_period_id
        else None
    )
    previous_manifest = (
        db.scalar(
            select(ResultManifest)
            .where(
                ResultManifest.company_id == session.company_id,
                ResultManifest.period_id == previous_period.id,
            )
            .order_by(ResultManifest.created_at.desc(), ResultManifest.id.desc())
            .limit(1)
        )
        if previous_period
        else None
    )
    if previous_manifest:
        previous_metrics = {
            (item["metric_key"], item["basis"], item["scope"]): item for item in previous_manifest.metrics
        }
        for observation in result["metrics"]:
            prior = previous_metrics.get(
                (observation["metric_key"], observation["basis"], observation["scope"])
            )
            if prior and prior["status"] == "available" and observation["status"] == "available":
                observation["comparison"] = comparison(observation["value"], prior["value"]) | {
                    "previous_manifest_id": previous_manifest.id,
                    "previous_period_id": previous_period.id,
                    "current_days": (period.end - period.start).days + 1,
                    "previous_days": (previous_period.end - previous_period.start).days + 1,
                }

    publish_manifest_and_findings(
        db,
        session,
        period,
        result,
        records,
        coverage,
        row_ids,
        files,
        parent,
        previous_manifest,
        forecast_context,
        allocations,
        plans,
        source_rows_for,
        latest_interpretations,
        audit,
    )
    job.state = "done"
