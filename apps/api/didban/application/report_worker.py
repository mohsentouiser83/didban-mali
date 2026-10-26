"""Durable leased export rendering with immutable publish and fenced completion."""

from __future__ import annotations
import hashlib
import logging
import os
from psycopg.errors import SerializationFailure
from uuid import uuid4
from ..adapters.report_rendering import render
from ..config import ROOT
from ..domain.reports import digest
from ..infrastructure.reports import complete_report_session
from .preparation_worker import PreparationWorker, StaleJob

LOGGER = logging.getLogger("didban.exports")


class ReportWorker(PreparationWorker):
    def run_once(self) -> bool:
        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_export_job(%s) AS job", (uuid4(),)
            ).fetchone()["job"]
            if not job:
                return False
            target = None
            try:
                with conn.transaction():
                    self.context(conn, job)
                    report = conn.execute(
                        "SELECT * FROM app.report_snapshots WHERE company_id=%s AND id=%s",
                        (job["company_id"], job["report_id"]),
                    ).fetchone()
                    if (
                        not report
                        or digest(report["content"]) != report["content_hash"]
                    ):
                        raise StaleJob()
                    content = report["content"] | {
                        "_report": {
                            "id": str(report["id"]),
                            "content_hash": report["content_hash"],
                            "revision_number": report["revision_number"],
                        }
                    }
                data = render(job["format"], content, ROOT / "assets/fonts")
                object_key = job["company_id"].replace("-", "") + "/" + uuid4().hex
                target = self.storage.path(object_key)
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "wb") as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
                with conn.transaction():
                    self.context(conn, job)
                    saved_hash = conn.execute(
                        "SELECT app.assert_export_checkpoint(%s,%s) AS hash",
                        (job["id"], job["claim"]),
                    ).fetchone()["hash"]
                    if saved_hash != report["content_hash"]:
                        raise StaleJob()
                    updated = conn.execute(
                        "UPDATE app.export_jobs SET status='ready',object_key=%s,sha256=%s,byte_size=%s,lease_token=NULL,lease_expires_at=NULL,error_code=NULL,row_version=row_version+1 WHERE company_id=%s AND id=%s AND lease_token=%s AND lease_expires_at>clock_timestamp()",
                        (
                            object_key,
                            hashlib.sha256(data).hexdigest(),
                            len(data),
                            job["company_id"],
                            job["id"],
                            job["claim"],
                        ),
                    )
                    if updated.rowcount != 1:
                        raise StaleJob()
                    complete_report_session(conn, job["company_id"], job["report_id"])
                target = None
            except Exception as error:
                with conn.transaction():
                    self.context(conn, job)
                    if conn.execute(
                        "SELECT app.can_operate(%s) AS allowed", (job["company_id"],)
                    ).fetchone()["allowed"]:
                        # Only the current lease may fail/reset its job. A stale
                        # renderer never overwrites a successful later attempt.
                        conn.execute(
                            "UPDATE app.export_jobs SET status=%s,error_code=%s,lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE company_id=%s AND id=%s AND lease_token=%s AND status='running'",
                            (
                                "pending"
                                if isinstance(error, (StaleJob, SerializationFailure))
                                else "failed",
                                None
                                if isinstance(error, (StaleJob, SerializationFailure))
                                else "export_render_failed",
                                job["company_id"],
                                job["id"],
                                job["claim"],
                            ),
                        )
                LOGGER.warning(
                    "export_render_retry export_id=%s type=%s",
                    job["id"],
                    type(error).__name__,
                )
            finally:
                if target:
                    try:
                        target.unlink(missing_ok=True)
                    except OSError:
                        LOGGER.warning("export_cleanup_failed export_id=%s", job["id"])
            return True
