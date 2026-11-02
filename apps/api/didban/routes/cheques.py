from fastapi import APIRouter, Request

from .. import cheque_service as service
from ..cheque_models import Cheque, ChequeEvent
from ..cheque_schemas import ChequeAction, ChequeInput
from ..http import C, access, expected, mutate, paginate
from ..services import get_entity

router = APIRouter()
P = C + "/cheques"


@router.get(P)
def listing(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return paginate(db, Cheque, company_id, limit, cursor, transform=service._public)


@router.post(P, status_code=201)
def create(company_id: str, data: ChequeInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/bank-options")
def options(company_id: str, request: Request, limit: int = 50, cursor: str | None = None, q: str = ""):
    with access(request, company_id) as (db, _u, _m):
        return service.bank_options(db, company_id, limit, cursor, q)


@router.get(P + "/{cheque_id}/events")
def events(company_id: str, cheque_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        get_entity(db, Cheque, company_id, cheque_id)
        return paginate(db, ChequeEvent, company_id, limit, cursor, [ChequeEvent.cheque_id == cheque_id])


@router.post(P + "/{cheque_id}/actions")
def action(company_id: str, cheque_id: str, data: ChequeAction, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.act(db, company_id, user, cheque_id, data.model_dump(), expected(request)),
    )
