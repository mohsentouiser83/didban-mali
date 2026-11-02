from fastapi import APIRouter, Request

from .. import period_lock_service as service
from ..http import C, access, expected, mutate
from ..period_lock_schemas import PeriodChecklistItemInput, PeriodLockInput

router = APIRouter()
P = C + "/financial-periods/{period_id}"


@router.get(P + "/checklist")
def checklist(company_id: str, period_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.checklist(db, company_id, period_id, user)


@router.get(P + "/lock-history")
def history(company_id: str, period_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return service.history(db, company_id, period_id, limit, cursor)


@router.post(P + "/close")
def close(company_id: str, period_id: str, data: PeriodLockInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.transition(
            db,
            company_id,
            user,
            period_id,
            True,
            data.reason,
            data.acknowledge_warnings,
            expected(request),
            data.expected_checklist_digest,
        ),
    )


@router.post(P + "/reopen")
def reopen(company_id: str, period_id: str, data: PeriodLockInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.transition(
            db, company_id, user, period_id, False, data.reason, data.acknowledge_warnings, expected(request)
        ),
    )


@router.post(P + "/checklist-items")
def create_item(company_id: str, period_id: str, data: PeriodChecklistItemInput, request: Request):
    from ..period_checklist_service import save

    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: save(db, company_id, user, period_id, data.model_dump()),
    )


@router.patch(P + "/checklist-items/{item_id}")
def update_item(
    company_id: str, period_id: str, item_id: str, data: PeriodChecklistItemInput, request: Request
):
    from ..period_checklist_service import save

    version = expected(request)
    return mutate(
        request,
        company_id,
        data.model_dump() | {"version": version},
        "write",
        lambda db, user: save(db, company_id, user, period_id, data.model_dump(), item_id, version),
    )
