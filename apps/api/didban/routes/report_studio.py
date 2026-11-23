"""Report Studio endpoints for dynamic dashboards, widgets, and AI report design."""

from typing import Literal

from fastapi import APIRouter, Request, Response

from .. import report_studio_service as service
from ..http import C, access, expected, mutate
from ..report_studio_schemas import (
    StudioInterpretInput,
    StudioPreviewInput,
    StudioSaveDefinitionInput,
    StudioUpdateDefinitionInput,
)
from ..workflow import audit

router = APIRouter()
BASE = C + "/report-studio"


@router.post(BASE + "/interpret")
def interpret_prompt(company_id: str, data: StudioInterpretInput, request: Request):
    """Interprets a natural language prompt into a complete multi-section dashboard layout."""
    with access(request, company_id):
        return service.interpret(data.prompt, data.period_id, data.unit)


@router.post(BASE + "/preview")
def preview_dashboard(company_id: str, data: StudioPreviewInput, request: Request):
    """Evaluates and renders all sections and widgets of a Studio dashboard."""
    with access(request, company_id) as (db, _user, _member):
        return service.preview(db, company_id, data.spec)


@router.get(BASE + "/definitions")
def list_definitions(company_id: str, request: Request):
    """Lists saved Studio dashboard templates for this company."""
    with access(request, company_id) as (db, _user, _member):
        return service.list_definitions(db, company_id)


@router.get(BASE + "/definitions/{definition_id}")
def get_definition(company_id: str, definition_id: str, request: Request):
    """Retrieves a single saved Studio dashboard template."""
    with access(request, company_id) as (db, _user, _member):
        return service.get_definition(db, company_id, definition_id)


@router.post(BASE + "/definitions", status_code=201)
def save_definition(company_id: str, data: StudioSaveDefinitionInput, request: Request):
    """Saves a new Studio dashboard template."""
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save(db, company_id, user, data),
    )


@router.patch(BASE + "/definitions/{definition_id}")
def update_definition(
    company_id: str, definition_id: str, data: StudioUpdateDefinitionInput, request: Request
):
    """Updates an existing Studio dashboard template with optimistic locking."""
    version = expected(request)
    return mutate(
        request,
        company_id,
        data.model_dump() | {"expected_version": version},
        "write",
        lambda db, user: service.save(db, company_id, user, data, definition_id, version),
    )


@router.get(BASE + "/active-dashboard")
def get_active_dashboard(company_id: str, request: Request, period_id: str | None = None):
    """Retrieves the active custom dashboard and its evaluated widgets for this company, if set."""
    with access(request, company_id) as (db, actor, _member):
        return service.get_active_dashboard(db, company_id, period_id, actor=actor)


@router.post(BASE + "/definitions/{definition_id}/set-dashboard")
def set_active_dashboard(
    company_id: str, definition_id: str, request: Request, mode: Literal["fixed", "live"] = "fixed"
):
    """Designates a saved report as the company's active main dashboard."""
    return mutate(
        request,
        company_id,
        {"definition_id": definition_id, "mode": mode},
        "write",
        lambda db, user: service.set_active_dashboard(db, company_id, user, definition_id, mode=mode),
    )


@router.post(BASE + "/active-dashboard/reset")
def reset_active_dashboard(company_id: str, request: Request):
    """Resets the company's dashboard back to the default Didban financial dashboard."""
    return mutate(
        request,
        company_id,
        {},
        "write",
        lambda db, user: service.reset_active_dashboard(db, company_id, user),
    )


@router.get(BASE + "/definitions/{definition_id}/export")
def export_definition(
    company_id: str,
    definition_id: str,
    request: Request,
    format: str = "pdf",
    period_id: str | None = None,
):
    """Exports an evaluated report definition to a downloadable PDF document."""
    with access(request, company_id) as (db, user, _member):
        content = service.export_definition_pdf(db, company_id, definition_id, period_id)
        audit(
            db,
            company_id,
            user.id,
            "report_studio.definition_exported",
            definition_id,
            {"format": format},
        )
        return Response(
            content=content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="report-{definition_id}.pdf"'
            },
        )


@router.post(BASE + "/reports/{report_id}/set-dashboard")
def set_official_report_as_dashboard(
    company_id: str, report_id: str, request: Request, mode: Literal["fixed", "live"] = "fixed"
):
    """Converts an official Report into an active dashboard for this company."""
    return mutate(
        request,
        company_id,
        {"report_id": report_id, "mode": mode},
        "write",
        lambda db, user: service.set_official_report_as_dashboard(db, company_id, user, report_id, mode=mode),
    )
