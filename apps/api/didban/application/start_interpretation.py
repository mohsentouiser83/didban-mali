from ..errors import conflict
from ..infrastructure.interpretation import schedule


def start(
    intake, conn, repo, actor, company, session, key, expected, request_id, access
):
    def action():
        intake._version(session, expected)
        if (
            not session["preparation_finished_at"]
            or session["status"] != "waiting_dependency"
            or any(
                s["step_kind"].startswith("interpret:")
                for s in repo.steps(company, session["id"])
            )
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
