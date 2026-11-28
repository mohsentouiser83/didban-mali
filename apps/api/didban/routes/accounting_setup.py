from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from .. import accounting_setup_service as service
from ..accounting_setup_schemas import AccountingModeInput, ChartImportInput, ChartPreviewInput
from ..document_archive_service import archive_spreadsheet, read_spreadsheet_upload
from ..errors import require
from ..http import C, access, expected, mutate
from ..ingestion import scan

router = APIRouter()
A = C + "/accounting/setup"


@router.get(A)
def read_setup(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.setup(db, company_id, user)


@router.patch(A)
def edit_setup(company_id: str, data: AccountingModeInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "owner",
        lambda db, user: service.update_mode(db, company_id, user, data.mode, expected(request)),
    )


@router.get(A + "/chart-template")
def template(company_id: str, request: Request):
    with access(request, company_id):
        return {"rows": service.TEMPLATE, "certified": False, "financial_effect": False}


@router.post(
    A + "/chart-file",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {"file": {"type": "string", "format": "binary"}},
                    }
                }
            },
        }
    },
)
async def chart_file(company_id: str, request: Request):
    with access(request, company_id, "manage_accounts") as (_db, user, _m):
        actor_id = user.id
    name, content = await read_spreadsheet_upload(request)
    result = await run_in_threadpool(service.parse_chart, name, content)
    scan_status = await run_in_threadpool(scan, content)
    with access(request, company_id, "manage_accounts") as (db, user, _m):
        require(
            user.id == actor_id,
            "permission_denied",
            "دسترسی تغییر کرده است.",
            403,
        )
        archive_spreadsheet(db, company_id, user.id, "chart", name, content, scan_status)
    return result


@router.post(A + "/chart-preview")
def preview(company_id: str, data: ChartPreviewInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "manage_accounts",
        lambda db, user: service.preview_chart(db, company_id, user, [r.model_dump() for r in data.rows]),
    )


@router.post(A + "/chart-import", status_code=201)
def apply(company_id: str, data: ChartImportInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "manage_accounts",
        lambda db, user: service.import_chart(db, company_id, user, data.preview_id),
    )
