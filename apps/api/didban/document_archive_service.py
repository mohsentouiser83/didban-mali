"""Retain validated private spreadsheet originals and their provenance."""

from datetime import timezone
from hashlib import sha256
from pathlib import Path

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .config import settings
from .document_archive_models import ArchivedSpreadsheet
from .errors import DomainError, require
from .workflow import audit


async def read_spreadsheet_upload(request: Request) -> tuple[str, bytes]:
    limit = settings.max_file_bytes + 16384
    length = request.headers.get("content-length")
    require(
        length is None or (length.isdecimal() and int(length) <= limit),
        "file_size_limit",
        "حداکثر حجم فایل ۲۰ مگابایت است.",
        413,
    )
    require(
        request.headers.get("content-type", "").startswith("multipart/form-data"),
        "spreadsheet_required",
        "فایل اکسل یا CSV لازم است.",
    )

    async def bounded_stream():
        received = 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > limit:
                raise MultiPartException("spreadsheet_upload_limit")
            yield chunk

    try:
        form = await MultiPartParser(request.headers, bounded_stream(), max_files=1, max_fields=0).parse()
    except MultiPartException:
        raise DomainError(
            "invalid_spreadsheet_upload", "فایل معتبر و کمتر از ۲۰ مگابایت لازم است.", 413
        ) from None
    try:
        file = form.get("file")
        require(isinstance(file, UploadFile), "spreadsheet_required", "فایل اکسل یا CSV لازم است.")
        content = await file.read(settings.max_file_bytes + 1)
        require(0 < len(content) <= settings.max_file_bytes, "file_size_limit", "حجم فایل معتبر نیست.", 413)
        name = Path((file.filename or "").replace(chr(92), "/")).name[:255]
        require(bool(name), "spreadsheet_required", "نام فایل لازم است.")
        return name, content
    finally:
        await form.close()


def public_spreadsheet(item: ArchivedSpreadsheet) -> dict:
    created_at = item.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return {
        "id": item.id,
        "name": item.name,
        "origin": item.origin,
        "size": item.size,
        "created_at": created_at.isoformat(),
    }


def archive_spreadsheet(
    db: Session, company: str, actor: str, origin: str, name: str, content: bytes, scan_status: str
) -> dict:
    digest = sha256(content).hexdigest()
    item = db.scalar(
        select(ArchivedSpreadsheet).where(
            ArchivedSpreadsheet.company_id == company,
            ArchivedSpreadsheet.actor_id == actor,
            ArchivedSpreadsheet.origin == origin,
            ArchivedSpreadsheet.sha256 == digest,
            ArchivedSpreadsheet.name == name,
        )
    )
    if item is None:
        item = ArchivedSpreadsheet(
            company_id=company,
            actor_id=actor,
            origin=origin,
            name=name,
            sha256=digest,
            size=len(content),
            content=content,
            scan_status=scan_status,
        )
        db.add(item)
        db.flush()
        audit(db, company, actor, "spreadsheet.archived", item.id, {"origin": origin, "sha256": digest})
    return public_spreadsheet(item)
