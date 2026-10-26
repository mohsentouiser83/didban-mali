"""Encrypted offline backup and restore into a NEW isolated Compose project only.

No command accepts an existing restore target. Production replacement remains an
explicit operator handover after verifying the newly restored installation.
"""

from __future__ import annotations
import argparse
from getpass import getpass
import json
from pathlib import Path
import secrets
import shutil
import tempfile

from cryptography.exceptions import InvalidTag
from psycopg import sql
from backup_bundle import encrypt, decrypt, pack, unpack, digest
from installation_snapshot import ComposeInstallation, run
from database_archive import recover


def backup(project: str, env_file: Path, target: Path, password: str):
    if target.exists():
        raise ValueError("Backup output already exists; it will not be overwritten.")
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    installation = ComposeInstallation(project, env_file)
    with tempfile.TemporaryDirectory(
        prefix=".didban-backup-", dir=target.parent
    ) as temporary:
        root = Path(temporary)
        installation.capture(root / "payload")
        pack(root / "payload", root / "payload.tar.gz")
        encrypt(root / "payload.tar.gz", target, password)
    return {"status": "encrypted_backup_created", "sha256": digest(target)}


def prepare_roles(installation: ComposeInstallation):
    configuration = json.loads(
        run(installation.command + ["config", "--format", "json"])
    )
    api = configuration["services"]["api"]["environment"]
    worker = configuration["services"]["worker"]["environment"]
    postgres = configuration["services"]["postgres"]["environment"]
    groups = ("didban_app", "didban_identity", "didban_worker")
    statements = [
        sql.SQL(
            "CREATE ROLE {} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;"
        ).format(sql.Identifier(g))
        for g in groups
    ]
    logins = [
        (api["DIDBAN_APP_DB_USER"], api["DIDBAN_APP_DB_PASSWORD"], groups[0]),
        (api["DIDBAN_IDENTITY_DB_USER"], api["DIDBAN_IDENTITY_DB_PASSWORD"], groups[1]),
        (
            worker["DIDBAN_WORKER_DB_USER"],
            worker["DIDBAN_WORKER_DB_PASSWORD"],
            groups[2],
        ),
    ]
    names = [item[0] for item in logins]
    if len(set(names)) != 3 or set(names) & {
        *groups,
        postgres["POSTGRES_USER"],
        "postgres",
    }:
        raise ValueError("Runtime role boundaries are invalid.")
    for name, password, group in logins:
        statements.append(
            sql.SQL(
                "CREATE ROLE {} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD {};"
            ).format(sql.Identifier(name), sql.Literal(password))
        )
        statements.append(
            sql.SQL("GRANT {} TO {};").format(
                sql.Identifier(group), sql.Identifier(name)
            )
        )
        if group == "didban_worker":
            statements.append(
                sql.SQL("GRANT didban_app TO {};").format(sql.Identifier(name))
            )
    installation.psql("\n".join(statement.as_string() for statement in statements))


def restore(bundle: Path, destination: Path, password: str):
    if destination.exists():
        raise ValueError(
            "Restore destination must be a new directory; existing targets are forbidden."
        )
    destination.mkdir(mode=0o700, parents=True)
    project = "didban-restore-" + secrets.token_hex(8)
    installation = None
    resources_created = False
    try:
        with tempfile.TemporaryDirectory(
            prefix=".didban-restore-", dir=destination
        ) as temporary:
            root = Path(temporary)
            decrypt(bundle, root / "payload.tar.gz", password)
            unpack(root / "payload.tar.gz", root / "payload")
            payload = root / "payload"
            metadata = json.loads((payload / "snapshot.json").read_text())
            if metadata.get("format") != 1 or not metadata.get("quiesced"):
                raise ValueError(
                    "Backup was not made by the quiesced installation tool."
                )
            env_file = destination / "recovery.env"
            env_file.write_bytes((payload / "configuration.env").read_bytes())
            env_file.chmod(0o600)
            installation = ComposeInstallation(project, env_file)
            existing = run(
                [
                    "docker",
                    "ps",
                    "-aq",
                    "--filter",
                    "label=com.docker.compose.project=" + project,
                ]
            ).strip()
            volumes = run(
                [
                    "docker",
                    "volume",
                    "ls",
                    "-q",
                    "--filter",
                    "label=com.docker.compose.project=" + project,
                ]
            ).strip()
            if existing or volumes:
                raise ValueError("Restore project is not empty.")
            # Reuse the exact resolved source definition, not today's defaults.
            definition = destination / "recovery.compose.json"
            definition.write_bytes((payload / "definition.json").read_bytes())
            definition.chmod(0o600)
            if (payload / "configuration-bindings").exists():
                shutil.copytree(
                    payload / "configuration-bindings",
                    destination / "configuration-bindings",
                )
            installation.command = installation.command[:-2] + ["-f", str(definition)]
            resources_created = True  # Only after the empty-target ownership guard.
            run(
                installation.command
                + ["up", "-d", "--wait", "--no-deps", "postgres", "storage-init"]
            )
            prepare_roles(installation)
            pg = installation.container("postgres")
            recover(pg, payload / "database.dump")
            storage = installation.container("storage-init")
            run(["docker", "cp", str(payload / "private") + "/.", storage + ":/data/"])
            # docker cp does not preserve the source UID by default.
            run(
                installation.command
                + [
                    "run",
                    "--rm",
                    "--no-deps",
                    "-T",
                    "storage-init",
                    "python",
                    "-c",
                    "import os; [(os.chown(d,10001,10001),os.chmod(d,0o700),[(os.chown(os.path.join(d,f),10001,10001),os.chmod(os.path.join(d,f),0o600)) for f in fs]) for d,ds,fs in os.walk('/data/objects')]",
                ]
            )
            after = installation.metadata()
            for key in ("migrations", "table_counts", "runtime_version", "objects"):
                before_value, after_value = metadata[key], after[key]
                if key == "objects":
                    before_value = sorted(before_value, key=lambda x: x["key"])
                    after_value = sorted(after_value, key=lambda x: x["key"])
                if before_value != after_value:
                    raise ValueError("Restored database verification failed.")
            verified = root / "verified-private"
            run(["docker", "cp", storage + ":/data/.", str(verified)])
            for item in after["objects"]:
                if digest(verified / "objects" / item["key"]) != item["sha256"]:
                    raise ValueError(
                        "Restored original/export content verification failed."
                    )
            report = {
                "status": "restored_and_integrity_verified",
                "project": project,
                "runtime_version": after["runtime_version"],
                "verified_tables": len(after["table_counts"]),
                "verified_referenced_objects": len(after["objects"]),
                "application_services_started": False,
                "configuration": "recovery.env",
                "compose_definition": "recovery.compose.json",
                "next_action": "Review origin, HTTPS and unused ports; use this exact Compose project and override. Never bootstrap restored users again.",
            }
            result_file = destination / "restore-validation.json"
            result_file.write_text(json.dumps(report, indent=2) + "\n")
            result_file.chmod(0o600)
            return report
    except BaseException:
        if installation and resources_created:
            try:
                run(installation.command + ["down", "-v", "--remove-orphans"])
            except RuntimeError:
                pass
        (destination / "recovery.env").unlink(missing_ok=True)
        (destination / "recovery.compose.json").unlink(missing_ok=True)
        shutil.rmtree(destination / "configuration-bindings", ignore_errors=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="action", required=True)
    create = subs.add_parser("backup")
    create.add_argument("--project", required=True)
    create.add_argument("--env-file", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    recover = subs.add_parser("restore-new")
    recover.add_argument("--bundle", type=Path, required=True)
    recover.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    password = getpass("Backup passphrase (at least 16 characters): ")
    if args.action == "backup":
        if getpass("Repeat passphrase: ") != password:
            raise SystemExit("Passphrases do not match.")
        result = backup(args.project, args.env_file, args.output, password)
    else:
        result = restore(args.bundle, args.destination, password)
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except InvalidTag:
        raise SystemExit(
            "Backup authentication failed: incorrect passphrase or corrupted data."
        ) from None
    except (ValueError, RuntimeError) as error:
        raise SystemExit(str(error)) from None
