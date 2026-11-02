from fastapi import APIRouter, Request
from pydantic import Field

from .. import models as m
from .. import native_control_service as service
from ..accounting_schemas import StrictInput
from ..http import C, access, mutate, paginate
from ..native_control_models import NativeControlRun
from ..services import get_entity
from ..workflow import serialize_fact

router = APIRouter()
P = C + "/accounting/native-controls"


class AuditInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)


@router.get(P)
def current(company_id: str, period_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.build(db, company_id, user, period_id)


@router.post(P + "/runs", status_code=201)
def save(company_id: str, data: AuditInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save(db, company_id, user, data.period_id),
    )


@router.get(P + "/runs")
def runs(company_id: str, period_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        get_entity(db, m.Period, company_id, period_id)
        return paginate(
            db, NativeControlRun, company_id, limit, cursor, [NativeControlRun.period_id == period_id]
        )


@router.get(P + "/runs/{run_id}")
def detail(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return serialize_fact(get_entity(db, NativeControlRun, company_id, run_id))
