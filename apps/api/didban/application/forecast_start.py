"""Start a forecast revision without reopening its historical upload session."""

from __future__ import annotations
import hashlib
from psycopg.types.json import Jsonb

from ..errors import conflict, missing
from ..infrastructure import settlements as store
from ..infrastructure.analysis import enqueue
from ..infrastructure.intake import IntakeRepository


def start_forecast_revision(conn, company, actor, manifest_id, parameters):
    # The immutable manifest's original session is the serialization point for
    # concurrent starts, even when subsequent revisions use continuation sessions.
    manifest = store.active_manifest(conn, company, manifest_id)
    if not manifest:
        raise missing()
    repo = IntakeRepository(conn)
    original = repo.session(company, str(manifest["session_id"]), True)
    if not original or original["status"] in ("cancelled", "failed"):
        raise conflict("session_not_editable")
    if original["status"] == "waiting_input":
        raise conflict("question_pending")
    if conn.execute(
        "SELECT 1 FROM app.forecast_runs WHERE company_id=%s AND manifest_id=%s AND status='waiting_input'",
        (company, manifest_id),
    ).fetchone():
        raise conflict("forecast_already_pending")
    if not original["analysis_finished_at"]:
        raise conflict("analysis_not_ready")
    policy = conn.execute(
        "SELECT policy_id FROM app.processing_steps WHERE company_id=%s AND session_id=%s AND step_kind='analysis:domains'",
        (company, original["id"]),
    ).fetchone()
    if not policy:
        raise conflict("analysis_not_ready")
    if not store.projection(conn, company, manifest_id):
        store.project(conn, company, manifest_id)
    session = conn.execute(
        """INSERT INTO app.processing_sessions(
          company_id,requested_by,period_id,as_of_date,status,sealed_at,
          preparation_finished_at,interpretation_finished_at,
          financial_finished_at,manifest_id,analysis_context)
        VALUES(%s,%s,%s,%s,'sealed',clock_timestamp(),%s,%s,%s,%s,%s)
        RETURNING *""",
        (
            company,
            actor["id"],
            original["period_id"],
            original["as_of_date"],
            original["preparation_finished_at"],
            original["interpretation_finished_at"],
            original["financial_finished_at"],
            manifest_id,
            Jsonb({"purpose": "forecast", "source_session_id": str(original["id"])}),
        ),
    ).fetchone()
    from .forecast import new_run

    run = new_run(conn, company, session, manifest_id, parameters)
    context = session["analysis_context"] | {"forecast_run_id": str(run["id"])}
    conn.execute(
        "UPDATE app.processing_sessions SET analysis_context=%s WHERE company_id=%s AND id=%s",
        (Jsonb(context), company, session["id"]),
    )
    step = conn.execute(
        """INSERT INTO app.processing_steps(
          company_id,session_id,step_kind,input_fingerprint,policy_id,status,total_items)
        VALUES(%s,%s,'analysis:domains',%s,%s,'pending',1) RETURNING id""",
        (
            company,
            session["id"],
            hashlib.sha256(
                (str(manifest_id) + ":" + str(run["id"])).encode()
            ).hexdigest(),
            policy["policy_id"],
        ),
    ).fetchone()
    enqueue(conn, company, str(session["id"]), step["id"])
    return run
