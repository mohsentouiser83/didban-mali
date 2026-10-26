"""Durable physical cleanup only after an authorized, dependency-free DB removal."""

from __future__ import annotations
from uuid import uuid4
from ..adapters.private_files import PrivateFiles
from .preparation_worker import PreparationWorker


class SourceCleanupWorker(PreparationWorker):
    def run_once(self) -> bool:
        claim = uuid4()
        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_source_deletion(%s) AS job", (claim,)
            ).fetchone()["job"]
        if not job:
            return False
        path = PrivateFiles(self.settings.storage_root, 1).path(job["object_key"])
        # Refuse a redirected company directory; no arbitrary or client paths accepted.
        if path.parent.is_symlink() or not path.resolve().is_relative_to(
            self.settings.storage_root.resolve()
        ):
            return False
        try:
            path.unlink(missing_ok=True)
        except OSError:
            return False
        with self.connection() as conn:
            conn.execute("SELECT app.finish_source_deletion(%s,%s)", (job["id"], claim))
        return True
