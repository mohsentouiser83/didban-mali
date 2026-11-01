import asyncio

import httpx
import pytest
from pydantic import SecretStr
from test_api_delivery import scenario

from didban.config import settings
from didban.errors import DomainError
from didban.voice_service import transcribe


@pytest.fixture
def speech(monkeypatch):
    monkeypatch.setattr(settings, "voice_enabled", True)
    monkeypatch.setattr(settings, "voice_model", "groq.whisper-large-v3")
    monkeypatch.setattr(settings, "model_provider", "AvalAI")
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("synthetic-secret"))


def test_speech_upload_is_bounded_and_returns_only_editable_text(speech):
    def send(request):
        assert str(request.url) == "https://api.avalai.ir/v1/audio/transcriptions"
        assert request.headers["authorization"] == "Bearer synthetic-secret"
        assert b"groq.whisper-large-v3" in request.content
        assert b'filename="voice.webm"' in request.content
        return httpx.Response(200, json={"text": "  مانده بانک چقدر است؟  ", "secret": "ignored"})

    assert asyncio.run(transcribe(b"\x1a\x45\xdf\xa3synthetic", "audio/webm;codecs=opus",
                                   transport=httpx.MockTransport(send))) == {"text": "مانده بانک چقدر است؟"}


@pytest.mark.parametrize("content,mime,code", [
    (b"", "audio/webm", "voice_size_invalid"),
    (b"x" * (10 * 1024 * 1024 + 1), "audio/webm", "voice_size_invalid"),
    (b"<html>", "text/html", "voice_format_invalid"),
    (b"not-a-webm", "audio/webm", "voice_format_invalid"),
])
def test_invalid_audio_never_calls_provider(speech, content, mime, code):
    def forbidden(_request):
        raise AssertionError("Invalid input reached provider")

    with pytest.raises(DomainError) as error:
        asyncio.run(transcribe(content, mime, transport=httpx.MockTransport(forbidden)))
    assert error.value.code == code


@pytest.mark.parametrize("response,code", [
    (httpx.Response(401, text="provider-secret"), "voice_provider_unavailable"),
    (httpx.Response(429), "voice_rate_limited"),
    (httpx.Response(200, text="invalid-json"), "voice_response_invalid"),
    (httpx.Response(200, json={"text": " "}), "voice_text_invalid"),
    (httpx.Response(200, json={"text": "x" * 1001}), "voice_text_invalid"),
    (httpx.Response(200, content=b"x" * 65537), "voice_response_invalid"),
])
def test_provider_failures_are_safe_and_not_retried(speech, response, code):
    calls = []

    def send(request):
        calls.append(request)
        return response

    with pytest.raises(DomainError) as error:
        asyncio.run(transcribe(b"OggSsynthetic", "audio/ogg", transport=httpx.MockTransport(send)))
    assert error.value.code == code
    assert "provider-secret" not in error.value.message
    assert len(calls) == 1


def test_voice_route_authentication_csrf_scope_and_temporary_upload_cleanup(tmp_path):
    scenario(tmp_path, r'''
from pydantic import SecretStr
from didban import voice_service
settings.voice_enabled = True
settings.voice_model = "synthetic-speech"
settings.openai_api_key = SecretStr("synthetic-key")
calls=[]
async def fake_transcribe(content, content_type):
    calls.append((content,content_type))
    return {"text":"مانده بانک"}
voice_service.transcribe=fake_transcribe
viewer=client_for("viewer")
path=base+"/assistant/transcriptions"
files={"file":("voice.webm",b"\x1a\x45\xdf\xa3synthetic","audio/webm")}
assert viewer.get(base+"/assistant/voice-status").json()=={"enabled":True}
assert viewer.post(path,files=files).json()=={"text":"مانده بانک"}
assert len(calls)==1
assert viewer.post("/api/v1/companies/company-b/assistant/transcriptions",files=files).status_code==404
csrf=viewer.headers.pop("x-csrf-token")
assert viewer.post(path,files=files).status_code==403
viewer.headers["x-csrf-token"]=csrf
assert viewer.post(path,files=files,headers={"content-length":str(11*1024*1024)}).status_code==413
assert len(calls)==1
async def revoking_transcribe(content, content_type):
    with transaction("company-a") as db:
        member=db.get(m.Membership,members["viewer"])
        member.active=False
    return {"text":"متن پنهان"}
voice_service.transcribe=revoking_transcribe
response=viewer.post(path,files=files)
assert response.status_code==404 and "متن پنهان" not in response.text
with transaction("company-a") as db:
    db.get(m.Membership,members["viewer"]).active=True
settings.voice_enabled=False
assert viewer.get(base+"/assistant/voice-status").json()=={"enabled":False}
assert viewer.post(path,files=files).status_code==503
assert len(calls)==1
assert list(settings.storage.iterdir())==[]
''')
