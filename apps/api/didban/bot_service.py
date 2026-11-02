"""Opt-in private bot identity pairing and read-only, manifest-bound AI bridge."""

import re
import secrets
from datetime import timedelta, timezone
from typing import Literal

from sqlalchemy import func, select, text

from . import models as m
from .assistant_service import respond
from .bot_transport import BotTransport, normalize_update
from .config import settings
from .db import engine, transaction
from .errors import DomainError, require
from .finance import REASONS
from .security import digest, membership
from .workflow import audit

Provider = Literal["telegram", "bale"]
# Engineering limits, not financial policy: ten accepted questions per minute.
QUESTIONS_PER_MINUTE = 10
ALLOWED_METRICS = {
    "cash",
    "cash_subset",
    "revenue",
    "expense",
    "net_profit",
    "pre_tax_profit",
    "ar_ledger",
    "ar_invoice",
    "ar_difference",
    "debt_total_ledger",
    "ap_trade_ledger",
    "ap_invoice",
    "ap_difference",
}


def configuration(provider: Provider):
    token = getattr(settings, provider + "_bot_token")
    secret = getattr(settings, provider + "_webhook_secret")
    ready = bool(
        settings.bots_enabled
        and token
        and secret
        and re.fullmatch(r"[A-Za-z0-9:_-]{10,256}", token.get_secret_value())
        and re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret.get_secret_value())
    )
    return ready, token, secret


def configured(provider: Provider):
    ready, token, secret = configuration(provider)
    require(ready, "bot_unavailable", "اتصال بات تنظیم نشده است.", 503)
    return token, secret


def public_connection(item: m.BotConnection) -> dict:
    result = {
        key: getattr(item, key)
        for key in ("id", "provider", "state", "version", "created_at", "expires_at", "sender_id", "chat_id")
    }
    # SQLite drops timezone metadata on reload. The API contract is always UTC;
    # a naive expiry would be read in the browser's local timezone and expire early.
    for key in ("created_at", "expires_at"):
        stamp = result[key]
        if stamp.tzinfo is None:
            result[key] = stamp.replace(tzinfo=timezone.utc)
    return result


def own_connection(db, company: str, user: m.User, identifier: str):
    item = db.scalar(
        select(m.BotConnection).where(
            m.BotConnection.id == identifier,
            m.BotConnection.company_ref == company,
            m.BotConnection.user_id == user.id,
        )
    )
    require(item is not None, "not_found", "اتصال پیدا نشد.", 404)
    return item


def create_pairing(db, company: str, user: m.User, provider: Provider) -> dict:
    configured(provider)
    # Revoke old pending links for this account/company/provider, retaining history.
    for item in db.scalars(
        select(m.BotConnection).where(
            m.BotConnection.company_ref == company,
            m.BotConnection.user_id == user.id,
            m.BotConnection.provider == provider,
            m.BotConnection.state.in_(("pending", "awaiting_confirmation")),
        )
    ):
        item.state, item.token_hash = "revoked", None
        item.version += 1
    token = secrets.token_urlsafe(32)
    item = m.BotConnection(
        company_ref=company,
        user_id=user.id,
        provider=provider,
        token_hash=digest(token),
        expires_at=m.now() + timedelta(minutes=5),
    )
    db.add(item)
    db.flush()
    audit(db, company, user.id, "bot.pairing_created", item.id, {"provider": provider})
    return public_connection(item) | {"pairing_code": token}


def confirm(db, company, user, identifier: str, version: int) -> dict:
    item = own_connection(db, company, user, identifier)
    configured(item.provider)
    require(item.version == version, "version_conflict", "اطلاعات اتصال را تازه کنید.", 409)
    require(
        item.state == "awaiting_confirmation" and item.expires_at.replace(tzinfo=timezone.utc) > m.now(),
        "pairing_expired",
        "درخواست اتصال معتبر نیست؛ دوباره اتصال بسازید.",
        409,
    )
    # Serialize global identity claims across companies as well as company mutations.
    if engine.dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:identity,0))"),
            {"identity": "bot:" + item.provider + ":" + item.sender_id},
        )
    exists = db.scalar(
        select(m.BotConnection.id).where(
            m.BotConnection.provider == item.provider,
            m.BotConnection.sender_id == item.sender_id,
            m.BotConnection.state == "active",
        )
    )
    require(exists is None, "bot_already_connected", "ابتدا اتصال فعلی این حساب بات را قطع کنید.", 409)
    item.state, item.token_hash, item.version = "active", None, item.version + 1
    audit(db, company, user.id, "bot.connected", item.id, {"provider": item.provider})
    return public_connection(item)


def revoke(db, company, user, identifier: str, version: int) -> dict:
    item = own_connection(db, company, user, identifier)
    require(item.version == version, "version_conflict", "اطلاعات اتصال را تازه کنید.", 409)
    item.state, item.token_hash, item.version = "revoked", None, item.version + 1
    audit(db, company, user.id, "bot.revoked", item.id, {"provider": item.provider})
    return public_connection(item)


def authorized(db, item: m.BotConnection):
    require(item is not None and item.state == "active", "bot_disconnected", "اتصال غیرفعال است.", 403)
    user = db.get(m.User, item.user_id)
    require(user is not None and user.active, "access_revoked", "دسترسی غیرفعال است.", 403)
    membership(db, item.company_ref, user)
    return user


def render_response(response: dict, company: str) -> str:
    lines = [company, response["answer"]]
    if response.get("as_of_date"):
        lines.append("تاریخ گزارش: " + str(response["as_of_date"]))
    if response.get("native_statement_id"):
        lines.append("نسخهٔ گزارش دفتر اصلی: " + response["native_statement_id"])
    if response.get("manifest_id"):
        lines.append("نسخه گزارش: " + response["manifest_id"])
    if response.get("model_state") != "completed":
        lines.append("پاسخ از اطلاعات گزارش؛ مدل اجرا نشده یا در دسترس نیست.")
    for fact in response.get("facts", []):
        value = fact.get("value")
        label = fact.get("label", fact["metric_key"])
        reasons = fact.get("reason") or " ".join(
            REASONS.get(code, ("برای جزئیات محدودیت، گزارش را در سامانه ببینید.",))[0]
            for code in fact.get("reason_codes", [])
        )
        if value is None:
            line = label + ": ناموجود" + (" — " + reasons if reasons else "")
        else:
            unit = {"IRR": "ریال", "IRT": "تومان"}.get(fact.get("unit"), fact.get("unit") or "واحد نامشخص")
            line = label + ": " + str(value) + " " + unit
            if fact.get("status") == "limited":
                line += " (پوشش محدود)"
            if reasons:
                line += " — " + reasons
        if len("\n".join([*lines, line])) > 3800:
            lines.append("ادامه جزئیات در گزارش سامانه.")
            break
        lines.append(line)
    return "\n".join(lines)


async def receive(provider: Provider, payload: object, *, transport=None, responder=None) -> dict:
    """Claim before external calls. Uncertain deliveries are never auto-retried."""
    token, _secret = configured(provider)
    from .bot_posting_service import receive_posting

    posting_result = await receive_posting(provider, payload, transport=transport)
    if posting_result is not None:
        return posting_result
    from .bot_text_intake_service import receive_text

    text_result = await receive_text(provider, payload, transport=transport)
    if text_result is not None:
        return text_result
    from .bot_intake_service import receive_attachment

    attachment_result = await receive_attachment(provider, payload, transport=transport)
    if attachment_result is not None:
        return attachment_result
    message = normalize_update(provider, payload)
    if message is None:
        return {"accepted": True}
    with transaction() as db:
        if engine.dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:update,0))"),
                {"update": f"bot:{provider}:{message.update_id}"},
            )
        previous = db.scalar(
            select(m.BotUpdate).where(
                m.BotUpdate.provider == provider, m.BotUpdate.update_id == str(message.update_id)
            )
        )
        if previous:
            return {"accepted": True}
        update = m.BotUpdate(provider=provider, update_id=str(message.update_id))
        db.add(update)
        db.flush()
        update_id = update.id
        if message.text.startswith("/start "):
            code = message.text[7:].strip()
            item = db.scalar(
                select(m.BotConnection)
                .where(
                    m.BotConnection.provider == provider,
                    m.BotConnection.token_hash == digest(code),
                    m.BotConnection.state == "pending",
                )
                .with_for_update()
            )
            if item and item.expires_at.replace(tzinfo=timezone.utc) > m.now():
                item.sender_id, item.chat_id = message.sender_id, message.chat_id
                item.state, item.token_hash, item.version = "awaiting_confirmation", None, item.version + 1
                update.connection_id = item.id
            update.state = "pairing_received"
            return {"accepted": True}
        item = db.scalar(
            select(m.BotConnection)
            .where(
                m.BotConnection.provider == provider,
                m.BotConnection.sender_id == message.sender_id,
                m.BotConnection.chat_id == message.chat_id,
                m.BotConnection.state == "active",
            )
            .with_for_update()
        )
        if item is None:
            update.state = "unlinked"
            return {"accepted": True}
        recent = (
            db.scalar(
                select(func.count())
                .select_from(m.BotUpdate)
                .where(
                    m.BotUpdate.connection_id == item.id,
                    m.BotUpdate.state != "pairing_received",
                    m.BotUpdate.created_at > m.now() - timedelta(minutes=1),
                )
            )
            or 0
        )
        update.connection_id = item.id
        if recent >= QUESTIONS_PER_MINUTE:
            update.state = "rate_limited"
            return {"accepted": True}
        company, actor, connection_id, version = item.company_ref, item.user_id, item.id, item.version
    try:
        with transaction(company) as db:
            item = db.get(m.BotConnection, connection_id)
            from .native_assistant_service import select_context

            current_user = authorized(db, item)
            selected = select_context(db, company, current_user)
            company_name = db.get(m.Company, company).name
            frozen = selected["frozen"]
            if frozen:
                # Exclude row data and personnel details entirely from model context.
                frozen["metrics"] = [v for v in frozen["metrics"] if v["metric_key"] in ALLOWED_METRICS]
                frozen["details"] = {"as_of_date": frozen.get("details", {}).get("as_of_date")}
                frozen["selection"] = {}
        arguments = {
            "manifest": frozen,
            "question": message.text,
            "company_id": company,
            "actor_id": actor,
            "request_key": "bot:" + update_id,
        }
        if selected["missing_answer"]:
            arguments["missing_answer"] = selected["missing_answer"]
        response = await (responder or respond)(**arguments)
        response |= {
            name: selected["descriptor"][name]
            for name in ("context_type", "manifest_id", "native_statement_id")
        }
        with transaction(company) as db:
            item = db.get(m.BotConnection, connection_id)
            authorized(db, item)
            configured(provider)
            require(item.version == version, "bot_disconnected", "اتصال تغییر کرده است.", 403)
            db.get(m.BotUpdate, update_id).state = "sending"
        # No external call under a DB transaction. A revocation committed before
        # this final authorization blocks send; an already-started HTTP send cannot be recalled.
        await (transport or BotTransport(provider, token)).send_message(
            message.chat_id, render_response(response, company_name)
        )
        state = "sent"
    except DomainError:
        state = "failed"
    except Exception:
        # Never persist provider exception text (URLs include tokens).
        state = "failed"
    with transaction() as db:
        db.get(m.BotUpdate, update_id).state = state
    return {"accepted": True}
