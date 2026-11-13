import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from didban import bot_notification_service as service
from didban import models as m
from didban.bot_notification_models import (
    BotNotificationDelivery as Delivery,
)
from didban.bot_notification_models import (
    BotNotificationPreference as Preference,
)
from didban.bot_notification_schemas import BotNotificationInput
from didban.bot_transport import BotTransport
from didban.errors import DomainError

STAMP = datetime(2026, 11, 2, 8, 0, tzinfo=timezone.utc)


@pytest.fixture
def environment(tmp_path, monkeypatch):
    engine = create_engine("sqlite:///" + str(tmp_path / "notice.db"))
    m.Base.metadata.create_all(engine)

    @contextmanager
    def transaction(_company=None):
        with Session(engine, expire_on_commit=False) as db:
            with db.begin():
                yield db

    monkeypatch.setattr(service, "transaction", transaction)
    monkeypatch.setattr(
        service, "configuration", lambda provider: (True, SecretStr("1234567890:test"), SecretStr("s" * 32))
    )
    monkeypatch.setattr(
        service, "configured", lambda provider: (SecretStr("1234567890:test"), SecretStr("s" * 32))
    )
    with transaction() as db:
        db.add_all(
            [
                m.User(id="u", email="u@example.test", name="کاربر", password_hash="unused"),
                m.User(id="other", email="other@example.test", name="دیگر", password_hash="unused"),
                m.Company(id="c", name="شرکت"),
            ]
        )
        db.flush()
        db.add_all(
            [
                m.Membership(company_id="c", user_id="u", role="viewer"),
                m.Membership(company_id="c", user_id="other", role="owner"),
                m.Period(id="p", company_id="c", name="ماه", start=STAMP.date(), end=STAMP.date()),
            ]
        )
        db.flush()
        connection = m.BotConnection(
            id="connection",
            provider="telegram",
            company_ref="c",
            user_id="u",
            expires_at=STAMP + timedelta(days=1),
            state="active",
            version=3,
            chat_id="123",
            sender_id="123",
        )
        db.add(connection)
        db.flush()
        session = m.ProcessingSession(id="s", company_id="c", period_id="p", actor_id="u", state="completed")
        db.add(session)
        db.flush()
        db.add(
            m.ResultManifest(
                id="manifest",
                company_id="c",
                session_id="s",
                period_id="p",
                digest="test",
                selection={},
                created_at=STAMP,
                metrics=[
                    {"metric_key": "cash", "value": None, "status": "unavailable"},
                    {"metric_key": "ar_invoice", "value": "0", "status": "available"},
                    {"metric_key": "employee_salary", "value": "999999", "status": "available"},
                ],
                details={"employee_name": "private", "as_of_date": "2026-11-02"},
            )
        )
        db.flush()
        pref = Preference(
            id="pref",
            company_id="c",
            user_id="u",
            provider="telegram",
            connection_id="connection",
            connection_version=3,
            enabled=True,
            events=["report_ready"],
            quiet_enabled=False,
            quiet_start="22:00",
            quiet_end="08:00",
            summary_time="09:00",
            enabled_at=STAMP - timedelta(seconds=1),
        )
        db.add(pref)
    return transaction


def test_quiet_hours_cross_midnight_and_same_day():
    pref = Preference(quiet_enabled=True, quiet_start="22:00", quiet_end="08:00")
    assert service.next_allowed(pref, datetime(2026, 11, 2, 20, 0, tzinfo=timezone.utc)) == datetime(
        2026, 11, 3, 4, 30, tzinfo=timezone.utc
    )
    assert service.next_allowed(pref, datetime(2026, 11, 3, 3, 0, tzinfo=timezone.utc)) == datetime(
        2026, 11, 3, 4, 30, tzinfo=timezone.utc
    )
    pref.quiet_start = "12:00"
    pref.quiet_end = "14:00"
    assert service.next_allowed(pref, datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)) == datetime(
        2026, 11, 2, 10, 30, tzinfo=timezone.utc
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"events": ["unknown_event"]},
        {"quiet_enabled": True, "quiet_start": "08:00", "quiet_end": "08:00"},
        {"summary_time": "24:00"},
        {"enabled": True, "events": []},
    ],
)
def test_invalid_preferences_rejected(changes):
    with pytest.raises(ValidationError):
        BotNotificationInput.model_validate(changes)


def test_report_queue_is_deduplicated_send_once_no_personnel_and_null_preserved(environment):
    transaction = environment
    requests = []

    def factory(provider, token):
        def handle(request):
            requests.append(request)
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 9}})

        return BotTransport(provider, token, transport=httpx.MockTransport(handle))

    assert asyncio.run(service.run_notifications_once(STAMP, transport_factory=factory)) == 1
    assert (
        asyncio.run(service.run_notifications_once(STAMP + timedelta(seconds=1), transport_factory=factory))
        == 0
    )
    assert len(requests) == 1
    text = requests[0].read().decode()
    assert "999999" not in text and "private" not in text and "employee" not in text
    import json

    body = json.loads(requests[0].read())
    assert "ناموجود" in body["text"] and "۰ ریال" in body["text"]
    with transaction("c") as db:
        assert db.scalar(select(func.count()).select_from(Delivery)) == 1
        assert db.scalar(select(Delivery)).state == "sent"
        assert db.scalar(select(m.JournalLine.id)) is None


def test_quiet_defer_then_send_not_drop(environment):
    transaction = environment
    with transaction("c") as db:
        pref = db.get(Preference, "pref")
        pref.quiet_enabled = True
        pref.quiet_start = "10:00"
        pref.quiet_end = "13:00"
    sends = []

    class Transport:
        async def send_message(self, *args):
            sends.append(args)
            return "1"

    assert asyncio.run(service.run_notifications_once(STAMP, transport_factory=lambda *_: Transport())) == 0
    with transaction("c") as db:
        item = db.scalar(select(Delivery))
        assert item.state == "pending"
        assert service.aware(item.due_at) == datetime(2026, 11, 2, 9, 30, tzinfo=timezone.utc)
    assert (
        asyncio.run(
            service.run_notifications_once(
                datetime(2026, 11, 2, 9, 31, tzinfo=timezone.utc), transport_factory=lambda *_: Transport()
            )
        )
        == 1
    )
    assert len(sends) == 1


def test_revoked_membership_and_preferences_cancel_before_delivery(environment):
    transaction = environment
    with transaction("c") as db:
        service.queue_events(db, "c", STAMP)
        pref = db.get(Preference, "pref")
        pref.enabled = False

    def forbidden(*args):
        raise AssertionError("no transmission allowed")

    assert asyncio.run(service.run_notifications_once(STAMP, transport_factory=forbidden)) == 0
    with transaction("c") as db:
        assert db.scalar(select(Delivery)).state == "cancelled"


def test_unknown_send_never_retried_and_unconfigured_waits(environment, monkeypatch):
    transaction = environment
    monkeypatch.setattr(service, "configuration", lambda _: (False, None, None))
    assert asyncio.run(service.run_notifications_once(STAMP)) == 0
    with transaction("c") as db:
        assert db.scalar(select(Delivery)).state == "waiting_configuration"
    monkeypatch.setattr(service, "configuration", lambda _: (True, None, None))
    calls = []

    class Failed:
        async def send_message(self, *args):
            calls.append(1)
            raise DomainError("bot_delivery_unconfirmed", "ارسال تأیید نشد.", 503)

    assert (
        asyncio.run(
            service.run_notifications_once(
                STAMP + timedelta(minutes=2), transport_factory=lambda *_: Failed()
            )
        )
        == 0
    )
    assert (
        asyncio.run(
            service.run_notifications_once(
                STAMP + timedelta(minutes=3), transport_factory=lambda *_: Failed()
            )
        )
        == 0
    )
    assert calls == [1]
    with transaction("c") as db:
        assert db.scalar(select(Delivery)).state == "unconfirmed"


def test_daily_summary_once_per_local_day_and_question_has_no_raw_question(environment):
    transaction = environment
    messages = []
    with transaction("c") as db:
        db.get(Preference, "pref").events = ["daily_summary", "question_open"]
        db.get(Preference, "pref").enabled_at = STAMP - timedelta(hours=4)
        db.add(
            m.ProcessingIssue(
                id="question",
                company_id="c",
                session_id="s",
                code="payroll_not_balanced",
                question="private employee salary 999999",
                choices=[],
                evidence={},
                created_at=STAMP,
            )
        )

    class Transport:
        async def send_message(self, chat, text):
            messages.append(text)
            return "1"

    assert asyncio.run(service.run_notifications_once(STAMP, transport_factory=lambda *_: Transport())) == 2
    assert (
        asyncio.run(
            service.run_notifications_once(
                STAMP + timedelta(minutes=1), transport_factory=lambda *_: Transport()
            )
        )
        == 0
    )
    assert all("private" not in text and "999999" not in text for text in messages)
    with transaction("c") as db:
        assert service.delivery_history(db, "c", db.get(m.User, "other"))["items"] == []


def test_preferences_current_binding_version_own_user_only_and_unavailable_provider(environment):
    transaction = environment
    with transaction("c") as db:
        user = db.get(m.User, "u")
        values = BotNotificationInput(enabled=True, events=["report_ready"]).model_dump()
        with pytest.raises(DomainError):
            service.save_preferences(db, "c", user, "bale", values, 1)
        with pytest.raises(DomainError):
            service.save_preferences(db, "c", user, "telegram", values, 2)
        saved = service.save_preferences(db, "c", user, "telegram", values, 1)
        assert saved["version"] == 2 and saved["binding_current"]
        assert not service.preferences(db, "c", db.get(m.User, "other"))["items"][0]["enabled"]
        db.get(m.BotConnection, "connection").version += 1
        current = service.preferences(db, "c", user)["items"][0]
        assert current["enabled"] is True and not current["binding_current"]
        assert service._authorized(db, db.get(Preference, "pref")) is None
        assert db.scalar(select(m.ModelRequest.id)) is None


def test_reauthorize_after_transport_creation_prevents_send(environment):
    transaction = environment

    class Forbidden:
        async def send_message(self, *args):
            raise AssertionError("must not transmit")

    def factory(*args):
        with transaction("c") as db:
            db.get(m.BotConnection, "connection").state = "revoked"
        return Forbidden()

    assert asyncio.run(service.run_notifications_once(STAMP, transport_factory=factory)) == 0
    with transaction("c") as db:
        assert db.scalar(select(Delivery)).state == "cancelled"


def test_http_personal_optin_version_and_other_user_privacy(tmp_path):
    import os
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    code = r"""
from datetime import timedelta
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import select
from didban.api import app
from didban.config import settings
from didban.db import initialize,transaction
from didban.models import Company,User,Membership,BotConnection,ModelRequest,now
from didban.security import hasher
initialize()
with transaction() as db:
    db.add_all([User(id='u',email='qa@example.test',name='کاربر',password_hash=hasher.hash('Synthetic-password-2026!')),Company(id='c',name='شرکت')]);db.flush()
    db.add(Membership(company_id='c',user_id='u',role='viewer'));db.add(BotConnection(id='b',provider='telegram',company_ref='c',user_id='u',expires_at=now()+timedelta(days=1),state='active',version=3,sender_id='123',chat_id='123'))
client=TestClient(app)
login=client.post('/api/v1/auth/login',json={'email':'qa@example.test','password':'Synthetic-password-2026!'})
assert login.status_code==200,login.text
csrf=login.json()['csrf']
def headers(version=1,key=None):return {'X-CSRF-Token':csrf,'Idempotency-Key':key or str(uuid4()),'If-Match':str(version),'Origin':settings.web_origin}
base='/api/v1/companies/c/bot-notifications'
body={'enabled':True,'events':['report_ready'],'quiet_enabled':True,'quiet_start':'22:00','quiet_end':'08:00','summary_time':'09:00'}
h=headers(key='optin-once');saved=client.patch(base+'/telegram',json=body,headers=h)
assert saved.status_code==200 and saved.json()['version']==2,saved.text
assert client.patch(base+'/telegram',json=body,headers=h).json()==saved.json()
assert client.patch(base+'/telegram',json=body,headers=headers()).status_code==409
assert client.patch(base+'/bale',json=body,headers=headers()).status_code==409
assert client.patch(base+'/telegram',json=body|{'user_id':'other'},headers=headers(2)).status_code==422
assert client.get(base+'/deliveries').json()['items']==[]
assert client.get('/api/v1/companies/other/bot-notifications').status_code==404
with transaction('c') as db:assert db.scalar(select(ModelRequest.id)) is None
"""
    env = os.environ | {
        "PYTHONPATH": str(root / "apps/api"),
        "DIDBAN_DATABASE_URL": "sqlite:///" + str(tmp_path / "notice-http.db"),
        "DIDBAN_STORAGE": str(tmp_path / "files"),
        "DIDBAN_BOTS_ENABLED": "false",
    }
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=root, env=env, capture_output=True, text=True, timeout=60
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_preference_edit_cancels_previous_queue_immediately(environment):
    transaction = environment
    with transaction("c") as db:
        service.queue_events(db, "c", STAMP)
        assert db.scalar(select(Delivery)).state == "pending"
        user = db.get(m.User, "u")
        values = BotNotificationInput(enabled=False).model_dump()
        service.save_preferences(db, "c", user, "telegram", values, 1)
        assert db.scalar(select(Delivery)).state == "cancelled"


def test_daily_optin_after_scheduled_time_waits_until_next_day(environment):
    transaction = environment
    with transaction("c") as db:
        db.get(Preference, "pref").events = ["daily_summary"]
        service.queue_events(db, "c", STAMP)
        assert db.scalar(select(Delivery.id)) is None
        service.queue_events(db, "c", STAMP + timedelta(days=1))
        assert db.scalar(select(Delivery)).event_type == "daily_summary"


def test_cheque_due_opt_in_dedupe_and_stale_clearance_cancel(environment):
    from didban.cheque_models import Cheque

    transaction = environment
    with transaction() as db:
        pref = db.get(Preference, "pref")
        pref.events = ["cheque_due"]
        for identifier, state, due in (
            ("due", "received", STAMP.date()),
            ("future", "issued", STAMP.date() + timedelta(days=1)),
            ("cleared", "cleared", STAMP.date()),
            ("endorsed", "endorsed", STAMP.date()),
        ):
            db.add(
                Cheque(
                    id=identifier,
                    company_id="c",
                    direction="received",
                    number=identifier,
                    bank_name="private-bank",
                    bank_account="private-account",
                    party_id="private-party",
                    amount="90071992547409930",
                    original_amount="9007199254740993",
                    original_unit="TOMAN",
                    issue_date=STAMP.date() - timedelta(days=1),
                    due_date=due,
                    state=state,
                    actor_id="u",
                )
            )
        db.flush()
        service.queue_events(db, "c", STAMP)
        service.queue_events(db, "c", STAMP)
        deliveries = list(db.scalars(select(Delivery)))
        assert len(deliveries) == 1 and deliveries[0].event_id == "due"
        text = service._text(db, deliveries[0])
        assert "۹۰٬۰۷۱٬۹۹۲٬۵۴۷٬۴۰۹٬۹۳۰" in text
        assert "private-party" not in text and "private-account" not in text
        module = m.CompanyModule(company_id="c", key="settlements", enabled=False)
        db.add(module)
        db.flush()
        assert service._text(db, deliveries[0]) is None
        module.enabled = True
        db.flush()
        # Cleared while quiet-hours queue is waiting: no obsolete due notification.
        cheque = db.get(Cheque, "due")
        cheque.state = "cleared"
        cheque.version += 1
        db.flush()
        assert service._claim(db, "c", deliveries[0].id, STAMP) is None
        assert deliveries[0].state == "obsolete"
        pref.events = []
        db.get(Cheque, "future").due_date = STAMP.date()
        db.flush()
        service.queue_events(db, "c", STAMP)
        assert len(list(db.scalars(select(Delivery)))) == 1


def test_native_book_notification_delivery_and_summary(db_session):
    from didban.accounting_setup_models import CompanyAccountingSetup
    from didban.native_reporting_models import NativeStatementRun

    db = db_session
    company_id = "c-native-bot"
    user_id = "u-native-bot"
    user = m.User(id=user_id, email="nbot@test.local", name="کاربر بومی", password_hash="test")
    company = m.Company(id=company_id, name="شرکت دفتر بومی")
    conn = m.BotConnection(
        id="conn-1", company_ref=company_id, user_id=user_id, provider="telegram",
        sender_id="12345", chat_id="12345", state="active", version=1,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1)
    )
    stamp = datetime(2026, 11, 13, 5, 30, tzinfo=timezone.utc)  # 09:00 in Tehran
    member = m.Membership(company_id=company_id, user_id=user_id, role="viewer", active=True)
    pref = Preference(
        company_id=company_id, user_id=user_id, provider="telegram",
        enabled=True, enabled_at=stamp - timedelta(hours=1),
        events=["daily_summary", "report_ready"],
        connection_id="conn-1", connection_version=1,
        quiet_enabled=False, summary_time="09:00"
    )
    setup = CompanyAccountingSetup(company_id=company_id, mode="primary")
    db.add_all([user, company, member, conn, pref, setup])
    db.flush()
    stmt = NativeStatementRun(
        id="stmt-bot-1",
        company_id=company_id,
        actor_id=user_id,
        digest="7" * 64,
        created_at=stamp,
        snapshot={
            "as_of": "2026-11-13",
            "metrics": [
                {"metric_key": "bank_balance", "value": "1500000", "status": "available"},
                {"metric_key": "trade_receivable_balance", "value": "2000000", "status": "available"},
                {"metric_key": "trade_payable_balance", "value": "800000", "status": "available"},
            ],
        },
    )
    db.add(stmt)
    db.flush()

    queued = service.queue_events(db, company_id, stamp)
    assert queued >= 1

    deliveries = list(db.scalars(select(Delivery).where(Delivery.company_id == company_id)))
    assert len(deliveries) >= 1
    assert deliveries[0].manifest_id == stmt.id

    # Check rendered notification text
    text = service._text(db, deliveries[0])
    assert text is not None
    assert "دفتر اصلی" in text
    assert "موجودی نقد" in text
    assert "۱٬۵۰۰٬۰۰۰ ریال" in text


def test_bot_02_deliver_snapshot_pdf_to_bot(environment):
    from didban.native_reporting_models import NativeStatementRun

    with environment() as db:
        user = db.get(m.User, "u")

        # Add active Telegram connection for user 'u'
        conn = m.BotConnection(
            id="conn-pdf-1", company_ref="c", user_id="u", provider="telegram",
            chat_id="12345678", state="active", expires_at=STAMP + timedelta(days=365)
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

