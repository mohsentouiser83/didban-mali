"""Report Studio endpoints for dynamic dashboards, widgets, and AI report design."""

from fastapi import APIRouter, Request

from .. import report_studio_service as service
from ..http import C, access, expected, mutate
from ..report_studio_schemas import (
    StudioInterpretInput,
    StudioPreviewInput,
    StudioSaveDefinitionInput,
    StudioUpdateDefinitionInput,
)

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
