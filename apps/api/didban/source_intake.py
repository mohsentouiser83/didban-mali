"""Shared validated file intake; no route invocation from bot services."""

from hashlib import sha256
from typing import Literal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .config import settings
from .errors import require
from .ingestion import REQUIRED, Sheet, interpret
from .period_lock_service import require_open_period
from .services import get_entity
from .workflow import audit, enqueue, serialize_fact


def store_source(
    db, company_id, user, session_id, name, content, scanned, sheets, storage_key=None, *, proposals=None
):
    session = get_entity(db, m.ProcessingSession, company_id, session_id)
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
    for sheet, proposal in zip(
        sheets, proposals or [interpret(sheet, name) for sheet in sheets], strict=True
    ):
        db.add(
            m.Interpretation(
                company_id=company_id,
                file_id=source.id,
                sheet=sheet.name,
                provenance="validated_header_rules",
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


def queue_source_processing(
    db: Session, session: m.ProcessingSession, user: m.User, file_ids: list[str]
) -> None:
    session.state = "sealed"
    session.version += 1
    enqueue(db, session)
    audit(db, session.company_id, user.id, "session.sealed", session.id, {"file_ids": file_ids})


def import_moadian_source(
    db: Session,
    company_id: str,
    user: m.User,
    period_id: str,
    parent_id: str | None,
    direction: Literal["sales", "purchases"],
    name: str,
    content: bytes,
    scanned: str,
    sheets: list[Sheet],
) -> dict:
    get_entity(db, m.Period, company_id, period_id)
    require_open_period(db, company_id, period_id)
    if parent_id:
        get_entity(db, m.ResultManifest, company_id, parent_id)
    else:
        parent_id = db.scalar(
            select(m.ResultManifest.id)
            .where(m.ResultManifest.company_id == company_id, m.ResultManifest.period_id == period_id)
            .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
            .limit(1)
        )

    family = f"moadian_{direction}"
    proposals = [interpret(sheet, f"moadian-{direction}") for sheet in sheets]
    require(
        all(
            proposal["family"] == family and set(REQUIRED[family]) <= proposal["mapping"].keys()
            for proposal in proposals
        ),
        "invalid_moadian_file",
        "ستون‌های فایل با جهت خرید یا فروش انتخاب‌شدهٔ کارپوشه سازگار نیست.",
    )
    session = m.ProcessingSession(
        company_id=company_id,
        period_id=period_id,
        parent_id=parent_id,
        actor_id=user.id,
    )
    db.add(session)
    db.flush()
    audit(db, company_id, user.id, "session.created", session.id)
    source = store_source(
        db, company_id, user, session.id, name, content, scanned, sheets, proposals=proposals
    )
    queue_source_processing(db, session, user, [source.id])
    return serialize_fact(session)
