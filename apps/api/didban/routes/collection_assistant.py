from fastapi import APIRouter, Request

from .. import collection_assistant_service as service
from ..http import C, access

router = APIRouter()
P = C + "/collection-assistant"


@router.get(P + "/queue")
def queue(company_id: str, request: Request, priority: str = "amount", page: int = 0, q: str = ""):
    with access(request, company_id) as (db, user, _member):
        return service.queue(db, company_id, user, page, q, priority)


@router.get(P + "/invoices/{invoice_id}/reminder")
def reminder(company_id: str, invoice_id: str, manifest_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.reminder(db, company_id, user, invoice_id, manifest_id)
