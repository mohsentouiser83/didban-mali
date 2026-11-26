from fastapi import APIRouter, Request
from sqlalchemy import select

from .. import cheque_service as service
from .. import models as m
from ..cheque_models import Cheque, ChequeClearance, ChequeEvent
from ..cheque_schemas import ChequeAction, ChequeInput
from ..http import C, access, expected, mutate, paginate
from ..services import get_entity
from ..workflow import serialize_fact

router = APIRouter()
P = C + "/cheques"


@router.get(P)
def listing(company_id: str, request: Request, limit: int = 25, cursor: str | None = None, direction: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        filters = [Cheque.direction == direction] if direction else []
        return paginate(db, Cheque, company_id, limit, cursor, filters, transform=service._public)


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

        def transform(ev: ChequeEvent) -> dict:
            data = serialize_fact(ev)
            clr = db.scalar(
                select(ChequeClearance).where(
                    ChequeClearance.company_id == company_id,
                    ChequeClearance.event_id == ev.id,
                )
            )
            if clr:
                bm = db.get(m.BankMovement, clr.bank_id)
                data["bank_id"] = clr.bank_id
                data["bank_reference"] = bm.reference if bm and bm.company_id == company_id else None
            return data

        return paginate(db, ChequeEvent, company_id, limit, cursor, [ChequeEvent.cheque_id == cheque_id], transform=transform)


@router.post(P + "/{cheque_id}/actions")
def action(company_id: str, cheque_id: str, data: ChequeAction, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.act(db, company_id, user, cheque_id, data.model_dump(), expected(request)),
    )
