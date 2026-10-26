from psycopg.types.json import Jsonb
from ..errors import ApiError, conflict
from ..infrastructure.financial import enqueue
from .auth import response


def answer_financial(
    conn, repo, actor, company, session, issue, body, key, request_id, access
):
    constraints = issue["answer_constraints"]
    value = body["answer"].get("value")
    if body["answer"]["kind"] != "choice" or value not in constraints.get(
        "choices", []
    ):
        raise ApiError(
            422, "answer_not_allowed", "یکی از گزینه‌های مجاز را انتخاب کنید."
        )
    context = session["financial_context"]
    context.setdefault("answers", {})[constraints["financial_key"]] = value
    context.setdefault("answer_actors", {})[constraints["financial_key"]] = str(
        actor["id"]
    )
    receipt = conn.execute(
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
    conn.execute(
        "UPDATE app.processing_issues SET resolved_at=clock_timestamp() WHERE company_id=%s AND id=%s",
        (company, issue["id"]),
    )
    step = conn.execute(
        "UPDATE app.processing_steps SET status='pending',fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND session_id=%s AND step_kind='financial:core' RETURNING id",
        (company, session["id"]),
    ).fetchone()
    if not step:
        raise conflict("financial_not_started")
    remaining = any(
        i["required"] and not i["resolved_at"] and not i["superseded_at"]
        for i in repo.issues(company, session["id"])
    )
    updated = conn.execute(
        "UPDATE app.processing_sessions SET financial_context=%s,status=%s,session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING *",
        (
            Jsonb(context),
            "waiting_input" if remaining else "sealed",
            company,
            session["id"],
        ),
    ).fetchone()
    enqueue(conn, company, session["id"], step["id"])
    access.audit(
        company,
        str(actor["id"]),
        "issue.answered",
        "processing_issue",
        str(issue["id"]),
        request_id,
    )
    return response(
        {
            "id": receipt["id"],
            "issue_id": issue["id"],
            "session_id": session["id"],
            "session_version": updated["session_version"],
            "status": updated["status"],
        },
        201,
        etag=updated["session_version"],
    )
