"""Periods HTTP routes."""

from fastapi import APIRouter, Request
from sqlalchemy import select

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
        return paginate(db, m.Period, company_id, limit, cursor)


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
        period = service.get_entity(db, m.Period, company_id, period_id)
        service.check_version(period, expected(request))
        used = db.scalar(
            select(m.ProcessingSession.id)
            .where(m.ProcessingSession.company_id == company_id, m.ProcessingSession.period_id == period_id)
            .limit(1)
        )
        require(not used, "period_in_use", "دوره استفاده‌شده قابل حذف نیست.", 409)
        db.delete(period)
        audit(db, company_id, user.id, "period.deleted", period_id)
        return {"deleted": True}

    return mutate(request, company_id, {}, "write", apply)
