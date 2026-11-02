from fastapi import APIRouter, Request
from fastapi.responses import Response

from .. import company_group_service as service
from ..company_group_models import CompanyComparisonRun, CompanyGroup
from ..company_group_schemas import ComparisonInput, GroupInput
from ..http import C, access, expected, mutate, paginate

router = APIRouter()
BASE = C + "/company-groups"


@router.get(BASE)
def groups(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _):
        return paginate(
            db,
            CompanyGroup,
            company_id,
            limit,
            cursor,
            transform=lambda item: service.public_group(db, company_id, user, item),
        )


@router.post(BASE, status_code=201)
def create(company_id: str, data: GroupInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "owner",
        lambda db, user: service.save(db, company_id, user, data.model_dump()),
    )


@router.patch(BASE + "/{group_id}")
def update(company_id: str, group_id: str, data: GroupInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "owner",
        lambda db, user: service.save(db, company_id, user, data.model_dump(), group_id, expected(request)),
    )


@router.post(BASE + "/{group_id}/runs", status_code=201)
def compare(company_id: str, group_id: str, data: ComparisonInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.compare(
            db, company_id, user, group_id, data.period_id, data.expected_version
        ),
    )


@router.get(BASE + "/runs/history")
def runs(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _):
        return paginate(
            db,
            CompanyComparisonRun,
            company_id,
            limit,
            cursor,
            transform=lambda item: service.read_run(db, company_id, user, item.id),
        )


@router.get(BASE + "/runs/{run_id}")
def detail(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.read_run(db, company_id, user, run_id)


@router.get(BASE + "/runs/{run_id}/export")
def export(company_id: str, run_id: str, request: Request):
    from ..exports import xlsx_report

    with access(request, company_id) as (db, user, _):
        run = service.read_run(db, company_id, user, run_id)
        snapshot = run["snapshot"]
        rows = [
            {
                "company": row["name"],
                "source": row.get("source", "imported_manifest"),
                "native_statement_id": row.get("native_statement_id"),
                "manifest_id": row.get("manifest_id"),
                **metric,
            }
            for row in snapshot["companies"]
            for metric in row["metrics"]
        ]
        content = xlsx_report(
            {
                "id": run_id,
                "digest": run["digest"],
                "selection": {"period": snapshot["period"]},
                "metrics": [],
                "details": {"comparison": rows, "limitation": snapshot["limitation"]},
            },
            {"id": run_id, "title": snapshot["title"], "version": run["group_version"], "approvals": []},
            snapshot["title"],
        )
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="didban-comparison-{run_id}.xlsx"'},
    )
