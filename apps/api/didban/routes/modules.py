"""Company-scoped module settings; changing preferences preserves financial facts."""
from fastapi import APIRouter, Request
from pydantic import StrictBool

from .. import module_service as service
from ..http import C, access, expected, mutate
from ..schemas import InputModel

router = APIRouter()


class ModuleInput(InputModel):
    enabled: StrictBool


@router.get(C + "/modules")
def modules(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.list_modules(db, company_id, user)


@router.patch(C + "/modules/{module_key}")
def update_module(company_id: str, module_key: str, data: ModuleInput, request: Request):
    return mutate(request, company_id, data.model_dump(), "owner",
                  lambda db, user: service.update_module(db, company_id, user, module_key,
                                                         data.enabled, expected(request)))
