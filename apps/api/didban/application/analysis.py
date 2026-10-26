"""Explicit continuation for core snapshots created before automatic analysis."""

from ..errors import missing, conflict
from ..infrastructure.analysis import schedule
from ..infrastructure.intake import IntakeRepository


class AnalysisService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(conn, actor, company, True)
            repo = IntakeRepository(conn)
            session = repo.session(company, ids["session_id"], True)
            if not session:
                raise missing()

            def action():
                self.intake._version(session, expected)
                if (
                    not session["manifest_id"]
                    or session["status"] != "waiting_dependency"
                    or session["analysis_finished_at"]
                ):
                    raise conflict("analysis_not_ready")
                schedule(conn, company, session["id"], session["manifest_id"])
                conn.execute(
                    "UPDATE app.processing_sessions SET session_version=session_version+1,status='sealed' WHERE company_id=%s AND id=%s",
                    (company, session["id"]),
                )
                return self.intake._operation(
                    conn,
                    actor,
                    company,
                    session["id"],
                    "start_analysis",
                    request_id,
                    access,
                )

            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + ids["session_id"],
                key=key,
                payload={"version": expected},
                action=action,
            )
