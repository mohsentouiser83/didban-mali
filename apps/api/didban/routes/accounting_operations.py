from fastapi import APIRouter, Request

from .. import operation_service as service
from ..http import C, access, mutate, paginate
from ..operation_models import OperationDraft
from ..operation_schemas import OperationInput

router = APIRouter()
P = C + "/accounting/operations"


@router.get(P + "/catalogue")
def catalogue(company_id: str, request: Request):
    with access(request, company_id):
        return service.catalogue()


@router.get(P)
def listing(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return paginate(db, OperationDraft, company_id, limit, cursor)


@router.post(P, status_code=201)
def create(company_id: str, data: OperationInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.create(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/cheque-options")
def cheque_options(company_id: str, kind: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return service.cheque_options(db, company_id, kind, limit, cursor)
