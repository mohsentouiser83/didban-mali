"""Safe report builder endpoints; existing financial approvals remain independent."""

from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import Response

from .. import report_builder_service as service
from ..http import C, access, expected, mutate, paginate
from ..report_builder_exports import pdf_run, xlsx_run
from ..report_builder_models import (
    NativeBuilderRun,
    NativeInvoiceBuilderRun,
    SavedReportDefinition,
    SavedReportRun,
)
from ..report_builder_schemas import InterpretReportInput, PreviewInput, RerunInput, SaveReportInput
from ..workflow import audit, serialize_fact

router = APIRouter()
BASE = C + "/report-builder"


@router.post(BASE + "/interpret")
def interpret(company_id: str, data: InterpretReportInput, request: Request):
    with access(request, company_id):
        return service.interpret(data.question, data.period_id, data.source)


@router.post(BASE + "/preview")
def preview(company_id: str, data: PreviewInput, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.preview(db, company_id, data.spec)


@router.get(BASE + "/definitions")
def definitions(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, SavedReportDefinition, company_id, limit, cursor)


@router.post(BASE + "/definitions", status_code=201)
def save(company_id: str, data: SaveReportInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save(db, company_id, user, data),
    )


@router.patch(BASE + "/definitions/{definition_id}")
def update(company_id: str, definition_id: str, data: SaveReportInput, request: Request):
    version = expected(request)
    return mutate(
        request,
        company_id,
        data.model_dump() | {"expected_version": version},
        "write",
        lambda db, user: service.save(db, company_id, user, data, definition_id, version),
    )


@router.post(BASE + "/definitions/{definition_id}/runs", status_code=201)
def rerun(company_id: str, definition_id: str, data: RerunInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.rerun(db, company_id, user, definition_id, data.expected_version),
    )


@router.get(BASE + "/runs")
def runs(
    company_id: str,
    request: Request,
    limit: int = 50,
    cursor: str | None = None,
    source: Literal["imported_manifest", "native_statement", "native_invoice"] = "imported_manifest",
):
    with access(request, company_id) as (db, _user, _member):
        return paginate(
            db,
            NativeBuilderRun
            if source == "native_statement"
            else NativeInvoiceBuilderRun
            if source == "native_invoice"
            else SavedReportRun,
            company_id,
            limit,
            cursor,
            transform=lambda row: (
                {key: value for key, value in serialize_fact(row).items() if key != "snapshot"}
                | {"title": row.snapshot["title"], "row_count": row.snapshot["row_count"]}
            ),
        )


@router.get(BASE + "/runs/{run_id}")
def run_detail(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return serialize_fact(service.get_run(db, company_id, run_id))


@router.get(BASE + "/runs/{run_id}/export")
def export(company_id: str, run_id: str, request: Request, format: Literal["pdf", "xlsx"] = "pdf"):
    with access(request, company_id) as (db, user, _member):
        run = serialize_fact(service.get_run(db, company_id, run_id))
        audit(
            db,
            company_id,
            user.id,
            "report_builder.downloaded",
            run_id,
            {"format": format, "digest": run["digest"]},
        )
    return Response(
        pdf_run(run) if format == "pdf" else xlsx_run(run),
        media_type="application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="didban-builder-{run_id}.{format}"'},
    )
