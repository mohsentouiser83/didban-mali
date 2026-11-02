"""Explicit bot approvals share native posting authority, versions and capacity."""

import asyncio
from contextlib import contextmanager
from datetime import timedelta

import pytest
from pydantic import SecretStr
from sqlalchemy import select
from test_posting import book as book
from test_posting import data

from didban import bot_posting_service as service
from didban import bot_service
from didban import models as m
from didban.accounting_models import Draft
from didban.accounting_service import save_draft
from didban.bot_posting_models import BotPostingDispatch as Dispatch
from didban.bot_posting_models import BotPostingReview as Review
from didban.errors import DomainError
from didban.operation_models import OperationDraft
from didban.posting_models import NativeJournal


def connection(db):
    item = m.BotConnection(
        id="conn",
        company_ref="c",
        user_id="finance_manager",
        provider="telegram",
        state="active",
        sender_id="123",
        chat_id="123",
        version=2,
        expires_at=m.now() + timedelta(days=1),
    )
    db.add(item)
    db.flush()
    return item


def operation(db, *, kind="sale_service", amount="10", description="خدمات"):
    body = data(db, amount)
    body["description"] = description
    draft = save_draft(db, "c", db.get(m.User, "finance_manager"), body)
    db.add(
        OperationDraft(
            company_id="c",
            draft_id=draft["id"],
            kind=kind,
            source_reference=draft["id"],
            payload={},
            actor_id="finance_manager",
        )
    )
    db.flush()
    return db.get(Draft, draft["id"])


def sent(db, review, message_id="77"):
    dispatch = db.scalar(select(Dispatch).where(Dispatch.review_id == review.id))
    dispatch.state = "sent"
    dispatch.sent_message_id = message_id
    db.flush()
    return dispatch


def message(text, update=1):
    return {
        "update_id": update,
        "message": {
            "message_id": update,
            "chat": {"id": 123, "type": "private"},
            "from": {"id": 123, "is_bot": False},
            "text": text,
        },
    }


def callback(token, update=2, message_id=77):
    return {
        "update_id": update,
        "callback_query": {
            "id": "query",
            "from": {"id": 123, "is_bot": False},
            "message": {"message_id": message_id, "chat": {"id": 123, "type": "private"}},
            "data": "journal:" + token,
        },
    }


@pytest.mark.parametrize("provider", ["telegram", "bale"])
def test_private_actions_only_and_free_text_never_posts(provider):
    assert service.normalize_action(provider, message("ثبتش کن")) is None
    assert service.normalize_action(provider, message("/journals")) is not None
    value = callback("a" * 32)
    assert service.normalize_action(provider, value).token == "a" * 32
    value["callback_query"]["message"]["chat"]["type"] = "group"
    assert service.normalize_action(provider, value) is None
    value = callback("a" * 32)
    value["callback_query"]["from"]["id"] = 999
    assert service.normalize_action(provider, value) is None
    value = callback("a" * 31)
    assert service.normalize_action(provider, value) is None


def test_exact_batch_confirmation_and_replay_single_effect(book):
    db = book
    connection(db)
    first = operation(db)
    second = operation(db, amount="9007199254740993")
    review, token, text = service.prepare_review(db, "c", "conn", 2, [first.id, second.id])
    assert token not in review.token_hash and token not in str(review.items)
    assert "90071992547409930" in text and "001 001" in text
    assert "نسخه 1" in text and "جمع بدهکار" in text
    assert db.scalar(select(NativeJournal.id)) is None
    sent(db, review)
    with pytest.raises(DomainError):
        service.confirm_review(db, "c", "conn", 2, token, "different")
    result = service.confirm_review(db, "c", "conn", 2, token, "77")
    assert len(result["items"]) == 2
    assert service.confirm_review(db, "c", "conn", 2, token, "77") == result
    assert len(list(db.scalars(select(NativeJournal)))) == 2
    assert db.scalar(select(m.JournalLine.id)) is None


def test_stale_batch_rejected_atomically_and_expiry_connection_role_checked(book, monkeypatch):
    db = book
    conn = connection(db)
    first = operation(db)
    second = operation(db)
    review, token, _ = service.prepare_review(db, "c", "conn", 2, [first.id, second.id])
    sent(db, review)
    changed = data(db, "30")
    save_draft(db, "c", db.get(m.User, "finance_manager"), changed, second.id, 1)
    with pytest.raises(DomainError):
        service.confirm_review(db, "c", "conn", 2, token, "77")
    assert db.scalar(select(NativeJournal.id)) is None
    review, token, _ = service.prepare_review(db, "c", "conn", 2, [first.id])
    sent(db, review)
    conn.version += 1
    with pytest.raises(DomainError):
        service.confirm_review(db, "c", "conn", 2, token, "77")
    conn.version = 2
    db.get(m.Membership, "finance_manager").role = "viewer"
    db.flush()
    with pytest.raises(DomainError):
        service.confirm_review(db, "c", "conn", 2, token, "77")
    db.get(m.Membership, "finance_manager").role = "finance_manager"
    db.flush()
    expiry = m.now() + timedelta(minutes=11)
    monkeypatch.setattr(service.m, "now", lambda: expiry)
    with pytest.raises(DomainError) as error:
        service.confirm_review(db, "c", "conn", 2, token, "77")
    assert error.value.code == "bot_review_expired"
    assert db.scalar(select(NativeJournal.id)) is None


def test_personnel_and_unknown_provenance_stay_in_app(book):
    db = book
    connection(db)
    for kind, description in (("payroll", "ماه"), ("payroll_payment", "پرداخت"), ("expense", "حقوق کارکنان")):
        draft = operation(db, kind=kind, description=description)
        with pytest.raises(DomainError) as error:
            service.prepare_review(db, "c", "conn", 2, [draft.id])
        assert error.value.code == "bot_review_app_only"
    manual = save_draft(db, "c", db.get(m.User, "finance_manager"), data(db))
    with pytest.raises(DomainError):
        service.prepare_review(db, "c", "conn", 2, [manual["id"]])
    assert db.scalar(select(Review.id)) is None


def test_callback_tampering_and_crosscompany_do_not_post(book):
    db = book
    connection(db)
    draft = operation(db)
    review, token, _ = service.prepare_review(db, "c", "conn", 2, [draft.id])
    sent(db, review)
    with pytest.raises(DomainError):
        service.confirm_review(db, "c", "conn", 2, "x" * 32, "77")
    with pytest.raises(DomainError):
        service.confirm_review(db, "other", "conn", 2, token, "77")
    db.get(m.BotConnection, "conn").state = "revoked"
    with pytest.raises(DomainError):
        service.confirm_review(db, "c", "conn", 2, token, "77")
    assert db.scalar(select(NativeJournal.id)) is None


def test_webhook_command_full_review_explicit_confirm_and_duplicate_update(book, monkeypatch):
    db = book
    connection(db)
    draft = operation(db)

    @contextmanager
    def tx(company=None):
        yield db

    monkeypatch.setattr(service, "transaction", tx)
    monkeypatch.setattr(
        bot_service, "configured", lambda provider: (SecretStr("test-token-123"), SecretStr("s" * 32))
    )
    sends = []

    class Transport:
        async def send_message(self, chat, text, **kwargs):
            sends.append((chat, text, kwargs))
            return "77"

    transport = Transport()

    async def responder(**kwargs):
        raise AssertionError("Posting must never call assistant")

    async def run():
        request = message("/journals " + draft.id)
        await bot_service.receive("telegram", request, transport=transport, responder=responder)
        await bot_service.receive("telegram", request, transport=transport, responder=responder)
        assert len(sends) == 1 and db.scalar(select(NativeJournal.id)) is None
        token = sends[0][2]["reply_markup"]["inline_keyboard"][0][0]["callback_data"][8:]
        await bot_service.receive("telegram", callback(token), transport=transport, responder=responder)
        await bot_service.receive("telegram", callback(token), transport=transport, responder=responder)

    asyncio.run(run())
    assert len(list(db.scalars(select(NativeJournal)))) == 1
    assert len(sends) == 2 and "ثبت نهایی 1 سند" in sends[1][1]


def test_failed_review_delivery_token_cannot_post(book, monkeypatch):
    db = book
    connection(db)
    draft = operation(db)

    @contextmanager
    def tx(company=None):
        yield db

    monkeypatch.setattr(service, "transaction", tx)
    monkeypatch.setattr(
        bot_service, "configured", lambda provider: (SecretStr("test-token-123"), SecretStr("s" * 32))
    )

    class Transport:
        async def send_message(self, *args, **kwargs):
            raise DomainError("bot_delivery_unconfirmed", "ارسال تأیید نشد.", 503)

    asyncio.run(service.receive_posting("telegram", message("/journals " + draft.id), transport=Transport()))
    dispatch = db.scalar(select(Dispatch))
    assert dispatch.state == "unconfirmed" and dispatch.sent_message_id is None
    assert db.scalar(select(NativeJournal.id)) is None


def test_signed_webhook_actual_posting_replay_and_frozen_review(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from pydantic import SecretStr
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.accounting_service import save_account,save_draft
from didban.operation_models import OperationDraft
from didban.posting_models import NativeJournal
from didban.bot_posting_models import BotPostingReview,BotPostingDispatch
from didban.bot_transport import BotTransport
settings.bots_enabled=True
settings.telegram_bot_token=SecretStr("1234567890:test")
settings.telegram_webhook_secret=SecretStr("s"*32)
sends=[]
async def send(self,chat,text,**kwargs):
    sends.append((chat,text,kwargs));return "77"
async def acknowledge(self,identifier):return None
BotTransport.send_message=send
BotTransport.answer_callback=acknowledge
with transaction("company-a") as db:
    actor=db.get(m.User,users["finance_manager"])
    db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"))
    one=save_account(db,"company-a",actor,{"code":"001","name":"بانک","active":True})
    two=save_account(db,"company-a",actor,{"code":"002","name":"خدمات","active":True})
    draft=save_draft(db,"company-a",actor,{"period_id":period_id,"date":date(2026,9,2),"description":"خدمات","unit":"TOMAN","lines":[{"account_id":one["id"],"party_id":"customer","debit":"10","credit":"0"},{"account_id":two["id"],"party_id":"customer","debit":"0","credit":"10"}]})
    db.add(OperationDraft(company_id="company-a",draft_id=draft["id"],kind="sale_service",source_reference="invoice-1",payload={},actor_id=actor.id))
    db.add(m.BotConnection(company_ref="company-a",user_id=actor.id,provider="telegram",state="active",sender_id="123",chat_id="123",version=2,expires_at=m.now()))
webhook="/api/v1/bots/telegram/webhook"
headers={"x-telegram-bot-api-secret-token":"s"*32}
cmd={"update_id":100,"message":{"message_id":10,"chat":{"id":123,"type":"private"},"from":{"id":123,"is_bot":False},"text":"/journals "+draft["id"]}}
assert TestClient(app).post(webhook,json=cmd).status_code==403
http=TestClient(app)
assert http.post(webhook,json=cmd,headers=headers).status_code==200
assert len(sends)==1 and "100" in sends[0][1]
assert http.post(webhook,json=cmd,headers=headers).status_code==200
assert len(sends)==1
button=sends[0][2]["reply_markup"]["inline_keyboard"][0][0]
callback={"update_id":101,"callback_query":{"id":"query-id","from":{"id":123,"is_bot":False},"message":{"message_id":77,"chat":{"id":123,"type":"private"}},"data":button["callback_data"]}}
assert http.post(webhook,json=callback,headers=headers).status_code==200
assert http.post(webhook,json=callback,headers=headers).status_code==200
with transaction("company-a") as db:
    assert len(list(db.scalars(select(NativeJournal))))==1
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(BotPostingDispatch)).state=="posted"
try:
    with transaction("company-a") as db:db.execute(update(BotPostingReview).values(items=[]))
except IntegrityError:pass
else:raise AssertionError("Bot exact-version review was editable")
initialize()
""",
    )


def test_transport_constrained_inline_confirmation_and_callback_ack():
    import json

    import httpx

    from didban.bot_transport import BotTransport

    calls = []

    def handle(request):
        calls.append(request)
        if request.url.path.endswith("answerCallbackQuery"):
            return httpx.Response(200, json={"ok": True, "result": True})
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 77}})

    transport = BotTransport("bale", SecretStr("1234567890:test"), transport=httpx.MockTransport(handle))
    markup = {"inline_keyboard": [[{"text": "تأیید", "callback_data": "journal:" + "a" * 32}]]}

    async def run():
        assert await transport.send_message("123", "بررسی", reply_markup=markup) == "77"
        await transport.answer_callback("query-id")
        with pytest.raises(DomainError):
            await transport.send_message(
                "123", "x", reply_markup={"inline_keyboard": [[{"text": "x", "url": "https://example.test"}]]}
            )

    asyncio.run(run())
    assert len(calls) == 2
    assert json.loads(calls[0].content)["reply_markup"] == markup
    assert json.loads(calls[1].content) == {"callback_query_id": "query-id"}


def test_draft_notification_opt_in_no_personnel_live_authority_and_stale_version(book):
    from didban import bot_notification_service as notices
    from didban.bot_notification_models import BotNotificationDelivery as Delivery
    from didban.bot_notification_models import BotNotificationPreference as Preference

    db = book
    connection(db)
    safe = operation(db, amount="12345")
    operation(db, kind="payroll", description="پرسنلی")
    save_draft(db, "c", db.get(m.User, "finance_manager"), data(db))
    pref = Preference(
        company_id="c",
        user_id="finance_manager",
        provider="telegram",
        connection_id="conn",
        connection_version=2,
        enabled=True,
        events=["draft_approval"],
        enabled_at=m.now(),
    )
    db.add(pref)
    db.flush()
    notices.queue_events(db, "c", m.now())
    notices.queue_events(db, "c", m.now())
    deliveries = list(db.scalars(select(Delivery)))
    assert len(deliveries) == 1 and deliveries[0].event_id == safe.id
    text = notices._text(db, deliveries[0])
    assert "/journals " + safe.id in text and "12345" not in text and "پرسنلی" not in text
    safe.version += 1
    db.flush()
    assert notices._text(db, deliveries[0]) is None
    db.get(m.Membership, "finance_manager").role = "viewer"
    db.flush()
    notices.queue_events(db, "c", m.now())
    assert len(list(db.scalars(select(Delivery)))) == 1
