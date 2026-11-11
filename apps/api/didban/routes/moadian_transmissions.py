"""Explicit, versioned sending and follow-up for native sales invoices."""

from fastapi import APIRouter, Request
from pydantic import Field

from .. import moadian_service as service
from ..http import C, access
from ..moadian_schemas import MoadianInvoiceInput

router = APIRouter()
P = C + "/moadian/transmissions"


class MoadianConfirmation(MoadianInvoiceInput):
    digest: str = Field(pattern=r"^[0-9a-f]{64}$")


@router.get(P)
def history(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _, member):
        return service.history(db, company_id, member, limit, cursor)


@router.get(P + "/candidates")
def candidates(company_id: str, request: Request):
    with access(request, company_id) as (db, user, member):
        return service.candidates(db, company_id, user, member)


@router.post(P + "/preview")
def preview(company_id: str, data: MoadianInvoiceInput, request: Request):
    with access(request, company_id) as (db, user, member):
        return service.preview(db, company_id, user, member, data)


@router.post(P, status_code=201)
def submit(company_id: str, data: MoadianConfirmation, request: Request):
    payload = MoadianInvoiceInput.model_validate(data.model_dump(exclude={"digest"}))
    return service.submit(request, company_id, payload, data.digest)


@router.post(P + "/{transmission_id}/retry")
def retry(company_id: str, transmission_id: str, request: Request):
    return service.retry(request, company_id, transmission_id)


@router.post(P + "/{transmission_id}/inquiry")
def inquiry(company_id: str, transmission_id: str, request: Request):
    return service.inquire(request, company_id, transmission_id)
