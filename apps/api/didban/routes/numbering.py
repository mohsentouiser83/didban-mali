"""HTTP endpoints for company numbering systems."""

from fastapi import APIRouter, Request

from .. import numbering_service as service
from ..http import C, access, expected, mutate
from ..numbering_schemas import NumberingRuleCreateInput, NumberingRuleInput

router = APIRouter()
P = C + "/numbering"


@router.get(P)
def listing(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.list_rules(db, company_id, user)


@router.post(P, status_code=201)
def create_rule(company_id: str, data: NumberingRuleCreateInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_rule(
            db,
            company_id,
            user,
            data.model_dump(),
        ),
    )


@router.get(P + "/{rule_id}")
def get_rule(company_id: str, rule_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.get_rule(db, company_id, user, rule_id)


@router.patch(P + "/{rule_id}")
def update_rule(company_id: str, rule_id: str, data: NumberingRuleInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.update_rule(
            db,
            company_id,
            user,
            rule_id,
            data.model_dump(exclude_unset=True),
            expected(request),
        ),
    )


@router.delete(P + "/{rule_id}")
def delete_rule(company_id: str, rule_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        service.delete_rule(db, company_id, user, rule_id)


@router.post(P + "/next/{entity_type}")
def get_next(company_id: str, entity_type: str, request: Request, consume: bool = False):
    with access(request, company_id) as (db, user, _m):
        return service.generate_next_number(db, company_id, user, entity_type, consume=consume)
