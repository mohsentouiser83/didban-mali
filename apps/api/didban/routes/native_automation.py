from fastapi import APIRouter, Request

from .. import native_automation_service as service
from ..automation_schemas import NativeRulePreview
from ..http import C, access, mutate, paginate
from ..native_automation_models import NativeAutomationRun

router = APIRouter()
P = C + "/automation"


@router.post(P + "/native-preview")
def preview(company_id: str, data: NativeRulePreview, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.save_preview(db, company_id, user, data.definition.model_dump()),
    )


@router.get(P + "/native-runs")
def runs(company_id: str, request: Request, limit: int = 25, cursor: str | None = None, rule_id: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        filters = [NativeAutomationRun.rule_id == rule_id] if rule_id else []
        return paginate(db, NativeAutomationRun, company_id, limit, cursor, filters)
