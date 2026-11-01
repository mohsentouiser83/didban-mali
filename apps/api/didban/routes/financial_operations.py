"""Financial operations HTTP routes."""

from decimal import Decimal

from fastapi import APIRouter, Request
from sqlalchemy import select

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..errors import require
from ..http import C, access, expected, mutate, paginate
from ..ingestion import money
from ..workflow import (
    audit,
    serialize_fact,
)
from .reporting import latest_result

router = APIRouter()


@router.get(C + "/planned-payments")
def plans(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(
            db, m.PlannedPayment, company_id, limit, cursor, [m.PlannedPayment.state != "cancelled"]
        )


@router.post(C + "/planned-payments", status_code=201)
def create_plan(company_id: str, data: s.PlanInput, request: Request):
    def apply(db, user):
        amount = money(data.amount, "IRR")
        require(Decimal(amount) > 0, "invalid_amount", "مبلغ باید مثبت باشد.")
        existing = db.scalar(
            select(m.PlannedPayment.id).where(
                m.PlannedPayment.company_id == company_id,
                m.PlannedPayment.obligation_id == data.obligation_id,
                m.PlannedPayment.state == "confirmed",
            )
        )
        require(not existing, "duplicate_obligation", "این تعهد برنامه پرداخت فعال دارد.", 409)
        item = m.PlannedPayment(company_id=company_id, **(data.model_dump() | {"amount": amount}))
        db.add(item)
        db.flush()
        audit(db, company_id, user.id, "payment_plan.created", item.id, {"amount": amount})
        service.create_revision(db, company_id, user)
        return serialize_fact(item)

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.patch(C + "/planned-payments/{plan_id}")
def update_plan(company_id: str, plan_id: str, data: s.PlanInput, request: Request):
    def apply(db, user):
        plan = service.get_entity(db, m.PlannedPayment, company_id, plan_id)
        service.check_version(plan, expected(request))
        require(
            plan.source_row_id is None, "source_fact_immutable", "برنامه واردشده با فایل اصلاح می‌شود.", 409
        )
        amount = money(data.amount, "IRR")
        require(Decimal(amount) > 0, "invalid_amount", "مبلغ باید مثبت باشد.")
        for key, value in (data.model_dump() | {"amount": amount}).items():
            setattr(plan, key, value)
        plan.version += 1
        audit(db, company_id, user.id, "payment_plan.updated", plan.id, {"version": plan.version})
        service.create_revision(db, company_id, user)
        return serialize_fact(plan)

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.delete(C + "/planned-payments/{plan_id}")
def cancel_plan(company_id: str, plan_id: str, request: Request):
    def apply(db, user):
        plan = service.get_entity(db, m.PlannedPayment, company_id, plan_id)
        service.check_version(plan, expected(request))
        plan.state, plan.version = "cancelled", plan.version + 1
        audit(db, company_id, user.id, "payment_plan.cancelled", plan_id)
        service.create_revision(db, company_id, user)
        return serialize_fact(plan)

    return mutate(request, company_id, {}, "write", apply)


@router.post(C + "/allocations", status_code=201)
def allocation_create(company_id: str, data: s.AllocationInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.allocate(db, company_id, user, data.model_dump()),
    )


@router.post(C + "/allocations/{allocation_id}/reversals")
def allocation_reverse(company_id: str, allocation_id: str, data: s.ReversalInput, request: Request):
    def apply(db, user):
        allocation = service.get_entity(db, m.Allocation, company_id, allocation_id)
        service.check_version(allocation, data.expected_version)
        require(allocation.reversed_at is None, "already_reversed", "این تخصیص برگشت خورده است.", 409)
        allocation.reversed_at, allocation.reversed_by, allocation.reversal_reason = (
            m.now(),
            user.id,
            data.reason,
        )
        allocation.version += 1
        audit(
            db,
            company_id,
            user.id,
            "allocation.reversed",
            allocation.id,
            {"reason": data.reason, "amount": allocation.amount},
        )
        service.create_revision(db, company_id, user)
        return serialize_fact(allocation)

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.get(C + "/forecasts/latest")
def forecast(company_id: str, request: Request):
    result = latest_result(company_id, request)
    return result["details"].get(
        "forecast", {"status": "unavailable", "reason_codes": ["forecast_policy_not_approved"], "days": []}
    )
