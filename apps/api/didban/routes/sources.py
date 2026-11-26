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
        from sqlalchemy import select

        page = paginate(db, m.SourceFile, company_id, limit, cursor, transform=public_source)
        session_ids = list({item["session_id"] for item in page["items"] if item.get("session_id")})
        if session_ids:
            sessions = {
                s_row.id: s_row
                for s_row in db.scalars(
                    select(m.ProcessingSession).where(
                        m.ProcessingSession.company_id == company_id,
                        m.ProcessingSession.id.in_(session_ids),
                    )
                )
            }
            period_ids = list({s_row.period_id for s_row in sessions.values() if s_row.period_id})
            periods = (
                {
                    p_row.id: p_row.name
                    for p_row in db.scalars(
                        select(m.Period).where(m.Period.company_id == company_id, m.Period.id.in_(period_ids))
                    )
                }
                if period_ids
                else {}
            )
            for item in page["items"]:
                sess = sessions.get(item.get("session_id"))
                item["period_id"] = sess.period_id if sess else None
                item["period_name"] = periods.get(sess.period_id) if sess and sess.period_id else None
        return page


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
