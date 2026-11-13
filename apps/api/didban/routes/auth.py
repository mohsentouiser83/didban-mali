"""Auth HTTP routes."""

from datetime import datetime, timezone

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
        "model_status": "configured" if settings.model_enabled and settings.openai_api_key else "unconfigured",
    }


@router.get(P + "/health/readiness")
def readiness():
    # 1. Database check
    db_ok = False
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
            db_ok = True
    except Exception:
        db_ok = False

    # 2. Storage check
    storage_ok = False
    try:
        if settings.storage.is_dir():
            test_file = settings.storage / f".health_check_{datetime.now(timezone.utc).timestamp()}"
            test_file.write_text("ok")
            test_file.unlink()
            storage_ok = True
    except Exception:
        storage_ok = False

    # 3. Worker queue visibility
    worker_info = {"pending_jobs": 0, "running_jobs": 0, "failed_jobs": 0, "stuck_jobs": 0, "oldest_pending_age_seconds": None}
    if db_ok:
        try:
            with transaction() as db:
                from ..models import Job, now
                jobs = list(db.scalars(select(Job)))
                curr_time = now()
                pending = [j for j in jobs if j.state == "pending"]
                running = [j for j in jobs if j.state == "running"]
                failed = [j for j in jobs if j.state == "failed"]
                stuck = [j for j in running if j.leased_until and j.leased_until < curr_time]

                oldest_age = None
                if pending:
                    oldest_created = min(j.created_at for j in pending)
                    oldest_age = round((curr_time - oldest_created).total_seconds(), 1)

                worker_info = {
                    "pending_jobs": len(pending),
                    "running_jobs": len(running),
                    "failed_jobs": len(failed),
                    "stuck_jobs": len(stuck),
                    "oldest_pending_age_seconds": oldest_age,
                }
        except Exception:
            pass

    overall_ok = db_ok and storage_ok
    status_code = 200 if overall_ok else 503

    return JSONResponse(
        {
            "status": "ready" if overall_ok else "unready",
            "database": {"status": "connected" if db_ok else "unavailable"},
            "storage": {"status": "ready" if storage_ok else "unavailable"},
            "worker": worker_info,
            "scanner": {"status": "configured" if settings.scanner_host else "development_unscanned"},
            "model": {
                "enabled": settings.model_enabled,
                "provider": settings.model_provider,
                "configured": bool(settings.openai_api_key),
            },
            "bots": {
                "enabled": settings.bots_enabled,
                "telegram": bool(settings.telegram_bot_token),
                "bale": bool(settings.bale_bot_token),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        status_code=status_code,
    )



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
