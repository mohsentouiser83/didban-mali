from typing import Literal

from fastapi import APIRouter, Request
from sqlalchemy import select

from .. import dimensions_service as service
from ..dimensions_models import Dimension, DimensionReportRun, NativeDimensionReportRun
from ..dimensions_schemas import AllocationInput, DimensionInput, Kind, RunInput
from ..http import C, access, expected, mutate, paginate
from ..workflow import serialize_fact

router = APIRouter()
P = C + "/dimensions"


@router.get(P)
def listing(company_id: str, request: Request, limit: int = 100, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return paginate(db, Dimension, company_id, limit, cursor)


@router.get(P + "/options/all")
def options(company_id: str, request: Request):
    with access(request, company_id) as (db, _u, _m):
        return {
            "items": [
                serialize_fact(item)
                for item in db.scalars(
                    select(Dimension)
                    .where(Dimension.company_id == company_id)
                    .order_by(Dimension.kind, Dimension.code)
                )
            ]
        }


@router.post(P, status_code=201)
def create(company_id: str, data: DimensionInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_dimension(db, company_id, user, data.model_dump()),
    )


@router.patch(P + "/{dimension_id}")
def edit(company_id: str, dimension_id: str, data: DimensionInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_dimension(
            db, company_id, user, data.model_dump(), dimension_id, expected(request)
        ),
    )


@router.get(P + "/report/current")
def current(
    company_id: str,
    kind: Kind,
    request: Request,
    manifest_id: str | None = None,
    native_statement_id: str | None = None,
    native_period_id: str | None = None,
):
    with access(request, company_id) as (db, _u, _m):
        return service.current_report(
            db, company_id, kind, manifest_id, native_statement_id, native_period_id
        )


@router.post(P + "/allocations", status_code=201)
def allocate(company_id: str, data: AllocationInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.assign(db, company_id, user, data.model_dump(), expected(request)),
    )


@router.get(P + "/reports/saved")
def saved(
    company_id: str,
    request: Request,
    limit: int = 25,
    cursor: str | None = None,
    source: Literal["imported_manifest", "native_statement"] = "imported_manifest",
):
    with access(request, company_id) as (db, _u, _m):
        return paginate(
            db,
            NativeDimensionReportRun if source == "native_statement" else DimensionReportRun,
            company_id,
            limit,
            cursor,
        )


@router.post(P + "/reports/saved", status_code=201)
def save(company_id: str, data: RunInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_report(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/reports/saved/{run_id}/export")
def export(company_id: str, run_id: str, request: Request, format: Literal["pdf", "xlsx"] = "pdf"):
    from fastapi.responses import Response

    with access(request, company_id) as (db, user, _member):
        content = service.export_report(db, company_id, user, run_id, format)
    return Response(
        content,
        media_type="application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="dimensions-{run_id}.{format}"'},
    )
