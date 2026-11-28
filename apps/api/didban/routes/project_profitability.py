"""HTTP route for per-project and contract profitability reporting."""

from fastapi import APIRouter, Request

from .. import project_profitability_service as service
from ..http import C, access

router = APIRouter()


@router.get(C + "/reports/project-profitability")
def project_profitability(
    company_id: str,
    request: Request,
    period_id: str | None = None,
    dimension_id: str | None = None,
):
    with access(request, company_id) as (db, _u, _m):
        return service.get_project_profitability(
            db,
            company_id,
            period_id=period_id,
            dimension_id=dimension_id,
        )
