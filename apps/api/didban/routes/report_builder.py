"""Safe report builder endpoints; existing financial approvals remain independent."""

from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import Response
from sqlalchemy import select

from .. import models as m
from .. import report_builder_service as service
from ..custom_reports import (
    FinancialBlockQueryEngine,
    compose_report_block,
    get_entity_registry,
    list_data_sources,
    serialize_entity_registry,
)
from ..custom_reports.exports import export_custom_report_pdf, export_custom_report_xlsx
from ..http import C, access, expected, mutate, paginate
from ..report_builder_exports import pdf_run, xlsx_run
from ..report_builder_models import (
    NativeBuilderRun,
    NativeInvoiceBuilderRun,
    SavedReportDefinition,
    SavedReportRun,
)
from ..report_builder_schemas import (
    AIComposeInput,
    BlockPreviewInput,
    CustomExportInput,
    InterpretReportInput,
    PreviewInput,
    RerunInput,
    SaveCustomDefinitionInput,
    SaveReportInput,
)
from ..workflow import audit, serialize_fact

router = APIRouter()
BASE = C + "/report-builder"


@router.get(BASE + "/data-sources")
def get_data_sources(company_id: str, request: Request):
    """Lists all available financial and operational entity data sources."""
    with access(request, company_id):
        return {"data_sources": list_data_sources()}


@router.get(BASE + "/field-registry/{entity_type}")
def get_field_registry(company_id: str, entity_type: str, request: Request):
    """Retrieves filterable, selectable, and groupable fields for a given entity type."""
    with access(request, company_id):
        reg = get_entity_registry(entity_type)
        if not reg:
            return {"error": f"Unknown entity type: {entity_type}", "entity_type": entity_type}
        return serialize_entity_registry(reg)


@router.post(BASE + "/block-preview")
def block_preview(company_id: str, data: BlockPreviewInput, request: Request):
    """Safely executes a single custom report block query."""
    with access(request, company_id) as (db, user, _member):
        period = db.get(m.Period, data.period_id) if data.period_id else None
        return FinancialBlockQueryEngine.execute(
            db=db,
            company_id=company_id,
            block=data.block,
            period=period,
            limit=data.limit,
            actor=user,
        )


@router.post(BASE + "/ai-compose")
def ai_compose(company_id: str, data: AIComposeInput, request: Request):
    """Translates a Persian natural language query into a structured block specification."""
    with access(request, company_id):
        return compose_report_block(data.prompt)


@router.post(BASE + "/export")
def export_report(company_id: str, data: CustomExportInput, request: Request):
    """Exports multi-source report blocks into formatted XLSX or PDF."""
    with access(request, company_id) as (db, _user, _member):
        company = db.get(m.Company, company_id)
        company_name = company.name if company else company_id
        if data.format == "pdf":
            content = export_custom_report_pdf(company_name, data.report_name, data.blocks_results)
            media_type = "application/pdf"
            filename = "report.pdf"
        else:
            content = export_custom_report_xlsx(company_name, data.report_name, data.blocks_results)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "report.xlsx"
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.get(BASE + "/custom-definitions")
def list_custom_definitions(company_id: str, request: Request):
    """Lists saved custom multi-source report templates."""
    with access(request, company_id) as (db, _user, _member):
        items = db.scalars(
            select(SavedReportDefinition)
            .where(SavedReportDefinition.company_id == company_id)
            .order_by(SavedReportDefinition.created_at.desc())
        ).all()
        return [
            {
                "id": row.id,
                "name": row.name,
                "version": row.version,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "spec": row.spec,
            }
            for row in items
            if isinstance(row.spec, dict) and row.spec.get("layout_kind") == "custom_blocks"
        ]


@router.post(BASE + "/custom-definitions", status_code=201)
def save_custom_definition(company_id: str, data: SaveCustomDefinitionInput, request: Request):
    """Saves a custom multi-source report template."""
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: _save_custom_def(db, company_id, user, data),
    )


def _save_custom_def(db, company_id: str, user, data: SaveCustomDefinitionInput):
    spec_payload = {
        "layout_kind": "custom_blocks",
        "blocks": data.blocks,
        "period_id": data.period_id,
    }
    definition = SavedReportDefinition(
        company_id=company_id,
        name=data.name,
        spec=spec_payload,
        actor_id=user.id,
    )
    db.add(definition)
    db.flush()
    audit(
        db,
        company_id,
        user.id,
        "report_builder.custom_definition_saved",
        definition.id,
        {"name": definition.name, "version": definition.version},
    )
    return {
        "id": definition.id,
        "name": definition.name,
        "version": definition.version,
    }


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
