"""Company-local proposals only; accepting one never posts a journal."""

from fastapi import APIRouter, Request
from pydantic import Field

from .. import operation_learning_service as service
from ..accounting_schemas import StrictInput
from ..http import C, access, expected, mutate

router = APIRouter()
P = C + "/accounting/operation-learning"


class PatternInput(StrictInput):
    name: str = Field(min_length=1, max_length=120)
    enabled: bool


@router.get(P)
def suggestions(
    company_id: str, request: Request, kind: str, party_id: str, limit: int = 25, cursor: str | None = None
):
    with access(request, company_id) as (db, user, _member):
        return service.suggestions(db, company_id, user, kind, party_id, limit, cursor)


@router.patch(P + "/{operation_id}")
def edit(company_id: str, operation_id: str, data: PatternInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.update(
            db, company_id, user, operation_id, data.model_dump(), expected(request)
        ),
    )


@router.get(P + "/{operation_id}")
def proposal(company_id: str, operation_id: str, request: Request, kind: str, party_id: str):
    with access(request, company_id) as (db, user, _member):
        return service.proposal(db, company_id, user, operation_id, kind, party_id)


class CorrectionInput(StrictInput):
    journal_id: str = Field(min_length=1, max_length=36)
    journal_digest: str = Field(min_length=64, max_length=64)
    approved_draft_version: int = Field(ge=1)
    accounts: dict[str, str] = Field(min_length=2, max_length=10)
    reason: str = Field(min_length=1, max_length=1000)


@router.get(P + "/corrections/candidates")
def correction_candidates(
    company_id: str, request: Request, kind: str, party_id: str, limit: int = 25, cursor: str | None = None
):
    from ..operation_learning_corrections import candidates

    with access(request, company_id) as (db, user, _member):
        return candidates(db, company_id, user, kind, party_id, limit, cursor)


@router.post(P + "/{operation_id}/correction", status_code=201)
def adopt_correction(company_id: str, operation_id: str, data: CorrectionInput, request: Request):
    from ..operation_learning_corrections import adopt

    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: adopt(db, company_id, user, operation_id, data.model_dump()),
    )
