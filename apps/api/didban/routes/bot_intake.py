from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from pydantic import Field

from .. import bot_intake_service as service
from ..accounting_schemas import StrictInput
from ..bot_intake_models import BotIntake
from ..config import settings
from ..errors import require
from ..http import C, access, expected, mutate, paginate
from ..models import SourceFile
from ..services import get_entity

router = APIRouter()
BASE = C + "/bot-intakes"


class ImportInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)


@router.get(BASE)
def listing(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _):
        return paginate(
            db,
            BotIntake,
            company_id,
            limit,
            cursor,
            [BotIntake.actor_id == user.id],
            transform=lambda item: (
                service.public(item, db)
                | {
                    "session_id": db.get(SourceFile, item.source_file_id).session_id
                    if item.source_file_id
                    else None
                }
            ),
        )


@router.post(BASE + "/{item_id}/import", status_code=201)
def import_file(company_id: str, item_id: str, data: ImportInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.import_file(
            db, company_id, user, item_id, data.period_id, expected(request)
        ),
    )


@router.get(BASE + "/{item_id}/download")
def download(company_id: str, item_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        item = get_entity(db, BotIntake, company_id, item_id)
        require(item.actor_id == user.id, "not_found", "فایل پیدا نشد.", 404)
        path = settings.storage / item.storage_key
        require(path.is_file(), "not_found", "اصل فایل پیدا نشد.", 404)
        name = "bot-intake-" + item.id + Path(item.name).suffix.lower()
    return FileResponse(path, filename=name, media_type="application/octet-stream")
