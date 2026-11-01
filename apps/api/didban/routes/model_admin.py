"""Explicit model budget and tariff administration; secrets are environment-only."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import Field, field_validator
from sqlalchemy import select

from .. import model_admin_service as service
from .. import models as m
from ..errors import require
from ..http import C, P, access, expected, installation_mutate, mutate, paginate
from ..model_gateway import reconcile_unknown_cost_in
from ..schemas import InputModel
from ..workflow import serialize_fact

router = APIRouter()


@router.get(P + "/admin/model-configuration")
def installation_model_configuration(request: Request):
    with access(request) as (_db, user, _member):
        require(user.installation_admin, "permission_denied", "فقط مدیر نصب مجاز است.", 403)
        return service.installation_model_configuration()


class InstallationBudgetInput(InputModel):
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    cap: str = Field(min_length=1, max_length=80)
    per_session_cap: str | None = Field(default=None, min_length=1, max_length=80)


class TariffInput(InputModel):
    model: Literal["gpt-5.6-luna"]
    price_version: str = Field(min_length=1, max_length=60)
    input_per_million: str = Field(min_length=1, max_length=80)
    cached_input_per_million: str = Field(min_length=1, max_length=80)
    cache_write_per_million: str = Field(min_length=1, max_length=80)
    output_per_million: str = Field(min_length=1, max_length=80)
    max_input_tokens: int = Field(ge=16384, le=200000)
    max_output_tokens: int = Field(ge=1, le=4096)
    effective_from: datetime

    @field_validator("effective_from")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("زمان اثر تعرفه باید منطقه زمانی داشته باشد.")
        return value


@router.get(P + "/admin/model-budget")
def installation_budgets(request: Request):
    with access(request) as (db, user, _member):
        require(user.installation_admin, "permission_denied", "فقط مدیر نصب مجاز است.", 403)
        budgets = db.scalars(select(m.InstallationModelBudget).order_by(m.InstallationModelBudget.period.desc()).limit(100))
        return {"items": [service.public_installation_budget(budget) for budget in budgets]}


@router.post(P + "/admin/model-budget")
def save_installation_budget(data: InstallationBudgetInput, request: Request):
    version = expected(request) if request.headers.get("if-match") else None
    return installation_mutate(request, data.model_dump(), lambda db, actor: service.configure_installation_budget(db, actor, data.model_dump(), version))


@router.get(C + "/model-status")
def status(company_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.model_status(db, company_id)


@router.get(C + "/model-tariffs")
def tariffs(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, m.ModelTariff, company_id, limit, cursor, transform=serialize_fact)


@router.post(C + "/model-tariffs", status_code=201)
def save_tariff(company_id: str, data: TariffInput, request: Request):
    return mutate(request, company_id, data.model_dump(), "write", lambda db, actor: service.configure_tariff(db, company_id, actor, data.model_dump()))


@router.get(C + "/model-requests")
def model_requests(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, m.ModelRequest, company_id, limit, cursor, transform=service.public_model_request)


class CostReconciliationInput(InputModel):
    actual_cost: str = Field(min_length=1, max_length=80)
    evidence_reference: str = Field(min_length=1, max_length=200)


@router.get(C + "/model-reservations")
def model_reservations(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        def public(item):
            return {key: getattr(item, key) for key in ("id", "created_at", "request_id", "period", "attempt", "amount", "actual_cost", "state")}
        return paginate(db, m.BudgetReservation, company_id, limit, cursor, transform=public)


@router.post(C + "/model-reservations/{reservation_id}/reconciliations")
def reconcile_cost(company_id: str, reservation_id: str, data: CostReconciliationInput, request: Request):
    return mutate(request, company_id, data.model_dump(), "read", lambda db, actor: reconcile_unknown_cost_in(db, company_id=company_id, actor_id=actor.id, reservation_id=reservation_id, **data.model_dump()))
