"""Leased, fenced deterministic financial publication with atomic outbox acknowledgement."""

import logging
from uuid import uuid4
import psycopg
from psycopg.types.json import Jsonb
from ..domain.financial import calculate
from ..infrastructure.financial import inputs, publish, digest
from ..infrastructure.intake import IntakeRepository
from ..infrastructure.input_review import ready
from .financial_questions import requirements, declarations
from .preparation_worker import PreparationWorker, StaleJob

LOGGER = logging.getLogger("didban.financial")


class FinancialWorker(PreparationWorker):
    def run_once(self):
        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_financial_job(%s) AS job", (uuid4(),)
            ).fetchone()["job"]
            if not job:
                return False
            try:
                with conn.transaction():
                    self.context(conn, job)
                    repo = IntakeRepository(conn)
                    session = repo.session(job["company_id"], job["session_id"], True)
                    if (
                        not ready(conn, str(session["id"]))
                        or not session["interpretation_finished_at"]
                        or session["manifest_id"]
                    ):
                        raise StaleJob()
                    step = conn.execute(
                        "UPDATE app.processing_steps SET status='running',fence=fence+1,lease_owner=%s,lease_expires_at=clock_timestamp()+interval '120 seconds' WHERE company_id=%s AND id=%s RETURNING *",
                        (job["claim"], job["company_id"], job["step_id"]),
                    ).fetchone()
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
                    data = inputs(conn, job["company_id"], session)
                    # Declarations are scoped to this session's selected dataset, never inherited silently.
                    fingerprint = digest(
                        [data[1], str(session["period_id"]), str(session["as_of_date"])]
                    )
                    context = session["financial_context"]
                    if context.get("selection_fingerprint") != fingerprint:
                        context = {"selection_fingerprint": fingerprint, "answers": {}}
                        session["financial_context"] = context
                    answers = context.get("answers", {})
                    shared = session["interpretation_context"]
                    if (
                        data[0] is None
                        and shared.get("coverage") == "declared_complete"
                    ):
                        for source_kind in {row.kind for row in data[3]}:
                            coverage_key = "coverage|" + source_kind + "|" + data[4].id
                            answers.setdefault(coverage_key, shared["coverage"])
                            context.setdefault("answer_actors", {}).setdefault(
                                coverage_key, shared.get("actor_id")
                            )
                        context["answers"] = answers
                        context["shared_coverage_origin"] = {
                            "kind": "interpretation_coverage",
                            "actor_id": shared.get("actor_id"),
                            "period_id": data[4].id,
                            "selection_fingerprint": fingerprint,
                        }
                    question = next(
                        (
                            q
                            for q in requirements(data[3], data[4], data[5])
                            if q[0] not in answers
                        ),
                        None,
                    )
                    declared = declarations(
                        data[3],
                        data[4],
                        data[5],
                        answers,
                        context.get("answer_actors", {}),
                    )
                metrics = (
                    calculate(data[3], data[4], data[5], declared)
                    if not question
                    else None
                )
                with conn.transaction():
                    self.context(conn, job)
                    conn.execute(
                        "SELECT app.assert_checkpoint(%s,%s,%s,%s)",
                        (
                            session["id"],
                            session["session_version"],
                            step["id"],
                            step["fence"],
                        ),
                    )
                    conn.execute(
                        "UPDATE app.processing_sessions SET financial_context=%s WHERE company_id=%s AND id=%s",
                        (
                            Jsonb(session["financial_context"]),
                            job["company_id"],
                            session["id"],
                        ),
                    )
                    if question:
                        key, text, choices = question
                        issue = conn.execute(
                            "INSERT INTO app.processing_issues(company_id,session_id,code,root_key,question_fa,answer_kind,answer_constraints,opened_session_version) VALUES(%s,%s,'financial_declaration',%s,%s,'choice',%s,%s) RETURNING id",
                            (
                                job["company_id"],
                                session["id"],
                                "financial:" + key,
                                text,
                                Jsonb(
                                    {
                                        "setting_key": "financial",
                                        "financial_key": key,
                                        "choices": list(choices),
                                        "allow_unknown": False,
                                    }
                                ),
                                session["session_version"],
                            ),
                        ).fetchone()
                        repo.notify(
                            job["company_id"],
                            job["actor_id"],
                            session["id"],
                            "برای ادامه محاسبه، پاسخ شما لازم است.",
                            str(issue["id"]),
                        )
                    else:
                        manifest = publish(
                            conn,
                            job["company_id"],
                            session,
                            step,
                            *data[:3],
                            metrics,
                            declared,
                        )
                        auto_analysis = conn.execute(
                            "SELECT coalesce(bool_or((p.parameters->>'auto_analysis')::boolean),false) AS enabled FROM app.processing_steps s JOIN app.policy_versions p ON p.company_id=s.company_id AND p.id=s.policy_id WHERE s.company_id=%s AND s.session_id=%s AND s.step_kind LIKE 'prepare:%%'",
                            (job["company_id"], session["id"]),
                        ).fetchone()["enabled"]
                        if auto_analysis:
                            from ..infrastructure.analysis import schedule

                            schedule(conn, job["company_id"], session["id"], manifest)
                        repo.notify(
                            job["company_id"],
                            job["actor_id"],
                            session["id"],
                            "نتایج مالی پایه آماده است.",
                        )
                    conn.execute(
                        "UPDATE app.processing_steps SET status=%s,completed_items=%s,lease_expires_at=NULL WHERE company_id=%s AND id=%s",
                        (
                            "waiting_input" if question else "limited",
                            0 if question else 1,
                            job["company_id"],
                            step["id"],
                        ),
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
            except (StaleJob, psycopg.Error) as error:
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,'barrier')",
                    (job["id"], job["claim"]),
                )
                LOGGER.warning(
                    "financial_retry step_id=%s type=%s reason=%s",
                    job["step_id"],
                    type(error).__name__,
                    error.sqlstate
                    if isinstance(error, psycopg.Error)
                    else "stale_checkpoint",
                )
            except Exception as error:
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,'barrier')",
                    (job["id"], job["claim"]),
                )
                LOGGER.error(
                    "financial_failure step_id=%s type=%s",
                    job["step_id"],
                    type(error).__name__,
                )
            return True
