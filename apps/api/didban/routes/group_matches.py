from typing import Literal

from fastapi import APIRouter, Request
from pydantic import Field

from .. import group_match_service as service
from ..accounting_schemas import StrictInput
from ..errors import require
from ..http import C, access, expected, mutate

router = APIRouter()


class GroupDecisionInput(StrictInput):
    run_id: str = Field(min_length=1, max_length=36)
    expected_version: int = Field(ge=1)
    decision: Literal["accepted", "rejected"]
    reason: str = Field(min_length=1, max_length=500)


@router.get(C + "/reconciliation-groups")
def listing(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.proposals(db, company_id, user, run_id)


@router.post(C + "/reconciliation-groups/{candidate_id}/decisions", status_code=201)
def decide(company_id: str, candidate_id: str, data: GroupDecisionInput, request: Request):
    require(expected(request) == data.expected_version, "version_conflict", "نسخه درخواست یکسان نیست.", 409)
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.decide(db, company_id, user, candidate_id, data.model_dump()),
    )
