from datetime import date
from psycopg.types.json import Jsonb
from ..errors import ApiError, conflict
from .auth import response


def answer_forecast(
    conn, repo, actor, company, session, issue, body, key, request_id, access
):
    constraint = issue["answer_constraints"]
    answer = body["answer"]
    value = None
    row = conn.execute(
        "SELECT * FROM app.forecast_runs WHERE company_id=%s AND id=%s AND status='waiting_input' FOR UPDATE",
        (company, constraint["forecast_run_id"]),
    ).fetchone()
    if not row or str(row["session_id"]) != str(session["id"]):
        raise conflict("forecast_not_pending")
    if answer["kind"] == "unknown" and constraint.get("allow_unknown"):
        value = None
    elif (
        issue["answer_kind"] == "choice"
        and answer["kind"] == "choice"
        and answer["value"] in constraint.get("choices", [])
    ):
        value = True if answer["value"] == "affirmed" else None
    elif issue["answer_kind"] == "date" and answer["kind"] == "date":
        value = answer["value"]
        d = date.fromisoformat(value)
        if d < date.fromisoformat(constraint["min_date"]) or d > date.fromisoformat(
            constraint["max_date"]
        ):
            raise ApiError(
                422,
                "invalid_forecast_date",
                "تاریخ مورد انتظار باید پس از تاریخ گزارش باشد.",
            )
    else:
        raise ApiError(422, "answer_not_allowed", "پاسخ معتبر وارد کنید.")
    answers = row["answers"]
    answers[constraint["forecast_key"]] = value
    conn.execute(
        "UPDATE app.forecast_runs SET answers=%s WHERE company_id=%s AND id=%s",
        (Jsonb(answers), company, row["id"]),
    )
    receipt = conn.execute(
        "INSERT INTO app.issue_answers(company_id,issue_id,actor_id,expected_session_version,answer,idempotency_key) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
        (
            company,
            issue["id"],
            actor["id"],
            session["session_version"],
            Jsonb(answer),
            key,
        ),
    ).fetchone()
    conn.execute(
        "UPDATE app.processing_issues SET resolved_at=clock_timestamp() WHERE company_id=%s AND id=%s",
        (company, issue["id"]),
    )
    step = conn.execute(
        "UPDATE app.processing_steps SET status='pending',fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND session_id=%s AND step_kind='analysis:domains' RETURNING id",
        (company, session["id"]),
    ).fetchone()
    if not step:
        raise conflict("analysis_not_ready")
    remaining = any(
        i["required"] and not i["resolved_at"] and not i["superseded_at"]
        for i in repo.issues(company, str(session["id"]))
    )
    updated = conn.execute(
        "UPDATE app.processing_sessions SET analysis_finished_at=NULL,status=%s,session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING session_version,status",
        ("waiting_input" if remaining else "sealed", company, session["id"]),
    ).fetchone()
    from ..infrastructure.analysis import enqueue

    enqueue(conn, company, str(session["id"]), step["id"])
    access.audit(
        company,
        str(actor["id"]),
        "forecast.answered",
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
