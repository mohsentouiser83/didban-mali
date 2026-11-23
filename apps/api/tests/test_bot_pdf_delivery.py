import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from pydantic import SecretStr

from didban import bot_pdf_delivery as service
from didban import models as m
from didban.bot_transport import BotTransport
from didban.errors import DomainError

STAMP = datetime(2026, 11, 2, 8, 0, tzinfo=timezone.utc)


def test_bot_02_deliver_snapshot_pdf_to_bot(db_session, monkeypatch):
    from didban.native_reporting_models import NativeStatementRun

    db = db_session
    user = m.User(id="u", email="u@example.test", name="کاربر", password_hash="unused")
    db.add_all([user, m.Company(id="c", name="شرکت آزمون")])
    db.flush()
    db.add(m.Membership(company_id="c", user_id="u", role="viewer"))
    monkeypatch.setattr(
        service, "configured", lambda provider: (SecretStr("1234567890:test"), SecretStr("s" * 32))
    )

    # Add active Telegram connection for user 'u'
    conn = m.BotConnection(
        id="conn-pdf-1",
        company_ref="c",
        user_id="u",
        provider="telegram",
        chat_id="12345678",
        state="active",
        expires_at=STAMP + timedelta(days=365),
    )
    db.add(conn)
    db.flush()

    # Add native statement run
    stmt = NativeStatementRun(
        id="stmt-pdf-test",
        company_id="c",
        actor_id="u",
        digest="8" * 64,
        created_at=STAMP,
        snapshot={
            "title": "صورت وضعیت مالی",
            "company_name": "شرکت تست",
            "period_id": "p",
            "period": {"id": "p", "start": "2026-11-01", "end": "2026-11-30"},
            "as_of": "2026-11-13",
            "metrics": [
                {
                    "metric_key": "bank_balance",
                    "label": "موجودی نقد",
                    "value": "1000000",
                    "unit": "IRR",
                    "status": "available",
                    "reason_codes": [],
                },
            ],
            "items": [],
            "role_assignments": [],
            "opening_evidence": {"status": "available", "evidence": []},
            "journal_ids": [],
            "profit_journal_ids": [],
            "movement_journal_ids": [],
        },
    )
    db.add(stmt)
    db.flush()

    calls = []

    def transport_factory(provider, token):
        def handler(request):
            calls.append(request)
            assert request.url.path.endswith("/sendDocument")
            assert b"%PDF" in request.content
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 777}})

        return BotTransport(provider, token, transport=httpx.MockTransport(handler))

    res = asyncio.run(
        service.deliver_snapshot_pdf_to_bot(
            db,
            "c",
            user,
            provider="telegram",
            export_type="native_statement",
            export_id=stmt.id,
            caption="صورت وضعیت",
            transport_factory=transport_factory,
        )
    )
    assert res["status"] == "sent"
    assert res["provider_message_id"] == "777"
    assert res["filename"].startswith("statement_")
    assert len(calls) == 1

    # Attempting to deliver with unconnected provider fails
    with pytest.raises(DomainError) as err:
        asyncio.run(
            service.deliver_snapshot_pdf_to_bot(
                db, "c", user, provider="bale", export_type="native_statement", export_id=stmt.id
            )
        )
    assert err.value.code == "bot_not_connected"
