"""Private text-only bot adapter; provider payloads never grant application access.

Protocols: https://core.telegram.org/bots/api and https://docs.bale.ai/.
No webhook registration or automatic retry is performed here. HTTP access logging
must redact bot-token URL paths at deployment time.
"""

import json
import logging
import re
from dataclasses import dataclass
from typing import Literal

import httpx
from pydantic import SecretStr

from .errors import DomainError, require

Provider = Literal["telegram", "bale"]
ORIGINS = {"telegram": "https://api.telegram.org", "bale": "https://tapi.bale.ai"}
MAX_TEXT = 4000


class _BotRequestLogFilter(logging.Filter):
    """HTTPX logs full request URLs, whose bot paths contain credentials.

    Suppress only requests to our fixed bot API origins. Filter installation is
    permanent so concurrent sends and unrelated HTTPX requests do not race over
    logger state; unrelated request logs remain available.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return not any(
            origin + suffix in message for origin in ORIGINS.values() for suffix in ("/bot", "/file/bot")
        )


logging.getLogger("httpx").addFilter(_BotRequestLogFilter())


@dataclass(frozen=True)
class PrivateMessage:
    provider: Provider
    update_id: int
    message_id: int
    sender_id: str
    chat_id: str
    text: str


def _integer(value: object, minimum: int = 1) -> bool:
    return type(value) is int and minimum <= value <= 2**63 - 1


def normalize_update(provider: Provider, payload: object) -> PrivateMessage | None:
    """Ignore unsupported updates and reject malformed identities without coercion."""
    if provider not in ORIGINS or not isinstance(payload, dict):
        return None
    if not _integer(payload.get("update_id"), 0):
        return None
    # Edited and forwarded content cannot impersonate a new direct user action.
    if any(key in payload for key in ("edited_message", "channel_post", "callback_query")):
        return None
    message = payload.get("message")
    if not isinstance(message, dict):
        return None
    sender, chat, text = message.get("from"), message.get("chat"), message.get("text")
    if not isinstance(sender, dict) or not isinstance(chat, dict):
        return None
    if chat.get("type") != "private" or sender.get("is_bot") is not False:
        return None
    if not _integer(sender.get("id")) or not _integer(chat.get("id")):
        return None
    if sender["id"] != chat["id"] or not _integer(message.get("message_id")):
        return None
    if any(key in message for key in ("forward_origin", "forward_from", "forward_from_chat", "document")):
        return None
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        return None
    return PrivateMessage(
        provider=provider,
        update_id=payload["update_id"],
        message_id=message["message_id"],
        sender_id=str(sender["id"]),
        chat_id=str(chat["id"]),
        text=text.strip(),
    )


class BotTransport:
    """Send once with bounded I/O; errors never expose token URLs or provider text."""

    def __init__(
        self, provider: Provider, token: SecretStr, *, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        require(provider in ORIGINS, "bot_provider_invalid", "پیام‌رسان معتبر نیست.")
        require(
            isinstance(token, SecretStr)
            and re.fullmatch(r"[A-Za-z0-9:_-]{10,256}", token.get_secret_value()) is not None,
            "bot_not_configured",
            "اتصال بات تنظیم نشده است.",
            503,
        )
        self.provider = provider
        self._token = token
        self._transport = transport

    async def send_message(self, chat_id: str, text: str, *, reply_markup: dict | None = None) -> str:
        require(
            isinstance(chat_id, str) and re.fullmatch(r"[1-9][0-9]{0,18}", chat_id) is not None,
            "bot_chat_invalid",
            "گفت‌وگوی خصوصی معتبر نیست.",
        )
        require(
            isinstance(text, str) and bool(text.strip()) and len(text) <= MAX_TEXT,
            "bot_text_invalid",
            "متن پیام معتبر نیست.",
        )
        body = {"chat_id": chat_id, "text": text}
        if reply_markup is not None:
            rows = reply_markup.get("inline_keyboard") if isinstance(reply_markup, dict) else None
            require(
                isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], list) and len(rows[0]) == 1,
                "bot_markup_invalid",
                "دکمهٔ پیام معتبر نیست.",
            )
            button = rows[0][0]
            require(
                isinstance(button, dict)
                and set(button) == {"text", "callback_data"}
                and isinstance(button["text"], str)
                and 1 <= len(button["text"]) <= 100
                and isinstance(button["callback_data"], str)
                and re.fullmatch(r"journal:[A-Za-z0-9_-]{32}", button["callback_data"]) is not None,
                "bot_markup_invalid",
                "دکمهٔ پیام معتبر نیست.",
            )
            body["reply_markup"] = reply_markup
        endpoint = f"{ORIGINS[self.provider]}/bot{self._token.get_secret_value()}/sendMessage"
        failed = False
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10, connect=5),
                follow_redirects=False,
                transport=self._transport,
                trust_env=False,
            ) as client:
                response = await client.post(endpoint, json=body)
                if response.status_code != 200 or len(response.content) > 65536:
                    failed = True
                else:
                    data = response.json()
                    result = data.get("result") if isinstance(data, dict) else None
                    if (
                        isinstance(data, dict)
                        and data.get("ok") is True
                        and isinstance(result, dict)
                        and _integer(result.get("message_id"))
                    ):
                        return str(result["message_id"])
                    failed = True
        except (httpx.HTTPError, ValueError):
            failed = True
        # Outside the except block to avoid retaining token-bearing exceptions.
        if failed:
            raise DomainError("bot_delivery_unconfirmed", "ارسال پیام تأیید نشد.", 503)
        raise DomainError("bot_delivery_unconfirmed", "ارسال پیام تأیید نشد.", 503)

    async def answer_callback(self, callback_id: str) -> None:
        require(
            isinstance(callback_id, str) and re.fullmatch(r"[!-~]{1,256}", callback_id) is not None,
            "bot_callback_invalid",
            "شناسهٔ دکمه معتبر نیست.",
        )
        endpoint = f"{ORIGINS[self.provider]}/bot{self._token.get_secret_value()}/answerCallbackQuery"
        failed = False
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10, connect=5),
                follow_redirects=False,
                transport=self._transport,
                trust_env=False,
            ) as client:
                response = await client.post(endpoint, json={"callback_query_id": callback_id})
                if response.status_code == 200 and len(response.content) <= 65536:
                    data = response.json()
                    if isinstance(data, dict) and data.get("ok") is True and data.get("result") is True:
                        return
                failed = True
        except (httpx.HTTPError, ValueError):
            failed = True
        if failed:
            raise DomainError("bot_callback_unconfirmed", "دریافت دکمه تأیید نشد.", 503)

    async def download_file(self, file_id: str, *, max_bytes: int = 20 * 1024 * 1024) -> bytes:
        """Provider-owned getFile path only; no redirects, user URLs or secret errors."""
        require(
            isinstance(file_id, str) and 1 <= len(file_id) <= 256,
            "bot_file_invalid",
            "شناسه فایل معتبر نیست.",
        )
        origin = ORIGINS[self.provider]
        token = self._token.get_secret_value()
        failed = False
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(20, connect=5),
                follow_redirects=False,
                transport=self._transport,
                trust_env=False,
            ) as client:
                metadata_bytes = bytearray()
                async with client.stream(
                    "POST", f"{origin}/bot{token}/getFile", json={"file_id": file_id}
                ) as response:
                    require(
                        response.status_code == 200, "bot_file_unavailable", "دریافت فایل تأیید نشد.", 503
                    )
                    async for chunk in response.aiter_bytes():
                        metadata_bytes.extend(chunk)
                        require(
                            len(metadata_bytes) <= 65536,
                            "bot_file_unavailable",
                            "دریافت فایل تأیید نشد.",
                            503,
                        )
                body = json.loads(metadata_bytes)
                metadata = body.get("result") if isinstance(body, dict) and body.get("ok") is True else None
                require(isinstance(metadata, dict), "bot_file_unavailable", "دریافت فایل تأیید نشد.", 503)
                path = metadata.get("file_path")
                require(
                    isinstance(path, str)
                    and len(path) <= 512
                    and re.fullmatch(r"[A-Za-z0-9_./-]+", path) is not None
                    and not path.startswith("/")
                    and all(part not in ("", ".", "..") for part in path.split("/")),
                    "bot_file_invalid",
                    "مسیر فایل معتبر نیست.",
                )
                size = metadata.get("file_size")
                require(
                    size is None or (type(size) is int and 0 <= size <= max_bytes),
                    "bot_file_too_large",
                    "فایل بزرگ‌تر از حد مجاز است.",
                    413,
                )
                content = bytearray()
                async with client.stream("GET", f"{origin}/file/bot{token}/{path}") as file:
                    require(file.status_code == 200, "bot_file_unavailable", "دریافت فایل تأیید نشد.", 503)
                    async for chunk in file.aiter_bytes():
                        content.extend(chunk)
                        require(
                            len(content) <= max_bytes,
                            "bot_file_too_large",
                            "فایل بزرگ‌تر از حد مجاز است.",
                            413,
                        )
                return bytes(content)
        except (httpx.HTTPError, ValueError):
            failed = True
        if failed:
            raise DomainError("bot_file_unavailable", "دریافت فایل تأیید نشد.", 503)
        raise DomainError("bot_file_unavailable", "دریافت فایل تأیید نشد.", 503)
