"""Restore an authenticated localhost bundle into a NEW isolated recovery target.

Never stops, overwrites or switches the current installation. Recovered services
and watchdog remain stopped until a deliberate operator handover.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time

import psycopg

from backup_bundle import decrypt, digest, unpack
from backup_local import private_file, tree_hashes
from database_archive import recover
from installation_snapshot import POSTGRES_IMAGE
from restart_local import ROOT, model_environment

LABEL = "ir.didban.local-recovery"


def run(arguments: list[str], *, data: bytes | None = None, env=None) -> bytes:
    result = subprocess.run(
        arguments,
        input=data,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=1800,
    )
    if result.returncode:
        raise RuntimeError("Recovery command failed; private output suppressed.")
    return result.stdout


def new_destination(path: Path) -> Path:
    absolute = path.absolute()
    parent = absolute.parent.resolve(strict=True)
    destination = parent / absolute.name
    protected = [ROOT.resolve(), (ROOT.parent / "didban-mali").resolve()]
    if any(destination == p or destination.is_relative_to(p) for p in protected):
        raise ValueError("Recovery destination must be outside existing project roots.")
    if destination.exists() or destination.is_symlink():
        raise ValueError("Recovery requires a new destination; never overwrite.")
    return destination


def validate_payload(payload: Path) -> tuple[dict, dict, dict, str]:
    metadata = json.loads((payload / "snapshot.json").read_text())
    if (
        metadata.get("format") != "didban-local-1"
        or metadata.get("quiesced") is not True
        or metadata.get("database") != "postgres"
        or metadata.get("database_user") != "postgres"
    ):
        raise ValueError("Unsupported or non-quiesced local installation bundle.")
    tree_hashes(payload)
    private = payload / "private"
    state = json.loads(private_file(private / "state.json"))
    private_file(private / "application-secret")
    if state.get("mode") != "clean_local":
        raise ValueError("Unsupported installation state.")
    if (
        metadata.get("model_configuration_present")
        is not (payload / "model.env").exists()
    ):
        raise ValueError("Model configuration presence differs from snapshot.")
    if (payload / "model.env").exists():
        model_environment(payload / "model.env")
    applied = metadata.get("migrations")
    if not isinstance(applied, list):
        raise ValueError("Missing applied migration manifest.")
    for name, expected in applied:
        if (
            not re.fullmatch(r"[0-9]{3}_[a-z0-9_]+\.sql", name)
            or not re.fullmatch(r"[a-f0-9]{64}", expected)
            or digest(payload / "source-migrations" / name) != expected
            or not (ROOT / "database" / name).is_file()
            or digest(ROOT / "database" / name) != expected
        ):
            raise ValueError("Recovery code and applied migration checksums differ.")
    with (payload / "database.dump").open("rb") as archive:
        archive_header = archive.read(5)
    if archive_header != b"PGDMP":
        raise ValueError("Expected a PostgreSQL custom archive.")
    info = json.loads((payload / "container-inspect.json").read_text())
    values = dict(v.split("=", 1) for v in info["Config"]["Env"] if "=" in v)
    password = values.get("POSTGRES_PASSWORD")
    if not isinstance(password, str) or not password:
        raise ValueError("Original local database credential is absent.")
    if values.get("POSTGRES_USER", "postgres") != "postgres":
        raise ValueError("Unsupported original database administrator.")
    globals_sql = (payload / "globals.sql").read_text()
    # pg_dumpall emits the bootstrap role too. Keep its ALTER attributes/password,
    # but do not attempt to recreate the one role already in the new cluster.
    if globals_sql.splitlines().count("CREATE ROLE postgres;") != 1:
        raise ValueError("Expected exactly one original bootstrap role declaration.")
    globals_sql = (
        "\n".join(
            line for line in globals_sql.splitlines() if line != "CREATE ROLE postgres;"
        )
        + "\n"
    )
    return metadata, state, values, globals_sql


def cleanup_failed_recovery(
    destination: Path,
    name: str,
    volume: str,
    container_created: bool,
    volume_created: bool,
) -> None:
    """A Docker outage must never prevent private plaintext cleanup."""
    failures = []
    commands = []
    if container_created:
        commands.append(["docker", "rm", "-f", name])
    if volume_created:
        commands.append(["docker", "volume", "rm", volume])
    try:
        for command in commands:
            try:
                run(command)
            except Exception:
                failures.append(True)
    finally:
        shutil.rmtree(destination)
    if failures:
        raise RuntimeError(
            "Private extraction removed; labelled recovery resources require manual cleanup."
        ) from None


def restore_new(*, bundle: Path, destination: Path, passphrase_file: Path) -> dict:
    destination = new_destination(destination)
    password = private_file(passphrase_file).decode().rstrip("\r\n")
    if len(password) < 16:
        raise ValueError("Recovery passphrase must contain at least 16 characters.")
    destination.mkdir(mode=0o700)
    token = secrets.token_hex(12)
    name = "didban-local-fresh-recovery-" + token
    volume = "didban-local-recovery-" + token
    created_container = False
    created_volume = False
    try:
        with tempfile.TemporaryDirectory(prefix=".verify-", dir=destination) as temp:
            work = Path(temp)
            decrypt(bundle, work / "payload.tar.gz", password)
            unpack(work / "payload.tar.gz", work / "payload")
            payload = work / "payload"
            metadata, state, values, globals_sql = validate_payload(payload)
            # Reserve only random new resources. Never derive a target resource
            # name, volume, mount, image or executable from saved configuration.
            if run(["docker", "ps", "-aq", "--filter", "name=^/" + name + "$"]).strip():
                raise ValueError("Recovery container name is already in use.")
            if run(
                ["docker", "volume", "ls", "-q", "--filter", "name=^" + volume + "$"]
            ).strip():
                raise ValueError("Recovery volume name is already in use.")
            run(["docker", "volume", "create", "--label", LABEL + "=" + token, volume])
            created_volume = True
            container_id = (
                run(
                    [
                        "docker",
                        "run",
                        "-d",
                        "--name",
                        name,
                        "--label",
                        LABEL + "=" + token,
                        "-e",
                        "POSTGRES_PASSWORD",
                        "-p",
                        "127.0.0.1::5432",
                        "--mount",
                        "type=volume,source=" + volume + ",target=/var/lib/postgresql",
                        POSTGRES_IMAGE,
                    ],
                    env=dict(os.environ, POSTGRES_PASSWORD=values["POSTGRES_PASSWORD"]),
                )
                .decode()
                .strip()
            )
            created_container = True
            info = json.loads(run(["docker", "inspect", container_id]))[0]
            ports = info["NetworkSettings"]["Ports"]["5432/tcp"]
            if len(ports) != 1 or ports[0]["HostIp"] != "127.0.0.1":
                raise ValueError("Recovery database must be localhost-only.")
            admin = psycopg.conninfo.make_conninfo(
                host="127.0.0.1",
                port=ports[0]["HostPort"],
                dbname="postgres",
                user="postgres",
                password=values["POSTGRES_PASSWORD"],
                connect_timeout=2,
            )
            for attempt in range(60):
                try:
                    with psycopg.connect(admin):
                        break
                except psycopg.OperationalError:
                    if attempt == 59:
                        raise RuntimeError(
                            "New recovery database did not become ready."
                        ) from None
                    time.sleep(0.25)
            run(
                [
                    "docker",
                    "exec",
                    "-i",
                    container_id,
                    "psql",
                    "-X",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "--username=postgres",
                    "--dbname=postgres",
                ],
                data=globals_sql.encode(),
            )
            recover(
                container_id,
                payload / "database.dump",
                database="postgres",
                user="postgres",
            )
            with psycopg.connect(admin) as conn:
                migrations = conn.execute(
                    "SELECT name,sha256 FROM didban_meta.schema_migrations ORDER BY name"
                ).fetchall()
                if [list(row) for row in migrations] != metadata["migrations"]:
                    raise ValueError("Restored migration manifest differs.")
                references = conn.execute(
                    "SELECT object_key,sha256 FROM app.source_files UNION ALL SELECT object_key,sha256 FROM app.export_jobs WHERE status='ready'"
                ).fetchall()
                if len(references) != metadata["object_references"]:
                    raise ValueError("Restored object reference count differs.")
                for key, expected in references:
                    if (
                        not re.fullmatch(r"[a-f0-9]{32}/[a-f0-9]{32}", key or "")
                        or digest(payload / "private/objects" / key) != expected
                    ):
                        raise ValueError(
                            "Restored original/export object is missing or corrupted."
                        )
                runtime = conn.execute(
                    "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('ui_app','ui_identity','ui_worker') ORDER BY rolname"
                ).fetchall()
                if len(runtime) != 3 or any(row[1] or row[2] for row in runtime):
                    raise ValueError("Restored runtime role boundaries are invalid.")
            private = destination / ".local/local-runtime"
            private.parent.mkdir(mode=0o700)
            shutil.copytree(payload / "private", private)
            original_hashes = tree_hashes(payload / "private")
            if tree_hashes(private) != original_hashes:
                raise ValueError("Restored private files differ.")
            shutil.copyfile(
                payload / "private/state.json", destination / "original-state.json"
            )
            if (payload / "model.env").exists():
                shutil.copyfile(payload / "model.env", destination / ".env.model")
            state.update(
                container=name,
                volume=volume,
                pids=[],
                storage_root=str(private / "objects"),
            )
            (private / "state.json").write_text(json.dumps(state, indent=2) + "\n")
            # Never restore the previous host's PID ownership, lock or watchdog
            # health/recovery commands. Their bytes remain inside the backup.
            for stale in ("restart.lock", "watchdog.json", "watchdog-state.json"):
                (private / stale).unlink(missing_ok=True)
            report = {
                "status": "local_bundle_restored_integrity_verified",
                "container": name,
                "volume": volume,
                "verified_migrations": len(migrations),
                "verified_referenced_objects": len(references),
                "application_services_started": False,
                "watchdog_installed": False,
                "saved_processes_replayed": False,
                "source_bundle_sha256": digest(bundle),
                "next_action": "Use a matching fresh application checkout at this destination, build dependencies and web, then explicitly run its restart_local.py. Do not overwrite or switch the existing installation. Review ports before handover.",
            }
            (destination / "restore-validation.json").write_text(
                json.dumps(report, indent=2) + "\n"
            )
            for path in destination.rglob("*"):
                path.chmod(0o700 if path.is_dir() else 0o600)
            return report
    except BaseException:
        # Clean up only resources allocated by THIS invocation; never saved IDs.
        cleanup_failed_recovery(
            destination, name, volume, created_container, created_volume
        )
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--passphrase-file", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(restore_new(**vars(args))))
    except Exception:
        raise SystemExit(
            "Local recovery failed; private details suppressed. Existing installation unchanged. Labelled recovery resources may require cleanup if Docker is unavailable."
        ) from None


if __name__ == "__main__":
    main()
