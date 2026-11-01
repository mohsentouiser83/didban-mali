#!/usr/bin/env python3
"""Consistent database + private originals backup; does not perform retention/deletion."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))


def run_compose(*arguments: str, **kwargs):
    return subprocess.run(["docker", "compose", "-f", str(ROOT / "docker-compose.yml"), *arguments], cwd=ROOT, check=True, **kwargs)


def sqlite_backup(output: Path) -> None:
    from sqlalchemy.engine import make_url
    from didban.config import settings

    url = make_url(settings.database_url)
    if url.drivername != "sqlite" or not url.database or url.database == ":memory:":
        raise ValueError("SQLite mode requires a file-backed SQLite database")
    source_path = Path(url.database).resolve()
    if not source_path.is_file():
        raise FileNotFoundError("Database does not exist")
    # Lock out writers for the entire database/files snapshot. A second connection
    # performs the SQLite online backup API while the guard holds the write lease.
    with sqlite3.connect(source_path, timeout=30) as guard:
        guard.execute("BEGIN IMMEDIATE")
        try:
            with sqlite3.connect(source_path) as source, sqlite3.connect(output / "database.sqlite3") as target:
                source.backup(target)
            shutil.copytree(settings.storage, output / "private", symlinks=False)
        finally:
            guard.rollback()


def compose_backup(output: Path) -> None:
    running = run_compose("ps", "--services", "--status", "running", capture_output=True, text=True).stdout.splitlines()
    quiesce = [name for name in ("api", "worker") if name in running]
    if quiesce:
        run_compose("stop", *quiesce)
    try:
        with (output / "database.sql").open("wb") as target:
            run_compose("exec", "-T", "postgres", "pg_dump", "--username", "didban_migration_admin", "--dbname", "didban_fresh", "--no-owner", "--no-privileges", stdout=target)
        with (output / "private.tar.gz").open("wb") as target:
            run_compose("run", "--rm", "--no-deps", "-T", "api", "tar", "-czf", "-", "-C", "/app/var/private", ".", stdout=target)
    finally:
        if quiesce:
            run_compose("start", *quiesce)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("sqlite", "compose"), required=True)
    parser.add_argument("--output", type=Path, required=True, help="New private directory outside this repository")
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents:
        parser.error("Choose an output directory outside this repository")
    os.umask(0o077)
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    try:
        (sqlite_backup if args.mode == "sqlite" else compose_backup)(output)
        if (ROOT / ".env").is_file():
            shutil.copy2(ROOT / ".env", output / "installation.env")
            (output / "installation.env").chmod(0o600)
        files = [{"path": str(file.relative_to(output)), "bytes": file.stat().st_size,
                  "sha256": hashlib.file_digest(file.open("rb"), "sha256").hexdigest()}
                 for file in sorted(output.rglob("*")) if file.is_file()]
        manifest = {"schema": "didban-backup-1", "created_at": datetime.now(timezone.utc).isoformat(), "mode": args.mode,
                    "files": files, "retention_performed": False,
                    "restore_validation": "Not performed by backup creation; verify in an isolated installation"}
        (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(f"Backup completed: {output}")
    except Exception:
        # An incomplete backup is retained and explicitly marked; original data is untouched.
        (output / "INCOMPLETE").write_text("Backup failed; do not restore this directory.\n")
        raise


if __name__ == "__main__":
    main()
