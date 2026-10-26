"""PostgreSQL-version-matched streaming archive commands, with suppressed output."""

from __future__ import annotations
from pathlib import Path
import subprocess


def dump(
    container: str,
    target: Path,
    *,
    database: str | None = None,
    user: str | None = None,
):
    command = ["docker", "exec", container]
    if database is None:
        command += [
            "sh",
            "-c",
            'exec pg_dump -Fc --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
        ]
    else:
        command += [
            "pg_dump",
            "-Fc",
            "--no-owner",
            "--username=" + str(user),
            "--dbname=" + database,
        ]
    with target.open("wb") as output:
        result = subprocess.run(
            command, stdout=output, stderr=subprocess.PIPE, timeout=1800
        )
    if result.returncode:
        raise RuntimeError("Database archive failed; database output suppressed.")


def recover(
    container: str,
    source: Path,
    *,
    database: str | None = None,
    user: str | None = None,
):
    command = ["docker", "exec", "-i", container]
    if database is None:
        command += [
            "sh",
            "-c",
            'exec pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
        ]
    else:
        command += [
            "pg_restore",
            "--exit-on-error",
            "--no-owner",
            "--username=" + str(user),
            "--dbname=" + database,
        ]
    with source.open("rb") as incoming:
        result = subprocess.run(
            command,
            stdin=incoming,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=1800,
        )
    if result.returncode:
        raise RuntimeError("Database restore failed; database output suppressed.")
