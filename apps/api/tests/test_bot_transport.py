import asyncio
import json

import httpx
import pytest
from pydantic import SecretStr

from didban.bot_transport import BotTransport, normalize_update
from didban.errors import DomainError


def update():
    return {"update_id": 0, "message": {"message_id": 1, "from": {"id": 12, "is_bot": False},
            "chat": {"id": 12, "type": "private"}, "text": " سلام "}}


@pytest.mark.parametrize("provider", ["telegram", "bale"])
def test_private_normalization(provider):
    message = normalize_update(provider, update())
    assert message.provider == provider and message.update_id == 0
    assert message.text == "سلام" and message.chat_id == message.sender_id == "12"


@pytest.mark.parametrize("edit", [
    lambda p: p.update(update_id=True),
    lambda p: p.update(edited_message=p["message"]),
    lambda p: p["message"]["from"].update(id="12"),
    lambda p: p["message"]["from"].update(is_bot=True),
    lambda p: p["message"]["chat"].update(type="group"),
    lambda p: p["message"]["chat"].update(id=13),
    lambda p: p["message"].update(text="a" * 4001),
    lambda p: p["message"].update(text="  "),
    lambda p: p["message"].update(document={}),
    lambda p: p["message"].update(forward_origin={}),
])
def test_unsupported_or_malformed_updates_are_ignored(edit):
    payload = update()
    edit(payload)
    assert normalize_update("telegram", payload) is None


@pytest.mark.parametrize("provider,host", [("telegram", "api.telegram.org"), ("bale", "tapi.bale.ai")])
def test_send_plain_text_to_fixed_origin(provider, host):
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.host == host and request.url.scheme == "https"
        assert json.loads(request.content) == {"chat_id": "12", "text": "سلام"}
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 20}})

    adapter = BotTransport(provider, SecretStr("synthetic:token"), transport=httpx.MockTransport(handler))
    assert asyncio.run(adapter.send_message("12", "سلام")) == "20"
    assert len(calls) == 1 and "synthetic:token" not in repr(adapter)


@pytest.mark.parametrize("status,body", [(429, {}), (302, {}), (200, {"ok": False}),
                                         (200, {"ok": True, "result": {"message_id": True}})])
def test_errors_sanitized_and_never_retried(status, body):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json=body)

    adapter = BotTransport("telegram", SecretStr("synthetic:token"), transport=httpx.MockTransport(handler))
    with pytest.raises(DomainError) as error:
        asyncio.run(adapter.send_message("12", "سلام"))
    assert len(calls) == 1 and error.value.code == "bot_delivery_unconfirmed"
    assert "synthetic" not in str(error.value) and error.value.__context__ is None


def test_network_errors_sanitized():
    def handler(request):
        raise httpx.ReadTimeout(str(request.url), request=request)

    adapter = BotTransport("bale", SecretStr("synthetic:token"), transport=httpx.MockTransport(handler))
    with pytest.raises(DomainError) as error:
        asyncio.run(adapter.send_message("12", "سلام"))
    assert "synthetic" not in str(error.value) and error.value.__context__ is None


def test_arbitrary_endpoint_and_non_private_target_rejected():
    with pytest.raises(DomainError):
        BotTransport("https://invalid.test", SecretStr("synthetic:token"))
    with pytest.raises(DomainError):
        BotTransport("bale", SecretStr("secret/../path"))
    adapter = BotTransport("bale", SecretStr("synthetic:token"))
    with pytest.raises(DomainError):
        asyncio.run(adapter.send_message("-12", "سلام"))


@pytest.mark.parametrize("provider", ["telegram", "bale"])
def test_httpx_info_logs_do_not_expose_bot_tokens(caplog, provider):
    def handler(request):
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    caplog.set_level("INFO", logger="httpx")
    adapter = BotTransport(provider, SecretStr("synthetic:token"), transport=httpx.MockTransport(handler))
    asyncio.run(adapter.send_message("12", "سلام"))
    assert "synthetic:token" not in caplog.text
    # Do not silence ordinary application HTTP requests.
    async def ordinary_request():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await client.get("https://example.test/status")
    asyncio.run(ordinary_request())
    assert "https://example.test/status" in caplog.text
