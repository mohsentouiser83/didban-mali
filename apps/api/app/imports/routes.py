from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool
from starlette.responses import StreamingResponse

from app.companies.models import CompanyAccess
from app.identity.dependencies import CurrentUser, DbSession
from app.imports.models import FileScanStatus, SourceFile
from app.imports.storage import get_storage, iter_object

router = APIRouter(prefix="/companies/{company_id}/imports", tags=["evidence-source-files"])


async def _access(session: DbSession, company_id: UUID, user_id: UUID) -> CompanyAccess:
    access = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == company_id,
            CompanyAccess.user_id == user_id,
        )
    )
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")
    return access


def _require_clean(source_file: SourceFile) -> None:
    if source_file.scan_status != FileScanStatus.CLEAN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="فقط فایل تأییدشده در بررسی امنیتی قابل پردازش است.",
        )


async def _source_file_response(source_file: SourceFile) -> StreamingResponse:
    _require_clean(source_file)
    body = await run_in_threadpool(get_storage().open, source_file.object_key)
    encoded_name = quote(source_file.original_name)
    return StreamingResponse(
        iter_object(body),
        media_type=source_file.mime_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )


@router.get("/source-files/{source_file_id}/download")
async def download_evidence_source_file(
    company_id: UUID,
    source_file_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> StreamingResponse:
    await _access(session, company_id, current_user.id)
    source_file = await session.scalar(
        select(SourceFile).where(
            SourceFile.id == source_file_id,
            SourceFile.company_id == company_id,
        )
    )
    if source_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="فایل منبع پیدا نشد.")
    return await _source_file_response(source_file)
