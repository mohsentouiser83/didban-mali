from __future__ import annotations
from contextlib import asynccontextmanager
import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException
import psycopg
from psycopg_pool import PoolTimeout

from .api.router import Controller, install_routes
from .config import Settings
from .db import Database
from .errors import ApiError

LOGGER = logging.getLogger("didban.runtime")


def error_response(error: ApiError, request_id: str) -> JSONResponse:
    return JSONResponse(
        {
            "code": error.code,
            "message_fa": error.message,
            "request_id": request_id,
            "retryable": error.status == 503,
            "field_errors": error.fields,
            "details": [],
        },
        status_code=error.status,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    db = Database(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.open()
        try:
            yield
        finally:
            db.close()

    app = FastAPI(title="Didban Mali", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.db = db
    app.state.settings = settings
    controller = Controller(db, settings)
    install_routes(app, controller, settings)

    @app.exception_handler(ApiError)
    async def api_error(request: Request, error: ApiError):
        return error_response(error, request.state.request_id)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        return error_response(
            ApiError(
                error.status_code,
                "not_found" if error.status_code == 404 else "http_error",
                "مسیر یا درخواست معتبر نیست.",
            ),
            request.state.request_id,
        )

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        request.state.request_id = str(uuid4())
        try:
            result = await call_next(request)
        except psycopg.Error as error:
            state = error.sqlstate or ""
            known = error.diag.message_primary if error.diag else ""
            if state == "42501":
                mapped = ApiError(
                    403, "permission_denied", "اجازه این عملیات را ندارید."
                )
            elif state in ("23505", "23503"):
                mapped = ApiError(
                    409, "resource_conflict", "این تغییر با اطلاعات موجود سازگار نیست."
                )
            elif known == "last_owner_required":
                mapped = ApiError(
                    409, "last_owner_required", "حداقل یک مالک فعال لازم است."
                )
            elif state == "23514":
                mapped = ApiError(422, "domain_constraint", "این تغییر مجاز نیست.")
            elif state in ("40001", "40P01"):
                mapped = ApiError(
                    409,
                    "concurrent_conflict",
                    "درخواست هم‌زمان تغییر کرده است؛ دوباره بررسی کنید.",
                )
            else:
                mapped = ApiError(
                    503, "database_unavailable", "سرویس موقتاً در دسترس نیست."
                )
            LOGGER.warning(
                "database_failure request_id=%s sqlstate=%s",
                request.state.request_id,
                state,
            )
            result = error_response(mapped, request.state.request_id)
        except PoolTimeout:
            result = error_response(
                ApiError(503, "database_busy", "سرویس موقتاً مشغول است."),
                request.state.request_id,
            )
        except Exception as error:
            # Do not log body, credentials, cookies, DSNs or raw SQL/provider errors.
            LOGGER.error(
                "internal_failure request_id=%s type=%s",
                request.state.request_id,
                type(error).__name__,
            )
            result = error_response(
                ApiError(500, "internal_error", "درخواست انجام نشد."),
                request.state.request_id,
            )
        result.headers["X-Request-ID"] = request.state.request_id
        result.headers["Cache-Control"] = "no-store"
        result.headers["X-Content-Type-Options"] = "nosniff"
        result.headers["Referrer-Policy"] = "no-referrer"
        return result

    return app
