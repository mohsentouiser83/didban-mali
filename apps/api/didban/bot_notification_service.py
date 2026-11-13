"""Opt-in deterministic notifications; no model calls or personnel content."""

from datetime import datetime, time, timedelta, timezone
from hashlib import sha256
from typing import Callable
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_setup_models import CompanyAccountingSetup
from .bot_notification_models import (
    BotNotificationDelivery as Delivery,
)
from .bot_notification_models import (
    BotNotificationPreference as Preference,
)
from .bot_notification_schemas import BotNotificationInput
from .bot_service import configuration, configured
from .bot_transport import BotTransport
from .cheque_models import Cheque
from .db import transaction
from .errors import require
from .module_service import module_state
from .money_type import canonical_money
from .native_reporting_models import NativeStatementRun
from .security import membership
from .workflow import audit, serialize_fact

TEHRAN = ZoneInfo("Asia/Tehran")
METRICS = (("cash", "موجودی نقد"), ("ar_invoice", "مطالبات فاکتوری"), ("ap_invoice", "بدهی فاکتوری"))


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def next_allowed(pref: Preference, stamp: datetime) -> datetime:
    stamp = aware(stamp)
    if not pref.quiet_enabled:
        return stamp
    local = stamp.astimezone(TEHRAN)
    clock = local.strftime("%H:%M")
    start, end = pref.quiet_start, pref.quiet_end
    quiet = start <= clock < end if start < end else clock >= start or clock < end
    if not quiet:
        return stamp
    hour, minute = map(int, end.split(":"))
    target = datetime.combine(local.date(), time(hour, minute), tzinfo=TEHRAN)
    if target <= local:
        target += timedelta(days=1)
    return target.astimezone(timezone.utc)


def _connection(db: Session, company: str, user_id: str, provider: str) -> m.BotConnection | None:
    return db.scalar(
        select(m.BotConnection)
        .where(
            m.BotConnection.company_ref == company,
            m.BotConnection.user_id == user_id,
            m.BotConnection.provider == provider,
            m.BotConnection.state == "active",
        )
        .order_by(m.BotConnection.created_at.desc(), m.BotConnection.id.desc())
        .limit(1)
    )


def preferences(db: Session, company: str, user: m.User) -> dict:
    membership(db, company, user)
    items = []
    for provider in ("telegram", "bale"):
        pref = db.scalar(
            select(Preference).where(
                Preference.company_id == company,
                Preference.user_id == user.id,
                Preference.provider == provider,
            )
        )
        connection = _connection(db, company, user.id, provider)
        defaults = BotNotificationInput().model_dump()
        value = {key: getattr(pref, key) for key in defaults} if pref else defaults
        items.append(
            value
            | {
                "provider": provider,
                "version": pref.version if pref else 1,
                "connected": bool(connection),
                "binding_current": bool(
                    pref
                    and connection
                    and pref.connection_id == connection.id
                    and pref.connection_version == connection.version
                ),
                "configured": configuration(provider)[0],
                "timezone": "Asia/Tehran",
            }
        )
    return {
        "items": items,
        "available_events": [
            "report_ready",
            "question_open",
            "daily_summary",
            "cheque_due",
            "draft_approval",
        ],
        "unavailable_events": [],
    }


def save_preferences(
    db: Session, company: str, user: m.User, provider: str, data: dict, version: int
) -> dict:
    membership(db, company, user)
    require(provider in ("telegram", "bale"), "bot_provider_invalid", "پیام‌رسان معتبر نیست.")
    values = BotNotificationInput.model_validate(data).model_dump()
    connection = _connection(db, company, user.id, provider)
    require(
        not values["enabled"] or connection is not None,
        "bot_connection_required",
        "ابتدا حساب این پیام‌رسان را متصل کنید.",
        409,
    )
    pref = db.scalar(
        select(Preference).where(
            Preference.company_id == company, Preference.user_id == user.id, Preference.provider == provider
        )
    )
    require(
        (pref.version if pref else 1) == version,
        "version_conflict",
        "تنظیم اعلان تغییر کرده؛ تازه کنید.",
        409,
    )
    before = {key: getattr(pref, key) for key in values} if pref else None
    if pref:
        for pending in db.scalars(
            select(Delivery).where(
                Delivery.company_id == company,
                Delivery.preference_id == pref.id,
                Delivery.state.in_(("pending", "waiting_configuration")),
            )
        ):
            pending.state = "cancelled"
        pref.version += 1
    else:
        pref = Preference(company_id=company, user_id=user.id, provider=provider, version=2)
        db.add(pref)
    for key, value in values.items():
        setattr(pref, key, value)
    pref.connection_id = connection.id if connection else None
    pref.connection_version = connection.version if connection else None
    pref.enabled_at = m.now()
    db.flush()
    audit(
        db,
        company,
        user.id,
        "bot.notifications_changed",
        pref.id,
        {"provider": provider, "before": before, "after": values, "version": pref.version},
    )
    return next(item for item in preferences(db, company, user)["items"] if item["provider"] == provider)


def _authorized(db: Session, pref: Preference) -> m.BotConnection | None:
    user = db.get(m.User, pref.user_id)
    member = db.scalar(
        select(m.Membership).where(
            m.Membership.company_id == pref.company_id,
            m.Membership.user_id == pref.user_id,
            m.Membership.active.is_(True),
        )
    )
    connection = db.get(m.BotConnection, pref.connection_id) if pref.connection_id else None
    if not (
        user
        and user.active
        and member
        and pref.enabled
        and connection
        and connection.state == "active"
        and connection.company_ref == pref.company_id
        and connection.user_id == pref.user_id
        and connection.provider == pref.provider
        and connection.version == pref.connection_version
    ):
        return None
    return connection


def _enqueue(
    db: Session,
    pref: Preference,
    kind: str,
    event_id: str,
    event_version: int,
    manifest_id: str | None,
    stamp: datetime,
) -> None:
    key = sha256(
        f"{pref.company_id}|{pref.user_id}|{pref.connection_id}|{pref.connection_version}|{pref.version}|{kind}|{event_id}|{event_version}".encode()
    ).hexdigest()
    if db.scalar(
        select(Delivery.id).where(Delivery.company_id == pref.company_id, Delivery.dedupe_key == key)
    ):
        return
    db.add(
        Delivery(
            company_id=pref.company_id,
            preference_id=pref.id,
            preference_version=pref.version,
            connection_id=pref.connection_id,
            connection_version=pref.connection_version,
            user_id=pref.user_id,
            provider=pref.provider,
            event_type=kind,
            event_id=event_id,
            event_version=event_version,
            manifest_id=manifest_id,
            dedupe_key=key,
            due_at=next_allowed(pref, stamp),
            state="pending",
        )
    )


def queue_events(db: Session, company: str, stamp: datetime) -> int:
    stamp = aware(stamp)
    count = 0
    for pref in db.scalars(
        select(Preference).where(Preference.company_id == company, Preference.enabled.is_(True))
    ):
        if not _authorized(db, pref):
            continue
        since = aware(pref.enabled_at)
        if "draft_approval" in pref.events:
            from .accounting_models import Draft

            for draft in db.scalars(select(Draft).where(Draft.company_id == company, Draft.state == "draft")):
                if _reviewable_draft(db, company, pref.user_id, draft):
                    _enqueue(db, pref, "draft_approval", draft.id, draft.version, None, stamp)
        setup = db.get(CompanyAccountingSetup, company)
        is_native = setup is not None and setup.mode == "primary"

        if "report_ready" in pref.events:
            if is_native:
                for report in db.scalars(
                    select(NativeStatementRun).where(
                        NativeStatementRun.company_id == company,
                        NativeStatementRun.created_at >= since,
                        NativeStatementRun.created_at <= stamp,
                    )
                ):
                    _enqueue(db, pref, "report_ready", report.id, 1, report.id, stamp)
            else:
                for report in db.scalars(
                    select(m.ResultManifest).where(
                        m.ResultManifest.company_id == company,
                        m.ResultManifest.created_at >= since,
                        m.ResultManifest.created_at <= stamp,
                    )
                ):
                    _enqueue(db, pref, "report_ready", report.id, 1, report.id, stamp)
        if "question_open" in pref.events:
            for question in db.scalars(
                select(m.ProcessingIssue).where(
                    m.ProcessingIssue.company_id == company,
                    m.ProcessingIssue.answer.is_(None),
                    m.ProcessingIssue.created_at >= since,
                    m.ProcessingIssue.created_at <= stamp,
                )
            ):
                _enqueue(db, pref, "question_open", question.id, question.version, None, stamp)
        local = stamp.astimezone(TEHRAN)
        if "cheque_due" in pref.events and module_state(db, company, "settlements")["enabled"]:
            for cheque in db.scalars(
                select(Cheque).where(
                    Cheque.company_id == company,
                    Cheque.due_date <= local.date(),
                    Cheque.state.in_(("received", "issued", "deposited", "returned")),
                )
            ):
                _enqueue(db, pref, "cheque_due", cheque.id, cheque.version, None, stamp)
        summary_hour, summary_minute = map(int, pref.summary_time.split(":"))
        scheduled = datetime.combine(local.date(), time(summary_hour, summary_minute), tzinfo=TEHRAN)
        if "daily_summary" in pref.events and stamp >= aware(scheduled) >= since:
            if is_native:
                native_stmt = db.scalar(
                    select(NativeStatementRun)
                    .where(NativeStatementRun.company_id == company, NativeStatementRun.created_at <= stamp)
                    .order_by(NativeStatementRun.created_at.desc(), NativeStatementRun.id.desc())
                    .limit(1)
                )
                if native_stmt:
                    _enqueue(db, pref, "daily_summary", local.date().isoformat(), 1, native_stmt.id, stamp)
            else:
                manifest = db.scalar(
                    select(m.ResultManifest)
                    .where(m.ResultManifest.company_id == company, m.ResultManifest.created_at <= stamp)
                    .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
                    .limit(1)
                )
                if manifest:
                    _enqueue(db, pref, "daily_summary", local.date().isoformat(), 1, manifest.id, stamp)
        count += 1
    db.flush()
    return count


def _display_amount(raw: str) -> str:
    value = canonical_money(raw)
    integer, _, fraction = value.partition(".")
    sign = "−" if integer.startswith("-") else ""
    digits = integer.lstrip("-")
    groups = [digits[max(0, index - 3) : index] for index in range(len(digits), 0, -3)]
    text = sign + "٬".join(reversed(groups)) + ("٫" + fraction if fraction else "")
    return text.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _text(db: Session, item: Delivery) -> str | None:
    company = db.get(m.Company, item.company_id)
    if item.event_type == "draft_approval":
        from .accounting_models import Draft

        draft = db.scalar(select(Draft).where(Draft.company_id == item.company_id, Draft.id == item.event_id))
        if (
            not draft
            or draft.version != item.event_version
            or not _reviewable_draft(db, item.company_id, item.user_id, draft)
        ):
            return None
        return f"{company.name}\nپیش‌نویس برای بررسی ثبت نهایی آماده است.\nبرای مشاهدهٔ نسخهٔ دقیق:\n/journals {draft.id}"
    if item.event_type == "cheque_due":
        if not module_state(db, item.company_id, "settlements")["enabled"]:
            return None
        cheque = db.scalar(
            select(Cheque).where(Cheque.company_id == item.company_id, Cheque.id == item.event_id)
        )
        if (
            not cheque
            or cheque.version != item.event_version
            or cheque.state not in ("received", "issued", "deposited", "returned")
        ):
            return None
        direction = "دریافتی" if cheque.direction == "received" else "پرداختی"
        return f"{company.name}\nچک {direction} {cheque.number} به سررسید رسیده است.\nمبلغ: {_display_amount(cheque.amount)} ریال\nجزئیات را در دیدبان مالی بررسی کنید."
    if item.event_type == "question_open":
        question = db.scalar(
            select(m.ProcessingIssue).where(
                m.ProcessingIssue.company_id == item.company_id, m.ProcessingIssue.id == item.event_id
            )
        )
        if not question or question.answer is not None or question.version != item.event_version:
            return None
        return f"{company.name}\nپرسش تکمیل پردازش منتظر پاسخ است.\nپاسخ را در دیدبان مالی ثبت کنید."
    manifest = db.scalar(
        select(m.ResultManifest).where(
            m.ResultManifest.company_id == item.company_id, m.ResultManifest.id == item.manifest_id
        )
    )
    if not manifest:
        native_stmt = db.scalar(
            select(NativeStatementRun).where(
                NativeStatementRun.company_id == item.company_id, NativeStatementRun.id == item.manifest_id
            )
        )
        if not native_stmt:
            return None
        snapshot = native_stmt.snapshot or {}
        stmt_metrics = snapshot.get("metrics", [])
        as_of = snapshot.get("as_of") or "ناموجود"
        lines = [
            company.name,
            "خلاصه روزانه (دفتر اصلی)" if item.event_type == "daily_summary" else "گزارش مالی دفتر اصلی آماده است",
            f"تاریخ مبنا: {as_of}",
        ]
        NATIVE_METRICS = (
            ("bank_balance", "موجودی نقد"),
            ("trade_receivable_balance", "مطالبات تجاری"),
            ("trade_payable_balance", "بدهی تجاری"),
        )
        for key, label in NATIVE_METRICS:
            metric = next((row for row in stmt_metrics if row.get("metric_key") == key), None)
            value = "ناموجود"
            if metric and metric.get("value") is not None:
                try:
                    value = _display_amount(metric["value"]) + " ریال"
                except (ValueError, TypeError):
                    pass
                if metric.get("status") == "limited":
                    value += " (دامنه محدود)"
            lines.append(label + ": " + value)
        return "\n".join(lines)
    lines = [
        company.name,
        "خلاصه روزانه" if item.event_type == "daily_summary" else "گزارش تازه آماده است",
        "تاریخ مبنا: "
        + str(
            manifest.details.get("as_of_date") or manifest.selection.get("period", {}).get("end") or "ناموجود"
        ),
    ]
    for key, label in METRICS:
        metric = next((row for row in manifest.metrics if row.get("metric_key") == key), None)
        value = "ناموجود"
        if metric and metric.get("value") is not None:
            try:
                value = _display_amount(metric["value"]) + " ریال"
            except (ValueError, TypeError):
                pass
            if metric.get("status") == "limited":
                value += " (دامنه محدود)"
        lines.append(label + ": " + value)
    return "\n".join(lines)


def _reviewable_draft(db: Session, company: str, user_id: str, draft) -> bool:
    from .accounting_service import capabilities
    from .bot_posting_service import safe_draft

    user = db.get(m.User, user_id)
    if not user or not user.active or draft.state != "draft":
        return False
    ability = capabilities(db, company, user)
    return ability["can_post"] and ability["posting_available"] and safe_draft(db, company, draft)


def _claim(db: Session, company: str, item_id: str, stamp: datetime) -> tuple[str, str] | None:
    item = db.scalar(select(Delivery).where(Delivery.company_id == company, Delivery.id == item_id))
    if not item or item.state not in ("pending", "waiting_configuration") or aware(item.due_at) > stamp:
        return None
    pref = db.scalar(
        select(Preference).where(Preference.company_id == company, Preference.id == item.preference_id)
    )
    connection = _authorized(db, pref) if pref else None
    if not (
        pref
        and connection
        and pref.version == item.preference_version
        and connection.version == item.connection_version
        and connection.id == item.connection_id
    ):
        item.state = "cancelled"
        return None
    due = next_allowed(pref, stamp)
    if due > stamp:
        item.due_at = due
        item.state = "pending"
        return None
    ready = configuration(item.provider)[0]
    if not ready:
        item.state = "waiting_configuration"
        item.due_at = stamp + timedelta(minutes=1)
        return None
    message = _text(db, item)
    if message is None:
        item.state = "obsolete"
        return None
    item.state = "sending"
    item.claimed_at = stamp
    return connection.chat_id, message


async def run_notifications_once(
    stamp: datetime | None = None, transport_factory: Callable | None = None
) -> int:
    stamp = aware(stamp or m.now())
    delivered = 0
    with transaction() as db:
        companies = list(db.scalars(select(m.Company.id)))
    for company in companies:
        with transaction(company) as db:
            queue_events(db, company, stamp)
            for uncertain in db.scalars(
                select(Delivery).where(
                    Delivery.company_id == company,
                    Delivery.state == "sending",
                    Delivery.claimed_at < stamp - timedelta(seconds=30),
                )
            ):
                uncertain.state = "unconfirmed"
            ids = list(
                db.scalars(
                    select(Delivery.id)
                    .where(
                        Delivery.company_id == company,
                        Delivery.state.in_(("pending", "waiting_configuration")),
                        Delivery.due_at <= stamp,
                    )
                    .order_by(Delivery.created_at, Delivery.id)
                    .limit(25)
                )
            )
        for identifier in ids:
            with transaction(company) as db:
                claimed = _claim(db, company, identifier, stamp)
                provider = db.get(Delivery, identifier).provider
            if not claimed:
                continue
            state = "unconfirmed"
            message_id = None
            try:
                token, _ = configured(provider)
                transport = (
                    transport_factory(provider, token) if transport_factory else BotTransport(provider, token)
                )
                with transaction(company) as db:
                    current = db.get(Delivery, identifier)
                    pref = db.scalar(
                        select(Preference).where(
                            Preference.company_id == company, Preference.id == current.preference_id
                        )
                    )
                    connection = _authorized(db, pref) if pref else None
                    if not (
                        connection
                        and pref.version == current.preference_version
                        and connection.id == current.connection_id
                        and connection.version == current.connection_version
                    ):
                        current.state = "cancelled"
                        continue
                    message = _text(db, current)
                    if message is None:
                        current.state = "obsolete"
                        continue
                    claimed = (connection.chat_id, message)
                message_id = await transport.send_message(*claimed)
                state = "sent"
                delivered += 1
            except Exception:
                pass
            with transaction(company) as db:
                item = db.get(Delivery, identifier)
                if item.state == "sending":
                    item.state = state
                    item.provider_message_id = message_id
                    item.completed_at = m.now()
    return delivered


def delivery_history(
    db: Session, company: str, user: m.User, limit: int = 25, cursor: str | None = None
) -> dict:
    from .http import paginate

    def public(item: Delivery) -> dict:
        value = {
            key: data
            for key, data in serialize_fact(item).items()
            if key not in ("dedupe_key", "connection_id", "user_id")
        }
        # SQLite strips tzinfo; all scheduler timestamps remain UTC on the API.
        for field in ("created_at", "due_at", "claimed_at", "completed_at"):
            stamp = getattr(item, field)
            if stamp is not None:
                value[field] = aware(stamp).isoformat()
        return value

    return paginate(db, Delivery, company, limit, cursor, [Delivery.user_id == user.id], transform=public)


async def deliver_snapshot_pdf_to_bot(
    db: Session,
    company: str,
    user: m.User,
    *,
    provider: str,
    export_type: str,
    export_id: str,
    caption: str | None = None,
    transport_factory: Callable | None = None,
) -> dict:
    from .services import get_entity

    membership(db, company, user)
    connection = _connection(db, company, user.id, provider)
    require(connection is not None, "bot_not_connected", "حساب پیام‌رسان متصل برای این شرکت یافت نشد.", 404)
    token, _ = configured(provider)

    if export_type == "report_builder":
        from .report_builder_exports import pdf_run
        from .report_builder_service import get_run

        run = get_run(db, company, export_id)
        pdf_bytes = pdf_run(serialize_fact(run))
        filename = f"report_{export_id[:8]}.pdf"
    elif export_type == "native_statement":
        from .native_reporting_exports import pdf_run as pdf_native_run
        from .native_reporting_models import NativeStatementRun

        run = get_entity(db, NativeStatementRun, company, export_id)
        pdf_bytes = pdf_native_run(serialize_fact(run))
        filename = f"statement_{export_id[:8]}.pdf"
    elif export_type == "financial_report":
        from .exports import pdf_export

        manifest = get_entity(db, m.ResultManifest, company, export_id)
        pdf_bytes = pdf_export(manifest)
        filename = f"manifest_{export_id[:8]}.pdf"
    else:
        require(False, "unsupported_export_type", "نوع خروجی پشتیبانی نمی‌شود.", 400)

    transport = transport_factory(provider, token) if transport_factory else BotTransport(provider, token)
    message_id = await transport.send_document(
        connection.chat_id,
        pdf_bytes,
        filename,
        caption=caption or f"نسخه چاپی ثابت {filename}",
    )
    audit(
        db,
        company,
        user.id,
        "bot.document_delivered",
        export_id,
        {"provider": provider, "export_type": export_type, "message_id": message_id},
    )
    return {
        "status": "sent",
        "provider": provider,
        "export_type": export_type,
        "export_id": export_id,
        "filename": filename,
        "provider_message_id": message_id,
    }
