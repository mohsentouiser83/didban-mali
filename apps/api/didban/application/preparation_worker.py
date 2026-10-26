from __future__ import annotations
from contextlib import contextmanager
from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ..adapters.private_files import PrivateFiles
from ..adapters.scanner import ClamScanner
from ..adapters.table_inspector import TableInspector
from ..config import ROOT
from ..domain.intake import DependencyUnavailable, EncodingQuestion, PreparationFailure
from ..infrastructure.intake import IntakeRepository
from ..infrastructure.interpretation import schedule

LOGGER = logging.getLogger("didban.preparation")


@dataclass(frozen=True)
class WorkerSettings:
    dsn: str = field(repr=False)
    storage_root: Path = ROOT / ".local/private-files"
    scanner_host: str = "127.0.0.1"
    scanner_port: int = 3310

    @classmethod
    def from_env(cls):
        return cls(
            dsn=os.environ.get("DIDBAN_WORKER_DSN")
            or psycopg.conninfo.make_conninfo(
                host=os.environ.get("DIDBAN_DB_HOST", "postgres"),
                port=os.environ.get("DIDBAN_DB_PORT", "5432"),
                dbname=os.environ.get("DIDBAN_DB_NAME", "didban"),
                user=os.environ.get("DIDBAN_WORKER_DB_USER", "didban_worker_login"),
                password=os.environ["DIDBAN_WORKER_DB_PASSWORD"],
            ),
            storage_root=Path(
                os.environ.get(
                    "DIDBAN_STORAGE_ROOT", str(ROOT / ".local/private-files")
                )
            ),
            scanner_host=os.environ.get("DIDBAN_SCANNER_HOST", "127.0.0.1"),
            scanner_port=int(os.environ.get("DIDBAN_SCANNER_PORT", "3310")),
        )


class StaleJob(Exception):
    pass


class PreparationWorker:
    def __init__(self, settings: WorkerSettings, scanner=None, inspector=None):
        self.settings = settings
        self.scanner = scanner or ClamScanner(
            settings.scanner_host, settings.scanner_port
        )
        self.inspector = inspector
        self.storage = PrivateFiles(settings.storage_root, 20971520)
        with self.connection() as conn:
            role = conn.execute(
                "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,current_user=session_user AS direct,pg_has_role(current_user,'didban_worker','MEMBER') AS worker,pg_has_role(current_user,'didban_app','MEMBER') AS financial,pg_has_role(current_user,'didban_identity','MEMBER') AS identity FROM pg_roles WHERE rolname=current_user"
            ).fetchone()
            owns = conn.execute(
                "SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','didban_meta') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns"
            ).fetchone()["owns"]
            if (
                any(
                    role[k]
                    for k in (
                        "rolsuper",
                        "rolbypassrls",
                        "rolcreaterole",
                        "rolcreatedb",
                        "identity",
                    )
                )
                or owns
                or not all(role[k] for k in ("worker", "financial", "direct"))
            ):
                raise RuntimeError("Worker role boundary invalid")
            if (
                conn.execute("SELECT app.runtime_version() AS version").fetchone()[
                    "version"
                ]
                != 10
            ):
                raise RuntimeError("Run intake migrations first")

    @contextmanager
    def connection(self):
        with psycopg.connect(
            self.settings.dsn, row_factory=dict_row, autocommit=True
        ) as conn:
            yield conn

    @staticmethod
    def context(conn, job):
        conn.execute(
            "SELECT set_config('app.user_id',%s,true),set_config('app.company_id',%s,true),set_config('timezone','UTC',true),set_config('search_path','app,pg_catalog',true)",
            (job["actor_id"], job["company_id"]),
        )

    def run_once(self) -> bool:
        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_intake_job(%s) AS job", (uuid4(),)
            ).fetchone()["job"]
            if not job:
                return False
            try:
                with conn.transaction():
                    self.context(conn, job)
                    repo = IntakeRepository(conn)
                    session = repo.session(job["company_id"], job["session_id"], True)
                    if not session:
                        raise DependencyUnavailable("permission_revoked")
                    if session["status"] not in (
                        "sealed",
                        "processing",
                        "waiting_dependency",
                    ) or any(
                        i["required"]
                        and not i["resolved_at"]
                        and not i["superseded_at"]
                        for i in repo.issues(job["company_id"], job["session_id"])
                    ):
                        raise StaleJob()
                    step = conn.execute(
                        "UPDATE app.processing_steps SET status='running',dependency_code=NULL,fence=fence+1,lease_owner=%s,lease_expires_at=clock_timestamp()+interval '120 seconds' WHERE company_id=%s AND id=%s AND status NOT IN ('succeeded','limited','cancelled') RETURNING *",
                        (job["claim"], job["company_id"], job["step_id"]),
                    ).fetchone()
                    if not step:
                        raise StaleJob()
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='processing' WHERE company_id=%s AND id=%s",
                        (job["company_id"], job["session_id"]),
                    )
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
                    file = next(
                        f
                        for f in repo.files(job["company_id"], job["session_id"])
                        if str(f["id"]) == job["file_id"]
                    )
                    policy = conn.execute(
                        "SELECT parameters FROM app.policy_versions WHERE company_id=%s AND id=%s",
                        (job["company_id"], step["policy_id"]),
                    ).fetchone()["parameters"]
                    conn.execute(
                        "UPDATE app.session_files SET status='scanning' WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                        (job["company_id"], job["session_id"], job["file_id"]),
                    )
                    version = session["session_version"]
                    fence = step["fence"]
                engine = None
                summary = None
                error = None
                question = False
                try:
                    path = self.storage.path(file["object_key"])
                    engine = self.scanner.scan(path)
                    inspector = self.inspector or TableInspector(
                        policy["max_nonempty_rows"], policy["max_expanded_bytes"]
                    )
                    summary = inspector.inspect(
                        path, file["format"], file["preparation_settings"]
                    )
                except EncodingQuestion:
                    question = True
                except DependencyUnavailable:
                    raise
                except PreparationFailure as failure:
                    error = failure.code
                except FileNotFoundError:
                    raise DependencyUnavailable("storage_unavailable") from None
                self.finish(
                    conn,
                    job,
                    version,
                    fence,
                    attempt,
                    summary,
                    engine,
                    error,
                    question,
                    policy,
                )
            except DependencyUnavailable as failure:
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,%s)",
                    (job["id"], job["claim"], failure.code),
                )
            except StaleJob:
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,'barrier')",
                    (job["id"], job["claim"]),
                )
            except psycopg.Error as failure:
                reason = (
                    "permission_revoked" if failure.sqlstate == "42501" else "barrier"
                )
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,%s)",
                    (job["id"], job["claim"], reason),
                )
                LOGGER.warning(
                    "preparation_database_conflict step_id=%s sqlstate=%s",
                    job["step_id"],
                    failure.sqlstate,
                )
            except Exception as failure:
                # Content/provider exceptions never reach logs; leases still recover this job.
                conn.execute(
                    "SELECT app.defer_intake_job(%s,%s,'storage_unavailable')",
                    (job["id"], job["claim"]),
                )
                LOGGER.error(
                    "preparation_failure step_id=%s type=%s",
                    job["step_id"],
                    type(failure).__name__,
                )
            return True

    def finish(
        self,
        conn,
        job,
        version,
        fence,
        attempt,
        summary,
        engine,
        error,
        question,
        policy,
    ):
        with conn.transaction():
            self.context(conn, job)
            repo = IntakeRepository(conn)
            conn.execute(
                "SELECT app.assert_checkpoint(%s,%s,%s,%s)",
                (job["session_id"], version, job["step_id"], fence),
            )
            # Every effect below and the outbox acknowledgement share this fenced transaction.
            if summary:
                total = (
                    sum(
                        (f["preparation_summary"] or {}).get("nonempty_rows", 0)
                        for f in repo.files(job["company_id"], job["session_id"])
                        if str(f["id"]) != job["file_id"]
                    )
                    + summary["nonempty_rows"]
                )
                if total > policy["max_nonempty_rows"]:
                    error = "row_limit"
            conn.execute(
                "UPDATE app.source_files SET scan_status=%s,scan_engine=%s,scanned_at=clock_timestamp(),raw_row_count=coalesce(%s,raw_row_count) WHERE company_id=%s AND id=%s",
                (
                    "rejected" if error == "malware_detected" else "clean",
                    engine,
                    summary["nonempty_rows"] if summary else None,
                    job["company_id"],
                    job["file_id"],
                ),
            )
            conn.execute(
                "UPDATE app.session_files SET status=%s,preparation_summary=%s,error_code=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                (
                    "rejected" if error else "pending_interpretation",
                    Jsonb(summary) if summary else None,
                    error,
                    job["company_id"],
                    job["session_id"],
                    job["file_id"],
                ),
            )
            status = "failed" if error else "waiting_input" if question else "succeeded"
            conn.execute(
                "UPDATE app.processing_steps SET status=%s,completed_items=%s,lease_expires_at=NULL,checkpoint=%s WHERE company_id=%s AND id=%s",
                (
                    status,
                    0 if error or question else 1,
                    Jsonb({"file_id": job["file_id"], "error_code": error}),
                    job["company_id"],
                    job["step_id"],
                ),
            )
            conn.execute(
                "UPDATE app.step_attempts SET finished_at=clock_timestamp(),error_code=%s WHERE company_id=%s AND id=%s",
                (error, job["company_id"], attempt),
            )
            if question:
                original_name = conn.execute(
                    "SELECT original_name FROM app.source_files WHERE company_id=%s AND id=%s",
                    (job["company_id"], job["file_id"]),
                ).fetchone()["original_name"]
                issue = conn.execute(
                    """INSERT INTO app.processing_issues(company_id,session_id,code,root_key,question_fa,answer_kind,answer_constraints,opened_session_version)
                 VALUES(%s,%s,'csv_encoding',%s,%s,'choice',%s,%s) RETURNING id""",
                    (
                        job["company_id"],
                        job["session_id"],
                        "csv_encoding:" + job["file_id"],
                        f"کدگذاری فایل «{original_name}» چیست؟",
                        Jsonb(
                            {
                                "choices": ["windows-1256", "windows-1252"],
                                "allow_unknown": False,
                            }
                        ),
                        version,
                    ),
                ).fetchone()
                repo.notify(
                    job["company_id"],
                    job["actor_id"],
                    job["session_id"],
                    "برای ادامه آماده‌سازی، پاسخ شما لازم است.",
                    str(issue["id"]),
                )
            elif error:
                conn.execute(
                    "UPDATE app.processing_sessions SET status='failed',session_version=session_version+1 WHERE company_id=%s AND id=%s",
                    (job["company_id"], job["session_id"]),
                )
                repo.notify(
                    job["company_id"],
                    job["actor_id"],
                    job["session_id"],
                    "یکی از فایل‌های بسته نیاز به اصلاح دارد.",
                )
            else:
                steps = repo.steps(job["company_id"], job["session_id"])
                if all(step["status"] == "succeeded" for step in steps):
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='waiting_dependency',preparation_finished_at=clock_timestamp(),session_version=session_version+1 WHERE company_id=%s AND id=%s",
                        (job["company_id"], job["session_id"]),
                    )
                    repo.notify(
                        job["company_id"],
                        job["actor_id"],
                        job["session_id"],
                        "فایل‌ها آماده مرحله تفسیر هستند.",
                    )
                    if policy.get("auto_interpretation"):
                        for source in repo.files(job["company_id"], job["session_id"]):
                            schedule(
                                conn, job["company_id"], job["session_id"], source["id"]
                            )
                        conn.execute(
                            "UPDATE app.processing_sessions SET status='sealed' WHERE company_id=%s AND id=%s",
                            (job["company_id"], job["session_id"]),
                        )
            acknowledged = conn.execute(
                "UPDATE app.outbox_events SET published_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE id=%s AND company_id=%s AND lease_token=%s AND published_at IS NULL AND lease_expires_at>clock_timestamp()",
                (job["id"], job["company_id"], job["claim"]),
            ).rowcount
            if acknowledged != 1:
                raise StaleJob()
