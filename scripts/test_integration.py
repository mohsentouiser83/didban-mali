"""Run backend tests with disposable database, queue, API, worker and upload bucket."""

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import FrameType
from typing import NoReturn
from uuid import uuid4

import httpx
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ["docker", "compose"]


def run(*args: str, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        cwd=ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout.strip() if capture else ""


def port(container: str, internal: int) -> int:
    return int(
        run("docker", "port", container, str(internal), capture=True)
        .splitlines()[0]
        .rsplit(":", 1)[1]
    )


def interrupt(_signum: int, _frame: FrameType | None) -> NoReturn:
    raise KeyboardInterrupt


def main() -> int:
    suffix = uuid4().hex[:12]
    database = f"didban_test_{suffix}"
    bucket = f"didban-test-{suffix}"
    containers = {
        kind: f"didban-test-{kind}-{suffix}" for kind in ("redis", "api", "worker")
    }
    created_database = False
    created_bucket = False
    with tempfile.TemporaryDirectory(prefix="didban-integration-") as temporary:

        def env_file(name: str, values: dict[str, str]) -> str:
            path = Path(temporary) / name
            path.touch(mode=0o600)
            path.write_text(
                "".join(f"{key}={value}\n" for key, value in values.items())
            )
            return str(path)

        def compose_run(service: str, environment: str, *args: str) -> None:
            run(
                *COMPOSE,
                "run",
                "--rm",
                "--no-deps",
                "--env-from-file",
                environment,
                service,
                *args,
            )

        try:
            print(
                "Preparing shared infrastructure and current backend images", flush=True
            )
            run(*COMPOSE, "up", "-d", "--wait", "postgres", "minio", "clamav")
            run(*COMPOSE, "build", "api", "worker", "migrate")
            config = json.loads(
                run(*COMPOSE, "config", "--format", "json", capture=True)
            )
            services = config["services"]
            admin_url = make_url(
                services["migrate"]["environment"]["DATABASE_URL"]
            ).set(database=database)
            app_url = make_url(services["api"]["environment"]["DATABASE_URL"]).set(
                database=database
            )
            admin_env = env_file(
                "admin.env",
                {"DATABASE_URL": admin_url.render_as_string(hide_password=False)},
            )
            runtime = {
                "DATABASE_URL": app_url.render_as_string(hide_password=False),
                "REDIS_URL": f"redis://{containers['redis']}:6379/0",
                "CELERY_BROKER_URL": f"redis://{containers['redis']}:6379/1",
                "CELERY_RESULT_BACKEND": f"redis://{containers['redis']}:6379/2",
                "MINIO_BUCKET": bucket,
                "DISABLE_RATE_LIMIT": "1",
            }
            runtime_env = env_file("runtime.env", runtime)
            run(
                *COMPOSE,
                "exec",
                "-T",
                "postgres",
                "sh",
                "-c",
                'createdb -U "$POSTGRES_USER" "$1"',
                "sh",
                database,
            )
            created_database = True
            compose_run("migrate", admin_env)
            # The inherited Redis data volume is unused: this process stores no files.
            run(
                *COMPOSE,
                "run",
                "--rm",
                "--no-deps",
                "-d",
                "--name",
                containers["redis"],
                "-p",
                "127.0.0.1::6379",
                "redis",
                "redis-server",
                "--save",
                "",
                "--appendonly",
                "no",
                "--dir",
                "/tmp",
            )
            compose_run(
                "api",
                runtime_env,
                "python",
                "-c",
                "from app.imports.storage import get_storage; from app.core.config import settings; "
                "get_storage().client.create_bucket(Bucket=settings.minio_bucket)",
            )
            created_bucket = True
            for service in ("worker", "api"):
                args = [
                    *COMPOSE,
                    "run",
                    "--rm",
                    "--no-deps",
                    "-d",
                    "--name",
                    containers[service],
                    "--env-from-file",
                    runtime_env,
                ]
                if service == "api":
                    args += ["-p", "127.0.0.1::8000"]
                run(*args, service)
            api_url = f"http://127.0.0.1:{port(containers['api'], 8000)}/api/v1"
            deadline = time.monotonic() + 120
            with httpx.Client(timeout=2) as client:
                while True:
                    try:
                        if client.get(api_url + "/health/ready").is_success:
                            break
                    except httpx.HTTPError:
                        pass
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Isolated API did not become ready")
                    time.sleep(1)
            run(
                "docker",
                "exec",
                containers["worker"],
                "celery",
                "-A",
                "app.worker.celery_app",
                "inspect",
                "ping",
                "--timeout=10",
            )
            pg_port = int(
                run(*COMPOSE, "port", "postgres", "5432", capture=True)
                .splitlines()[0]
                .rsplit(":", 1)[1]
            )
            host_admin = admin_url.set(host="127.0.0.1", port=pg_port).render_as_string(
                hide_password=False
            )
            host_app_url = app_url.set(host="127.0.0.1", port=pg_port)
            host_app = host_app_url.render_as_string(hide_password=False)
            redis_port = port(containers["redis"], 6379)
            environment = {
                **os.environ,
                "RUN_INTEGRATION_TESTS": "1",
                "INTEGRATION_API_URL": api_url,
                "DATABASE_URL": host_app,
                "INTEGRATION_DATABASE_URL": host_app_url.set(
                    drivername="postgresql"
                ).render_as_string(hide_password=False),
                "ACCOUNTING_TEST_DATABASE_URL": host_admin,
                "PERIODS_TEST_ADMIN_URL": host_admin,
                "PERIODS_TEST_APP_URL": host_app,
                "REDIS_URL": f"redis://127.0.0.1:{redis_port}/0",
                "CELERY_BROKER_URL": f"redis://127.0.0.1:{redis_port}/1",
                "CELERY_RESULT_BACKEND": f"redis://127.0.0.1:{redis_port}/2",
                "MINIO_BUCKET": bucket,
            }
            print("Running backend tests against the isolated stack", flush=True)
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pytest",
                    "-c",
                    "apps/api/pyproject.toml",
                    *(sys.argv[1:] or ["apps/api/tests"]),
                    "-rs",
                ],
                cwd=ROOT,
                env=environment,
            )
            if result.returncode:
                for service in ("api", "worker"):
                    run("docker", "logs", "--tail=80", containers[service])
            return result.returncode
        finally:
            print("Removing disposable test resources", flush=True)
            for service in ("api", "worker", "redis"):
                subprocess.run(
                    ["docker", "rm", "-f", containers[service]], capture_output=True
                )
            try:
                if created_bucket:
                    compose_run(
                        "api",
                        runtime_env,
                        "python",
                        "-c",
                        "from app.imports.storage import get_storage; from app.core.config import settings; "
                        "c=get_storage().client; b=settings.minio_bucket; "
                        "[c.delete_object(Bucket=b, Key=o['Key']) for page in "
                        "c.get_paginator('list_objects_v2').paginate(Bucket=b) for o in page.get('Contents', [])]; "
                        "c.delete_bucket(Bucket=b)",
                    )
            finally:
                if created_database:
                    run(
                        *COMPOSE,
                        "exec",
                        "-T",
                        "postgres",
                        "sh",
                        "-c",
                        'dropdb --force -U "$POSTGRES_USER" "$1"',
                        "sh",
                        database,
                    )


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, interrupt)
    raise SystemExit(main())
