"""Durable session-wide question barrier and repeatable publication."""

import json
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from .errors import DomainError, require
from .ingestion import FAMILY_LABELS, REQUIRED, Sheet, interpret
from .models import (
    AuditEvent,
    BankMovement,
    Finding,
    Interpretation,
    Invoice,
    InvoiceSnapshot,
    Job,
    JournalLine,
    Membership,
    Notification,
    Period,
    PersonnelRecord,
    PlannedPayment,
    ProcessingIssue,
    ProcessingSession,
    Report,
    ResultManifest,
    Settlement,
    SourceFile,
    SourceRow,
    User,
)
from .normalization import ENTRY_TYPES, ROLES, journal_entry_type_key, normalize

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
    from .finance import calculate
    from .models import Allocation

    session = db.get(ProcessingSession, job.session_id)
    assert session
    if session.result_id or session.state in ("cancelled", "completed", "completed_limited"):
        job.state = "done"
        return
    member = db.scalar(
        select(Membership).where(
            Membership.company_id == session.company_id,
            Membership.user_id == session.actor_id,
            Membership.active.is_(True),
        )
    )
    actor = db.get(User, session.actor_id)
    if not member or member.role == "viewer" or not actor or not actor.active:
        session.state, session.error_code, session.error_message, job.state = (
            "failed",
            "permission_revoked",
            "دسترسی پردازش لغو شده است.",
            "done",
        )
        return
    if open_issues(db, session):
        session.state, job.state = "waiting_input", "done"
        return
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
        issue(
            db,
            session,
            "period",
            "این نوبت مربوط به کدام دوره است؟",
            [{"value": p.id, "label": p.name} for p in periods],
            {"action": "/settings/periods"},
        )
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
    coverage_answer = db.scalar(
        select(ProcessingIssue).where(
            ProcessingIssue.company_id == session.company_id,
            ProcessingIssue.session_id == session.id,
            ProcessingIssue.code == "coverage",
        )
    )
    if not coverage_answer:
        issue(db, session, "coverage", "کدام بخش از پوشش منابع تأیید می‌شود؟", [], {"fields": COVERAGE_FIELDS})
        job.state = "done"
        return
    coverage = dict(coverage_answer.answer["value"]) if coverage_answer.answer else {}
    candidates, selected_rows = [], []
    for source in files:
        if source.state == "excluded_overlap":
            continue
        interpretations = {i.sheet: i for i in latest_interpretations(db, session.company_id, source.id)}
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
                    issue(
                        db,
                        session,
                        question_code("bank_account", row.sheet),
                        "این شیت مربوط به کدام حساب بانکی است؟",
                        [],
                        {**evidence, "kind": "text", "label": "شناسه حساب بانکی"},
                        source.id,
                    )
                elif error.code == "anchor_cutoff_ambiguous":
                    issue(
                        db,
                        session,
                        question_code("anchor_cutoff", row.sheet),
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
                    issue(
                        db,
                        session,
                        question_code("account_role", account),
                        "نقش این حساب چیست؟",
                        [{"value": role, "label": ROLE_LABELS[role]} for role in sorted(ROLES)],
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
                    issue(
                        db,
                        session,
                        question_code("entry_type", entry_key),
                        "نوع این سند چیست؟" if entry_id else "نوع ثبت این ردیف چیست؟",
                        [{"value": key, "label": label} for key, label in labels.items()],
                        {**evidence, "entry_id": entry_id, "entry_date": entry_date, "entry_key": entry_key},
                        source.id,
                    )
                else:
                    issue(
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
                job.state = "done"
                return
    # Separate logical identity from the value fingerprint. Two real equal-value
    # transactions with distinct references remain independent. Reused references
    # across files require an explicit choice; they are never merged automatically.
    current_rows = source_rows_for(db, session.company_id, selected_rows)
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
                issue(
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
                job.state = "done"
                return
            journal_files_by_date.setdefault(item.date, set()).add(source.file_id)
            if item.entry_id:
                journal_sources[identity] = source.file_id
            else:
                unnumbered_files_by_date.setdefault(item.date, set()).add(source.file_id)
            continue
        key = logical_key(item)
        source = current_rows[item.source_row_id]
        if key in seen:
            previous = current_rows[seen[key].source_row_id]
            code = "overlap_current" if previous.file_id != source.file_id else "invalid_rows"
            issue(
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
            job.state = "done"
            return
        seen[key] = item
    parent = db.get(ResultManifest, session.parent_id) if session.parent_id else None
    require(not parent or parent.company_id == session.company_id, "not_found", "نسخه مبنا پیدا نشد.", 404)
    parent_rows = list(parent.selection.get("row_ids", [])) if parent else []
    parent_row_map = source_rows_for(db, session.company_id, parent_rows)
    old_records = records_for(db, session.company_id, parent_rows)
    old_keys = {}
    old_journal_rows_by_date = {}
    old_unnumbered_rows_by_date = {}
    for key, cls in FACTS.items():
        for values in old_records[key]:
            item = cls(**values)
            if isinstance(item, JournalLine):
                old_journal_rows_by_date.setdefault(item.date, set()).add(item.source_row_id)
                if not item.entry_id:
                    old_unnumbered_rows_by_date.setdefault(item.date, set()).add(item.source_row_id)
            identity = (
                ("journal_document", item.entry_id, item.date)
                if isinstance(item, JournalLine)
                else logical_key(item)
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
        old_keys.setdefault(logical_key(plan), set()).add(plan.source_row_id)
    overlap_files = {}
    for item in candidates:
        identity = (
            ("journal_document", item.entry_id, item.date)
            if isinstance(item, JournalLine)
            else logical_key(item)
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
            issue(
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
            job.state = "done"
            return
        if answer.answer and answer.answer["value"] == "replace":
            old_files = answer.evidence["old_file_ids"]
            parent_rows = [rid for rid in parent_rows if parent_row_map[rid].file_id not in old_files]
    # A document's balance cannot be repaired by another file or another date.
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
        issue(
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
        job.state = "done"
        return
    # Excluding a source invalidates its completeness declaration. Unknown effects
    # cannot become a complete zero just because the remaining rows are readable.
    family_coverage = {
        "ledger": ["ledger_complete", "tax_complete", "comparable_ar", "comparable_ap"],
        "bank": ["bank_complete"],
        "sales": ["invoice_complete", "comparable_ar"],
        "purchases": ["invoice_complete", "comparable_ap"],
        "settlements": ["settlements_complete", "comparable_ar", "comparable_ap"],
    }
    for source in files:
        if source.state == "excluded_overlap":
            for interpretation in latest_interpretations(db, session.company_id, source.id):
                # A deliberate duplicate exclusion does not remove the matching
                # parent source; other exclusions have unknown financial effects.
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
                        [f["key"] for f in COVERAGE_FIELDS] if interpretation.family == "unknown" else [],
                    ):
                        coverage[field] = False
    # Date questions are preflighted before inserting canonical facts. A paused
    # session can therefore replay safely without duplicating financial effects.
    from .forecast_workflow import prepare_forecast

    row_ids = list(dict.fromkeys(parent_rows + selected_rows))
    period = db.get(Period, session.period_id)
    assert period
    from .period_lock_service import require_open_period

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
    period = db.get(Period, session.period_id)
    assert period
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
    # Comparisons read another frozen report, never infer prior coverage from dates.
    from .finance import comparison

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
    selected_file_ids = {row.file_id for row in source_rows_for(db, session.company_id, row_ids).values()}
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
            for item in latest_interpretations(db, session.company_id, source.id)
        ],
    }

    def encode(value):
        return value.isoformat() if hasattr(value, "isoformat") else str(value)

    # Stable facts and exact decisions are frozen, including all inherited source versions.
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
    # Every reporting area has its own coverage; full ledger metrics alone do not
    # make an unavailable forecast or missing tax snapshot complete.
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
    session.completed_steps, session.version, job.state = 4, session.version + 1, "done"
    db.add(Notification(company_id=session.company_id, title="گزارش تازه آماده است", href="/reports"))
    from .automation_service import on_manifest

    on_manifest(db, session.company_id, manifest)
    audit(
        db,
        session.company_id,
        None,
        "report.generated",
        manifest.id,
        {"digest": digest, "state": session.state, "row_count": len(row_ids)},
    )
