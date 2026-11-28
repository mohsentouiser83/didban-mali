"""Company-scoped archive of originals for table imports and chart uploads."""

from hashlib import sha256
from urllib.parse import quote

from fastapi import APIRouter, Request, Response
from starlette.concurrency import run_in_threadpool

from ..company_documents import CompanyDocumentPage, list_company_documents
from ..config import settings
from ..document_archive_models import ArchivedSpreadsheet
from ..document_archive_service import archive_spreadsheet, public_spreadsheet, read_spreadsheet_upload
from ..errors import require
from ..http import C, access, mutate, paginate
from ..ingestion import read_file, scan
from ..services import get_entity
from ..workflow import audit

router = APIRouter()
P = C + "/document-archive/spreadsheets"


@router.get(C + "/document-archive")
def list_documents(
    company_id: str, request: Request, limit: int = 25, cursor: str | None = None
) -> CompanyDocumentPage:
    with access(request, company_id) as (db, user, _member):
        return list_company_documents(db, company_id, user.id, limit, cursor)


@router.get(P)
def list_spreadsheets(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, user, _member):
        return paginate(
            db,
            ArchivedSpreadsheet,
            company_id,
            limit,
            cursor,
            [ArchivedSpreadsheet.actor_id == user.id],
            transform=public_spreadsheet,
        )


@router.post(
    P,
    status_code=201,
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
async def upload_spreadsheet(company_id: str, request: Request):
    with access(request, company_id, "write") as (_db, actor, _member):
        actor_id = actor.id
    name, content = await read_spreadsheet_upload(request)
    scan_status = await run_in_threadpool(scan, content)
    await run_in_threadpool(read_file, name, content)

    def store(db, user):
        require(user.id == actor_id, "permission_denied", "دسترسی تغییر کرده است.", 403)
        return archive_spreadsheet(db, company_id, user.id, "table", name, content, scan_status)

    return mutate(request, company_id, {"name": name, "sha256": sha256(content).hexdigest()}, "write", store)


@router.get(P + "/{file_id}/download")
def download_spreadsheet(company_id: str, file_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        item = get_entity(db, ArchivedSpreadsheet, company_id, file_id)
        require(item.actor_id == user.id, "not_found", "رکورد یافت نشد.", 404)
        require(
            item.scan_status == "clean" or not settings.production,
            "file_not_clean",
            "فایل برای دانلود تأیید نشده است.",
            409,
        )
        audit(db, company_id, user.id, "spreadsheet.downloaded", item.id)
        return Response(
            item.content,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(item.name, safe='')}",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, no-store",
            },
        )
