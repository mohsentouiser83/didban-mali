from fastapi import APIRouter, Request
from pydantic import Field
from sqlalchemy import select

from .. import models as m
from .. import reconciliation_service as service
from ..errors import require
from ..http import C, access, mutate
from ..schemas import InputModel

router = APIRouter()


class ReconciliationInput(InputModel):
    manifest_id: str
    bank_to_ledger: dict[str, str] = Field(max_length=100)


class ReconciliationDecisionInput(InputModel):
    run_id: str
    expected_version: int = Field(ge=1)
    decision: str = Field(pattern=r"^(accepted|rejected)$")
    reason: str = Field(min_length=1, max_length=500)


@router.get(C + "/reconciliation-options")
def options(company_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.options(db, company_id)


@router.post(C + "/reconciliations", status_code=201)
def create(company_id: str, data: ReconciliationInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_run(db, company_id, user, data.manifest_id, data.bank_to_ledger),
    )


@router.get(C + "/reconciliations/latest")
def latest(company_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        run = db.scalar(
            select(m.ReconciliationRun)
            .where(m.ReconciliationRun.company_id == company_id)
            .order_by(m.ReconciliationRun.created_at.desc(), m.ReconciliationRun.id.desc())
            .limit(1)
        )
        require(run is not None, "no_reconciliation", "هنوز تطبیقی اجرا نشده است.", 404)
        return service.public_run(db, run)


@router.get(C + "/reconciliations/{run_id}")
def detail(company_id: str, run_id: str, request: Request):
    from ..services import get_entity

    with access(request, company_id) as (db, _user, _member):
        return service.public_run(db, get_entity(db, m.ReconciliationRun, company_id, run_id))


@router.post(C + "/reconciliation-proposals/{proposal_id}/decisions", status_code=201)
def decide(company_id: str, proposal_id: str, data: ReconciliationDecisionInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.decide(db, company_id, user, proposal_id, data.model_dump()),
    )
