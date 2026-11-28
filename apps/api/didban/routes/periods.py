"""Periods HTTP routes."""

from fastapi import APIRouter, Request

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..errors import require
from ..http import C, access, expected, mutate, paginate
from ..workflow import (
    audit,
)

router = APIRouter()


@router.get(C + "/financial-periods")
def periods(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        from ..period_lock_service import lock_for

        def transform(period):
            data = service.serialize_fact(period)
            lock = lock_for(db, company_id, period.id)
            data["in_use"] = service.period_has_dependencies(db, company_id, period.id)
            data["closed"] = bool(lock and lock.closed)
            data["lock_version"] = lock.version if lock else 1
            return data

        return paginate(db, m.Period, company_id, limit, cursor, transform=transform)


@router.get(C + "/financial-periods/options")
def period_options(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        def transform(period):
            return {"id": period.id, "name": period.name, "start": period.start, "end": period.end}

        return paginate(db, m.Period, company_id, limit, cursor, transform=transform)


@router.post(C + "/financial-periods", status_code=201)
def create_period(company_id: str, data: s.PeriodInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_period(db, company_id, user, data.model_dump()),
    )


@router.patch(C + "/financial-periods/{period_id}")
def update_period(company_id: str, period_id: str, data: s.PeriodInput, request: Request):
    def apply(db, user):
        period = service.get_entity(db, m.Period, company_id, period_id)
        service.check_version(period, expected(request))
        return service.save_period(db, company_id, user, data.model_dump(), period)

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.delete(C + "/financial-periods/{period_id}")
def delete_period(company_id: str, period_id: str, request: Request):
    def apply(db, user):
        from ..period_lock_service import require_open_period

        period = service.get_entity(db, m.Period, company_id, period_id)
        service.check_version(period, expected(request))
        require_open_period(db, company_id, period_id)
        used = service.period_has_dependencies(db, company_id, period_id)
        require(not used, "period_in_use", "دوره استفاده‌شده قابل حذف نیست.", 409)
        db.delete(period)
        audit(db, company_id, user.id, "period.deleted", period_id)
        return {"deleted": True}

    return mutate(request, company_id, {}, "write", apply)
