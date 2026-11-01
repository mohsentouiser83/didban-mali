"""Private text-only bot adapter; provider payloads never grant application access.

Protocols: https://core.telegram.org/bots/api and https://docs.bale.ai/.
No webhook registration or automatic retry is performed here. HTTP access logging
must redact bot-token URL paths at deployment time.
"""

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
        return not any(origin + "/bot" in message for origin in ORIGINS.values())


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
            "bot_not_configured", "اتصال بات تنظیم نشده است.", 503,
        )
        self.provider = provider
        self._token = token
        self._transport = transport

    async def send_message(self, chat_id: str, text: str) -> str:
        require(
            isinstance(chat_id, str) and re.fullmatch(r"[1-9][0-9]{0,18}", chat_id) is not None,
            "bot_chat_invalid", "گفت‌وگوی خصوصی معتبر نیست.",
        )
        require(
            isinstance(text, str) and bool(text.strip()) and len(text) <= MAX_TEXT,
            "bot_text_invalid", "متن پیام معتبر نیست.",
        )
        endpoint = f"{ORIGINS[self.provider]}/bot{self._token.get_secret_value()}/sendMessage"
        failed = False
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10, connect=5), follow_redirects=False,
                transport=self._transport, trust_env=False,
            ) as client:
                response = await client.post(endpoint, json={"chat_id": chat_id, "text": text})
                if response.status_code != 200 or len(response.content) > 65536:
                    failed = True
                else:
                    data = response.json()
                    result = data.get("result") if isinstance(data, dict) else None
                    if (
                        isinstance(data, dict) and data.get("ok") is True
                        and isinstance(result, dict) and _integer(result.get("message_id"))
                    ):
                        return str(result["message_id"])
                    failed = True
        except (httpx.HTTPError, ValueError):
            failed = True
        # Outside the except block to avoid retaining token-bearing exceptions.
        if failed:
            raise DomainError("bot_delivery_unconfirmed", "ارسال پیام تأیید نشد.", 503)
        raise DomainError("bot_delivery_unconfirmed", "ارسال پیام تأیید نشد.", 503)
