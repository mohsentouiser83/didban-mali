from typing import Literal

from fastapi import APIRouter, Request

from .. import manual_group_service as service
from ..errors import require
from ..http import C, access, expected, mutate, paginate
from ..manual_group_models import ManualGroupPreview
from ..manual_group_schemas import ManualGroupDecision, ManualGroupInput

router = APIRouter()
P = C + "/reconciliation-manual-groups"


@router.get(P + "/options")
def options(
    company_id: str,
    request: Request,
    run_id: str,
    side: Literal["bank", "ledger"],
    q: str = "",
    limit: int = 25,
    cursor: str | None = None,
):
    with access(request, company_id) as (db, user, _):
        return service.selection_options(db, company_id, user, run_id, side, q, limit, cursor)


@router.get(P + "/previews")
def history(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _):
        return paginate(
            db,
            ManualGroupPreview,
            company_id,
            limit,
            cursor,
            transform=lambda row: service.public(db, company_id, user, row),
        )


@router.post(P + "/previews", status_code=201)
def preview(company_id: str, data: ManualGroupInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_preview(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/previews/{preview_id}")
def read(company_id: str, preview_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.read(db, company_id, user, preview_id)


@router.post(P + "/previews/{preview_id}/decisions", status_code=201)
def decide(company_id: str, preview_id: str, data: ManualGroupDecision, request: Request):
    require(expected(request) == data.expected_version, "version_conflict", "نسخهٔ درخواست یکسان نیست.", 409)
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.decide(db, company_id, user, preview_id, data.model_dump()),
    )
