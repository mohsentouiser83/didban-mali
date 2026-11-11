from fastapi import APIRouter, Request

from .. import inventory_service as service
from ..http import C, access, mutate
from ..inventory_schemas import InventoryDraftInput, InventoryItemInput, WarehouseInput

router = APIRouter()
P = C + "/accounting/inventory"


@router.get(P)
def summary(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.summary(db, company_id, user)


@router.post(P + "/items", status_code=201)
def add_item(company_id: str, data: InventoryItemInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request, company_id, payload, "read", lambda db, user: service.add_item(db, company_id, user, payload)
    )


@router.post(P + "/warehouses", status_code=201)
def add_warehouse(company_id: str, data: WarehouseInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.add_warehouse(db, company_id, user, payload),
    )


@router.post(P + "/drafts", status_code=201)
def create_draft(company_id: str, data: InventoryDraftInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_draft(db, company_id, user, payload),
    )
