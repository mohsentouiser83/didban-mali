from fastapi import APIRouter, Request
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .. import accounting_setup_service as service
from ..accounting_setup_schemas import AccountingModeInput, ChartImportInput, ChartPreviewInput
from ..config import settings
from ..errors import require
from ..http import C, access, expected, mutate

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
    with access(request, company_id) as (db, user, _m):
        require(
            service.capabilities(db, company_id, user)["can_manage_accounts"],
            "permission_denied",
            "اجازه مدیریت حساب‌ها ندارید.",
            403,
        )
        actor_id = user.id
    length = request.headers.get("content-length")
    require(
        length is None or (length.isdecimal() and int(length) <= settings.max_file_bytes + 16384),
        "file_size_limit",
        "حداکثر حجم فایل ۲۰ مگابایت است.",
        413,
    )
    require(
        request.headers.get("content-type", "").startswith("multipart/form-data"),
        "chart_file_required",
        "فایل کدینگ لازم است.",
    )

    async def bounded_stream():
        received = 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > settings.max_file_bytes + 16384:
                raise MultiPartException("chart_upload_limit")
            yield chunk

    try:
        form = await MultiPartParser(request.headers, bounded_stream(), max_files=1, max_fields=0).parse()
    except MultiPartException:
        from ..errors import DomainError

        raise DomainError("chart_upload_invalid", "فایل معتبر و کمتر از ۲۰ مگابایت لازم است.", 413) from None
    try:
        file = form.get("file")
        require(isinstance(file, UploadFile), "chart_file_required", "فایل کدینگ لازم است.")
        content = await file.read(settings.max_file_bytes + 1)
        require(
            len(content) <= settings.max_file_bytes, "file_size_limit", "حداکثر حجم فایل ۲۰ مگابایت است.", 413
        )
        result = service.parse_chart(file.filename or "", content)
    finally:
        await form.close()
    with access(request, company_id) as (db, user, _m):
        require(
            user.id == actor_id and service.capabilities(db, company_id, user)["can_manage_accounts"],
            "permission_denied",
            "دسترسی تغییر کرده است.",
            403,
        )
    return result


@router.post(A + "/chart-preview")
def preview(company_id: str, data: ChartPreviewInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.preview_chart(db, company_id, user, [r.model_dump() for r in data.rows]),
    )


@router.post(A + "/chart-import", status_code=201)
def apply(company_id: str, data: ChartImportInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.import_chart(db, company_id, user, data.preview_id),
    )
