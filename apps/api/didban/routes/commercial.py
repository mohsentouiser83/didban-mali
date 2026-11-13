"""API routes for commercial counterparties and proforma documents."""

from fastapi import APIRouter, Query, Request, Response

from .. import commercial_service as service
from ..commercial_schemas import (
    ConvertProformaInput,
    CounterpartyInput,
    ProformaInput,
    UpdateCounterpartyInput,
)
from ..http import C, access, expected, mutate

router = APIRouter()
P = C + "/commercial"


@router.post(P + "/counterparties", status_code=201)
def add_counterparty(company_id: str, data: CounterpartyInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.add_counterparty(db, company_id, user, payload),
    )


@router.get(P + "/counterparties")
def list_counterparties(
    company_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    active_only: bool = False,
):
    with access(request, company_id) as (db, user, _m):
        return service.list_counterparties(
            db, company_id, user, limit=limit, offset=offset, search=search, active_only=active_only
        )


@router.get(P + "/counterparties/{counterparty_id}")
def get_counterparty(company_id: str, counterparty_id: str, request: Request):
    with access(request, company_id) as (db, _user, _m):
        return service.get_counterparty(db, company_id, counterparty_id)


@router.patch(P + "/counterparties/{counterparty_id}")
def update_counterparty(
    company_id: str, counterparty_id: str, data: UpdateCounterpartyInput, request: Request
):
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_counterparty(
            db, company_id, user, counterparty_id, payload, expected(request)
        ),
    )


@router.post(P + "/proformas", status_code=201)
def create_proforma(company_id: str, data: ProformaInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_proforma(db, company_id, user, payload),
    )


@router.get(P + "/proformas")
def list_proformas(
    company_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    with access(request, company_id) as (db, user, _m):
        return service.list_proformas(db, company_id, user, limit=limit, offset=offset)


@router.get(P + "/proformas/{proforma_id}")
def get_proforma(company_id: str, proforma_id: str, request: Request):
    with access(request, company_id) as (db, _user, _m):
        return service.get_proforma(db, company_id, proforma_id)


@router.patch(P + "/proformas/{proforma_id}")
def update_proforma(company_id: str, proforma_id: str, data: ProformaInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_proforma(
            db, company_id, user, proforma_id, payload, expected(request)
        ),
    )


@router.post(P + "/proformas/{proforma_id}/convert", status_code=201)
def convert_proforma(
    company_id: str, proforma_id: str, data: ConvertProformaInput, request: Request
):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.convert_proforma(
            db, company_id, user, proforma_id, expected(request), payload
        ),
    )


@router.get(P + "/proformas/{proforma_id}/export")
def export_proforma_pdf(company_id: str, proforma_id: str, request: Request):
    with access(request, company_id) as (db, _user, _m):
        pf = service.get_proforma(db, company_id, proforma_id)
        from ..models import Company

        comp = db.get(Company, company_id)
        pdf_bytes = service.pdf_commercial_document(
            pf, company_name=comp.name if comp else "شرکت", doc_type="پیش‌فاکتور"
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=proforma_{pf['number']}.pdf"},
        )
