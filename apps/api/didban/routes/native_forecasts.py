"""Company-scoped native forecast plans, clarification barrier and frozen results."""

from typing import Literal

from fastapi import APIRouter, Request

from .. import native_forecast_service as service
from ..http import C, access, expected, mutate, paginate
from ..native_forecast_models import NativeForecastPlan, NativeForecastRun
from ..native_forecast_schemas import NativeForecastAnswer, NativeForecastInput
from ..services import get_entity
from ..workflow import serialize_fact

router = APIRouter()
P = C + "/native-forecasts"


@router.post(P + "/plans", status_code=201)
def create(company_id: str, data: NativeForecastInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create(
            db, company_id, user, data.native_statement_id, data.obligations_complete
        ),
    )


@router.get(P + "/plans")
def plans(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(
            db,
            NativeForecastPlan,
            company_id,
            limit,
            cursor,
            transform=lambda row: {
                "id": row.id,
                "version": row.version,
                "state": row.state,
                "native_statement_id": row.native_statement_id,
                "created_at": row.created_at,
                "as_of": row.snapshot["as_of"],
                "forecast_run_id": row.forecast_run_id,
            },
        )


@router.get(P + "/plans/{plan_id}")
def plan(company_id: str, plan_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.public(db, company_id, user, get_entity(db, NativeForecastPlan, company_id, plan_id))


@router.post(P + "/plans/{plan_id}/answers")
def answer(company_id: str, plan_id: str, data: NativeForecastAnswer, request: Request):
    version = expected(request)
    return mutate(
        request,
        company_id,
        data.model_dump() | {"version": version},
        "write",
        lambda db, user: service.answer(db, company_id, user, plan_id, version, data.model_dump()),
    )


@router.get(P + "/runs")
def runs(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(
            db,
            NativeForecastRun,
            company_id,
            limit,
            cursor,
            transform=lambda row: {
                "id": row.id,
                "digest": row.digest,
                "native_statement_id": row.native_statement_id,
                "created_at": row.created_at,
                "as_of": row.snapshot["as_of"],
                "status": row.snapshot["status"],
                "end": row.snapshot["end"],
            },
        )


@router.get(P + "/runs/{run_id}")
def run(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.public_run(get_entity(db, NativeForecastRun, company_id, run_id))


@router.get(P + "/runs/{run_id}/evaluation")
def evaluation(company_id: str, run_id: str, actual_statement_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.evaluate(db, company_id, user, run_id, actual_statement_id)


@router.get(P + "/runs/{run_id}/export")
def export(company_id: str, run_id: str, request: Request, format: Literal["pdf", "xlsx"] = "pdf"):
    from fastapi.responses import Response

    from .. import models as m
    from ..native_forecast_exports import export_run
    from ..workflow import audit

    with access(request, company_id) as (db, user, _member):
        run = serialize_fact(get_entity(db, NativeForecastRun, company_id, run_id))
        company_name = db.get(m.Company, company_id).name
        audit(
            db,
            company_id,
            user.id,
            "native_forecast.downloaded",
            run_id,
            {"format": format, "digest": run["digest"]},
        )
    return Response(
        export_run(run, company_name, format),
        media_type="application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="didban-native-forecast-{run_id}.{format}"'},
    )
