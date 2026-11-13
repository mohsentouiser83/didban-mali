from datetime import date

from fastapi import APIRouter, Query, Request

from .. import inventory_service as service
from ..http import C, access, expected, mutate
from ..inventory_schemas import (
    InventoryDraftInput,
    InventoryItemInput,
    InventoryTransferInput,
    OpeningStockInput,
    StockAdjustmentInput,
    UpdateInventoryItemInput,
    UpdateWarehouseInput,
    WarehouseInput,
)

router = APIRouter()
P = C + "/accounting/inventory"


@router.get(P)
def summary(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.summary(db, company_id, user)


@router.get(P + "/cardex")
def cardex(
    company_id: str,
    request: Request,
    item_id: str | None = None,
    warehouse_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    kind: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    with access(request, company_id) as (db, user, _member):
        return service.cardex(
            db,
            company_id,
            user,
            item_id=item_id,
            warehouse_id=warehouse_id,
            from_date=from_date,
            to_date=to_date,
            kind=kind,
            limit=limit,
            offset=offset,
        )


@router.get(P + "/valuation")
def valuation(
    company_id: str,
    request: Request,
    as_of: date | None = None,
):
    with access(request, company_id) as (db, user, _member):
        return service.valuation_report(db, company_id, user, as_of=as_of)


@router.get(P + "/profit")
def profit_report(
    company_id: str,
    request: Request,
    from_date: date | None = None,
    to_date: date | None = None,
):
    with access(request, company_id) as (db, user, _member):
        return service.item_profit_report(db, company_id, user, from_date=from_date, to_date=to_date)



@router.post(P + "/items", status_code=201)
def add_item(company_id: str, data: InventoryItemInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request, company_id, payload, "read", lambda db, user: service.add_item(db, company_id, user, payload)
    )


@router.patch(P + "/items/{item_id}")
def update_item(company_id: str, item_id: str, data: UpdateInventoryItemInput, request: Request):
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_item(
            db, company_id, user, item_id, payload, expected(request)
        ),
    )


@router.delete(P + "/items/{item_id}")
def delete_item(company_id: str, item_id: str, request: Request):
    return mutate(
        request,
        company_id,
        {},
        "read",
        lambda db, user: service.delete_item(db, company_id, user, item_id),
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


@router.patch(P + "/warehouses/{warehouse_id}")
def update_warehouse(company_id: str, warehouse_id: str, data: UpdateWarehouseInput, request: Request):
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_warehouse(
            db, company_id, user, warehouse_id, payload, expected(request)
        ),
    )


@router.delete(P + "/warehouses/{warehouse_id}")
def delete_warehouse(company_id: str, warehouse_id: str, request: Request):
    return mutate(
        request,
        company_id,
        {},
        "read",
        lambda db, user: service.delete_warehouse(db, company_id, user, warehouse_id),
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


@router.post(P + "/opening-drafts", status_code=201)
def create_opening_draft(company_id: str, data: OpeningStockInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_opening_stock_draft(db, company_id, user, payload),
    )


@router.post(P + "/transfer-drafts", status_code=201)
def create_transfer_draft(company_id: str, data: InventoryTransferInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_transfer_draft(db, company_id, user, payload),
    )


@router.post(P + "/adjustment-drafts", status_code=201)
def create_adjustment_draft(company_id: str, data: StockAdjustmentInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_adjustment_draft(db, company_id, user, payload),
    )
