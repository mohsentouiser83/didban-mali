from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from sqlalchemy import select, update

from app.audit.service import record_audit_event
from app.core.config import settings
from app.core.tenant import set_request_user
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.identity.models import AuthSession, Membership, User, Workspace, WorkspaceRole
from app.identity.schemas import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserResponse,
)
from app.identity.security import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    decode_token,
    hash_password,
    hash_token,
    issue_session_tokens,
    normalize_email,
    set_auth_cookies,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["identity"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest, response: Response, request: Request, session: DbSession
) -> AuthResponse:
    email = normalize_email(str(payload.email))
    if await session.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="این ایمیل قبلاً ثبت شده است."
        )

    user = User(
        email=email, full_name=payload.full_name, password_hash=hash_password(payload.password)
    )
    session.add(user)
    await session.flush()
    await set_request_user(session, user.id)
    workspace = Workspace(
        name=payload.workspace_name or f"فضای کاری {payload.full_name}", owner_user_id=user.id
    )
    session.add(workspace)
    await session.flush()
    session.add(Membership(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER))
    tokens = issue_session_tokens(session, user_id=user.id)
    record_audit_event(
        session,
        action="auth.registered",
        entity_type="user",
        actor_id=user.id,
        entity_id=user.id,
        workspace_id=workspace.id,
        request_id=request.headers.get("X-Request-ID"),
    )
    await session.commit()
    set_auth_cookies(response, tokens)
    return AuthResponse(user=_user_response(user), csrf_token=tokens.csrf_token)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest, response: Response, request: Request, session: DbSession
) -> AuthResponse:
    identifier = normalize_email(str(payload.email))
    email = (
        "admin@didban.ir"
        if settings.app_env == "development" and identifier == "admin"
        else identifier
    )
    user = await session.scalar(select(User).where(User.email == email, User.is_active.is_(True)))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="ایمیل یا رمز عبور صحیح نیست."
        )

    await set_request_user(session, user.id)
    tokens = issue_session_tokens(session, user_id=user.id)
    record_audit_event(
        session,
        action="auth.logged_in",
        entity_type="auth_session",
        actor_id=user.id,
        entity_id=tokens.session.id,
        request_id=request.headers.get("X-Request-ID"),
    )
    await session.commit()
    set_auth_cookies(response, tokens)
    return AuthResponse(user=_user_response(user), csrf_token=tokens.csrf_token)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    response: Response,
    session: DbSession,
    _: CsrfProtected,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> AuthResponse:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست قابل تمدید نیست."
        )
    try:
        payload = decode_token(refresh_token, "refresh")
        session_id = UUID(payload["sid"])
        user_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست معتبر نیست."
        ) from exc

    auth_session = await session.get(AuthSession, session_id)
    now = datetime.now(UTC)
    if auth_session is None or auth_session.refresh_token_hash != hash_token(refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست معتبر نیست.")
    if auth_session.revoked_at is not None:
        await session.execute(
            update(AuthSession)
            .where(
                AuthSession.family_id == auth_session.family_id, AuthSession.revoked_at.is_(None)
            )
            .values(revoked_at=now)
        )
        await session.commit()
        clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست باطل شده است.")
    if auth_session.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="نشست منقضی شده است.")

    user = await session.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="کاربر فعال نیست.")

    tokens = issue_session_tokens(session, user_id=user.id, family_id=auth_session.family_id)
    auth_session.revoked_at = now
    auth_session.rotated_to_id = tokens.session.id
    await session.commit()
    set_auth_cookies(response, tokens)
    return AuthResponse(user=_user_response(user), csrf_token=tokens.csrf_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    session: DbSession,
    current_user: CurrentUser,
    _: CsrfProtected,
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
) -> MessageResponse:
    if access_token:
        try:
            payload = decode_token(access_token, "access")
            auth_session = await session.get(AuthSession, UUID(payload["sid"]))
            if auth_session and auth_session.user_id == current_user.id:
                auth_session.revoked_at = datetime.now(UTC)
                await session.commit()
        except (jwt.InvalidTokenError, KeyError, ValueError):
            pass
    clear_auth_cookies(response)
    return MessageResponse(message="با موفقیت خارج شدید.")


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUser) -> UserResponse:
    return _user_response(current_user)
