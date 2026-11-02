from typing import Literal

from fastapi import APIRouter, Request

from .. import document_thread_service as service
from ..document_thread_schemas import DocumentActivityInput, DocumentThreadInput
from ..errors import require
from ..http import C, access, expected, mutate

router = APIRouter()
P = C + "/accounting/discussions"


@router.get(P)
def read(company_id: str, request: Request, subject_kind: Literal["draft", "journal"], subject_id: str):
    with access(request, company_id) as (db, user, _):
        return service.read(db, company_id, user, subject_kind, subject_id)


@router.post(P + "/activities", status_code=201)
def add(company_id: str, data: DocumentActivityInput, request: Request):
    require(expected(request) == data.expected_version, "version_conflict", "نسخهٔ درخواست یکسان نیست.", 409)
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.add(db, company_id, user, data.model_dump()),
    )


@router.patch(P + "/{thread_id}")
def update(company_id: str, thread_id: str, data: DocumentThreadInput, request: Request):
    require(expected(request) == data.expected_version, "version_conflict", "نسخهٔ درخواست یکسان نیست.", 409)
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.update(db, company_id, user, thread_id, data.model_dump()),
    )


@router.patch(P)
def start_followup(company_id: str, data: DocumentThreadInput, request: Request):
    require(expected(request) == data.expected_version, "version_conflict", "نسخهٔ درخواست یکسان نیست.", 409)
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.update(db, company_id, user, None, data.model_dump()),
    )


@router.get(P + "/{thread_id}/activities")
def activities(company_id: str, thread_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _):
        return service.activities(db, company_id, user, thread_id, limit, cursor)
