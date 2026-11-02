from fastapi import APIRouter, Request

from .. import closing_service as service
from ..closing_schemas import ClosingInput, OpeningInput
from ..http import C, mutate

router = APIRouter()
A = C + "/accounting"


@router.post(A + "/period-closing-drafts", status_code=201)
def closing(company_id: str, data: ClosingInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_closing(db, company_id, user, data.model_dump()),
    )


@router.post(A + "/period-opening-drafts", status_code=201)
def opening(company_id: str, data: OpeningInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_opening(db, company_id, user, data.model_dump()),
    )
