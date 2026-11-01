"""Authenticated bot account controls and bounded provider ingress."""

import json
import secrets
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import select

from .. import bot_service as service
from .. import models as m
from ..errors import require
from ..http import C, P, access, expected, mutate
from ..security import digest

router = APIRouter()


class PairingInput(BaseModel):
    provider: Literal["telegram", "bale"]


@router.get(C + "/bot-connections")
def connections(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return {
            "providers": {p: {
                "configured": service.configuration(p)[0],
                "username": getattr(service.settings, p + "_bot_username"),
            } for p in ("telegram", "bale")},
            "items": [service.public_connection(v) for v in db.scalars(select(m.BotConnection).where(
                m.BotConnection.company_ref == company_id, m.BotConnection.user_id == user.id,
            ).order_by(m.BotConnection.created_at.desc()).limit(50))],
        }


@router.post(C + "/bot-connections", status_code=201)
def pair(company_id: str, data: PairingInput, request: Request):
    key = request.headers.get("idempotency-key", "")
    require(1 <= len(key) <= 128, "idempotency_key_required", "شناسه درخواست لازم است.", 428)
    fingerprint = digest(request.url.path + ":" + data.provider)
    with access(request, company_id) as (db, user, _member):
        previous = db.scalar(select(m.Idempotency).where(
            m.Idempotency.company_id == company_id, m.Idempotency.actor_id == user.id,
            m.Idempotency.key == key,
        ))
        if previous:
            require(previous.fingerprint == fingerprint, "idempotency_conflict", "شناسه درخواست تکراری است.", 409)
            return previous.response
        result = jsonable_encoder(service.create_pairing(db, company_id, user, data.provider))
        # Display the raw pairing code once; never retain it in replay storage.
        db.add(m.Idempotency(company_id=company_id, actor_id=user.id, key=key,
                            fingerprint=fingerprint, response=result | {"pairing_code": None}))
        return result


@router.post(C + "/bot-connections/{connection_id}/confirm")
def confirm(company_id: str, connection_id: str, request: Request):
    version = expected(request)
    return mutate(request, company_id, {"version": version}, "read",
                  lambda db, user: service.confirm(db, company_id, user, connection_id, version))


@router.delete(C + "/bot-connections/{connection_id}")
def revoke(company_id: str, connection_id: str, request: Request):
    version = expected(request)
    return mutate(request, company_id, {"version": version}, "read",
                  lambda db, user: service.revoke(db, company_id, user, connection_id, version))


async def payload(request: Request):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        require(len(content) <= 32768, "bot_payload_too_large", "پیام بزرگ‌تر از حد مجاز است.", 413)
    try:
        return json.loads(content)
    except (ValueError, UnicodeDecodeError):
        require(False, "invalid_bot_payload", "پیام معتبر نیست.", 422)


@router.post(P + "/bots/telegram/webhook")
async def telegram(request: Request):
    _token, secret = service.configured("telegram")
    require(secrets.compare_digest(request.headers.get("x-telegram-bot-api-secret-token", "").encode("utf-8"),
                                   secret.get_secret_value().encode("utf-8")), "invalid_webhook_secret", "دسترسی مجاز نیست.", 403)
    return await service.receive("telegram", await payload(request))


# Bale's documented setWebhook has no secret-header argument. The high-entropy
# path is the shared ingress secret; reverse-proxy access logs must redact it.
@router.post(P + "/bots/bale/webhook/{webhook_secret}")
async def bale(webhook_secret: str, request: Request):
    _token, secret = service.configured("bale")
    require(secrets.compare_digest(webhook_secret.encode("utf-8"), secret.get_secret_value().encode("utf-8")),
            "invalid_webhook_secret", "دسترسی مجاز نیست.", 403)
    return await service.receive("bale", await payload(request))
