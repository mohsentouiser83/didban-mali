"""Source-backed personnel reporting; no statutory-rate calculations."""

from fastapi import APIRouter, Request

from ..http import C, access
from ..personnel_service import personnel_result
from ..security import require_payroll_access

router = APIRouter()


@router.get(C + "/personnel-directory")
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
    with access(request, company_id) as (db, user, _member):
        require_payroll_access(db, company_id, user)
        kind = "employees" if area == "personnel-directory" else area
        return personnel_result(db, company_id, kind, period_id, basis=basis)
