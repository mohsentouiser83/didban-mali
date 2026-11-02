"""Shared HTTP authorization, mutation, version and pagination adapters."""

import base64
import json
import secrets
from contextlib import contextmanager
from datetime import datetime
from hashlib import sha256

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, or_, select, text

from . import models as m
from .config import settings
from .db import engine, transaction
from .errors import DomainError, require
from .security import authenticate, membership
from .workflow import (
    serialize_fact,
)

P = "/api/v1"
C = P + "/companies/{company_id}"


def error_body(request: Request, code: str, message: str, fields: dict | None = None) -> dict:
    return {
        "code": code,
        "message_fa": message,
        "request_id": getattr(request.state, "request_id", ""),
        "retryable": code in ("scanner_unavailable", "temporary_dependency"),
        "field_errors": fields or {},
        "details": {},
    }


def check_csrf(request: Request, session: m.LoginSession) -> None:
    require(
        request.headers.get("origin") in (None, settings.web_origin),
        "origin_denied",
        "مبدأ درخواست مجاز نیست.",
        403,
    )
    require(
        secrets.compare_digest(request.headers.get("x-csrf-token", ""), session.csrf),
        "csrf_required",
        "نشست را تازه کنید.",
        403,
    )


@contextmanager
def access(request: Request, company: str | None = None, operation: str = "read"):
    with transaction(company) as db:
        user, session = authenticate(db, request.cookies.get("didban_session"))
        if engine.dialect.name == "postgresql":
            db.execute(text("SELECT set_config('didban.user_id', :actor, true)"), {"actor": user.id})
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            check_csrf(request, session)
        member = membership(db, company, user, operation) if company else None
        if company:
            # Shared server guard also covers callers bypassing disabled navigation.
            # Reports/results remain immutable historical records and are readable.
            from .module_service import require_module

            resource = request.url.path.removeprefix(f"/api/v1/companies/{company}/").split("/")[0]
            module = {
                "planned-payments": "cashflow",
                "forecasts": "cashflow",
                "cashflow-scenarios": "cashflow",
                "native-forecasts": "cashflow",
                "cheques": "settlements",
                "allocations": "settlements",
                "reconciliation-options": "reconciliation",
                "reconciliation-groups": "reconciliation",
                "reconciliation-manual-groups": "reconciliation",
                "reconciliation-native-groups": "reconciliation",
                "reconciliations": "reconciliation",
                "reconciliation-proposals": "reconciliation",
                "employees": "employees",
                "payroll": "payroll",
                "employee-reports": "employee_reports",
                "tax": "tax",
                "insurance": "insurance",
            }.get(resource)
            if module:
                require_module(db, company, module, ready=False)
        yield db, user, member


def mutate(request: Request, company: str, payload: dict, operation: str, callback) -> dict:
    key = request.headers.get("idempotency-key", "")
    require(1 <= len(key) <= 128, "idempotency_key_required", "شناسه درخواست لازم است.", 428)
    fingerprint = sha256(
        json.dumps(
            {"path": request.url.path, "method": request.method, "payload": jsonable_encoder(payload)},
            sort_keys=True,
        ).encode()
    ).hexdigest()
    with access(request, company, operation) as (db, user, _member):
        previous = db.scalar(
            select(m.Idempotency).where(
                m.Idempotency.company_id == company,
                m.Idempotency.actor_id == user.id,
                m.Idempotency.key == key,
            )
        )
        if previous:
            require(
                previous.fingerprint == fingerprint,
                "idempotency_conflict",
                "شناسه درخواست با محتوای دیگری استفاده شده است.",
                409,
            )
            return previous.response
        result = jsonable_encoder(callback(db, user))
        db.add(
            m.Idempotency(
                company_id=company, actor_id=user.id, key=key, fingerprint=fingerprint, response=result
            )
        )
        return result


def installation_mutate(request: Request, payload: dict, callback) -> dict:
    key = request.headers.get("idempotency-key", "")
    require(1 <= len(key) <= 128, "idempotency_key_required", "شناسه درخواست لازم است.", 428)
    fingerprint = sha256(
        json.dumps(
            {"path": request.url.path, "method": request.method, "payload": jsonable_encoder(payload)},
            sort_keys=True,
        ).encode()
    ).hexdigest()
    with access(request) as (db, user, _member):
        require(user.installation_admin, "permission_denied", "فقط مدیر نصب مجاز است.", 403)
        if engine.dialect.name == "postgresql":
            from sqlalchemy import text

            db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:actor,0))"), {"actor": user.id})
        previous = db.scalar(
            select(m.InstallationIdempotency).where(
                m.InstallationIdempotency.actor_id == user.id, m.InstallationIdempotency.key == key
            )
        )
        if previous:
            require(
                previous.fingerprint == fingerprint,
                "idempotency_conflict",
                "شناسه درخواست با محتوای دیگری استفاده شده است.",
                409,
            )
            return previous.response
        result = jsonable_encoder(callback(db, user))
        db.add(m.InstallationIdempotency(actor_id=user.id, key=key, fingerprint=fingerprint, response=result))
        return result


def expected(request: Request) -> int:
    try:
        value = int(request.headers.get("if-match", "").strip('"'))
        require(value >= 1, "version_required", "نسخه اطلاعات لازم است.", 428)
        return value
    except ValueError as error:
        raise DomainError("version_required", "نسخه اطلاعات لازم است.", 428) from error


def public_source(source: m.SourceFile) -> dict:
    return {k: v for k, v in serialize_fact(source).items() if k != "storage_key"}


def paginate(
    db,
    cls,
    company: str,
    limit: int = 50,
    cursor: str | None = None,
    filters: list | None = None,
    transform=serialize_fact,
) -> dict:
    require(1 <= limit <= 100, "invalid_limit", "تعداد ردیف باید بین ۱ و ۱۰۰ باشد.")
    query = select(cls).where(cls.company_id == company, *(filters or []))
    if cursor:
        try:
            data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            stamp, identifier = datetime.fromisoformat(data[0]), str(data[1])
        except (ValueError, TypeError, KeyError, IndexError) as error:
            raise DomainError("invalid_cursor", "صفحه‌بندی معتبر نیست.") from error
        query = query.where(or_(cls.created_at < stamp, and_(cls.created_at == stamp, cls.id < identifier)))
    items = list(db.scalars(query.order_by(cls.created_at.desc(), cls.id.desc()).limit(limit + 1)))
    next_cursor = (
        base64.urlsafe_b64encode(
            json.dumps([items[limit - 1].created_at.isoformat(), items[limit - 1].id]).encode()
        ).decode()
        if len(items) > limit
        else None
    )
    return {"items": [transform(item) for item in items[:limit]], "next_cursor": next_cursor}
