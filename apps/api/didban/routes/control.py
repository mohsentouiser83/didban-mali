"""Thin company-authorized control/collaboration adapters."""

from typing import Literal

from fastapi import APIRouter, Request

from .. import control_schemas as s
from .. import control_service as service
from ..control_models import ControlCase
from ..http import C, access, expected, mutate, paginate
from ..services import get_entity

router = APIRouter()
PREFIX = C + "/control"


@router.get(PREFIX + "/assignees")
def assignees(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.assignees(db, company_id, user)


@router.get(PREFIX + "/findings")
def findings(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _member):
        return service.findings(db, company_id, user, limit, cursor)


@router.get(PREFIX + "/collection")
def collection(company_id: str, request: Request, page: int = 0, q: str = ""):
    with access(request, company_id) as (db, user, _member):
        return service.collection(db, company_id, user, page, q.strip())


@router.get(PREFIX + "/cases")
def cases(
    company_id: str,
    request: Request,
    kind: Literal["finding", "invoice"] | None = None,
    limit: int = 25,
    cursor: str | None = None,
):
    with access(request, company_id) as (db, _user, _member):
        filters = []
        if kind:
            filters.append(
                ControlCase.finding_id.is_not(None)
                if kind == "finding"
                else ControlCase.invoice_id.is_not(None)
            )
        return paginate(
            db,
            ControlCase,
            company_id,
            limit,
            cursor,
            filters,
            transform=lambda item: service.public_case(db, company_id, item),
        )


@router.get(PREFIX + "/cases/{case_id}")
def case_detail(company_id: str, case_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.public_case(db, company_id, get_entity(db, ControlCase, company_id, case_id))


@router.post(PREFIX + "/cases", status_code=201)
def create_case(company_id: str, data: s.CaseCreate, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_case(db, company_id, user, data.model_dump()),
    )


@router.patch(PREFIX + "/cases/{case_id}")
def update_case(company_id: str, case_id: str, data: s.CaseUpdate, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.update_case(
            db, company_id, user, case_id, data.model_dump(), expected(request)
        ),
    )


@router.get(PREFIX + "/cases/{case_id}/activities")
def activities(company_id: str, case_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _member):
        return service.activities(db, company_id, user, case_id, limit, cursor)


@router.post(PREFIX + "/cases/{case_id}/activities", status_code=201)
def activity(company_id: str, case_id: str, data: s.ActivityCreate, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.record_activity(
            db, company_id, user, case_id, data.model_dump(), expected(request)
        ),
    )
