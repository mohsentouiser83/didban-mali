from fastapi import APIRouter, Request

from .. import expense_review_service as service
from ..http import C, access

router = APIRouter()


@router.get(C + "/expense-changes")
def changes(company_id: str, manifest_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return service.compare(db, company_id, manifest_id)
