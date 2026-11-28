"""File-report lifecycle and the dedicated Moadian spreadsheet import."""

from hashlib import sha256
from typing import Literal

from fastapi import APIRouter, Request
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..document_archive_service import read_spreadsheet_upload
from ..errors import require
from ..http import C, access, expected, mutate, public_source
from ..ingestion import read_file, scan
from ..period_lock_service import require_open_period
from ..source_intake import import_moadian_source
from ..workflow import (
    answer_issue,
    audit,
    enqueue,
    open_issues,
    serialize_fact,
)

router = APIRouter()


@router.post(
    C + "/moadian/import/{direction}",
    status_code=202,
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
async def import_moadian(
    company_id: str,
    direction: Literal["sales", "purchases"],
    period_id: str,
    request: Request,
    parent_id: str | None = None,
):
    with access(request, company_id, "write") as (db, _user, _member):
        service.get_entity(db, m.Period, company_id, period_id)
        require_open_period(db, company_id, period_id)
    name, content = await read_spreadsheet_upload(request)
    scanned = await run_in_threadpool(scan, content)
    sheets = await run_in_threadpool(read_file, name, content)
    return mutate(
        request,
        company_id,
        {"name": name, "sha256": sha256(content).hexdigest(), "period_id": period_id, "parent_id": parent_id},
        "write",
        lambda db, user: import_moadian_source(
            db, company_id, user, period_id, parent_id, direction, name, content, scanned, sheets
        ),
    )


@router.post(C + "/processing-sessions/from-result", status_code=202)
def recalculate(company_id: str, data: s.RecalculateInput, request: Request):
    def apply(db, user):
        parent = service.get_entity(db, m.ResultManifest, company_id, data.parent_id)
        service.get_entity(db, m.Period, company_id, data.period_id)
        require_open_period(db, company_id, data.period_id)
        session = m.ProcessingSession(
            company_id=company_id,
            period_id=data.period_id,
            parent_id=parent.id,
            actor_id=user.id,
            state="sealed",
        )
        db.add(session)
        db.flush()
        if parent.period_id == data.period_id:
            db.add(
                m.ProcessingIssue(
                    company_id=company_id,
                    session_id=session.id,
                    code="coverage",
                    question="پوشش نسخه مبنا",
                    choices=[],
                    evidence={"inherited_manifest_id": parent.id},
                    answer={"value": parent.selection.get("coverage", {})},
                    answered_by=user.id,
                )
            )
        enqueue(db, session)
        audit(
            db,
            company_id,
            user.id,
            "session.created_from_result",
            session.id,
            {"parent_id": parent.id, "period_id": data.period_id},
        )
        return serialize_fact(session)

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.get(C + "/processing-sessions/{session_id}")
def session_detail(company_id: str, session_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        session = service.get_entity(db, m.ProcessingSession, company_id, session_id)
        files = db.scalars(
            select(m.SourceFile)
            .where(m.SourceFile.company_id == company_id, m.SourceFile.session_id == session_id)
            .order_by(m.SourceFile.created_at)
        )
        return serialize_fact(session) | {
            "files": [public_source(f) for f in files],
            "issues": [serialize_fact(i) for i in open_issues(db, session)],
        }


@router.post(C + "/processing-issues/{issue_id}/answers", status_code=201)
def answer(company_id: str, issue_id: str, data: s.AnswerInput, request: Request):
    def apply(db, user):
        question = service.get_entity(db, m.ProcessingIssue, company_id, issue_id)
        return answer_issue(db, user, question, data.value, data.expected_version, expected(request))

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.post(C + "/processing-sessions/{session_id}/cancel", status_code=202)
def cancel(company_id: str, session_id: str, request: Request):
    def apply(db, user):
        session = service.get_entity(db, m.ProcessingSession, company_id, session_id)
        service.check_version(session, expected(request))
        require(
            session.state not in ("completed", "completed_limited", "cancelled"),
            "session_terminal",
            "نوبت پایان یافته است.",
            409,
        )
        session.state, session.version = "cancelled", session.version + 1
        audit(db, company_id, user.id, "session.cancelled", session_id)
        return serialize_fact(session)

    return mutate(request, company_id, {}, "write", apply)


@router.post(C + "/processing-sessions/{session_id}/retry", status_code=202)
def retry(company_id: str, session_id: str, request: Request):
    def apply(db, user):
        session = service.get_entity(db, m.ProcessingSession, company_id, session_id)
        service.check_version(session, expected(request))
        require(
            session.state in ("failed", "waiting_dependency"),
            "retry_not_allowed",
            "این نوبت قابل تلاش مجدد نیست.",
            409,
        )
        require(not open_issues(db, session), "question_barrier", "ابتدا سؤال نوبت را پاسخ دهید.", 409)
        session.state, session.version, session.error_code, session.error_message = (
            "sealed",
            session.version + 1,
            None,
            None,
        )
        enqueue(db, session)
        audit(db, company_id, user.id, "session.retried", session_id)
        return serialize_fact(session)

    return mutate(request, company_id, {}, "write", apply)
