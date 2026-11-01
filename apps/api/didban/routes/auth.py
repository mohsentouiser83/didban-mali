"""Auth HTTP routes."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .. import models as m
from .. import schemas as s
from ..config import settings
from ..db import engine, transaction
from ..errors import DomainError, require
from ..http import P, access, installation_mutate
from ..security import authenticate, hasher, login, public_user

router = APIRouter()


@router.get(P + "/health")
def health():
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    return {
        "status": "ok",
        "deployment_mode": "production" if settings.production else "development",
        "scanner_status": "configured" if settings.scanner_host else "development_unscanned",
        "model_status": "unconfigured",
    }


@router.get(P + "/auth/status")
def auth_status():
    with transaction() as db:
        return {"initialized": bool(db.scalar(select(m.User.id).limit(1)))}


@router.post(P + "/auth/login")
def auth_login(data: s.LoginInput, request: Request):
    require(
        request.headers.get("origin") in (None, settings.web_origin),
        "origin_denied",
        "مبدأ درخواست مجاز نیست.",
        403,
    )
    with transaction() as db:
        result, token = login(
            db, data.email, data.password, request.client.host if request.client else "unknown"
        )
    if not token:
        raise DomainError("invalid_credentials", result["error"], 401)
    response = JSONResponse(result)
    response.set_cookie(
        "didban_session",
        token,
        httponly=True,
        secure=settings.production,
        samesite="strict",
        max_age=settings.session_hours * 3600,
        path="/",
    )
    return response


@router.get(P + "/auth/me")
def auth_me(request: Request):
    with access(request) as (db, user, _member):
        _, session = authenticate(db, request.cookies.get("didban_session"))
        return {"user": public_user(user), "csrf": session.csrf}


@router.post(P + "/auth/logout")
def auth_logout(request: Request):
    with access(request) as (db, _user, _member):
        _, session = authenticate(db, request.cookies.get("didban_session"))
        db.delete(session)
    response = JSONResponse({"logged_out": True})
    response.delete_cookie("didban_session")
    return response


@router.get(P + "/admin/users")
def users(request: Request):
    with access(request) as (db, user, _member):
        require(user.installation_admin, "permission_denied", "فقط مدیر نصب مجاز است.", 403)
        return {
            "items": [
                public_user(u) for u in db.scalars(select(m.User).order_by(m.User.created_at).limit(100))
            ]
        }


@router.post(P + "/admin/users", status_code=201)
def create_user(data: s.UserInput, request: Request):
    def apply(db, user):
        item = m.User(name=data.name, email=data.email.lower(), password_hash=hasher.hash(data.password))
        db.add(item)
        db.flush()
        if hasattr(m, "InstallationAudit"):
            db.add(
                m.InstallationAudit(
                    actor_id=user.id,
                    actor_label="installation_admin",
                    action="user.created",
                    entity_id=item.id,
                    details={"email": item.email},
                )
            )
        return public_user(item)

    return installation_mutate(request, data.model_dump(), apply)
