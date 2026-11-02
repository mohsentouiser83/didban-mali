from typing import Literal

from fastapi import APIRouter, Request

from .. import bot_notification_service as service
from ..bot_notification_schemas import BotNotificationInput
from ..http import C, access, expected, mutate

router = APIRouter()
B = C + "/bot-notifications"


@router.get(B)
def preferences(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.preferences(db, company_id, user)


@router.patch(B + "/{provider}")
def save(
    company_id: str, provider: Literal["telegram", "bale"], data: BotNotificationInput, request: Request
):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.save_preferences(
            db, company_id, user, provider, data.model_dump(), expected(request)
        ),
    )


@router.get(B + "/deliveries")
def deliveries(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _m):
        return service.delivery_history(db, company_id, user, limit, cursor)
