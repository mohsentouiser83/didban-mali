import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Response
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.core.config import settings
from app.identity.models import AuthSession

ALGORITHM = "HS256"
ISSUER = "didban-mali"
AUDIENCE = "didban-mali-web"
ACCESS_COOKIE = "didban_access"
REFRESH_COOKIE = "didban_refresh"
CSRF_COOKIE = "didban_csrf"

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str
    csrf_token: str
    session: AuthSession


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode_token(
    *,
    user_id: UUID,
    session_id: UUID,
    token_type: Literal["access", "refresh"],
    expires_at: datetime,
) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "typ": token_type,
        "jti": str(uuid7()),
        "iat": now,
        "exp": expires_at,
        "iss": ISSUER,
        "aud": AUDIENCE,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict[str, Any]:
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[ALGORITHM],
        audience=AUDIENCE,
        issuer=ISSUER,
    )
    if payload.get("typ") != expected_type:
        raise jwt.InvalidTokenError("Unexpected token type")
    return payload


def issue_session_tokens(
    session: AsyncSession, *, user_id: UUID, family_id: UUID | None = None
) -> SessionTokens:
    now = datetime.now(UTC)
    session_id = uuid7()
    family = family_id or uuid7()
    refresh_expires_at = now + timedelta(days=settings.refresh_token_days)
    access_expires_at = now + timedelta(minutes=settings.access_token_minutes)
    refresh_token = _encode_token(
        user_id=user_id,
        session_id=session_id,
        token_type="refresh",
        expires_at=refresh_expires_at,
    )
    access_token = _encode_token(
        user_id=user_id,
        session_id=session_id,
        token_type="access",
        expires_at=access_expires_at,
    )
    auth_session = AuthSession(
        id=session_id,
        user_id=user_id,
        family_id=family,
        refresh_token_hash=hash_token(refresh_token),
        expires_at=refresh_expires_at,
        created_at=now,
    )
    session.add(auth_session)
    return SessionTokens(
        access_token=access_token,
        refresh_token=refresh_token,
        csrf_token=secrets.token_urlsafe(32),
        session=auth_session,
    )


def set_auth_cookies(response: Response, tokens: SessionTokens) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        tokens.access_token,
        httponly=True,
        max_age=settings.access_token_minutes * 60,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        tokens.refresh_token,
        httponly=True,
        max_age=settings.refresh_token_days * 86400,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        tokens.csrf_token,
        httponly=False,
        max_age=settings.refresh_token_days * 86400,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    for cookie_name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
        response.delete_cookie(cookie_name, path="/", secure=settings.cookie_secure, samesite="lax")
