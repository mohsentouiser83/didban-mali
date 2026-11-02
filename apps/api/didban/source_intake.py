"""Shared validated file intake; no route invocation from bot services."""

from hashlib import sha256
from uuid import uuid4

from sqlalchemy import select

from . import models as m
from .config import settings
from .errors import require
from .ingestion import interpret
from .learning_service import reuse
from .services import get_entity
from .workflow import audit


def store_source(db, company_id, user, session_id, name, content, scanned, sheets, storage_key=None):
    session = get_entity(db, m.ProcessingSession, company_id, session_id)
    from .period_lock_service import require_open_period

    require_open_period(db, company_id, session.period_id)
    require(session.state == "receiving", "session_sealed", "دریافت این نوبت پایان یافته است.", 409)
    checksum = sha256(content).hexdigest()
    existing = list(
        db.scalars(
            select(m.SourceFile).where(
                m.SourceFile.company_id == company_id, m.SourceFile.session_id == session_id
            )
        )
    )
    require(len(existing) < settings.max_files, "file_limit", "حداکثر ۱۰ فایل در هر نوبت مجاز است.", 413)
    duplicate = db.scalar(
        select(m.SourceFile).where(m.SourceFile.company_id == company_id, m.SourceFile.sha256 == checksum)
    )
    require(not duplicate, "duplicate_file", "این فایل قبلاً در همین شرکت ثبت شده است.", 409)
    count = sum(len(sheet.rows) for sheet in sheets)
    require(
        sum(f.row_count for f in existing) + count <= settings.max_rows,
        "row_limit",
        "مجموع ردیف‌های نوبت نباید بیش از ۲۰ هزار باشد.",
        413,
    )
    key = storage_key or str(uuid4())
    path = settings.storage / key
    if storage_key is None:
        with path.open("xb") as target:
            target.write(content)
        path.chmod(0o600)
    source = m.SourceFile(
        company_id=company_id,
        session_id=session_id,
        name=name,
        sha256=checksum,
        size=len(content),
        storage_key=key,
        row_count=count,
        scan_status=scanned,
        state="ready",
    )
    db.add(source)
    db.flush()
    for sheet in sheets:
        proposal = interpret(sheet, name)

        proposal = reuse(db, company_id, sheet, proposal)
        db.add(
            m.Interpretation(
                company_id=company_id,
                file_id=source.id,
                sheet=sheet.name,
                provenance="validated_company_memory"
                if proposal["evidence"].get("learning_pattern")
                else "validated_header_rules",
                **proposal,
            )
        )
        db.add_all(
            m.SourceRow(
                company_id=company_id,
                file_id=source.id,
                sheet=sheet.name,
                row_number=number,
                values=values,
            )
            for number, values in sheet.rows
        )
    session.version += 1
    audit(
        db,
        company_id,
        user.id,
        "source.received",
        source.id,
        {"sha256": checksum, "row_count": count, "scan_status": scanned},
    )
    return source
