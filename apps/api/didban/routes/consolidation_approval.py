"""Exact report-review controls; no ledger posting or ownership certification."""

from fastapi import APIRouter, Request
from pydantic import Field

from .. import consolidation_approval_service as service
from ..accounting_schemas import StrictInput
from ..http import C, access, mutate

router = APIRouter()
P = C + "/consolidation/drafts/{draft_id}"


class ApprovalInput(StrictInput):
    expected_digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    policy_version: str = Field(min_length=1, max_length=80)


@router.get(P + "/approval-preview")
def preview(company_id: str, draft_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.preview(db, company_id, user, draft_id)


@router.post(P + "/approvals", status_code=201)
def approve(company_id: str, draft_id: str, data: ApprovalInput, request: Request):
    # Cached idempotent responses must not bypass revoked original-company access.
    with access(request, company_id, "approve") as (db, user, _):
        service.preview(db, company_id, user, draft_id)
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "approve",
        lambda db, user: service.approve(
            db, company_id, user, draft_id, data.expected_digest, data.policy_version
        ),
    )
