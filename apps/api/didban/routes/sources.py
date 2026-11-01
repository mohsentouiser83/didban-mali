"""Sources HTTP routes."""

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..config import settings
from ..errors import require
from ..http import C, access, expected, mutate, paginate, public_source
from ..workflow import (
    audit,
)

router = APIRouter()


@router.get(C + "/source-files")
def sources(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, m.SourceFile, company_id, limit, cursor, transform=public_source)


@router.get(C + "/source-files/{file_id}/download")
def source_download(company_id: str, file_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        source = service.get_entity(db, m.SourceFile, company_id, file_id)
        require(
            source.scan_status == "clean" or not settings.production,
            "file_not_clean",
            "فایل برای دانلود تأیید نشده است.",
            409,
        )
        path = settings.storage / source.storage_key
        require(path.is_file(), "file_unavailable", "فایل در دسترس نیست.", 503)
        audit(db, company_id, user.id, "source.downloaded", source.id)
        return FileResponse(path, filename=source.name, media_type="application/octet-stream")


@router.post(C + "/source-files/{file_id}/archive")
def archive(company_id: str, file_id: str, data: s.ExpectedVersion, request: Request):
    def apply(db, user):
        source = service.get_entity(db, m.SourceFile, company_id, file_id)
        service.check_version(source, data.expected_version)
        return service.archive_source(db, company_id, user, source)

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.delete(C + "/source-files/{file_id}")
def delete_source(company_id: str, file_id: str, request: Request, confirmed: bool = False):
    def apply(db, user):
        source = service.get_entity(db, m.SourceFile, company_id, file_id)
        service.check_version(source, expected(request))
        return service.delete_source(db, company_id, user, source, confirmed)

    return mutate(request, company_id, {"confirmed": confirmed}, "owner", apply)


@router.get(C + "/source-rows/{row_id}")
def source_row(company_id: str, row_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        row = service.get_entity(db, m.SourceRow, company_id, row_id)
        source = service.get_entity(db, m.SourceFile, company_id, row.file_id)
        return {
            "id": row.id,
            "file_id": row.file_id,
            "filename": source.name,
            "sheet": row.sheet,
            "row_number": row.row_number,
            "values": row.values,
        }
