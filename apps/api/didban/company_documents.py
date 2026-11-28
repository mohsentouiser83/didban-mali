"""Read a company document page across processing files and personal originals."""

import base64
import json
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, literal, select, tuple_, union_all
from sqlalchemy.orm import Session

from . import models as m
from .bot_intake_models import BotIntake
from .bot_intake_service import public as public_bot_intake
from .document_archive_models import ArchivedSpreadsheet
from .errors import DomainError, require


class CompanyDocument(BaseModel):
    id: str
    name: str
    created_at: datetime
    size: int

    @field_validator("created_at")
    @classmethod
    def with_timezone(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class ProcessingDocument(CompanyDocument):
    kind: Literal["source"]
    state: str
    version: int
    archived: bool
    row_count: int
    period_name: str | None


class SpreadsheetDocument(CompanyDocument):
    kind: Literal["spreadsheet"]
    origin: Literal["chart", "table"]


class BotDocument(CompanyDocument):
    kind: Literal["bot"]
    origin: Literal["telegram", "bale"]
    state: str
    version: int
    duplicate_original: bool
    session_id: str | None


Document = Annotated[ProcessingDocument | SpreadsheetDocument | BotDocument, Field(discriminator="kind")]


class CompanyDocumentPage(BaseModel):
    items: list[Document]
    next_cursor: str | None = None


def list_company_documents(
    db: Session, company_id: str, actor_id: str, limit: int, cursor: str | None
) -> CompanyDocumentPage:
    require(1 <= limit <= 100, "invalid_limit", "تعداد ردیف باید بین ۱ و ۱۰۰ باشد.")
    index = union_all(
        select(m.SourceFile.id, m.SourceFile.created_at, literal("source").label("kind")).where(
            m.SourceFile.company_id == company_id
        ),
        select(ArchivedSpreadsheet.id, ArchivedSpreadsheet.created_at, literal("spreadsheet")).where(
            ArchivedSpreadsheet.company_id == company_id, ArchivedSpreadsheet.actor_id == actor_id
        ),
        select(BotIntake.id, BotIntake.created_at, literal("bot")).where(
            BotIntake.company_id == company_id, BotIntake.actor_id == actor_id
        ),
    ).subquery()
    order = (index.c.created_at, index.c.kind, index.c.id)
    query = select(index).order_by(*(column.desc() for column in order)).limit(limit + 1)
    if cursor:
        try:
            stamp, kind, identifier = json.loads(base64.urlsafe_b64decode(cursor))
            stamp = datetime.fromisoformat(stamp)
            if kind not in ("source", "spreadsheet", "bot") or not isinstance(identifier, str):
                raise ValueError
        except (ValueError, TypeError) as error:
            raise DomainError("invalid_cursor", "صفحه‌بندی معتبر نیست.") from error
        query = query.where(tuple_(*order) < tuple_(stamp, kind, identifier))

    keys = db.execute(query).all()
    page = keys[:limit]
    documents: dict[tuple[str, str], Document] = {}

    source_ids = [key.id for key in page if key.kind == "source"]
    if source_ids:
        sources = db.execute(
            select(m.SourceFile, m.Period.name)
            .join(
                m.ProcessingSession,
                and_(
                    m.ProcessingSession.id == m.SourceFile.session_id,
                    m.ProcessingSession.company_id == m.SourceFile.company_id,
                ),
            )
            .outerjoin(
                m.Period,
                and_(m.Period.id == m.ProcessingSession.period_id, m.Period.company_id == company_id),
            )
            .where(m.SourceFile.company_id == company_id, m.SourceFile.id.in_(source_ids))
        )
        for source, period_name in sources:
            documents["source", source.id] = ProcessingDocument(
                kind="source",
                id=source.id,
                name=source.name,
                created_at=source.created_at,
                size=source.size,
                state=source.state,
                version=source.version,
                archived=source.archived,
                row_count=source.row_count,
                period_name=period_name,
            )

    spreadsheet_ids = [key.id for key in page if key.kind == "spreadsheet"]
    if spreadsheet_ids:
        spreadsheets = db.scalars(
            select(ArchivedSpreadsheet).where(
                ArchivedSpreadsheet.company_id == company_id,
                ArchivedSpreadsheet.actor_id == actor_id,
                ArchivedSpreadsheet.id.in_(spreadsheet_ids),
            )
        )
        for item in spreadsheets:
            documents["spreadsheet", item.id] = SpreadsheetDocument(
                kind="spreadsheet",
                id=item.id,
                name=item.name,
                created_at=item.created_at,
                size=item.size,
                origin=item.origin,
            )

    bot_ids = [key.id for key in page if key.kind == "bot"]
    if bot_ids:
        intakes = db.execute(
            select(BotIntake, m.SourceFile.session_id)
            .outerjoin(
                m.SourceFile,
                and_(
                    m.SourceFile.id == BotIntake.source_file_id,
                    m.SourceFile.company_id == BotIntake.company_id,
                ),
            )
            .where(
                BotIntake.company_id == company_id, BotIntake.actor_id == actor_id, BotIntake.id.in_(bot_ids)
            )
        )
        for item, session_id in intakes:
            documents["bot", item.id] = BotDocument(
                kind="bot",
                id=item.id,
                name=item.name,
                created_at=item.created_at,
                size=item.size,
                origin=item.provider,
                state=item.state,
                version=item.version,
                duplicate_original=public_bot_intake(item, db)["duplicate_original"],
                session_id=session_id,
            )

    next_cursor = None
    if len(keys) > limit:
        last = page[-1]
        next_cursor = base64.urlsafe_b64encode(
            json.dumps([last.created_at.isoformat(), last.kind, last.id]).encode()
        ).decode()
    return CompanyDocumentPage(
        items=[documents[key.kind, key.id] for key in page if (key.kind, key.id) in documents],
        next_cursor=next_cursor,
    )
