"""Explicit delivery of a frozen PDF to a user's linked private bot chat."""

from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .bot_service import configured
from .bot_transport import BotTransport
from .errors import require
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


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
