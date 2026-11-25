"""HTTP routes for operational treasury accounts, receipt/payment documents, and tool allocations."""

from typing import Literal

from fastapi import APIRouter, Query, Request

from .. import treasury_service as service
from ..http import C, access, expected, mutate
from ..treasury_schemas import (
    ReverseTreasuryAllocationInput,
    TreasuryAccountInput,
    TreasuryAllocationInput,
    TreasuryDocumentInput,
    UpdateTreasuryAccountInput,
)

router = APIRouter()
T = C + "/treasury"


@router.get(T + "/accounts")
def list_accounts(
    company_id: str,
    request: Request,
    kind: Literal["bank", "cash", "petty_cash"] | None = None,
    active_only: bool = False,
):
    with access(request, company_id) as (db, user, _m):
        return service.list_treasury_accounts(db, company_id, user, kind=kind, active_only=active_only)


@router.post(T + "/accounts", status_code=201)
def create_account(company_id: str, data: TreasuryAccountInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_treasury_account(db, company_id, user, payload),
    )


@router.patch(T + "/accounts/{treasury_id}")
def update_account(
    company_id: str, treasury_id: str, data: UpdateTreasuryAccountInput, request: Request
):
    payload = data.model_dump(exclude_unset=True)
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_treasury_account(
            db, company_id, user, treasury_id, payload, expected(request)
        ),
    )


@router.get(T + "/documents")
def list_documents(
    company_id: str,
    request: Request,
    direction: Literal["receipt", "payment"] | None = Query(default=None),
):
    with access(request, company_id) as (db, user, _m):
        return service.list_treasury_documents(db, company_id, user, direction=direction)


@router.post(T + "/documents", status_code=201)
def create_document(company_id: str, data: TreasuryDocumentInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_treasury_document(db, company_id, user, payload),
    )


@router.post(T + "/documents/{document_id}/allocations", status_code=201)
def allocate_tool(
    company_id: str, document_id: str, data: TreasuryAllocationInput, request: Request
):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.allocate_treasury_tool(
            db, company_id, user, document_id, payload, expected(request)
        ),
    )


@router.post(T + "/allocations/{allocation_id}/reverse")
def reverse_allocation(
    company_id: str, allocation_id: str, data: ReverseTreasuryAllocationInput, request: Request
):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.reverse_treasury_allocation(
            db, company_id, user, allocation_id, data.reason, expected(request)
        ),
    )
