"""Quiesced Compose snapshots. Commands never include credentials or log output."""

from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
import subprocess

from backup_bundle import digest
from database_archive import dump
from recovery_configuration import portable

ROOT = Path(__file__).resolve().parents[1]
POSTGRES_IMAGE = (
    "postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5"
)


def run(arguments, *, data=None, output=None):
    result = subprocess.run(
        arguments,
        input=data,
        stdout=output or subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=600,
    )
    if result.returncode:
        raise RuntimeError(
            "Installation operation failed; credentials and database output were suppressed."
        )
    return result.stdout


class ComposeInstallation:
    def __init__(self, project: str, env_file: Path):
        if not re.fullmatch(r"[a-z][a-z0-9-]{2,62}", project):
            raise ValueError("Explicit valid Compose project required.")
        self.project = project
        self.env_file = env_file.resolve(strict=True)
        if self.env_file.stat().st_mode & 0o077:
            raise ValueError("Environment file must be private (mode 600).")
        self.command = [
            "docker",
            "compose",
            "-p",
            project,
            "--env-file",
            str(self.env_file),
            "-f",
            str(ROOT / "infra/compose.yaml"),
        ]

    def containers(self, service: str) -> list[str]:
        return run(self.command + ["ps", "-a", "-q", service]).decode().split()

    def container(self, service: str) -> str:
        ids = self.containers(service)
        if len(ids) != 1:
            raise ValueError(f"Expected exactly one {service} container.")
        info = json.loads(run(["docker", "inspect", ids[0]]))[0]
        if info["Config"]["Labels"].get("com.docker.compose.project") != self.project:
            raise ValueError("Container ownership mismatch.")
        return ids[0]

    def psql(self, query: str):
        data = run(
            [
                "docker",
                "exec",
                "-i",
                self.container("postgres"),
                "sh",
                "-c",
                'exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
            ],
            data=query.encode(),
        )
        return data.decode().strip()

    @contextmanager
    def quiesced(self):
        before = (
            run(self.command + ["ps", "--status", "running", "--services"])
            .decode()
            .split()
        )
        running = [s for s in ("web", "api", "worker") if s in before]
        lock = None
        try:
            run(self.command + ["stop", "-t", "120", "web", "api", "worker"])
            # Hold the same lock as the forward-migration runner throughout the copy.
            lock = subprocess.Popen(
                [
                    "docker",
                    "exec",
                    "-i",
                    "-e",
                    "PGAPPNAME=didban-backup-lock",
                    self.container("postgres"),
                    "sh",
                    "-c",
                    'exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            lock.stdin.write(
                b"SET lock_timeout='30s'; SELECT pg_advisory_lock(782409214);\n\\echo DIDBAN_LOCKED\n"
            )
            lock.stdin.flush()
            for _ in range(3):
                if lock.stdout.readline().strip() == b"DIDBAN_LOCKED":
                    break
            else:
                raise RuntimeError("Could not acquire migration maintenance lock.")
            self.assert_quiesced()
            yield
            self.assert_quiesced()
        finally:
            if lock:
                lock.stdin.close()
                try:
                    lock.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    lock.kill()
                    lock.wait()
            if running:
                run(self.command + ["start", *running])

    def assert_quiesced(self):
        active = int(
            self.psql(
                "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                "AND pid<>pg_backend_pid() AND backend_type='client backend' "
                "AND application_name<>'didban-backup-lock';"
            )
        )
        if active:
            raise RuntimeError("Another database client is active; backup refused.")
        if any(
            s
            in run(self.command + ["ps", "--status", "running", "--services"])
            .decode()
            .split()
            for s in ("web", "api", "worker")
        ):
            raise RuntimeError("A writer restarted during backup; snapshot refused.")

    def metadata(self):
        tables = json.loads(
            self.psql(
                "SELECT coalesce(json_agg(table_name ORDER BY table_name),'[]') "
                "FROM information_schema.tables WHERE table_schema='app' AND table_type='BASE TABLE';"
            )
        )
        counts = {}
        for table in tables:
            if not re.fullmatch("[a-z_]+", table):
                raise ValueError("Unexpected application table name.")
            counts[table] = int(self.psql(f'SELECT count(*) FROM app."{table}";'))
        migrations = json.loads(
            self.psql(
                "SELECT json_agg(json_build_object('name',name,'sha256',sha256) "
                "ORDER BY name) FROM didban_meta.schema_migrations;"
            )
        )
        refs = json.loads(
            self.psql(
                "SELECT coalesce(json_agg(json_build_object('key',object_key,'sha256',sha256)),'[]') FROM ("
                "SELECT object_key,sha256 FROM app.source_files UNION ALL "
                "SELECT object_key,sha256 FROM app.export_jobs WHERE status='ready') r;"
            )
        )
        return {
            "table_counts": counts,
            "migrations": migrations,
            "objects": refs,
            "runtime_version": int(self.psql("SELECT app.runtime_version();")),
        }

    def capture(self, directory: Path):
        directory.mkdir(mode=0o700)
        api = self.container("api")
        info = json.loads(run(["docker", "inspect", api]))[0]
        applied_files = info["Config"]["Labels"].get(
            "com.docker.compose.project.config_files", ""
        )
        files = [Path(name) for name in applied_files.split(",") if name]
        if not files or any(
            not path.is_absolute() or not path.is_file() or path.is_symlink()
            for path in files
        ):
            raise ValueError(
                "Original Compose definitions are unavailable; backup refused."
            )
        self.command = self.command[:-2] + [
            part for path in files for part in ("-f", str(path))
        ]
        configuration = json.loads(run(self.command + ["config", "--format", "json"]))
        containers = {
            service: json.loads(run(["docker", "inspect", self.container(service)]))[0]
            for service in ("api", "worker", "postgres", "web")
        }
        definition = portable(configuration, containers, directory)
        image = containers["api"]["Image"]
        (directory / "definition.json").write_text(json.dumps(definition, indent=2))
        with self.quiesced():
            metadata = self.metadata()
            source_sql = directory / "source-migrations"
            run(["docker", "cp", api + ":/app/database/.", str(source_sql)])
            if {p.name for p in source_sql.glob("*.sql")} != {
                m["name"] for m in metadata["migrations"]
            }:
                raise ValueError("Application migration set and database differ.")
            for migration in metadata["migrations"]:
                path = source_sql / migration["name"]
                if not path.is_file() or digest(path) != migration["sha256"]:
                    raise ValueError(
                        "Application image and applied database migrations differ."
                    )
            dump(self.container("postgres"), directory / "database.dump")
            run(["docker", "cp", api + ":/data/.", str(directory / "private")])
            shutil.copyfile(self.env_file, directory / "configuration.env")
            for item in metadata["objects"]:
                if not re.fullmatch(r"[0-9a-f]{32}/[0-9a-f]{32}", item["key"] or ""):
                    raise ValueError("Unsafe stored object key.")
                target = directory / "private" / "objects" / item["key"]
                if (
                    not target.is_file()
                    or target.is_symlink()
                    or digest(target) != item["sha256"]
                ):
                    raise ValueError(
                        "A referenced original/export file is absent or corrupted."
                    )
            metadata.update(
                {
                    "format": 1,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "api_image_id": image,
                    "postgres_image": containers["postgres"]["Image"],
                    "source_project": self.project,
                    "quiesced": True,
                }
            )
            (directory / "snapshot.json").write_text(json.dumps(metadata, indent=2))
            for file in directory.rglob("*"):
                if file.is_file():
                    file.chmod(0o600)
            return metadata
