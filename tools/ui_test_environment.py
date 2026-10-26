"""Start/stop a local UI validation environment with synthetic data only.

Uses a fresh private PostgreSQL container and restricted API credentials. Secrets
remain in ignored .local files; no production .env/database is reused.
"""

from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import time

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.manage import migrate, bootstrap, provision_login
from didban.security import HASHER

PRIVATE = ROOT / ".local/ui-validation"
PASSWORD = "UiValidation-Only-426!"
IMAGE = (
    "postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5"
)


def stop():
    state = PRIVATE / "state.json"
    if not state.exists():
        return
    data = json.loads(state.read_text())
    for pid in data.get("pids", []):
        try:
            os.killpg(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    subprocess.run(["docker", "rm", "-f", "-v", data["container"]], capture_output=True)
    if data.get("owned_scanner"):
        subprocess.run(
            ["docker", "rm", "-f", "-v", data["owned_scanner"]], capture_output=True
        )
    state.unlink()
    print("Only this synthetic UI environment was stopped.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "stop"])
    args = parser.parse_args()
    if args.action == "stop":
        stop()
        return
    PRIVATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    state = PRIVATE / "state.json"
    if state.exists():
        raise SystemExit(
            "UI environment already recorded; stop it explicitly before recreating."
        )
    data = {"container": "didban-ui-test-" + secrets.token_hex(5), "pids": []}

    def save():
        state.write_text(json.dumps(data, indent=2) + "\n")
        state.chmod(0o600)

    save()
    try:
        env = dict(os.environ, POSTGRES_PASSWORD=secrets.token_urlsafe(32))
        subprocess.run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                data["container"],
                "-e",
                "POSTGRES_PASSWORD",
                "-p",
                "127.0.0.1::5432",
                "--tmpfs",
                "/var/lib/postgresql",
                IMAGE,
            ],
            env=env,
            check=True,
            capture_output=True,
        )
        port = (
            subprocess.check_output(
                ["docker", "port", data["container"], "5432"], text=True
            )
            .strip()
            .rsplit(":", 1)[1]
        )
        dsn = psycopg.conninfo.make_conninfo(
            host="127.0.0.1",
            port=port,
            dbname="postgres",
            user="postgres",
            password=env["POSTGRES_PASSWORD"],
            connect_timeout=2,
        )
        for attempt in range(25):
            try:
                with psycopg.connect(dsn):
                    pass
                break
            except psycopg.OperationalError:
                if attempt == 24:
                    raise RuntimeError("UI test database did not start") from None
                time.sleep(1)
        migrate(dsn)
        admin = bootstrap(dsn, "ui.admin@fixture.invalid", "مدیر آزمایشی", PASSWORD)
        data["users"] = {"admin": admin}
        with psycopg.connect(dsn) as conn:
            for key, name in [
                ("advisor", "آرمان شریفی"),
                ("finance", "نگار راد"),
                ("viewer", "سارا مهر"),
                ("outsider", "کاربر شرکت مستقل"),
                ("empty", "کاربر بدون شرکت"),
            ]:
                row = conn.execute(
                    "INSERT INTO app.users(email,display_name,password_hash,activated_at) VALUES(%s,%s,%s,clock_timestamp()) RETURNING id",
                    (f"ui.{key}@fixture.invalid", name, HASHER.hash(PASSWORD)),
                ).fetchone()
                data["users"][key] = str(row[0])
        runtime = dict(
            os.environ,
            PYTHONPATH=str(ROOT / "apps/api"),
            DIDBAN_SECRET=secrets.token_urlsafe(48),
            DIDBAN_PUBLIC_ORIGIN="http://127.0.0.1:18148",
            DIDBAN_COOKIE_SECURE="false",
            DIDBAN_STORAGE_ROOT=str(PRIVATE / "objects"),
            DIDBAN_SCANNER_PORT=os.environ.get("DIDBAN_TEST_SCANNER_PORT", "3310"),
        )
        for group, login, boundary in [
            ("didban_app", "ui_app", "APP"),
            ("didban_identity", "ui_identity", "IDENTITY"),
            ("didban_worker", "ui_worker", "WORKER"),
        ]:
            password = secrets.token_urlsafe(32)
            provision_login(dsn, group, login, password)
            runtime[f"DIDBAN_{boundary}_DSN"] = psycopg.conninfo.make_conninfo(
                dsn, user=login, password=password
            )
        with (PRIVATE / "api.log").open("w") as log:
            child = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "didban.main:create_app",
                    "--factory",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "18149",
                    "--no-access-log",
                    "--no-proxy-headers",
                ],
                cwd=ROOT,
                env={
                    key: value
                    for key, value in runtime.items()
                    if key != "DIDBAN_WORKER_DSN"
                },
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        data["pids"].append(child.pid)
        save()
        with httpx.Client(base_url="http://127.0.0.1:18149") as client:
            for attempt in range(30):
                try:
                    if client.get("/health/ready").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                time.sleep(0.5)

            def mutate(path, body):
                token = client.get("/api/v1/auth/csrf").json()["token"]
                result = client.post(
                    path,
                    json=body,
                    headers={
                        "X-CSRF-Token": token,
                        "Idempotency-Key": secrets.token_hex(16),
                        "Origin": "http://127.0.0.1:18148",
                    },
                )
                result.raise_for_status()
                return result.json()

            mutate(
                "/api/v1/auth/login",
                {"email": "ui.admin@fixture.invalid", "password": PASSWORD},
            )
            company = mutate(
                "/api/v1/admin/companies",
                {
                    "name": "آوای روشن پارس · آزمایشی",
                    "owner_user_id": admin,
                    "timezone": "Asia/Tehran",
                    "display_unit": "IRR",
                },
            )
            data["company"] = company["id"]
            for key, role in [
                ("advisor", "advisor_accountant"),
                ("finance", "finance_manager"),
                ("viewer", "viewer"),
            ]:
                mutate(
                    "/api/v1/companies/" + company["id"] + "/memberships",
                    {"user_id": data["users"][key], "role": role},
                )
            other = mutate(
                "/api/v1/admin/companies",
                {
                    "name": "شرکت مستقل · آزمایشی",
                    "owner_user_id": data["users"]["outsider"],
                    "timezone": "Asia/Tehran",
                    "display_unit": "IRR",
                },
            )
            data["other_company"] = other["id"]
        with (PRIVATE / "worker.log").open("w") as log:
            worker_env = {
                key: value
                for key, value in runtime.items()
                if key
                in (
                    "PATH",
                    "PYTHONPATH",
                    "DIDBAN_WORKER_DSN",
                    "DIDBAN_STORAGE_ROOT",
                    "DIDBAN_SCANNER_PORT",
                )
            }
            worker = subprocess.Popen(
                [sys.executable, "-m", "didban.worker"],
                cwd=ROOT,
                env=worker_env,
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        data["pids"].append(worker.pid)
        save()
        with (PRIVATE / "web.log").open("w") as log:
            child = subprocess.Popen(
                ["npm", "run", "start"],
                cwd=ROOT,
                env=dict(
                    os.environ,
                    DIDBAN_API_ORIGIN="http://127.0.0.1:18149",
                    NEXT_TELEMETRY_DISABLED="1",
                ),
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        data["pids"].append(child.pid)
        save()
        for attempt in range(30):
            try:
                if httpx.get("http://127.0.0.1:18148/login").status_code == 200:
                    break
            except httpx.TransportError:
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError(
                "UI test web server did not start; inspect private web.log"
            )
        print(
            "Synthetic UI environment ready at http://127.0.0.1:18148/login; no production data used."
        )
    except Exception:
        stop()
        raise


if __name__ == "__main__":
    main()
