"""Processing HTTP routes."""

from hashlib import sha256
from pathlib import Path

from fastapi import APIRouter, File, Request, UploadFile
from sqlalchemy import select

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..config import settings
from ..errors import require
from ..http import C, access, expected, mutate, paginate, public_source
from ..ingestion import read_file, scan
from ..period_lock_service import require_open_period
from ..workflow import (
    answer_issue,
    audit,
    enqueue,
    open_issues,
    serialize_fact,
)

router = APIRouter()


@router.get(C + "/processing-sessions")
def sessions(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, m.ProcessingSession, company_id, limit, cursor)


@router.post(C + "/processing-sessions", status_code=201)
def create_session(company_id: str, data: s.SessionInput, request: Request):
    def apply(db, user):
        if data.period_id:
            service.get_entity(db, m.Period, company_id, data.period_id)
            require_open_period(db, company_id, data.period_id)
        parent_id = data.parent_id
        if parent_id:
            service.get_entity(db, m.ResultManifest, company_id, parent_id)
        else:
            parent_id = db.scalar(
                select(m.ResultManifest.id)
                .where(m.ResultManifest.company_id == company_id)
                .order_by(m.ResultManifest.created_at.desc())
                .limit(1)
            )
        session = m.ProcessingSession(
            company_id=company_id, period_id=data.period_id, parent_id=parent_id, actor_id=user.id
        )
        db.add(session)
        db.flush()
        audit(db, company_id, user.id, "session.created", session.id)
        return serialize_fact(session)

    return mutate(request, company_id, data.model_dump(), "write", apply)


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


@router.get(C + "/processing-sessions/{session_id}/issues")
def session_issues(company_id: str, session_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        session = service.get_entity(db, m.ProcessingSession, company_id, session_id)
        return {"items": [serialize_fact(i) for i in open_issues(db, session)]}


@router.post(C + "/processing-sessions/{session_id}/files", status_code=202)
async def upload(company_id: str, session_id: str, request: Request, file: UploadFile = File()):
    # Authenticate before reading, scanning or parsing untrusted content.
    with access(request, company_id, "write"):
        pass
    data = bytearray()
    while chunk := await file.read(65536):
        data.extend(chunk)
        require(
            len(data) <= settings.max_file_bytes, "file_size_limit", "حداکثر حجم فایل ۲۰ مگابایت است.", 413
        )
    name = Path((file.filename or "file").replace("\\", "/")).name[:255]
    content = bytes(data)
    checksum = sha256(content).hexdigest()
    scanned = scan(content)
    sheets = read_file(name, content)
    payload = {"session_id": session_id, "sha256": checksum, "name": name}

    def apply(db, user):
        session = service.get_entity(db, m.ProcessingSession, company_id, session_id)
        require(session.state == "receiving", "session_sealed", "دریافت این نوبت پایان یافته است.", 409)
        from ..source_intake import store_source

        source = store_source(db, company_id, user, session_id, name, content, scanned, sheets)
        return public_source(source)

    return mutate(request, company_id, payload, "write", apply)


@router.post(C + "/processing-sessions/{session_id}/seal", status_code=202)
def seal(company_id: str, session_id: str, data: s.SealInput, request: Request):
    def apply(db, user):
        session = service.get_entity(db, m.ProcessingSession, company_id, session_id)
        service.check_version(session, expected(request))
        require_open_period(db, company_id, session.period_id)
        require(
            session.state == "receiving", "session_already_sealed", "دریافت این نوبت پایان یافته است.", 409
        )
        files = list(
            db.scalars(
                select(m.SourceFile.id).where(
                    m.SourceFile.company_id == company_id, m.SourceFile.session_id == session_id
                )
            )
        )
        require(
            bool(files) and set(files) == set(data.file_ids) and len(files) == len(data.file_ids),
            "upload_incomplete",
            "فهرست فایل‌های دریافتی کامل نیست.",
            409,
        )
        session.state, session.version = "sealed", session.version + 1
        enqueue(db, session)
        audit(db, company_id, user.id, "session.sealed", session_id, {"file_ids": files})
        return serialize_fact(session)

    return mutate(request, company_id, data.model_dump(), "write", apply)


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
