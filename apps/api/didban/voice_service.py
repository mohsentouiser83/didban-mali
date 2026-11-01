"""Transient speech-to-text; no audio or transcript is saved to financial data.

Provider contract checked 2026-11-01:
https://docs.avalai.ir/en/models/groq
https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create

Audio billing is separate from structured text tariffs. The installation must
explicitly enable speech and select a supported speech model; never auto-retry a
potentially billable request or claim unknown provider charges are zero.
"""

import httpx

from .config import settings
from .errors import DomainError, require

ENDPOINTS = {
    "AvalAI": "https://api.avalai.ir/v1/audio/transcriptions",
    "OpenAI": "https://api.openai.com/v1/audio/transcriptions",
}
FORMATS = {
    "audio/webm": ("webm", lambda data: data.startswith(b"\x1a\x45\xdf\xa3")),
    "audio/ogg": ("ogg", lambda data: data.startswith(b"OggS")),
    "audio/mp4": ("m4a", lambda data: len(data) >= 12 and data[4:8] == b"ftyp"),
    "audio/mpeg": ("mp3", lambda data: data.startswith(b"ID3") or (len(data) > 1 and data[0] == 255 and data[1] & 224 == 224)),
    "audio/wav": ("wav", lambda data: data.startswith(b"RIFF") and data[8:12] == b"WAVE"),
    "audio/x-wav": ("wav", lambda data: data.startswith(b"RIFF") and data[8:12] == b"WAVE"),
}


def voice_available() -> bool:
    return bool(settings.voice_enabled and settings.voice_model and settings.openai_api_key)


async def transcribe(content: bytes, content_type: str, *, transport=None) -> dict:
    """Validate container metadata and return only bounded editable text."""
    require(voice_available(), "voice_unconfigured", "تبدیل ویس در سرور فعال نشده است.", 503)
    require(0 < len(content) <= settings.voice_max_bytes, "voice_size_invalid", "ویس باید کمتر از ۱۰ مگابایت باشد.", 413)
    mime = content_type.split(";", 1)[0].strip().lower()
    require(mime in FORMATS, "voice_format_invalid", "فرمت ویس پشتیبانی نمی‌شود.", 415)
    extension, matches = FORMATS[mime]
    require(matches(content), "voice_format_invalid", "فایل صوتی معتبر نیست.", 415)
    try:
        async with httpx.AsyncClient(transport=transport, timeout=45) as client:
            async with client.stream(
                "POST", ENDPOINTS[settings.model_provider],
                headers={"Authorization": "Bearer " + settings.openai_api_key.get_secret_value()},
                data={"model": settings.voice_model, "language": "fa", "response_format": "json"},
                files={"file": ("voice." + extension, content, mime)},
            ) as response:
                require(response.status_code != 429, "voice_rate_limited", "تبدیل ویس شلوغ است؛ کمی بعد تلاش کنید.", 503)
                require(response.status_code < 400, "voice_provider_unavailable", "تبدیل ویس انجام نشد؛ دوباره تلاش کنید.", 503)
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    require(len(body) <= 64 * 1024, "voice_response_invalid", "متن ویس قابل دریافت نیست.", 502)
        import json

        result = json.loads(body)
    except (httpx.TimeoutException, httpx.NetworkError, httpx.ProtocolError) as error:
        raise DomainError("voice_provider_unavailable", "تبدیل ویس انجام نشد؛ دوباره تلاش کنید.", 503) from error
    except (ValueError, TypeError) as error:
        raise DomainError("voice_response_invalid", "متن ویس قابل دریافت نیست.", 502) from error
    text = result.get("text") if isinstance(result, dict) else None
    require(isinstance(text, str) and 0 < len(text.strip()) <= 1000, "voice_text_invalid", "ویس واضح نیست یا متن آن بیش از حد طولانی است.", 422)
    return {"text": text.strip()}
