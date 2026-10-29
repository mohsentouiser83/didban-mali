"""Encrypted snapshot of an EXISTING localhost installation; never initializes it.

For an upgrade, hold restart_local.installation_lock() around capture_locked and
all subsequent upgrade/restart work. This prevents the watchdog from restarting
writers between snapshot and migration. This module never restarts services.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import tempfile
import time

import psycopg
from psycopg import sql

from backup_bundle import decrypt, digest, encrypt, pack, unpack
from database_archive import dump
from restart_local import ROOT, installation_lock, owned_process


def private_file(path: Path) -> bytes:
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        info = os.fstat(source.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or stat.S_IMODE(info.st_mode) != 0o600
            or info.st_uid != os.getuid()
        ):
            raise ValueError("Expected an owned private regular file (0600).")
        return source.read()


def command(arguments: list[str], output=None) -> bytes:
    result = subprocess.run(
        arguments,
        stdout=output or subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=1800,
    )
    if result.returncode:
        raise RuntimeError("Backup command failed; private output suppressed.")
    return result.stdout


def inspect_existing(state: dict, expected_id: str) -> dict:
    if state.get("mode") != "clean_local" or not re.fullmatch(
        r"didban-local-fresh-[a-z0-9-]+", state.get("container", "")
    ):
        raise ValueError("An existing persistent local installation is required.")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_id):
        raise ValueError("Explicit full existing container ID required.")
    info = json.loads(command(["docker", "inspect", state["container"]]))[0]
    if (
        info["Id"] != expected_id
        or info["Name"] != "/" + state["container"]
        or not info["State"]["Running"]
    ):
        raise ValueError("Existing container ownership or running state mismatch.")
    volumes = [
        m
        for m in info["Mounts"]
        if m["Type"] == "volume"
        and m["Destination"] in ("/var/lib/postgresql/data", "/var/lib/postgresql")
    ]
    if (
        len(volumes) != 1
        or not state.get("volume")
        or volumes[0]["Name"] != state["volume"]
    ):
        raise ValueError("Existing database volume ownership mismatch.")
    return info


def stop_owned(state: dict, quiesce: bool) -> list[int]:
    pids = state.get("pids")
    if (
        not isinstance(pids, list)
        or any(type(pid) is not int or pid <= 1 for pid in pids)
        or len(set(pids)) != len(pids)
    ):
        raise ValueError("Invalid recorded process ownership.")
    # Validate EVERY PID before stopping ANY process. Unknown/reused PIDs abort.
    active = [pid for pid in pids if owned_process(pid)]
    if active and not quiesce:
        raise ValueError("Owned services must be quiesced explicitly.")
    for pid in active:
        if owned_process(pid):
            try:
                os.killpg(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 30
    while any(owned_process(pid) for pid in active):
        if time.monotonic() >= deadline:
            raise RuntimeError(
                "Owned services did not stop gracefully; no forced kill."
            )
        time.sleep(0.1)
    return active


def tree_hashes(root: Path) -> dict[str, str]:
    result = {}
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Snapshot source must be a regular directory.")
    for item in root.rglob("*"):
        mode = item.lstat().st_mode
        if stat.S_ISLNK(mode) or not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):
            raise ValueError("Snapshot source contains a link or special file.")
        if stat.S_ISREG(mode):
            result[item.relative_to(root).as_posix()] = digest(item)
    return result


def assert_quiesced(conn, pids: list[int]) -> None:
    if any(owned_process(pid) for pid in pids):
        raise RuntimeError("A recorded writer restarted during backup.")
    count = conn.execute(
        "SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend'"
    ).fetchone()[0]
    if count:
        raise RuntimeError("Another database client is connected; backup refused.")


@contextmanager
def database_snapshot(info: dict, pids: list[int]):
    values = dict(item.split("=", 1) for item in info["Config"]["Env"] if "=" in item)
    ports = info["NetworkSettings"]["Ports"].get("5432/tcp") or []
    if not ports or any(p["HostIp"] not in ("127.0.0.1", "::1") for p in ports):
        raise ValueError("Existing database must be bound to localhost.")
    database = values.get("POSTGRES_DB", values.get("POSTGRES_USER", "postgres"))
    user = values.get("POSTGRES_USER", "postgres")
    with psycopg.connect(
        host=ports[0]["HostIp"],
        port=ports[0]["HostPort"],
        dbname=database,
        user=user,
        password=values["POSTGRES_PASSWORD"],
        connect_timeout=5,
        application_name="didban-local-backup",
    ) as conn:
        conn.execute("SET lock_timeout='30s'")
        conn.execute("SELECT pg_advisory_xact_lock(782409214)")
        assert_quiesced(conn, pids)
        tables = conn.execute(
            "SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','didban_meta') AND c.relkind IN ('r','p') ORDER BY 1,2"
        ).fetchall()
        if not tables:
            raise ValueError("Existing application schema is absent.")
        # SHARE permits pg_dump reads, while blocking row writes and schema changes.
        conn.execute(
            sql.SQL("LOCK TABLE {} IN SHARE MODE").format(
                sql.SQL(", ").join(sql.Identifier(*table) for table in tables)
            )
        )
        yield conn, database, user
        assert_quiesced(conn, pids)


def capture_locked(
    *,
    state_file: Path,
    container_id: str,
    target: Path,
    passphrase_file: Path,
    quiesce_owned: bool = False,
) -> dict:
    """Caller MUST hold installation_lock, including any later upgrade/restart.

    Stops only validated owned processes when explicitly requested. Failure leaves
    them stopped for operator recovery; never mutates state, DB, roles or budgets.
    """
    private = ROOT / ".local/local-runtime"
    if (
        state_file.absolute() != private / "state.json"
        or private.is_symlink()
        or private.resolve() != private
    ):
        raise ValueError("Explicit existing installation state file required.")
    password = private_file(passphrase_file).decode().rstrip("\r\n")
    if len(password) < 16:
        raise ValueError("Backup passphrase must contain at least 16 characters.")
    state_bytes = private_file(state_file)
    state = json.loads(state_bytes)
    if Path(state.get("storage_root", "")).absolute() != private / "objects":
        raise ValueError("Existing object storage ownership mismatch.")
    private_file(private / "application-secret")
    model = ROOT / ".env.model"
    model_bytes = private_file(model) if model.exists() or model.is_symlink() else None
    if target.exists() or target.is_symlink():
        raise ValueError("Backup target already exists; no overwrite permitted.")
    target = target.parent.resolve(strict=True) / target.name
    if target.is_relative_to(private):
        raise ValueError("Backup target must be outside the installation source.")
    info = inspect_existing(state, container_id)
    tree_hashes(private)  # Fail unsafe files before stopping any service.
    stopped = stop_owned(state, quiesce_owned)
    with tempfile.TemporaryDirectory(
        prefix=".didban-local-backup-", dir=target.parent
    ) as temporary:
        work = Path(temporary)
        payload = work / "payload"
        payload.mkdir(mode=0o700)
        with database_snapshot(info, state["pids"]) as (conn, database, user):
            before = tree_hashes(private)
            migrations = conn.execute(
                "SELECT name,sha256 FROM didban_meta.schema_migrations ORDER BY name"
            ).fetchall()
            refs = conn.execute(
                "SELECT object_key,sha256 FROM app.source_files UNION ALL SELECT object_key,sha256 FROM app.export_jobs WHERE status='ready'"
            ).fetchall()
            for key, expected in refs:
                if (
                    not re.fullmatch(r"[0-9a-f]{32}/[0-9a-f]{32}", key or "")
                    or before.get("objects/" + key) != expected
                ):
                    raise ValueError(
                        "Referenced original/export object absent or corrupted."
                    )
            dump(container_id, payload / "database.dump", database=database, user=user)
            with (payload / "globals.sql").open("wb") as output:
                command(
                    [
                        "docker",
                        "exec",
                        container_id,
                        "pg_dumpall",
                        "--globals-only",
                        "--username=" + user,
                        "--database=" + database,
                    ],
                    output,
                )
            shutil.copytree(private, payload / "private")
            if model_bytes is not None:
                (payload / "model.env").write_bytes(model_bytes)
            (payload / "container-inspect.json").write_text(json.dumps(info))
            source = payload / "source-migrations"
            source.mkdir()
            for name, expected in migrations:
                if (
                    not re.fullmatch(r"[0-9]{3}_[a-z0-9_]+\.sql", name)
                    or digest(ROOT / "database" / name) != expected
                ):
                    raise ValueError("Applied migration source is absent or differs.")
                shutil.copyfile(ROOT / "database" / name, source / name)
            if (
                before != tree_hashes(private)
                or before != tree_hashes(payload / "private")
                or state_file.read_bytes() != state_bytes
                or (model_bytes is not None and private_file(model) != model_bytes)
                or (model_bytes is None and model.exists())
            ):
                raise RuntimeError(
                    "Installation files changed during snapshot; backup refused."
                )
            (payload / "snapshot.json").write_text(
                json.dumps(
                    {
                        "format": "didban-local-1",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "quiesced": True,
                        "container_id": container_id,
                        "database": database,
                        "database_user": user,
                        "migrations": [list(row) for row in migrations],
                        "object_references": len(refs),
                        "model_configuration_present": model_bytes is not None,
                        "stopped_processes": stopped,
                        "restore_policy": "new isolated target only; never replay saved PIDs/watchdog state",
                    },
                    indent=2,
                )
            )
        for path in payload.rglob("*"):
            path.chmod(0o700 if path.is_dir() else 0o600)
        pack(payload, work / "payload.tar.gz")
        # Publish only after a full authenticated decrypt + manifest verification.
        encrypt(work / "payload.tar.gz", work / "encrypted.didban", password)
        decrypt(work / "encrypted.didban", work / "verified.tar.gz", password)
        unpack(work / "verified.tar.gz", work / "verified")
        if tree_hashes(payload) != tree_hashes(work / "verified"):
            raise RuntimeError("Encrypted snapshot verification failed.")
        os.link(work / "encrypted.didban", target)  # atomic no-replace publication
        with target.open("rb") as output:
            os.fsync(output.fileno())
        directory_fd = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    return {
        "status": "encrypted_local_backup_verified",
        "sha256": digest(target),
        "services_left_stopped": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-file", type=Path, required=True)
    parser.add_argument("--container-id", required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--passphrase-file", type=Path, required=True)
    parser.add_argument("--quiesce-owned", action="store_true")
    args = parser.parse_args()
    try:
        with installation_lock() as acquired:
            if not acquired:
                raise RuntimeError("Installation operation already active.")
            print(
                json.dumps(
                    capture_locked(
                        state_file=args.state_file,
                        container_id=args.container_id,
                        target=args.target,
                        passphrase_file=args.passphrase_file,
                        quiesce_owned=args.quiesce_owned,
                    )
                )
            )
    except Exception:
        raise SystemExit(
            "Local backup failed; private details suppressed. Services may remain stopped."
        ) from None


if __name__ == "__main__":
    main()
