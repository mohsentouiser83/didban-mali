"""Source-backed personnel reporting; no statutory-rate calculations."""

from fastapi import APIRouter, Request

from ..http import C, access
from ..module_service import require_module
from ..personnel_service import personnel_result

router = APIRouter()


@router.get(C + "/employees")
@router.get(C + "/payroll")
@router.get(C + "/employee-reports")
@router.get(C + "/tax")
@router.get(C + "/insurance")
def personnel(
    company_id: str,
    request: Request,
    period_id: str | None = None,
    basis: str | None = None,
):
    area = request.url.path.rsplit("/", 1)[-1]
    with access(request, company_id) as (db, _user, _member):
        require_module(db, company_id, area.replace("-", "_"))
        return personnel_result(db, company_id, area, period_id, basis=basis)
