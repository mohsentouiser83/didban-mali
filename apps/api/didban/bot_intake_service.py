"""Claim attachments once, reauthorize around network IO, await explicit import."""

from datetime import timedelta
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from sqlalchemy import and_, func, or_, select, text

from . import models as m
from .bot_attachments import normalize_attachment
from .bot_intake_models import BotIntake
from .bot_transport import BotTransport
from .config import settings
from .db import engine, transaction
from .errors import require
from .ingestion import read_file, scan
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def public(item, db=None):
    value = {
        key: value
        for key, value in serialize_fact(item).items()
        if key not in ("storage_key", "connection_id")
    }
    if db is not None:
        prior_intake = db.scalar(
            select(BotIntake.id)
            .where(
                BotIntake.company_id == item.company_id,
                BotIntake.sha256 == item.sha256,
                or_(
                    BotIntake.created_at < item.created_at,
                    and_(BotIntake.created_at == item.created_at, BotIntake.id < item.id),
                ),
            )
            .limit(1)
        )
        prior_source = db.scalar(
            select(m.SourceFile.id)
            .where(
                m.SourceFile.company_id == item.company_id,
                m.SourceFile.sha256 == item.sha256,
                m.SourceFile.id != (item.source_file_id or ""),
            )
            .limit(1)
        )
        # Do not expose another person's private bot intake ID, name or payload.
        value["duplicate_original"] = bool(prior_intake or prior_source)
    return value


def _signature(name: str, content: bytes) -> str:
    ext = Path(name).suffix.lower()
    if ext in (".csv", ".xls", ".xlsx"):
        read_file(name, content)
        return "awaiting_import"
    signatures = {
        ".pdf": content.startswith(b"%PDF-"),
        ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": content.startswith(b"\xff\xd8\xff"),
        ".jpeg": content.startswith(b"\xff\xd8\xff"),
        ".ogg": content.startswith(b"OggS"),
        ".wav": content.startswith(b"RIFF"),
        ".mp3": content.startswith(b"ID3") or content[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"),
        ".m4a": content[4:8] == b"ftyp",
    }
    require(signatures.get(ext) is True, "bot_media_invalid", "نوع واقعی فایل معتبر نیست.", 415)
    return "pending_extraction"


def claim_message(provider, message):
    """Share the same replay and connection rate limit across text and attachments."""
    with transaction() as db:
        if engine.dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
                {"key": f"bot:{provider}:{message.update_id}"},
            )
        prior = db.scalar(
            select(m.BotUpdate).where(
                m.BotUpdate.provider == provider, m.BotUpdate.update_id == str(message.update_id)
            )
        )
        if prior:
            return None
        update = m.BotUpdate(provider=provider, update_id=str(message.update_id))
        db.add(update)
        db.flush()
        update_id = update.id
        connection = db.scalar(
            select(m.BotConnection).where(
                m.BotConnection.provider == provider,
                m.BotConnection.sender_id == message.sender_id,
                m.BotConnection.chat_id == message.chat_id,
                m.BotConnection.state == "active",
            )
        )
        if not connection:
            update.state = "unlinked"
            return None
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
        update.connection_id = connection.id
        if recent >= 10:
            update.state = "rate_limited"
            return None
        return update_id, connection.company_ref, connection.id, connection.version


async def receive_attachment(provider, payload, *, transport=None):
    from .bot_service import authorized, configured

    attachment = normalize_attachment(provider, payload)
    if attachment is None:
        return None
    token, _ = configured(provider)
    message = attachment.message
    claimed = claim_message(provider, message)
    if claimed is None:
        return {"accepted": True}
    update_id, company, connection_id, version = claimed
    key = None
    try:
        with transaction(company) as db:
            connection = db.get(m.BotConnection, connection_id)
            user = authorized(db, connection)
            membership(db, company, user, "write")
            actor_id = user.id
        content = await (transport or BotTransport(provider, token)).download_file(
            attachment.file_id, max_bytes=settings.max_file_bytes
        )
        require(
            len(content) <= settings.max_file_bytes, "file_size_limit", "فایل بزرگ‌تر از حد مجاز است.", 413
        )
        scan_status = scan(content)
        state = _signature(attachment.name, content)
        with transaction(company) as db:
            connection = db.get(m.BotConnection, connection_id)
            user = authorized(db, connection)
            membership(db, company, user, "write")
            require(
                connection.version == version and user.id == actor_id,
                "bot_disconnected",
                "اتصال تغییر کرده است.",
                403,
            )
            configured(provider)
            key = str(uuid4())
            path = settings.storage / key
            with path.open("xb") as file:
                file.write(content)
            path.chmod(0o600)
            item = BotIntake(
                company_id=company,
                provider=provider,
                update_id=str(message.update_id),
                connection_id=connection_id,
                actor_id=user.id,
                name=attachment.name,
                kind=attachment.kind,
                storage_key=key,
                sha256=sha256(content).hexdigest(),
                size=len(content),
                scan_status=scan_status,
                state=state,
            )
            db.add(item)
            db.flush()
            audit(
                db, company, user.id, "bot.attachment_queued", item.id, {"provider": provider, "state": state}
            )
            db.get(m.BotUpdate, update_id).state = "attachment_queued"
    except Exception:
        if key:
            (settings.storage / key).unlink(missing_ok=True)
        with transaction() as db:
            db.get(m.BotUpdate, update_id).state = "attachment_failed"
    return {"accepted": True}


def import_file(db, company, user, item_id, period_id, version):
    membership(db, company, user, "write")
    item = get_entity(db, BotIntake, company, item_id)
    require(item.actor_id == user.id, "not_found", "فایل پیدا نشد.", 404)
    check_version(item, version)
    from .bot_service import authorized

    connection = db.get(m.BotConnection, item.connection_id)
    authorized(db, connection)
    require(
        connection.user_id == user.id and connection.company_ref == company,
        "not_found",
        "فایل پیدا نشد.",
        404,
    )
    require(
        item.state == "awaiting_import",
        "bot_import_unavailable",
        "استخراج این نوع فایل هنوز آماده نیست.",
        409,
    )
    get_entity(db, m.Period, company, period_id)
    content = (settings.storage / item.storage_key).read_bytes()
    require(sha256(content).hexdigest() == item.sha256, "source_changed", "اصل فایل تغییر کرده است.", 409)
    scanned = item.scan_status
    require(
        not settings.production or scanned == "clean", "scanner_unavailable", "اسکن معتبر فایل لازم است.", 503
    )
    sheets = read_file(item.name, content)
    session = m.ProcessingSession(
        company_id=company, period_id=period_id, actor_id=user.id, state="receiving"
    )
    db.add(session)
    db.flush()
    from .source_intake import store_source

    source = store_source(
        db, company, user, session.id, item.name, content, scanned, sheets, storage_key=item.storage_key
    )
    item.source_file_id = source.id
    item.state = "imported"
    item.version += 1
    audit(
        db,
        company,
        user.id,
        "bot.attachment_imported",
        item.id,
        {"session_id": session.id, "period_id": period_id, "source_file_id": source.id},
    )
    return public(item, db) | {"session_id": session.id}
