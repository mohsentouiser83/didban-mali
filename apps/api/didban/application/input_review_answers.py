"""Resolve a necessary review clarification without changing source data."""

from psycopg.types.json import Jsonb
from ..errors import ApiError
from .auth import response


def answer_review(
    conn, repo, actor, company, session, issue, body, key, request_id, access
):
    value = body["answer"].get("value")
    if body["answer"]["kind"] != "choice" or value not in (
        "revise_comment",
        "keep_current",
    ):
        raise ApiError(422, "answer_not_allowed", "یکی از پاسخ‌های مجاز را انتخاب کنید.")
    proposal = conn.execute(
        "SELECT * FROM app.input_review_proposals WHERE company_id=%s AND session_id=%s AND id=%s FOR UPDATE",
        (company, session["id"], issue["answer_constraints"]["proposal_id"]),
    ).fetchone()
    if not proposal:
        raise ApiError(409, "review_proposal_missing", "پیشنهاد دیگر در دسترس نیست.")
    row = conn.execute(
        "INSERT INTO app.issue_answers(company_id,issue_id,actor_id,expected_session_version,answer,idempotency_key) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
        (
            company,
            issue["id"],
            actor["id"],
            session["session_version"],
            Jsonb(body["answer"]),
            key,
        ),
    ).fetchone()
    if value == "keep_current":
        conn.execute(
            "UPDATE app.input_review_comments SET status='resolved',resolved_by=%s,resolved_at=clock_timestamp(),resolution='برداشت فعلی با تصمیم کاربر حفظ شد.' WHERE company_id=%s AND id=%s",
            (actor["id"], company, proposal["comment_id"]),
        )
    conn.execute(
        "UPDATE app.input_review_proposals SET status='rejected',decided_by=%s,decided_at=clock_timestamp() WHERE company_id=%s AND id=%s",
        (actor["id"], company, proposal["id"]),
    )
    conn.execute(
        "UPDATE app.processing_issues SET resolved_at=clock_timestamp() WHERE company_id=%s AND id=%s",
        (company, issue["id"]),
    )
    remaining = conn.execute(
        "SELECT 1 FROM app.processing_issues WHERE company_id=%s AND session_id=%s AND required AND resolved_at IS NULL AND superseded_at IS NULL",
        (company, session["id"]),
    ).fetchone()
    updated = conn.execute(
        "UPDATE app.processing_sessions SET status=%s,session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING *",
        (
            "waiting_input" if remaining else "waiting_dependency",
            company,
            session["id"],
        ),
    ).fetchone()
    access.audit(
        company,
        str(actor["id"]),
        "input_review.clarification_answered",
        "processing_issue",
        str(issue["id"]),
        request_id,
    )
    return response(
        {
            "id": row["id"],
            "issue_id": issue["id"],
            "session_id": session["id"],
            "session_version": updated["session_version"],
            "status": updated["status"],
        },
        201,
        etag=updated["session_version"],
    )
