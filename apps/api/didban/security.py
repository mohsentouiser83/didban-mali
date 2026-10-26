from __future__ import annotations
import base64
import hmac
import json
import secrets
import time
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.fernet import Fernet, InvalidToken

from .errors import ApiError

HASHER = PasswordHasher()
DUMMY_HASH = HASHER.hash(secrets.token_urlsafe(32))


def json_value(value):
    if isinstance(value, dict):
        return {str(k): json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(v) for v in value]
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


class Security:
    def __init__(self, secret: str, ttl: int):
        self.key = secret.encode()
        self.ttl = ttl
        self.cipher = Fernet(
            base64.urlsafe_b64encode(self.digest_bytes("encrypted-replay", "key"))
        )

    def digest_bytes(self, purpose: str, value: str) -> bytes:
        return hmac.digest(self.key, (purpose + "\0" + value).encode(), "sha256")

    def digest(self, purpose: str, value: str) -> str:
        return self.digest_bytes(purpose, value).hex()

    def fingerprint(self, value: dict) -> str:
        return self.digest(
            "request-payload",
            json.dumps(
                value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ),
        )

    def token(self) -> str:
        return secrets.token_urlsafe(32)

    def csrf(self) -> str:
        payload = f"{int(time.time())}.{self.token()}"
        return payload + "." + self.digest("csrf", payload)

    def valid_csrf(self, value: str | None) -> bool:
        try:
            stamp, nonce, signature = (value or "").split(".")
            age = time.time() - int(stamp)
            return (
                0 <= age <= self.ttl
                and len(nonce) >= 32
                and hmac.compare_digest(
                    signature, self.digest("csrf", stamp + "." + nonce)
                )
            )
        except (ValueError, TypeError):
            return False

    def encrypt(self, value: dict) -> str:
        return self.cipher.encrypt(
            json.dumps(json_value(value), separators=(",", ":")).encode()
        ).decode()

    def decrypt(self, value: str) -> dict:
        try:
            return json.loads(self.cipher.decrypt(value.encode()))
        except (InvalidToken, ValueError) as error:
            raise ApiError(
                503, "replay_key_unavailable", "بازیابی نتیجه موقتاً ممکن نیست."
            ) from error

    def cursor(self, resource: str, actor: str, company: str, row: dict) -> str:
        payload = json.dumps(
            {
                "resource": resource,
                "actor": actor,
                "company": company,
                "created_at": str(row["created_at"]),
                "id": str(row["id"]),
            },
            sort_keys=True,
        )
        return (
            base64.urlsafe_b64encode(payload.encode()).decode()
            + "."
            + self.digest("cursor", payload)
        )

    def read_cursor(
        self, value: str | None, resource: str, actor: str, company: str
    ) -> tuple | None:
        if value is None:
            return None
        try:
            encoded, signature = value.split(".")
            payload = base64.urlsafe_b64decode(encoded.encode()).decode()
            data = json.loads(payload)
            if not hmac.compare_digest(
                signature, self.digest("cursor", payload)
            ) or any(
                data[k] != v
                for k, v in [
                    ("resource", resource),
                    ("actor", actor),
                    ("company", company),
                ]
            ):
                raise ValueError()
            return datetime.fromisoformat(data["created_at"]), UUID(data["id"])
        except (ValueError, KeyError, TypeError, UnicodeError) as error:
            raise ApiError(422, "invalid_cursor", "نشان صفحه معتبر نیست.") from error


def verify_password(encoded: str, password: str) -> bool:
    try:
        return HASHER.verify(encoded, password)
    except (VerificationError, InvalidHashError):
        return False
