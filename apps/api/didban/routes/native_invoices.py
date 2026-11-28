from datetime import date
from typing import Literal

from fastapi import APIRouter, Request

from .. import native_invoice_service as service
from ..http import C, access, expected, mutate
from ..native_invoice_schemas import (
    AllocationInput,
    AllocationReversalInput,
    InvoiceInput,
    SourceRevisionInput,
    TermsUpdate,
)

router = APIRouter()
P = C + "/accounting/native-invoices"


@router.get(P)
def current(
    company_id: str,
    request: Request,
    as_of: date | None = None,
    direction: Literal["sale", "purchase"] | None = None,
    priority: Literal["amount", "history"] | None = None,
    counterparty_id: str | None = None,
):
    with access(request, company_id) as (db, user, _):
        if priority is not None:
            from ..errors import require
            from ..native_collection_priority import queue

            require(direction == "sale", "collection_direction", "اولویت وصول برای فاکتور فروش است.")
            return queue(db, company_id, user, as_of or service._today(db, company_id), priority)
        return service.current(db, company_id, user, as_of or service._today(db, company_id), direction, counterparty_id=counterparty_id)


@router.get(P + "/candidates")
def candidates(company_id: str, request: Request, kind: str):
    with access(request, company_id) as (db, user, _):
        return service.candidates(db, company_id, user, kind)


@router.post(P, status_code=201)
def create(company_id: str, data: InvoiceInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/{invoice_id}")
def detail(company_id: str, invoice_id: str, request: Request, as_of: date | None = None):
    with access(request, company_id) as (db, user, _):
        return service.detail(db, company_id, user, invoice_id, as_of)


@router.patch(P + "/{invoice_id}/terms")
def terms(company_id: str, invoice_id: str, data: TermsUpdate, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.update_terms(
            db, company_id, user, invoice_id, data.model_dump(), expected(request)
        ),
    )


@router.post(P + "/{invoice_id}/allocations", status_code=201)
def allocate(company_id: str, invoice_id: str, data: AllocationInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.allocate(
            db, company_id, user, invoice_id, data.model_dump(), expected(request)
        ),
    )


@router.post(P + "/{invoice_id}/allocations/{allocation_id}/reversal", status_code=201)
def reverse(
    company_id: str, invoice_id: str, allocation_id: str, data: AllocationReversalInput, request: Request
):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.reverse_allocation(
            db, company_id, user, invoice_id, allocation_id, data.reason, expected(request)
        ),
    )


@router.get(P + "/{invoice_id}/reminder")
def reminder(company_id: str, invoice_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.reminder(db, company_id, user, invoice_id)


@router.get(P + "/{invoice_id}/source-candidates")
def source_candidates(company_id: str, invoice_id: str, request: Request):
    from ..native_invoice_revisions import candidates

    with access(request, company_id) as (db, user, _):
        return candidates(db, company_id, user, invoice_id)


@router.post(P + "/{invoice_id}/source-revisions", status_code=201)
def adopt_source(company_id: str, invoice_id: str, data: SourceRevisionInput, request: Request):
    from ..native_invoice_revisions import adopt

    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: adopt(db, company_id, user, invoice_id, data.model_dump(), expected(request)),
    )
