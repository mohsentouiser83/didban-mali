"""Explicit plain-text document intake; free chat never becomes financial input."""

from hashlib import sha256
from uuid import uuid4

from . import models as m
from .bot_extraction_models import BotExtractionAttempt, BotExtractionProposal
from .bot_intake_models import BotIntake
from .bot_intake_service import claim_message
from .bot_transport import BotTransport, normalize_update
from .config import settings
from .db import transaction
from .errors import require
from .ingestion import scan
from .security import membership
from .workflow import audit


async def receive_text(provider, payload, *, transport=None):
    message = normalize_update(provider, payload)
    if message is None or not (message.text == "/document" or message.text.startswith("/document ")):
        return None
    from .bot_service import authorized, configured

    token, _ = configured(provider)
    claimed = claim_message(provider, message)
    if claimed is None:
        return {"accepted": True}
    update_id, company, connection_id, version = claimed
    storage_key = None
    queued = False
    try:
        with transaction(company) as db:
            connection = db.get(m.BotConnection, connection_id)
            user = authorized(db, connection)
            membership(db, company, user, "write")
            require(connection.version == version, "bot_disconnected", "اتصال تغییر کرده است.", 403)
        original = message.text.removeprefix("/document").strip()
        if original:
            content = original.encode("utf-8")
            require(
                len(content) <= settings.max_file_bytes, "file_size_limit", "متن بزرگ‌تر از حد مجاز است.", 413
            )
            scanned = scan(content)
            with transaction(company) as db:
                connection = db.get(m.BotConnection, connection_id)
                user = authorized(db, connection)
                membership(db, company, user, "write")
                require(connection.version == version, "bot_disconnected", "اتصال تغییر کرده است.", 403)
                configured(provider)
                storage_key = str(uuid4())
                path = settings.storage / storage_key
                with path.open("xb") as file:
                    file.write(content)
                path.chmod(0o600)
                item = BotIntake(
                    company_id=company,
                    provider=provider,
                    update_id=str(message.update_id),
                    connection_id=connection_id,
                    actor_id=user.id,
                    name=f"text-{message.update_id}.txt",
                    kind="text",
                    storage_key=storage_key,
                    sha256=sha256(content).hexdigest(),
                    size=len(content),
                    scan_status=scanned,
                    state="awaiting_review",
                )
                db.add(item)
                db.flush()
                attempt = BotExtractionAttempt(
                    company_id=company,
                    intake_id=item.id,
                    actor_id=user.id,
                    request_key=sha256(("plain-text:" + item.id).encode()).hexdigest(),
                    state="completed",
                )
                db.add(attempt)
                db.flush()
                db.add(
                    BotExtractionProposal(
                        company_id=company,
                        intake_id=item.id,
                        attempt_id=attempt.id,
                        actor_id=user.id,
                        source_sha256=item.sha256,
                        method="plain_text",
                        model_request_id=None,
                        proposal={
                            "text": original,
                            "family": "unknown",
                            "unit": "unknown",
                            "calendar": "unknown",
                            "rows": [],
                            "evidence_refs": ["intake:" + item.id],
                            "unresolved_fields": ["نوع، مبلغ، واحد، تاریخ و طرف حساب را از متن بررسی کنید."],
                        },
                    )
                )
                audit(
                    db,
                    company,
                    user.id,
                    "bot.text_document_queued",
                    item.id,
                    {"provider": provider, "source_sha256": item.sha256, "model_used": False},
                )
                db.get(m.BotUpdate, update_id).state = "text_document_queued"
                company_name = db.get(m.Company, company).name
            queued = True
            reply = company_name + "\nمتن مدرک برای بازبینی در اتصال‌های دیدبان دریافت شد؛ سند مالی ثبت نشد."
        else:
            reply = (
                "برای ارسال مدرک متنی:\n/document متن مدرک\nاطلاعات پیش از پردازش در دیدبان بازبینی می‌شود."
            )
        with transaction(company) as db:
            connection = db.get(m.BotConnection, connection_id)
            authorized(db, connection)
            require(connection.version == version, "bot_disconnected", "اتصال تغییر کرده است.", 403)
            configured(provider)
        try:
            await (transport or BotTransport(provider, token)).send_message(message.chat_id, reply)
        except Exception:
            # Queue commit is durable; an unconfirmed acknowledgement is never retried.
            pass
    except Exception:
        if storage_key and not queued:
            (settings.storage / storage_key).unlink(missing_ok=True)
        with transaction() as db:
            db.get(m.BotUpdate, update_id).state = (
                "text_document_queued" if queued else "text_document_failed"
            )
    return {"accepted": True}
