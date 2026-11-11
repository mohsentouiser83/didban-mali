"""Explicit bot review/confirm path, separate from the read-only assistant."""

import re
import secrets
from dataclasses import dataclass
from datetime import timedelta, timezone
from decimal import Decimal, localcontext
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Draft
from .bot_posting_models import BotPostingDispatch as Dispatch
from .bot_posting_models import BotPostingReview as Review
from .bot_transport import BotTransport, normalize_update
from .db import engine, transaction
from .errors import DomainError, require
from .security import digest
from .workflow import audit

PREFIX = "journal:"
MAX_DRAFTS = 10
MAX_REVIEW_TEXT = 3800
PERSONNEL = re.compile(r"حقوق|دستمزد|پرسنل|کارمند|کارکنان|payroll|salary|employee", re.IGNORECASE)


@dataclass(frozen=True)
class Action:
    update_id: str
    sender_id: str
    chat_id: str
    command: str | None = None
    token: str | None = None
    message_id: str | None = None
    callback_id: str | None = None


def normalize_action(provider: str, payload: object) -> Action | None:
    """Trust only documented private identities; callback data is untrusted input."""
    if provider not in ("telegram", "bale") or not isinstance(payload, dict):
        return None
    callback = payload.get("callback_query")
    if callback is None:
        message = normalize_update(provider, payload)
        if message and (message.text == "/journals" or message.text.startswith("/journals ")):
            return Action(str(message.update_id), message.sender_id, message.chat_id, command=message.text)
        return None
    update_id = payload.get("update_id")
    if type(update_id) is not int or not 0 <= update_id <= 2**63 - 1 or not isinstance(callback, dict):
        return None
    sender, message, data = callback.get("from"), callback.get("message"), callback.get("data")
    callback_id = callback.get("id")
    if not isinstance(callback_id, str) or not re.fullmatch(r"[!-~]{1,256}", callback_id):
        return None
    if not isinstance(sender, dict) or not isinstance(message, dict) or not isinstance(data, str):
        return None
    chat = message.get("chat")
    if not isinstance(chat, dict) or chat.get("type") != "private" or sender.get("is_bot") is not False:
        return None
    if any(
        type(value) is not int or not 1 <= value <= 2**63 - 1
        for value in (sender.get("id"), chat.get("id"), message.get("message_id"))
    ):
        return None
    if sender["id"] != chat["id"] or not re.fullmatch(r"journal:[A-Za-z0-9_-]{32}", data):
        return None
    if any(key in payload for key in ("edited_message", "channel_post")):
        return None
    return Action(
        str(update_id),
        str(sender["id"]),
        str(chat["id"]),
        token=data[len(PREFIX) :],
        message_id=str(message["message_id"]),
        callback_id=callback_id,
    )


def safe_draft(db: Session, company: str, draft: Draft) -> bool:
    """Only known non-personnel operation provenance can leave the application."""
    from .operation_models import OperationDraft
    from .operation_service import LABELS

    operation = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company, OperationDraft.draft_id == draft.id
        )
    )
    if (
        operation is None
        or operation.kind not in LABELS
        or operation.kind in ("payroll", "payroll_payment")
    ):
        return False
    from .accounting_models import Account

    labels = [draft.description]
    for line in draft.lines:
        party = line.get("party_id", "")
        if party and db.scalar(
            select(m.PersonnelRecord.id)
            .where(m.PersonnelRecord.company_id == company, m.PersonnelRecord.employee_id == party)
            .limit(1)
        ):
            return False
        labels.append(party)
        account = db.get(Account, line["account_id"])
        if account is None or account.company_id != company:
            return False
        labels.append(account.name)
    return not any(PERSONNEL.search(label) for label in labels)


def _bound(db: Session, company: str, connection_id: str, version: int):
    from .bot_service import authorized

    connection = db.get(m.BotConnection, connection_id)
    require(
        connection is not None and connection.company_ref == company and connection.version == version,
        "bot_review_connection_changed",
        "اتصال تغییر کرده؛ بررسی تازه لازم است.",
        409,
    )
    return connection, authorized(db, connection)


def prepare_review(
    db: Session, company: str, connection_id: str, version: int, draft_ids: list[str]
) -> tuple[Review, str, str]:
    from .posting_service import preview

    connection, user = _bound(db, company, connection_id, version)
    from .accounting_service import capabilities

    ability = capabilities(db, company, user)
    require(
        ability["can_post"] and ability["posting_available"],
        "permission_denied",
        "اجازه ثبت سند در این شرکت ندارید.",
        403,
    )
    require(
        1 <= len(draft_ids) <= MAX_DRAFTS and len(set(draft_ids)) == len(draft_ids),
        "bot_review_selection_invalid",
        "بین یک تا ده سند متفاوت انتخاب کنید.",
    )
    previews = []
    for identifier in draft_ids:
        draft = db.scalar(select(Draft).where(Draft.company_id == company, Draft.id == identifier))
        require(draft is not None, "not_found", "پیش‌نویس پیدا نشد.", 404)
        require(
            safe_draft(db, company, draft), "bot_review_app_only", "این سند باید داخل سامانه بررسی شود.", 409
        )
        previews.append(preview(db, company, user, identifier))
    token = secrets.token_urlsafe(24)
    review = Review(
        company_id=company,
        user_id=user.id,
        connection_id=connection.id,
        connection_version=connection.version,
        token_hash=digest(token),
        expires_at=m.now() + timedelta(minutes=10),
        items=[{key: row[key] for key in ("draft_id", "expected_version", "digest")} for row in previews],
        snapshots=jsonable_encoder([row["snapshot"] for row in previews]),
    )
    message = render_review(db.get(m.Company, company).name, previews)
    db.add(review)
    db.flush()
    db.add(Dispatch(company_id=company, review_id=review.id))
    audit(
        db,
        company,
        user.id,
        "bot.journal_review_created",
        review.id,
        {"drafts": review.items, "connection_id": connection.id, "connection_version": version},
    )
    db.flush()
    return review, token, message


def render_review(company_name: str, previews: list[dict]) -> str:
    """No omitted rows: an oversized review must stay in the application."""
    lines = [company_name, "بررسی ثبت نهایی اسناد — مبالغ به ریال"]
    with localcontext() as context:
        context.prec = 60
        total = Decimal(0)
        for number, item in enumerate(previews, 1):
            snapshot = item["snapshot"]
            lines.extend(
                [
                    f"سند {number} · نسخه {item['expected_version']} · {snapshot.get('date', '')}",
                    snapshot.get("description", ""),
                    f"شناسه: {item['draft_id']}",
                ]
            )
            for row in snapshot["lines"]:
                # Native preview snapshots flatten account name/code at posting time.
                account = row.get("account") or {}
                code = (
                    row.get("code")
                    or row.get("account_code")
                    or account.get("code")
                    or row.get("account_id", "")
                )
                name = row.get("name") or row.get("account_name") or account.get("name") or ""
                party = row.get("party_id") or "—"
                lines.append(
                    f"{code} {name} | طرف: {party} | بدهکار {row['debit']} | بستانکار {row['credit']}"
                )
            lines.append(f"جمع بدهکار = بستانکار: {item['total_debit']}")
            lines.append("اثر انگشت: " + item["digest"])
            total += Decimal(item["total_debit"])
        lines.extend(
            [
                f"تعداد اسناد: {len(previews)} · جمع بدهکار و بستانکار هرکدام: {total:f}",
                "با دکمهٔ زیر فقط همین نسخه‌ها ثبت نهایی می‌شوند. اعتبار: ۱۰ دقیقه.",
            ]
        )
    message = "\n".join(lines)
    require(
        len(message) <= MAX_REVIEW_TEXT,
        "bot_review_too_large",
        "برای بررسی کامل این اسناد از سامانه استفاده کنید.",
        409,
    )
    return message


def confirm_review(
    db: Session, company: str, connection_id: str, version: int, token: str, message_id: str
) -> dict:
    from .posting_service import post_batch

    connection, user = _bound(db, company, connection_id, version)
    review = db.scalar(
        select(Review).where(
            Review.company_id == company,
            Review.token_hash == digest(token),
            Review.user_id == user.id,
            Review.connection_id == connection.id,
        )
    )
    require(
        review is not None and review.connection_version == version,
        "bot_review_invalid",
        "بررسی معتبر نیست؛ بررسی تازه بسازید.",
        409,
    )
    dispatch = db.scalar(
        select(Dispatch).where(Dispatch.company_id == company, Dispatch.review_id == review.id)
    )
    require(
        dispatch is not None
        and dispatch.sent_message_id == message_id
        and dispatch.state in ("sent", "posted"),
        "bot_review_not_delivered",
        "پیام بررسی تأیید نشده است.",
        409,
    )
    from .accounting_service import capabilities

    require(capabilities(db, company, user)["can_post"], "permission_denied", "اجازه ثبت سند ندارید.", 403)
    if dispatch.state == "posted":
        return dispatch.result
    require(
        review.expires_at.replace(tzinfo=timezone.utc) > m.now(),
        "bot_review_expired",
        "بررسی منقضی شده؛ دوباره اسناد را بررسی کنید.",
        409,
    )
    for item in review.items:
        draft = db.scalar(select(Draft).where(Draft.company_id == company, Draft.id == item["draft_id"]))
        require(
            draft is not None and safe_draft(db, company, draft),
            "bot_review_app_only",
            "این سند باید داخل سامانه بررسی شود.",
            409,
        )
    result = post_batch(db, company, user, review.items)
    dispatch.state, dispatch.result = "posted", jsonable_encoder(result)
    audit(db, company, user.id, "bot.journals_confirmed", review.id, {"drafts": review.items})
    db.flush()
    return dispatch.result


def _draft_ids(command: str) -> list[str]:
    raw = command.removeprefix("/journals").strip()
    values = [value.strip() for value in raw.split(",")]
    require(len(values) <= MAX_DRAFTS, "bot_review_selection_invalid", "حداکثر ده سند انتخاب کنید.")
    for value in values:
        try:
            require(str(UUID(value)) == value, "bot_review_selection_invalid", "شناسهٔ پیش‌نویس معتبر نیست.")
        except ValueError as error:
            raise DomainError("bot_review_selection_invalid", "شناسهٔ پیش‌نویس معتبر نیست.") from error
    return values


async def receive_posting(provider: str, payload: object, *, transport=None) -> dict | None:
    """Claim webhook before any send; explicit callbacks alone can call post_batch."""
    action = normalize_action(provider, payload)
    if action is None:
        return None
    from .bot_service import configured

    token, _secret = configured(provider)
    with transaction() as db:
        if engine.dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:update,0))"),
                {"update": f"bot:{provider}:{action.update_id}"},
            )
        previous = db.scalar(
            select(m.BotUpdate).where(
                m.BotUpdate.provider == provider, m.BotUpdate.update_id == action.update_id
            )
        )
        if previous:
            return {"accepted": True}
        update = m.BotUpdate(provider=provider, update_id=action.update_id)
        db.add(update)
        db.flush()
        update_id = update.id
        connection = db.scalar(
            select(m.BotConnection)
            .where(
                m.BotConnection.provider == provider,
                m.BotConnection.sender_id == action.sender_id,
                m.BotConnection.chat_id == action.chat_id,
                m.BotConnection.state == "active",
            )
            .with_for_update()
        )
        if connection is None:
            update.state = "unlinked"
            return {"accepted": True}
        update.connection_id = connection.id
        recent = (
            db.scalar(
                select(func.count())
                .select_from(m.BotUpdate)
                .where(
                    m.BotUpdate.connection_id == connection.id,
                    m.BotUpdate.created_at > m.now() - timedelta(minutes=1),
                )
            )
            or 0
        )
        if recent > 10:
            update.state = "rate_limited"
            return {"accepted": True}
        company, connection_id, version = connection.company_ref, connection.id, connection.version
    review_id = None
    markup = None
    sender = transport or BotTransport(provider, token)
    if action.callback_id and not (provider == "bale" and action.callback_id.startswith("1")):
        try:
            await sender.answer_callback(action.callback_id)
        except Exception:
            # An acknowledgement is UI feedback, not evidence of journal posting.
            pass
    try:
        with transaction(company) as db:
            _bound(db, company, connection_id, version)
            if action.command == "/journals":
                message = "برای بررسی، شناسهٔ پیش‌نویس‌های انتخابی را بفرستید:\n/journals شناسه۱,شناسه۲\nاسناد پرسنلی فقط در سامانه بررسی می‌شوند."
            elif action.command:
                review, raw_token, message = prepare_review(
                    db, company, connection_id, version, _draft_ids(action.command)
                )
                review_id = review.id
                markup = {
                    "inline_keyboard": [
                        [{"text": "تأیید و ثبت همین نسخه‌ها", "callback_data": PREFIX + raw_token}]
                    ]
                }
            else:
                result = confirm_review(db, company, connection_id, version, action.token, action.message_id)
                message = f"ثبت نهایی {len(result['items'])} سند انجام شد."
        with transaction(company) as db:
            _bound(db, company, connection_id, version)
            configured(provider)
            if review_id:
                db.scalar(
                    select(Dispatch).where(Dispatch.review_id == review_id, Dispatch.company_id == company)
                ).state = "sending"
            db.get(m.BotUpdate, update_id).state = "sending"
        sent_id = (
            await sender.send_message(action.chat_id, message, reply_markup=markup)
            if markup
            else await sender.send_message(action.chat_id, message)
        )
        with transaction(company) as db:
            if review_id:
                state = db.scalar(
                    select(Dispatch).where(Dispatch.review_id == review_id, Dispatch.company_id == company)
                )
                state.state, state.sent_message_id = "sent", sent_id
            db.get(m.BotUpdate, update_id).state = "sent"
    except DomainError as error:
        # No account, draft, provider payload, token or personnel text in the failure reply.
        with transaction() as db:
            db.get(m.BotUpdate, update_id).state = "failed"
        if review_id:
            with transaction(company) as db:
                dispatch = db.scalar(
                    select(Dispatch).where(Dispatch.review_id == review_id, Dispatch.company_id == company)
                )
                dispatch.state = "unconfirmed"
        try:
            with transaction(company) as db:
                _bound(db, company, connection_id, version)
            await (transport or BotTransport(provider, token)).send_message(action.chat_id, error.message)
        except Exception:
            pass
    except Exception:
        with transaction() as db:
            db.get(m.BotUpdate, update_id).state = "failed"
        if review_id:
            with transaction(company) as db:
                state = db.scalar(
                    select(Dispatch).where(Dispatch.review_id == review_id, Dispatch.company_id == company)
                )
                state.state = "unconfirmed"
    return {"accepted": True}
