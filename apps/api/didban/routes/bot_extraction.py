from typing import Literal

from fastapi import APIRouter, Request
from pydantic import Field

from .. import bot_extraction_service as service
from ..accounting_schemas import StrictInput
from ..document_extraction_schema import DocumentRow
from ..errors import require
from ..http import C, access, expected, mutate

router = APIRouter()
BASE = C + "/bot-intakes"


class ReviewInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    family: Literal["sales", "purchases", "bank", "unknown"]
    unit: Literal["IRR", "TOMAN", "unknown"]
    calendar: Literal["gregorian", "jalali", "unknown"]
    rows: list[DocumentRow] = Field(min_length=1, max_length=100)


@router.get(BASE + "/extraction-status")
def status(company_id: str, request: Request):
    from ..config import settings
    from ..voice_service import voice_available

    with access(request, company_id):
        return {
            "enabled": settings.media_extraction_enabled,
            "vision": bool(
                settings.media_extraction_enabled and settings.model_enabled and settings.openai_api_key
            ),
            "voice": bool(settings.media_extraction_enabled and voice_available()),
            "max_pages": settings.media_max_pages,
            "max_bytes": settings.media_max_bytes,
            "quality_verified": False,
        }


@router.post(BASE + "/{item_id}/extract")
async def extract(company_id: str, item_id: str, request: Request):
    key = request.headers.get("idempotency-key", "")
    require(1 <= len(key) <= 128, "idempotency_key_required", "شناسه درخواست لازم است.", 428)
    version = expected(request)
    with access(request, company_id, "write") as (db, user, _):
        service.own(db, company_id, user, item_id)
        actor = user.id
    result = await service.extract(company_id, actor, item_id, version, key)
    with access(request, company_id, "write") as (db, user, _):
        service.own(db, company_id, user, item_id)
    return result


@router.get(BASE + "/{item_id}/extractions")
def proposals(company_id: str, item_id: str, request: Request):
    with access(request, company_id, "write") as (db, user, _):
        return service.proposals(db, company_id, user, item_id)


@router.post(BASE + "/extractions/{proposal_id}/review", status_code=201)
def review(company_id: str, proposal_id: str, data: ReviewInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.review(
            db, company_id, user, proposal_id, data.model_dump(), expected(request)
        ),
    )
