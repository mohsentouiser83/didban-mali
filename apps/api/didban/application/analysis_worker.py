"""Checkpointed deterministic domain analysis after core snapshot publication."""

from __future__ import annotations
import logging
from uuid import uuid4
from psycopg.types.json import Jsonb
from ..infrastructure.intake import IntakeRepository
from .preparation_worker import PreparationWorker, StaleJob

LOGGER = logging.getLogger("didban.analysis")


class AnalysisWorker(PreparationWorker):
    def run_once(self) -> bool:
        from ..infrastructure.cashflow import ensure_cashflow_snapshot
        from ..infrastructure.settlements import project
        from ..infrastructure.reconciliation import ensure_runs, pinned_rows
        from ..infrastructure.reports import ensure_report
        from .forecast import prepare_forecast

        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_analysis_job(%s) AS job", (uuid4(),)
            ).fetchone()["job"]
            if not job:
                return False
            try:
                with conn.transaction():
                    self.context(conn, job)
                    repo = IntakeRepository(conn)
                    session = repo.session(job["company_id"], job["session_id"], True)
                    if (
                        not session
                        or session["analysis_finished_at"]
                        or str(session["manifest_id"]) != str(job["manifest_id"])
                    ):
                        raise StaleJob()
                    step = conn.execute(
                        "UPDATE app.processing_steps SET status='running',fence=fence+1,lease_owner=%s,lease_expires_at=clock_timestamp()+interval '600 seconds' WHERE company_id=%s AND id=%s RETURNING *",
                        (job["claim"], job["company_id"], job["step_id"]),
                    ).fetchone()
                    conn.execute(
                        "SELECT app.assert_checkpoint(%s,%s,%s,%s)",
                        (
                            session["id"],
                            session["session_version"],
                            step["id"],
                            step["fence"],
                        ),
                    )
                    attempt = conn.execute(
                        "INSERT INTO app.step_attempts(company_id,step_id,attempt_number,fence,started_at) SELECT %s,%s,coalesce(max(attempt_number),0)+1,%s,clock_timestamp() FROM app.step_attempts WHERE company_id=%s AND step_id=%s RETURNING id",
                        (
                            job["company_id"],
                            step["id"],
                            step["fence"],
                            job["company_id"],
                            step["id"],
                        ),
                    ).fetchone()["id"]
                    raw = pinned_rows(conn, job["company_id"], session["manifest_id"])
                    project(conn, job["company_id"], session["manifest_id"], raw=raw)
                    for kind in ("bank_ledger", "moadian_sales", "moadian_purchases"):
                        ensure_runs(
                            conn,
                            job["company_id"],
                            session["manifest_id"],
                            job["actor_id"],
                            kind,
                            raw=raw,
                        )
                    ensure_cashflow_snapshot(
                        conn, job["company_id"], session["manifest_id"], raw=raw
                    )
                    forecast = prepare_forecast(
                        conn, job["company_id"], session, job["actor_id"]
                    )
                    waiting = forecast["waiting_input"]
                    conn.execute(
                        "UPDATE app.processing_steps SET status=%s,completed_items=%s,lease_expires_at=NULL WHERE company_id=%s AND id=%s",
                        (
                            "waiting_input" if waiting else "limited",
                            0 if waiting else 1,
                            job["company_id"],
                            step["id"],
                        ),
                    )
                    if not waiting:
                        report = ensure_report(
                            conn,
                            job["company_id"],
                            session["manifest_id"],
                            job["actor_id"],
                            forecast["run_id"],
                            processing_session_id=session["id"],
                        )
                        conn.execute(
                            "UPDATE app.processing_sessions SET analysis_finished_at=clock_timestamp(),analysis_context=%s,session_version=session_version+1,status='waiting_dependency' WHERE company_id=%s AND id=%s",
                            (
                                Jsonb(
                                    session["analysis_context"] | {
                                        "manifest_id": str(session["manifest_id"]),
                                        "forecast_run_id": str(forecast["run_id"]),
                                        "report_id": str(report["id"]),
                                    }
                                ),
                                job["company_id"],
                                session["id"],
                            ),
                        )
                        repo.notify(
                            job["company_id"],
                            job["actor_id"],
                            session["id"],
                            "تحلیل حوزه‌های مالی آماده است.",
                        )
                    conn.execute(
                        "UPDATE app.step_attempts SET finished_at=clock_timestamp() WHERE company_id=%s AND id=%s",
                        (job["company_id"], attempt),
                    )
                    if (
                        conn.execute(
                            "UPDATE app.outbox_events SET published_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE company_id=%s AND id=%s AND lease_token=%s AND published_at IS NULL AND lease_expires_at>clock_timestamp()",
                            (job["company_id"], job["id"], job["claim"]),
                        ).rowcount
                        != 1
                    ):
                        raise StaleJob()
            except Exception as error:
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,'barrier')",
                    (job["id"], job["claim"]),
                )
                LOGGER.warning(
                    "analysis_retry step_id=%s type=%s",
                    job["step_id"],
                    type(error).__name__,
                )
            return True
