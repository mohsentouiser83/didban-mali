"""Internal rule/pattern configuration and financially inert previews."""

from fastapi import APIRouter, Request
from sqlalchemy import select

from .. import automation_service as service
from .. import learning_service as learning
from .. import models as m
from ..automation_models import AutomationRule, AutomationRun, LearningPattern
from ..automation_schemas import PatternInput, PatternUpdate, RuleInput, RulePreview
from ..errors import require
from ..http import C, access, expected, mutate, paginate
from ..services import get_entity

router = APIRouter()
A = C + "/automation"


@router.get(A + "/capabilities")
def capabilities(company_id: str, request: Request):
    with access(request, company_id) as (db, user, member):
        return {
            "can_manage": service.can_manage(db, company_id, user),
            "can_learn": member.role in ("owner", "finance_manager", "advisor"),
        }


@router.get(A + "/rules")
def rules(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return paginate(db, AutomationRule, company_id, limit, cursor)


@router.post(A + "/rules", status_code=201)
def create(company_id: str, data: RuleInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_rule(db, company_id, user, data.model_dump()),
    )


@router.patch(A + "/rules/{rule_id}")
def edit(company_id: str, rule_id: str, data: RuleInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_rule(
            db, company_id, user, data.model_dump(), rule_id, expected(request)
        ),
    )


@router.post(A + "/preview")
def preview(company_id: str, data: RulePreview, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.save_preview(
            db, company_id, user, data.manifest_id, data.definition.model_dump()
        ),
    )


@router.post(A + "/rules/{rule_id}/execute")
def execute(company_id: str, rule_id: str, request: Request):
    def apply(db, user):
        require(
            service.can_manage(db, company_id, user), "permission_denied", "اجازه اجرای قاعده ندارید.", 403
        )
        rule = get_entity(db, AutomationRule, company_id, rule_id)
        from ..services import check_version

        check_version(rule, expected(request))
        if rule.definition["scope"] == "native_journal":
            from ..native_automation_service import execute

            return execute(db, company_id, rule)
        manifest = db.scalar(
            select(m.ResultManifest)
            .where(m.ResultManifest.company_id == company_id)
            .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
            .limit(1)
        )
        require(manifest is not None, "no_result", "ابتدا اسناد را پردازش کنید.", 409)
        return service.execute(db, company_id, rule, manifest)

    return mutate(request, company_id, {}, "write", apply)


@router.get(A + "/runs")
def runs(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return paginate(db, AutomationRun, company_id, limit, cursor)


@router.get(A + "/learning")
def patterns(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return paginate(db, LearningPattern, company_id, limit, cursor)


@router.get(A + "/learning/candidates")
def candidates(company_id: str, request: Request):
    with access(request, company_id) as (db, _u, _m):
        return learning.candidates(db, company_id)


@router.post(A + "/learning", status_code=201)
def remember(company_id: str, data: PatternInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: learning.remember(db, company_id, user, data.model_dump()),
    )


@router.patch(A + "/learning/{pattern_id}")
def edit_pattern(company_id: str, pattern_id: str, data: PatternUpdate, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: learning.update(
            db, company_id, user, pattern_id, data.model_dump(), expected(request)
        ),
    )
