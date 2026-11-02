"""Scenario HTTP routes; every saved revision is financially inert."""

from fastapi import APIRouter, Request

from .. import scenario_service as service
from ..http import C, access, expected, mutate
from ..native_scenario_schemas import NativeScenarioInput
from ..scenario_schemas import ScenarioInput

router = APIRouter()
S = C + "/cashflow-scenarios"


@router.get(S + "/baseline/{manifest_id}")
def baseline(company_id: str, manifest_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.baseline(db, company_id, manifest_id)


@router.get(S)
def listing(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return service.listing(db, company_id, limit, cursor)


@router.post(S, status_code=201)
def create(company_id: str, data: ScenarioInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(mode="json"),
        "write",
        lambda db, user: service.save(db, company_id, user, data.model_dump(mode="json")),
    )


@router.patch(S + "/{item_id}")
def revise(company_id: str, item_id: str, data: ScenarioInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(mode="json"),
        "write",
        lambda db, user: service.save(
            db, company_id, user, data.model_dump(mode="json"), item_id, expected(request)
        ),
    )


@router.get(S + "/{item_id}/evaluation")
def evaluation(company_id: str, item_id: str, actual_manifest_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.evaluate(db, company_id, item_id, actual_manifest_id)


@router.get(S + "/native/baseline/{statement_id}")
def native_baseline(company_id: str, statement_id: str, request: Request, horizon_days: int = 30):
    from ..native_scenario_service import baseline

    with access(request, company_id) as (db, user, _member):
        return baseline(db, company_id, user, statement_id, horizon_days)


@router.get(S + "/native")
def native_listing(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    from ..http import paginate
    from ..native_scenario_models import NativeCashScenario

    with access(request, company_id) as (db, _user, _member):
        return paginate(
            db,
            NativeCashScenario,
            company_id,
            limit,
            cursor,
            transform=lambda item: {
                "id": item.id,
                "series_id": item.series_id,
                "version": item.version,
                "name": item.name,
                "native_statement_id": item.native_statement_id,
                "created_at": item.created_at,
                "baseline": {"as_of_date": item.baseline["as_of_date"], "end": item.baseline["end"]},
                "summary_only": True,
            },
        )


@router.post(S + "/native", status_code=201)
def native_create(company_id: str, data: NativeScenarioInput, request: Request):
    from ..native_scenario_service import save

    return mutate(
        request,
        company_id,
        data.model_dump(mode="json"),
        "write",
        lambda db, user: save(db, company_id, user, data.model_dump(mode="json")),
    )


@router.get(S + "/native/{item_id}")
def native_detail(company_id: str, item_id: str, request: Request):
    from ..native_scenario_models import NativeCashScenario
    from ..native_scenario_service import public_scenario
    from ..services import get_entity

    with access(request, company_id) as (db, _user, _member):
        return public_scenario(get_entity(db, NativeCashScenario, company_id, item_id))


@router.patch(S + "/native/{item_id}")
def native_revise(company_id: str, item_id: str, data: NativeScenarioInput, request: Request):
    from ..native_scenario_service import save

    version = expected(request)
    return mutate(
        request,
        company_id,
        data.model_dump(mode="json") | {"expected_version": version},
        "write",
        lambda db, user: save(db, company_id, user, data.model_dump(mode="json"), item_id, version),
    )


@router.get(S + "/native/{item_id}/evaluation")
def native_evaluation(company_id: str, item_id: str, actual_statement_id: str, request: Request):
    from ..native_scenario_service import evaluate

    with access(request, company_id) as (db, user, _member):
        return evaluate(db, company_id, user, item_id, actual_statement_id)


@router.get(S + "/native/forecast-baseline/{forecast_id}")
def native_forecast_baseline(company_id: str, forecast_id: str, request: Request):
    from ..native_scenario_service import forecast_baseline

    with access(request, company_id) as (db, user, _member):
        return forecast_baseline(db, company_id, user, forecast_id)
