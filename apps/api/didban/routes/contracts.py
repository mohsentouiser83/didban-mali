"""HTTP routes for B2B client contracts, milestones, and statutory retentions."""

from fastapi import APIRouter, Request

from .. import contract_service as service
from ..contract_schemas import (
    ClientContractInput,
    ContractMilestoneInput,
    MilestoneBillingInput,
    MilestoneCollectionInput,
    UpdateClientContractInput,
)
from ..http import C, access, expected, mutate

router = APIRouter()
P = C + "/client-contracts"


@router.get(P)
def list_contracts(
    company_id: str,
    request: Request,
    status: str | None = None,
    dimension_id: str | None = None,
):
    with access(request, company_id) as (db, _u, _m):
        return service.list_contracts(db, company_id, status=status, dimension_id=dimension_id)


@router.post(P, status_code=201)
def create_contract(company_id: str, data: ClientContractInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_contract(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/{contract_id}")
def get_contract(company_id: str, contract_id: str, request: Request):
    with access(request, company_id) as (db, _u, _m):
        return service.get_contract(db, company_id, contract_id)


@router.patch(P + "/{contract_id}")
def update_contract(company_id: str, contract_id: str, data: UpdateClientContractInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.update_contract(
            db, company_id, user, contract_id, data.model_dump(exclude_unset=True), expected(request)
        ),
    )


@router.post(P + "/{contract_id}/milestones", status_code=201)
def add_milestone(company_id: str, contract_id: str, data: ContractMilestoneInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.add_milestone(db, company_id, user, contract_id, data.model_dump()),
    )


@router.post(P + "/{contract_id}/milestones/{milestone_id}/bill")
def bill_milestone(
    company_id: str, contract_id: str, milestone_id: str, data: MilestoneBillingInput, request: Request
):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.bill_milestone(db, company_id, user, contract_id, milestone_id, data.model_dump()),
    )


@router.post(P + "/{contract_id}/milestones/{milestone_id}/collect")
def collect_milestone(
    company_id: str, contract_id: str, milestone_id: str, data: MilestoneCollectionInput, request: Request
):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.collect_milestone(db, company_id, user, contract_id, milestone_id, data.model_dump()),
    )


@router.post(P + "/{contract_id}/milestones/{milestone_id}/release-retention")
def release_retention(company_id: str, contract_id: str, milestone_id: str, request: Request):
    return mutate(
        request,
        company_id,
        {},
        "write",
        lambda db, user: service.release_milestone_retention(db, company_id, user, contract_id, milestone_id),
    )
