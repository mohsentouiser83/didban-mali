import asyncio
import logging

import httpx
import pytest
from pydantic import SecretStr
from test_api_delivery import scenario
from test_bots import SETUP

from didban.bot_attachments import normalize_attachment
from didban.bot_transport import BotTransport
from didban.errors import DomainError


def attachment(identifier=2, **changes):
    message = {
        "message_id": identifier,
        "from": {"id": 77, "is_bot": False},
        "chat": {"id": 77, "type": "private"},
        "document": {"file_id": "file-id", "file_name": "bank.csv", "file_size": 12},
    }
    return {"update_id": identifier, "message": message | changes}


def test_only_direct_private_supported_files():
    assert normalize_attachment("telegram", attachment()).name == "bank.csv"
    for changes in (
        {"forward_origin": {}},
        {"chat": {"id": 77, "type": "group"}},
        {"document": {"file_id": "x", "file_name": "malware.zip"}},
        {"document": {"file_id": "x", "file_name": "a.csv", "file_size": True}},
    ):
        assert normalize_attachment("telegram", attachment(**changes)) is None


@pytest.mark.parametrize("provider,origin", [("telegram", "api.telegram.org"), ("bale", "tapi.bale.ai")])
def test_download_fixed_origin_and_sensitive_paths_not_logged(provider, origin, caplog):
    caplog.set_level(logging.INFO, logger="httpx")
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.host == origin
        if request.method == "POST":
            return httpx.Response(
                200, json={"ok": True, "result": {"file_path": "documents/a.csv", "file_size": 3}}
            )
        return httpx.Response(200, content=b"abc")

    result = asyncio.run(
        BotTransport(
            provider, SecretStr("123456:test-token"), transport=httpx.MockTransport(handler)
        ).download_file("id", max_bytes=3)
    )
    assert result == b"abc" and len(calls) == 2
    assert "test-token" not in caplog.text


@pytest.mark.parametrize(
    "path", ["../private", "https://evil.example/a", "/tmp/a", "documents/%2e%2e/a", "documents//a"]
)
def test_getfile_path_cannot_escape_provider(path):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"ok": True, "result": {"file_path": path}})

    with pytest.raises(DomainError):
        asyncio.run(
            BotTransport(
                "telegram", SecretStr("123456:test-token"), transport=httpx.MockTransport(handler)
            ).download_file("id")
        )
    assert len(calls) == 1


def test_stream_bound_not_only_declared_size():
    def handler(request):
        if request.method == "POST":
            return httpx.Response(200, json={"ok": True, "result": {"file_path": "a.csv"}})
        return httpx.Response(200, content=b"abcd")

    with pytest.raises(DomainError) as error:
        asyncio.run(
            BotTransport(
                "telegram", SecretStr("123456:test-token"), transport=httpx.MockTransport(handler)
            ).download_file("id", max_bytes=3)
        )
    assert error.value.code == "bot_file_too_large"


def test_private_queue_import_replay_revocation_and_no_financial_effect(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
from didban.bot_intake_models import BotIntake
from didban.bot_intake_service import import_file
initialize()
pair=pairing()
content=b'account,date,amount,reference,currency\nA,2026-09-03,12,R,IRR\n'
class IntakeTransport(Transport):
    calls=0
    async def download_file(self,file_id,**kwargs):self.calls+=1;return content
transport=IntakeTransport()
def document(identifier):
    return {"update_id":identifier,"message":{"message_id":identifier,"from":{"id":77,"is_bot":False},"chat":{"id":77,"type":"private"},"document":{"file_id":"doc","file_name":"bank.csv","file_size":len(content)}}}
asyncio.run(bot_service.receive("telegram",document(2),transport=transport))
asyncio.run(bot_service.receive("telegram",document(2),transport=transport))
assert transport.calls==1 and transport.messages==[]
with transaction("company-a") as db:
    queued=db.scalar(select(BotIntake));assert queued.state=="awaiting_import"
    assert db.scalar(select(m.SourceFile.id)) is None
    queued_id=queued.id; queued_version=queued.version
assert owner.get(base+"/bot-intakes").json()["items"][0]["id"]==queued_id
assert "storage_key" not in owner.get(base+"/bot-intakes").json()["items"][0]
assert viewer.get(base+"/bot-intakes").json()["items"]==[]
assert viewer.get(base+"/bot-intakes/"+queued_id+"/download").status_code==404
assert owner.get(base+"/bot-intakes/"+queued_id+"/download").content==content
key=str(uuid4())
response=command(owner,"POST",base+"/bot-intakes/"+queued_id+"/import",{"period_id":period_id},version=queued_version,key=key)
assert response.status_code==201,response.text
result=response.json();assert result["state"]=="imported"
assert command(owner,"POST",base+"/bot-intakes/"+queued_id+"/import",{"period_id":period_id},version=queued_version,key=key).json()==result
with transaction("company-a") as db:
    assert db.get(m.ProcessingSession,result["session_id"]).state=="receiving"
    assert db.scalar(select(m.JournalLine.id)) is None
asyncio.run(bot_service.receive("telegram",document(3),transport=transport))
with transaction("company-a") as db:
    queued=db.scalar(select(BotIntake).where(BotIntake.state=="awaiting_import"))
    member=db.scalar(select(m.Membership).where(m.Membership.company_id=="company-a",m.Membership.user_id==users["owner"]))
    member.role="viewer"
asyncio.run(bot_service.receive("telegram",document(4),transport=transport))
assert transport.calls==2
with transaction() as db:
    assert db.scalar(select(func.count()).select_from(BotIntake))==2
    assert db.scalar(select(m.BotUpdate).where(m.BotUpdate.update_id=="4")).state=="attachment_failed"
""",
    )
