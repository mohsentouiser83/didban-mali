from ..errors import conflict
from ..infrastructure.interpretation import schedule


def start(
    intake, conn, repo, actor, company, session, key, expected, request_id, access
):
    def action():
        intake._version(session, expected)
        existing = any(
            s["step_kind"].startswith("interpret:")
            for s in repo.steps(company, session["id"])
        )
        if existing:
            return retry_automatic(
                intake, conn, repo, actor, company, session, request_id, access
            )
        if (
            not session["preparation_finished_at"]
            or session["status"] != "waiting_dependency"
        ):
            raise conflict("interpretation_already_started")
        for source in repo.files(company, session["id"]):
            schedule(conn, company, session["id"], source["id"])
        conn.execute(
            "UPDATE app.processing_sessions SET status='sealed',session_version=session_version+1 WHERE company_id=%s AND id=%s",
            (company, session["id"]),
        )
        return intake._operation(
            conn,
            actor,
            company,
            session["id"],
            "start_interpretation",
            request_id,
            access,
        )

    return intake.replay.run(
        conn,
        identity=False,
        scope=company + ":" + str(actor["id"]),
        actor=str(actor["id"]),
        company=company,
        route="startSessionInterpretation:" + str(session["id"]),
        key=key,
        payload={"version": expected},
        action=action,
    )


def retry_automatic(intake, conn, repo, actor, company, session, request_id, access):
    """Explicit re-evaluation preserves questions/history, never invents answers."""
    if (
        session["status"] != "waiting_input"
        or session["manifest_id"] is not None
        or session["financial_finished_at"]
        or not session["preparation_finished_at"]
    ):
        raise conflict("interpretation_already_started")
    issues = [
        issue
        for issue in repo.issues(company, session["id"])
        if issue["required"]
        and not issue["resolved_at"]
        and not issue["superseded_at"]
        and issue["code"] in ("interpretation_mapping", "interpretation_kind")
    ]
    if not issues:
        raise conflict("interpretation_already_started")
    files = {str(file["id"]): file for file in repo.files(company, session["id"])}
    targets = {issue["answer_constraints"]["file_id"] for issue in issues}
    if not targets <= files.keys():
        raise conflict("interpretation_already_started")
    for file in targets:
        # Existing human settings and all immutable interpretation runs remain intact.
        schedule(conn, company, session["id"], file)
        conn.execute(
            "UPDATE app.processing_steps SET checkpoint='{}' WHERE company_id=%s AND session_id=%s AND step_kind=%s",
            (company, session["id"], "interpret:" + file),
        )
    for issue in issues:
        conn.execute(
            "UPDATE app.processing_issues SET superseded_at=clock_timestamp() WHERE company_id=%s AND id=%s",
            (company, issue["id"]),
        )
    blocked = any(
        issue["required"] and not issue["resolved_at"] and not issue["superseded_at"]
        for issue in repo.issues(company, session["id"])
    )
    conn.execute(
        "UPDATE app.processing_sessions SET status=%s,session_version=session_version+1 WHERE company_id=%s AND id=%s",
        ("waiting_input" if blocked else "sealed", company, session["id"]),
    )
    access.audit(
        company,
        str(actor["id"]),
        "interpretation.automatic_retry_requested",
        "processing_session",
        str(session["id"]),
        request_id,
    )
    return intake._operation(
        conn,
        actor,
        company,
        session["id"],
        "start_interpretation",
        request_id,
        access,
    )
