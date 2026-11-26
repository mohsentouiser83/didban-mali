"""API routes for multi-line commercial invoices, returns, quarantine resolution, and credits."""

from fastapi import APIRouter, Query, Request

from .. import commercial_doc_service as service
from ..commercial_doc_schemas import (
    ApplyCreditInput,
    CommercialDocumentDraftResponse,
    CommercialDocumentInput,
    CommercialDocumentListResponse,
    CommercialDocumentResponse,
    CommercialReturnInput,
    CreditRefundInput,
    QuarantineDecisionInput,
)
from ..http import C, access, mutate

router = APIRouter()
P = C + "/commercial"


@router.get(P + "/documents", response_model=CommercialDocumentListResponse)
def list_documents(
    company_id: str,
    request: Request,
    direction: str | None = None,
    counterparty_id: str | None = Query(None, min_length=1, max_length=36),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    with access(request, company_id) as (db, user, _m):
        return service.list_documents(
            db, company_id, user, direction=direction, counterparty_id=counterparty_id, limit=limit, offset=offset
        )


@router.get(P + "/documents/{document_id}", response_model=CommercialDocumentResponse)
def get_document(company_id: str, document_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.get_document(db, company_id, user, document_id)


@router.post(
    P + "/documents",
    status_code=201,
    response_model=CommercialDocumentDraftResponse,
    response_model_exclude_unset=True,
)
def create_document_draft(company_id: str, data: CommercialDocumentInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_commercial_document_draft(db, company_id, user, payload),
    )


@router.post(P + "/documents/{document_id}/returns", status_code=201)
def create_return_draft(company_id: str, document_id: str, data: CommercialReturnInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_commercial_return_draft(db, company_id, user, document_id, payload),
    )


@router.get(P + "/quarantine")
def list_quarantine(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.list_quarantine(db, company_id, user)


@router.post(P + "/quarantine/{return_line_id}/decide", status_code=201)
def decide_quarantine(company_id: str, return_line_id: str, data: QuarantineDecisionInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.decide_quarantine_draft(db, company_id, user, return_line_id, payload),
    )


@router.get(P + "/credits")
def list_credits(
    company_id: str,
    request: Request,
    counterparty_id: str | None = None,
    status: str | None = None,
):
    with access(request, company_id) as (db, user, _m):
        return service.list_credits(db, company_id, user, counterparty_id=counterparty_id, status=status)


@router.post(P + "/credits/{credit_id}/apply", status_code=201)
def apply_credit(company_id: str, credit_id: str, data: ApplyCreditInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.apply_credit_to_document(db, company_id, user, credit_id, payload),
    )


@router.post(P + "/credits/{credit_id}/refund-draft", status_code=201)
def refund_credit_draft(company_id: str, credit_id: str, data: CreditRefundInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_credit_refund_draft(db, company_id, user, credit_id, payload),
    )
