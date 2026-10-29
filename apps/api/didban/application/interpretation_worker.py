from __future__ import annotations
import hashlib
import logging
from uuid import uuid4
import psycopg
from psycopg.types.json import Jsonb
from ..adapters.source_reader import SourceReader
from ..domain.intake import DependencyUnavailable, PreparationFailure
from ..domain.interpretation import analyze, Question
from ..infrastructure.intake import IntakeRepository
from ..infrastructure.interpretation import overlap_candidates, persist
from .preparation_worker import PreparationWorker, StaleJob
from .intake_model import IntakeModel
from .source_understanding import prepare, remember

LOGGER = logging.getLogger("didban.interpretation")


class InterpretationWorker(PreparationWorker):
    def __init__(self, settings, *, model=None):
        super().__init__(settings)
        self.model = model or IntakeModel()

    def run_once(self) -> bool:
        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_interpretation_job(%s) AS job", (uuid4(),)
            ).fetchone()["job"]
            if not job:
                return False
            try:
                with conn.transaction():
                    self.context(conn, job)
                    repo = IntakeRepository(conn)
                    session = repo.session(job["company_id"], job["session_id"], True)
                    if not session or session["status"] not in (
                        "sealed",
                        "processing",
                        "waiting_dependency",
                    ):
                        raise StaleJob()
                    step = conn.execute(
                        "UPDATE app.processing_steps SET status='running',dependency_code=NULL,fence=fence+1,lease_owner=%s,lease_expires_at=clock_timestamp()+interval '120 seconds' WHERE company_id=%s AND id=%s AND status NOT IN ('succeeded','limited','cancelled') RETURNING *",
                        (job["claim"], job["company_id"], job["step_id"]),
                    ).fetchone()
                    if not step:
                        raise StaleJob()
                    attempt = conn.execute(
                        "INSERT INTO app.step_attempts(company_id,step_id,attempt_number,fence,started_at) SELECT %s,%s,coalesce(max(attempt_number),0)+1,%s,clock_timestamp() FROM app.step_attempts WHERE company_id=%s AND step_id=%s RETURNING id",
                        (
                            job["company_id"],
                            job["step_id"],
                            step["fence"],
                            job["company_id"],
                            job["step_id"],
                        ),
                    ).fetchone()["id"]
                    files = repo.files(job["company_id"], job["session_id"])
                    decisions = conn.execute(
                        "SELECT i.answer_constraints,a.id,a.actor_id,a.answer FROM app.issue_answers a JOIN app.processing_issues i ON i.company_id=a.company_id AND i.id=a.issue_id WHERE i.company_id=%s AND i.session_id=%s AND i.code='interpretation_account_role' ORDER BY a.created_at DESC,a.id DESC",
                        (job["company_id"], job["session_id"]),
                    ).fetchall()
                    for source in files:
                        source["role_decisions"] = {}
                        for decision in decisions:
                            constraints = decision["answer_constraints"]
                            if constraints.get("file_id") == str(source["id"]):
                                source["role_decisions"].setdefault(
                                    constraints["account_code"],
                                    {
                                        "role": decision["answer"]["value"],
                                        "answer_id": str(decision["id"]),
                                        "actor_id": str(decision["actor_id"]),
                                    },
                                )
                    file = next(f for f in files if str(f["id"]) == job["file_id"])
                    history = conn.execute(
                        "SELECT id,settings FROM app.interpretation_runs WHERE company_id=%s ORDER BY created_at DESC,id DESC LIMIT 30",
                        (job["company_id"],),
                    ).fetchall()
                    if (
                        file["scan_status"] != "clean"
                        or not file["preparation_summary"]
                    ):
                        raise StaleJob()
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='processing' WHERE company_id=%s AND id=%s",
                        (job["company_id"], job["session_id"]),
                    )
                result = None
                error = None
                if step["checkpoint"].get("stage") != "finalize":
                    try:
                        path = self.storage.path(file["object_key"])
                        if (
                            hashlib.sha256(path.read_bytes()).hexdigest()
                            != file["sha256"]
                        ):
                            raise PreparationFailure("source_integrity_mismatch")
                        tables = SourceReader().read(
                            path, file["format"], file["preparation_settings"]
                        )
                        settings, findings = prepare(
                            self.storage, files, file, tables, history
                        )
                        result = analyze(tables, settings)
                        with conn.transaction():
                            self.model_checkpoint(
                                conn, job, session["session_version"], step
                            )
                            conn.execute(
                                "UPDATE app.session_files SET interpretation_settings=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                                (
                                    Jsonb(settings),
                                    job["company_id"],
                                    job["session_id"],
                                    job["file_id"],
                                ),
                            )
                        file["interpretation_settings"] = settings
                        result = self.model.propose(
                            conn,
                            job,
                            session["session_version"],
                            step,
                            file,
                            tables,
                            result,
                        )
                        result.related_sources = findings
                        file["interpretation_settings"] = remember(
                            tables, file["interpretation_settings"], result
                        )
                    except FileNotFoundError:
                        raise DependencyUnavailable("storage_unavailable") from None
                    except DependencyUnavailable:
                        raise
                    except PreparationFailure as failure:
                        error = failure.code
                self.finish_interpretation(
                    conn,
                    job,
                    session["session_version"],
                    step,
                    attempt,
                    file,
                    result,
                    error,
                )
            except (StaleJob, psycopg.Error, DependencyUnavailable) as failure:
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,%s)",
                    (
                        job["id"],
                        job["claim"],
                        failure.code
                        if isinstance(failure, DependencyUnavailable)
                        else "barrier",
                    ),
                )
            except Exception as failure:
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,'storage_unavailable')",
                    (job["id"], job["claim"]),
                )
                LOGGER.error(
                    "interpretation_failure step_id=%s type=%s",
                    job["step_id"],
                    type(failure).__name__,
                )
            return True

    def finish_interpretation(
        self, conn, job, version, step, attempt, file, result, error
    ):
        with conn.transaction():
            self.context(conn, job)
            repo = IntakeRepository(conn)
            conn.execute(
                "SELECT app.assert_checkpoint(%s,%s,%s,%s)",
                (job["session_id"], version, job["step_id"], step["fence"]),
            )
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (job["company_id"] + ":interpret-commit",),
            )
            question = result.question if result else None
            if result:
                conn.execute(
                    "UPDATE app.session_files SET interpretation_preview=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                    (
                        Jsonb(result.previews),
                        job["company_id"],
                        job["session_id"],
                        job["file_id"],
                    ),
                )
            overlaps = []
            if result and not question:
                if result.related_sources and file["interpretation_settings"].get(
                    "overlap"
                ) not in ("keep_excluded", "distinct_records"):
                    finding = result.related_sources[0]
                    question = Question(
                        "interpretation_overlap",
                        "",
                        "overlap",
                        "دو خروجی دفتر، گردش یکسان حساب‌ها دارند. نسخه دیگر تفصیلی‌تر است"
                        + (
                            " و تاریخ بعضی ثبت‌ها متفاوت است"
                            if finding["date_difference_count"]
                            else ""
                        )
                        + "؛ پیشنهاد: این خروجی کنار بماند و نسخه تفصیلی مبنا شود.",
                        ("keep_excluded", "distinct_records"),
                    )
                overlaps = overlap_candidates(
                    conn, job["company_id"], job["file_id"], result
                )
                if (
                    not question
                    and overlaps
                    and file["interpretation_settings"].get("overlap")
                    not in (
                        "keep_excluded",
                        "distinct_records",
                    )
                ):
                    question = Question(
                        "interpretation_overlap",
                        "",
                        "overlap",
                        "این فایل با داده‌های قبلی هم‌پوشانی احتمالی دارد؛ چگونه نگه‌داری شود؟",
                        ("keep_excluded", "distinct_records"),
                    )
            summary = file["interpretation_summary"]
            if error:
                conn.execute(
                    "UPDATE app.processing_sessions SET status='failed',session_version=session_version+1 WHERE company_id=%s AND id=%s",
                    (job["company_id"], job["session_id"]),
                )
                conn.execute(
                    "UPDATE app.session_files SET error_code=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                    (error, job["company_id"], job["session_id"], job["file_id"]),
                )
            elif result and not question:
                summary = persist(
                    conn,
                    job,
                    result,
                    file["interpretation_settings"],
                    step["policy_id"],
                    overlaps,
                )
            finalizing = False
            if not error and not question:
                conn.execute(
                    "UPDATE app.processing_steps SET status=%s,completed_items=1 WHERE company_id=%s AND id=%s",
                    (
                        "limited"
                        if summary
                        and (summary["rejected_rows"] or summary["excluded_rows"])
                        else "succeeded",
                        job["company_id"],
                        job["step_id"],
                    ),
                )
                steps = repo.steps(job["company_id"], job["session_id"])
                if all(s["status"] in ("succeeded", "limited") for s in steps):
                    current = repo.session(job["company_id"], job["session_id"])
                    valid = any(
                        (f["interpretation_summary"] or {}).get("valid_rows", 0) > 0
                        for f in repo.files(job["company_id"], job["session_id"])
                    )
                    if valid and not current["period_id"]:
                        periods = conn.execute(
                            "SELECT id FROM app.financial_periods WHERE company_id=%s ORDER BY starts_on DESC LIMIT 100",
                            (job["company_id"],),
                        ).fetchall()
                        question = Question(
                            "interpretation_period",
                            "",
                            "period_id",
                            "دوره مالی این بسته کدام است؟",
                            tuple(str(p["id"]) for p in periods),
                        )
                        finalizing = True
                    elif valid and not current["interpretation_context"].get(
                        "coverage"
                    ):
                        question = Question(
                            "interpretation_coverage",
                            "",
                            "coverage",
                            "پوشش فایل‌های این بسته برای دوره انتخاب‌شده چگونه است؟",
                            ("declared_complete", "partial", "unknown"),
                        )
                        finalizing = True
                    else:
                        conn.execute(
                            "UPDATE app.processing_sessions SET interpretation_finished_at=clock_timestamp(),status='waiting_dependency',session_version=session_version+1 WHERE company_id=%s AND id=%s",
                            (job["company_id"], job["session_id"]),
                        )
                        repo.notify(
                            job["company_id"],
                            job["actor_id"],
                            job["session_id"],
                            "تفسیر فایل‌ها آماده است.",
                        )
                        auto_financial = conn.execute(
                            "SELECT coalesce(bool_or((p.parameters->>'auto_financial')::boolean),false) AS enabled FROM app.processing_steps s JOIN app.policy_versions p ON p.company_id=s.company_id AND p.id=s.policy_id WHERE s.company_id=%s AND s.session_id=%s AND s.step_kind LIKE 'prepare:%%'",
                            (job["company_id"], job["session_id"]),
                        ).fetchone()["enabled"]
                        if (
                            valid
                            and auto_financial
                            and not current["input_review_required"]
                        ):
                            from ..infrastructure.financial import schedule

                            schedule(conn, job["company_id"], job["session_id"])
            if question:
                constraints = {
                    "choices": list(question.choices),
                    "allow_unknown": False,
                    "file_id": job["file_id"],
                    "sheet_name": question.sheet,
                    "setting_key": question.field,
                    **(
                        {"account_code": question.account_code}
                        if question.account_code
                        else {}
                    ),
                }
                issue = conn.execute(
                    "INSERT INTO app.processing_issues(company_id,session_id,code,root_key,question_fa,answer_kind,answer_constraints,opened_session_version) VALUES(%s,%s,%s,%s,%s,'choice',%s,%s) RETURNING id",
                    (
                        job["company_id"],
                        job["session_id"],
                        question.code,
                        "interpretation:"
                        + job["file_id"]
                        + ":"
                        + question.sheet
                        + ":"
                        + question.field,
                        question.message,
                        Jsonb(constraints),
                        version,
                    ),
                ).fetchone()
                repo.notify(
                    job["company_id"],
                    job["actor_id"],
                    job["session_id"],
                    "برای ادامه تفسیر، پاسخ شما لازم است.",
                    str(issue["id"]),
                )
            conn.execute(
                "UPDATE app.processing_steps SET status=%s,lease_expires_at=NULL,checkpoint=%s WHERE company_id=%s AND id=%s",
                (
                    "failed"
                    if error
                    else "waiting_input"
                    if question
                    else "limited"
                    if summary
                    and (summary["rejected_rows"] or summary["excluded_rows"])
                    else "succeeded",
                    Jsonb(
                        {
                            "stage": "finalize" if finalizing else "interpreted",
                            "file_id": job["file_id"],
                            "error_code": error,
                        }
                    ),
                    job["company_id"],
                    job["step_id"],
                ),
            )
            conn.execute(
                "UPDATE app.step_attempts SET finished_at=clock_timestamp(),error_code=%s WHERE company_id=%s AND id=%s",
                (error, job["company_id"], attempt),
            )
            if (
                conn.execute(
                    "UPDATE app.outbox_events SET published_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE company_id=%s AND id=%s AND lease_token=%s AND published_at IS NULL AND lease_expires_at>clock_timestamp()",
                    (job["company_id"], job["id"], job["claim"]),
                ).rowcount
                != 1
            ):
                raise StaleJob()

    def model_checkpoint(self, conn, job, version, step):
        self.context(conn, job)
        conn.execute(
            "SELECT app.assert_checkpoint(%s,%s,%s,%s)",
            (job["session_id"], version, job["step_id"], step["fence"]),
        )
