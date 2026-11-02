"""Application services own authorization-sensitive rules and transactions."""

from decimal import Decimal, localcontext

from sqlalchemy import select
from sqlalchemy.orm import Session

from .errors import require
from .ingestion import money
from .models import (
    Allocation,
    BankMovement,
    Invoice,
    Membership,
    Period,
    ProcessingSession,
    Report,
    ReportApproval,
    ResultManifest,
    Settlement,
    SourceFile,
    SourceRow,
    User,
)
from .security import membership
from .workflow import audit, enqueue, serialize_fact


def get_entity(db: Session, cls, company: str, entity_id: str):
    item = db.scalar(select(cls).where(cls.company_id == company, cls.id == entity_id))
    require(item is not None, "not_found", "مورد پیدا نشد.", 404)
    return item


def check_version(item, version: int) -> None:
    require(item.version == version, "version_conflict", "اطلاعات تغییر کرده؛ صفحه را تازه کنید.", 409)


def save_period(db: Session, company: str, user: User, values: dict, period: Period | None = None) -> dict:
    previous_id = values.get("previous_period_id")
    if previous_id:
        previous = get_entity(db, Period, company, previous_id)
        require(
            (not period or previous.id != period.id) and previous.end < values["start"],
            "invalid_comparison_period",
            "دوره مقایسه باید پیش از آغاز این دوره باشد.",
        )
    overlaps = db.scalars(
        select(Period).where(
            Period.company_id == company, Period.start <= values["end"], Period.end >= values["start"]
        )
    )
    require(
        not any(not period or p.id != period.id for p in overlaps),
        "overlapping_period",
        "این بازه با دوره دیگری هم‌پوشانی دارد.",
    )
    if period:
        used = period_has_dependencies(db, company, period.id)
        require(
            not used
            or (
                period.start == values["start"]
                and period.end == values["end"]
                and period.previous_period_id == previous_id
            ),
            "period_in_use",
            "تاریخ و دوره مقایسهٔ دوره استفاده‌شده قابل تغییر نیست.",
            409,
        )
        for key, value in values.items():
            setattr(period, key, value)
        period.version += 1
    else:
        period = Period(company_id=company, **values)
        db.add(period)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "period.saved",
        period.id,
        values | {"start": str(values["start"]), "end": str(values["end"])},
    )
    return serialize_fact(period)


def change_member(db: Session, company: str, user: User, member: Membership, values: dict) -> dict:
    # D08: permission administration requires current same-company ownership.
    membership(db, company, user, "owner")
    if "approve_financial_report" in values:
        target_role = values.get("role", member.role)
        require(
            target_role in ("owner", "advisor"),
            "invalid_permission_recipient",
            "مجوز صریح فقط برای مالک یا مشاور است.",
        )
    if member.role == "owner" and (values.get("active") is False or values.get("role", "owner") != "owner"):
        count = len(
            list(
                db.scalars(
                    select(Membership).where(
                        Membership.company_id == company,
                        Membership.role == "owner",
                        Membership.active.is_(True),
                    )
                )
            )
        )
        require(count > 1, "last_owner", "آخرین مالک شرکت قابل حذف نیست.", 409)
    before = {key: getattr(member, key) for key in values}
    for key, value in values.items():
        setattr(member, key, value)
    if member.role not in ("owner", "advisor"):
        member.approve_financial_report = False
    member.version += 1
    audit(
        db,
        company,
        user.id,
        "membership.changed",
        member.id,
        {"recipient_id": member.user_id, "before": before, "after": values},
    )
    return serialize_fact(member)


def approve_report(db: Session, company: str, user: User, report_id: str, expected: int) -> dict:
    member = membership(db, company, user, "approve")
    report = get_entity(db, Report, company, report_id)
    check_version(report, expected)
    existing = db.scalar(
        select(ReportApproval).where(
            ReportApproval.company_id == company,
            ReportApproval.report_id == report_id,
            ReportApproval.actor_id == user.id,
        )
    )
    if existing:
        return serialize_fact(existing)
    provenance = (
        "role:finance_manager"
        if member.role == "finance_manager"
        else f"explicit:membership:{member.id}:v{member.version}"
    )
    approval = ReportApproval(
        company_id=company,
        report_id=report_id,
        report_version=report.version,
        actor_id=user.id,
        permission_provenance=provenance,
    )
    db.add(approval)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "report.approved",
        report_id,
        {"report_version": report.version, "permission_provenance": provenance},
    )
    return serialize_fact(approval)


def active_rows(db: Session, company: str) -> set[str]:
    manifest = db.scalar(
        select(ResultManifest)
        .where(ResultManifest.company_id == company)
        .order_by(ResultManifest.created_at.desc(), ResultManifest.id.desc())
        .limit(1)
    )
    return set(manifest.selection.get("row_ids", [])) if manifest else set()


def allocate(db: Session, company: str, user: User, values: dict) -> dict:
    bank = get_entity(db, BankMovement, company, values["bank_id"])
    invoice = get_entity(db, Invoice, company, values["invoice_id"])
    selected = active_rows(db, company)
    require(
        bank.source_row_id in selected and invoice.source_row_id in selected,
        "inactive_record",
        "رکورد در نسخه فعال نیست.",
        409,
    )
    amount = Decimal(money(values["amount"], "IRR"))
    bank_amount = Decimal(bank.amount)
    require(
        amount > 0 and bank.kind not in ("opening", "anchor", "internal", "transfer"),
        "invalid_allocation",
        "مبلغ یا نوع تراکنش برای تخصیص معتبر نیست.",
    )
    require(
        (invoice.direction == "sales" and bank_amount > 0)
        or (invoice.direction == "purchases" and bank_amount < 0),
        "allocation_direction",
        "جهت تراکنش با فاکتور سازگار نیست.",
    )
    if bank.party_id:
        require(
            bank.party_id == invoice.party_id, "allocation_party", "طرف حساب تراکنش با فاکتور متفاوت است."
        )
    imported = [
        s
        for s in db.scalars(select(Settlement).where(Settlement.company_id == company))
        if s.source_row_id in selected
    ]
    selected_accounts = set(
        db.scalars(
            select(BankMovement.account).where(
                BankMovement.company_id == company, BankMovement.source_row_id.in_(selected)
            )
        )
    )
    direction = "receipt" if bank_amount > 0 else "payment"
    for settlement in imported:
        if settlement.direction != direction:
            continue
        account, reference = settlement.bank_account, settlement.bank_reference
        distinct_known_account = account in selected_accounts and account != bank.account
        if distinct_known_account:
            continue
        if reference:
            if reference != bank.reference:
                continue
            require(
                account == bank.account,
                "imported_bank_identity_ambiguous",
                "حساب بانکی پرداخت واردشده مشخص نیست؛ تاریخچه را تکمیل کنید.",
                409,
            )
            require(False, "payment_already_imported", "این تراکنش در تاریخچه پرداخت موجود است.", 409)
        require(
            False,
            "imported_bank_identity_ambiguous",
            "مرجع بانکی پرداخت واردشده مشخص نیست؛ تاریخچه را تکمیل کنید.",
            409,
        )
    current = list(
        db.scalars(
            select(Allocation).where(Allocation.company_id == company, Allocation.reversed_at.is_(None))
        )
    )
    with localcontext() as context:
        context.prec = 50
        bank_used = sum((Decimal(a.amount) for a in current if a.bank_id == bank.id), Decimal(0))
        invoice_used = sum((Decimal(a.amount) for a in current if a.invoice_id == invoice.id), Decimal(0))
        settled = sum(
            (
                Decimal(s.amount)
                for s in imported
                if s.invoice_reference == invoice.reference
                and s.direction == ("receipt" if invoice.direction == "sales" else "payment")
            ),
            Decimal(0),
        )
        require(
            bank_used + amount <= abs(bank_amount)
            and invoice_used + settled + amount <= Decimal(invoice.amount),
            "allocation_capacity",
            "مبلغ از ظرفیت آزاد تراکنش یا فاکتور بیشتر است.",
            409,
        )
    item = Allocation(company_id=company, actor_id=user.id, **values)
    db.add(item)
    db.flush()
    audit(db, company, user.id, "allocation.created", item.id, values)
    create_revision(db, company, user)
    return serialize_fact(item)


def create_revision(db: Session, company: str, user: User) -> ProcessingSession | None:
    manifest = db.scalar(
        select(ResultManifest)
        .where(ResultManifest.company_id == company)
        .order_by(ResultManifest.created_at.desc(), ResultManifest.id.desc())
        .limit(1)
    )
    if not manifest:
        return None
    from .models import ProcessingIssue

    session = ProcessingSession(
        company_id=company,
        actor_id=user.id,
        period_id=manifest.period_id,
        parent_id=manifest.id,
        state="sealed",
    )
    db.add(session)
    db.flush()
    db.add(
        ProcessingIssue(
            company_id=company,
            session_id=session.id,
            code="coverage",
            question="پوشش نسخه مبنا",
            choices=[],
            evidence={"inherited_manifest_id": manifest.id},
            answer={"value": manifest.selection.get("coverage", {})},
            answered_by=user.id,
        )
    )
    enqueue(db, session)
    return session


def archive_source(db: Session, company: str, user: User, file: SourceFile) -> dict:
    file.archived = True
    file.version += 1
    audit(db, company, user.id, "source.archived", file.id, {"financial_effects_preserved": True})
    return {"id": file.id, "archived": True, "version": file.version}


def delete_source(db: Session, company: str, user: User, file: SourceFile, confirmed: bool) -> dict:
    membership(db, company, user, "owner")
    require(confirmed, "explicit_confirmation_required", "حذف قطعی باید صریحاً تأیید شود.")
    rows = list(
        db.scalars(select(SourceRow.id).where(SourceRow.company_id == company, SourceRow.file_id == file.id))
    )
    # Raw evidence and interpretation are historical dependencies as soon as persisted.
    require(not rows, "source_has_dependencies", "منبع دارای شواهد یا سابقه است؛ آن را بایگانی کنید.", 409)
    db.delete(file)
    audit(db, company, user.id, "source.deleted", file.id)
    return {"deleted": True}


def period_has_dependencies(db: Session, company: str, period_id: str) -> bool:
    """Even an empty frozen report/zero declaration is retained financial evidence."""
    from .accounting_models import Draft
    from .native_control_models import NativeControlRun
    from .native_reporting_models import NativeStatementRun, NativeZeroOpeningEvidence
    from .period_lock_models import PeriodLockEvent
    from .posting_models import NativeJournal
    from .report_builder_models import NativeInvoiceBuilderRun

    if db.scalar(
        select(NativeInvoiceBuilderRun.id)
        .where(
            NativeInvoiceBuilderRun.company_id == company,
            NativeInvoiceBuilderRun.snapshot["spec"]["period_id"].as_string() == period_id,
        )
        .limit(1)
    ):
        return True
    for model in (
        ProcessingSession,
        PeriodLockEvent,
        Draft,
        NativeJournal,
        NativeZeroOpeningEvidence,
        NativeControlRun,
    ):
        if db.scalar(
            select(model.id).where(model.company_id == company, model.period_id == period_id).limit(1)
        ):
            return True
    return (
        db.scalar(
            select(NativeStatementRun.id)
            .where(
                NativeStatementRun.company_id == company,
                NativeStatementRun.snapshot["period_id"].as_string() == period_id,
            )
            .limit(1)
        )
        is not None
    )
