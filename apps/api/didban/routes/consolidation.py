from fastapi import APIRouter, Request
from fastapi.responses import Response

from .. import consolidation_service as service
from ..consolidation_models import DraftConsolidationRun
from ..consolidation_schemas import DraftInput, MappingInput
from ..http import C, access, expected, mutate, paginate

router = APIRouter()
P = C + "/consolidation"


@router.get(P + "/mappings")
def mappings(company_id: str, group_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.mappings(db, company_id, user, group_id)


@router.post(P + "/mappings", status_code=201)
def mapping(company_id: str, data: MappingInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "owner",
        lambda db, user: service.save_mapping(db, company_id, user, data.model_dump(), expected(request)),
    )


@router.get(P + "/sources")
def sources(company_id: str, comparison_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.sources(db, company_id, user, comparison_id)


@router.get(P + "/drafts")
def drafts(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _):
        return paginate(
            db,
            DraftConsolidationRun,
            company_id,
            limit,
            cursor,
            transform=lambda item: service.read_draft(db, company_id, user, item.id),
        )


@router.post(P + "/drafts", status_code=201)
def create(company_id: str, data: DraftInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_draft(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/drafts/{draft_id}")
def detail(company_id: str, draft_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.read_draft(db, company_id, user, draft_id)


@router.get(P + "/drafts/{draft_id}/export")
def export(company_id: str, draft_id: str, request: Request):
    from ..exports import xlsx_report

    with access(request, company_id) as (db, user, _):
        item = service.read_draft(db, company_id, user, draft_id)
        snapshot = item["snapshot"]
        content = xlsx_report(
            {
                "id": draft_id,
                "digest": item["digest"],
                "selection": {"period": snapshot["period"]},
                "metrics": [],
                "details": {
                    "draft_metrics": snapshot["metrics"],
                    "proposed_eliminations": snapshot["pairs"],
                    "ownership_declarations": snapshot["mappings"],
                    "limitation": snapshot["limitation"],
                    "review_scope": item["approval_scope"],
                    "review_policy": item["approval_policy"],
                    "financial_effect": False,
                },
            },
            {
                "id": draft_id,
                "title": ("گزارش حذف‌های انتخابی؛ " if item["approvals"] else "پیش‌نویس حذف درون‌گروهی؛ ")
                + snapshot["title"],
                "version": 1,
                "approvals": [{**approval, "report_version": 1} for approval in item["approvals"]],
            },
            snapshot["title"],
        )
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="consolidation-draft-{draft_id}.xlsx"'},
    )
