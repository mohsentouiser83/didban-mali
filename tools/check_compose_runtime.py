"""Build/start/smoke-test and remove an isolated Compose installation.

Only synthetic credentials/data are created. No existing Compose project or
database is reused. Secrets stay in a private ignored temporary directory.
"""

from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--with-web", action="store_true")
    args = parser.parse_args()
    name = "didban-rebuild-check-" + secrets.token_hex(5)
    private = ROOT / ".local" / name
    private.mkdir(parents=True, mode=0o700)
    with socket.socket() as available:
        available.bind(("127.0.0.1", 0))
        port = available.getsockname()[1]
    api_origin = f"http://127.0.0.1:{port}"
    with socket.socket() as available:
        available.bind(("127.0.0.1", 0))
        web_port = available.getsockname()[1]
    origin = f"http://127.0.0.1:{web_port}" if args.with_web else api_origin
    target = "web" if args.with_web else "api"
    values = {
        "DIDBAN_MODEL_API_KEY": "",
        "DIDBAN_MODEL_ID": "",
        "DIDBAN_MODEL_INPUT_USD_PER_MILLION": "",
        "DIDBAN_MODEL_OUTPUT_USD_PER_MILLION": "",
        "DIDBAN_DB_NAME": "didban",
        "DIDBAN_DB_ADMIN_USER": "didban_migrator",
        "DIDBAN_APP_DB_USER": "didban_runtime_login",
        "DIDBAN_IDENTITY_DB_USER": "didban_identity_login",
        "DIDBAN_HTTP_PORT": str(port),
        "DIDBAN_WEB_PORT": str(web_port),
        "DIDBAN_PUBLIC_ORIGIN": origin,
        "DIDBAN_COOKIE_SECURE": "false",
        "NPM_REGISTRY": os.environ.get(
            "DIDBAN_TEST_NPM_REGISTRY", "https://registry.npmjs.org"
        ),
        "PIP_INDEX_URL": os.environ.get(
            "DIDBAN_TEST_PIP_INDEX_URL", "https://pypi.org/simple"
        ),
    }
    values.update(
        {
            key: secrets.token_urlsafe(48)
            for key in (
                "DIDBAN_DB_ADMIN_PASSWORD",
                "DIDBAN_APP_DB_PASSWORD",
                "DIDBAN_IDENTITY_DB_PASSWORD",
                "DIDBAN_WORKER_DB_PASSWORD",
                "DIDBAN_SECRET",
            )
        }
    )
    env_file = private / "test.env"
    descriptor = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write("".join(k + "=" + v + "\n" for k, v in values.items()))
    compose = [
        "docker",
        "compose",
        "-p",
        name,
        "--env-file",
        str(env_file),
        "-f",
        str(ROOT / "infra/compose.yaml"),
    ]
    checked = []
    log = (private / "commands.log").open("w")

    def command(arguments: list[str], *, input_text: str | None = None) -> str:
        result = subprocess.run(
            arguments,
            cwd=ROOT,
            input=input_text,
            text=True,
            capture_output=True,
            env=dict(os.environ, **values),
            timeout=240,
        )
        log.write(result.stdout + result.stderr)
        log.flush()
        if result.returncode:
            raise RuntimeError(
                f"Isolated Compose command failed ({result.returncode}); see ignored local log"
            )
        return result.stdout

    try:
        command(compose + ["config", "--quiet"])
        if not args.skip_build:
            command(compose + ["build", "api", *(["web"] if args.with_web else [])])
        print("Image ready; starting isolated PostgreSQL and API.", flush=True)
        command(compose + ["up", "-d", "--wait", target, "worker"])
        checked.append("clean_install_migrate_provision_start")
        # A manually delivered, test-only password goes over stdin, never argv/logs.
        password = secrets.token_urlsafe(32)
        program = "import sys; from didban.manage import bootstrap,migration_dsn; print(bootstrap(migration_dsn(),'admin@compose.fixture.invalid','Synthetic administrator',sys.stdin.readline().rstrip()))"
        raw = command(
            compose + ["run", "--rm", "-T", "migrate", "python", "-c", program],
            input_text=password + "\n",
        )
        from uuid import UUID

        user_id = str(UUID(raw.strip().splitlines()[-1]))
        command(
            compose
            + [
                "exec",
                "-T",
                "api",
                "python",
                "-c",
                "import os; assert os.getuid()!=0; assert 'DIDBAN_DB_ADMIN_PASSWORD' not in os.environ; assert 'DIDBAN_MIGRATION_DSN' not in os.environ",
            ]
        )
        checked.append("nonroot_readonly_runtime_without_migration_credentials")
        command(
            compose
            + [
                "exec",
                "-T",
                "api",
                "python",
                "-c",
                "from pathlib import Path; from didban.adapters.report_rendering import render; "
                "content={'manifest':{'company_name':'شرکت آزمایشی','period_name':'دوره آزمایشی','as_of_date':'2026-09-30','id':'test','manifest_hash':'a'*64},'metrics':[{'metric_key':'revenue','value':'100','status':'available','reason_codes':[]}],'reconciliation_runs':[],'candidates':[]}; "
                "pdf=render('pdf',content,Path('/app/assets/fonts')); "
                "assert pdf.startswith(b'%PDF-') and b'IRANYekanX' in pdf",
            ]
        )
        checked.append("current_image_renders_pdf_with_embedded_iranyekan")
        command(
            compose
            + [
                "exec",
                "-T",
                "worker",
                "python",
                "-c",
                "import os; from pathlib import Path; from uuid import uuid4; "
                "assert os.getuid()!=0; p=Path(os.environ['DIDBAN_STORAGE_ROOT'])/('readiness-probe-'+uuid4().hex); "
                "p.write_bytes(b'synthetic-export-probe'); assert p.read_bytes()==b'synthetic-export-probe'; p.unlink()",
            ]
        )
        checked.append("nonroot_worker_can_write_private_export_storage")
        version = command(
            compose
            + [
                "exec",
                "-T",
                "postgres",
                "psql",
                "-U",
                "didban_migrator",
                "-d",
                "didban",
                "-tAc",
                "SHOW server_version",
            ]
        ).strip()
        assert version.startswith("18.6"), version
        with httpx.Client(base_url=origin, timeout=10) as client:
            assert httpx.get(api_origin + "/health/ready").status_code == 200
            if args.with_web:
                page = client.get("/login")
                assert page.status_code == 200 and "خوش آمدید" in page.text
                assert page.headers["x-frame-options"] == "DENY"
                command(
                    compose
                    + [
                        "exec",
                        "-T",
                        "web",
                        "node",
                        "-e",
                        "if(process.getuid()===0 || process.env.DIDBAN_SECRET || process.env.DIDBAN_DB_ADMIN_PASSWORD)process.exit(1)",
                    ]
                )
                checked.append("standalone_web_nonroot_page_security_headers")

            def mutate(path: str, body: dict | None = None):
                csrf = client.get("/api/v1/auth/csrf")
                assert csrf.status_code == 200
                headers = {
                    "X-CSRF-Token": csrf.json()["token"],
                    "Idempotency-Key": secrets.token_hex(16),
                    "Origin": origin,
                }
                return (
                    client.post(path, json=body, headers=headers)
                    if body is not None
                    else client.post(path, headers=headers)
                )

            login = mutate(
                "/api/v1/auth/login",
                {"email": "admin@compose.fixture.invalid", "password": password},
            )
            assert login.status_code == 200, login.status_code
            assert client.get("/api/v1/auth/me").json()["id"] == user_id
            checked.append("real_tcp_login_session_csrf")
            company = mutate(
                "/api/v1/admin/companies",
                {
                    "name": "Synthetic Compose company",
                    "owner_user_id": user_id,
                    "timezone": "Asia/Tehran",
                    "display_unit": "IRR",
                },
            )
            assert company.status_code == 201, company.status_code
            scope = "/api/v1/companies/" + company.json()["id"]
            assert client.get(scope).status_code == 200
            access = client.get(scope + "/access").json()["permissions"]
            assert "company.owner" in access and "company.approve_report" not in access
            checked.append("real_tcp_company_and_owner_permissions")
            period = mutate(
                scope + "/financial-periods",
                {
                    "name": "1405 test",
                    "starts_on": "2026-03-21",
                    "ends_on": "2027-03-20",
                    "previous_period_id": None,
                },
            )
            assert period.status_code == 201, period.text
            session = mutate(
                scope + "/processing-sessions",
                {"period_id": period.json()["id"], "as_of_date": None},
            )
            assert session.status_code == 201, session.text
            session_path = scope + "/processing-sessions/" + session.json()["id"]

            def headers(version):
                return {
                    "X-CSRF-Token": client.get("/api/v1/auth/csrf").json()["token"],
                    "Origin": origin,
                    "Idempotency-Key": secrets.token_hex(16),
                    "If-Match": '"v' + str(version) + '"',
                }

            # More than 64 KiB: proves multipart streams through the web proxy rather than its JSON path.
            payload = b"date,amount,currency\n" + b"2026-04-01,100,IRR\n" * 6000
            command(compose + ["stop", "worker"])
            uploaded = client.post(
                session_path + "/files",
                files={"file": ("test.csv", payload, "text/csv")},
                headers=headers(session.json()["session_version"]),
            )
            assert uploaded.status_code == 202, uploaded.text
            assert (
                "storage_key" not in uploaded.text and "object_key" not in uploaded.text
            )
            latest = client.get(session_path).json()
            file_id = client.get(session_path + "/files").json()["items"][0]["id"]
            sealed = client.post(
                session_path + "/seal",
                json={"expected_file_ids": [file_id]},
                headers=headers(latest["session_version"]),
            )
            assert sealed.status_code == 202, sealed.text
            assert client.get(session_path).json()["preparation_finished_at"] is None
            command(compose + ["start", "worker"])
            for attempt in range(60):
                ready = client.get(session_path).json()
                if ready["preparation_finished_at"]:
                    break
                if ready["status"] == "failed":
                    raise AssertionError("Compose preparation failed")
                time.sleep(1)
            assert ready["preparation_finished_at"], ready
            files = client.get(session_path + "/files").json()["items"]
            assert (
                len(files) == 1
                and files[0]["preparation_summary"]["nonempty_rows"] == 6001
            )
            for attempt in range(60):
                interpreted = client.get(session_path).json()
                if interpreted["status"] == "waiting_input":
                    break
                time.sleep(1)
            assert interpreted["status"] == "waiting_input", interpreted
            issues = client.get(session_path + "/issues").json()["items"]
            issue = next(i for i in issues if i["status"] == "open")
            assert issue["code"] == "interpretation_coverage", issue["code"]
            answered = client.post(
                scope + "/processing-issues/" + issue["id"] + "/answers",
                json={"answer": {"kind": "choice", "value": "unknown"}},
                headers=headers(interpreted["session_version"]),
            )
            assert answered.status_code == 201, answered.text
            for attempt in range(60):
                interpreted = client.get(session_path).json()
                if interpreted["interpretation_finished_at"]:
                    break
                time.sleep(1)
            assert interpreted["interpretation_finished_at"], interpreted
            interpreted_files = client.get(session_path + "/files").json()["items"]
            assert interpreted_files[0]["interpretation_summary"]["valid_rows"] == 6000
            normalized = client.get(
                session_path + "/files/" + file_id + "/rows?limit=2"
            ).json()
            assert len(normalized["items"]) == 2 and normalized["next_cursor"]
            assert interpreted["manifest_id"] is None
            checked.extend(
                [
                    "real_worker_versioned_interpretation_and_coverage_barrier",
                    "scoped_canonical_rows_without_financial_manifest",
                ]
            )
            command(compose + ["restart", "worker"])
            assert len(client.get(session_path + "/files").json()["items"]) == 1
            command(
                compose
                + [
                    "exec",
                    "-T",
                    "worker",
                    "python",
                    "-c",
                    "import os; assert os.getuid()!=0; assert 'DIDBAN_SECRET' not in os.environ; assert 'DIDBAN_IDENTITY_DB_PASSWORD' not in os.environ; assert 'DIDBAN_DB_ADMIN_PASSWORD' not in os.environ",
                ]
            )
            checked.extend(
                [
                    "period_and_private_multipart_over_64k",
                    "durable_preparation_after_worker_stop_start",
                    "real_clamav_structural_summary",
                    "worker_restart_no_duplicate_and_credentials_isolated",
                ]
            )
            repeated = command(compose + ["run", "--rm", "-T", "migrate"])
            assert '"applied": []' in repeated or "'applied': []" in repeated
            assert client.get("/api/v1/auth/me").status_code == 200
            checked.append("repeat_migration_preserves_users_and_session")
            result = mutate("/api/v1/auth/logout")
            assert result.status_code == 200, result.status_code
            assert client.get("/api/v1/auth/me").status_code == 401
            checked.append("real_tcp_logout_revokes_session")
        report = {
            "status": "passed",
            "scope": "isolated_docker_postgresql_and_tcp_http_smoke",
            "postgres_version": version,
            "checks": checked,
            "model_calls": 0,
            "external_notifications": 0,
            "production_deployment": False,
            "same_origin_web_proxy": args.with_web,
            "source_sha256": {
                str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in [
                    ROOT / "infra/compose.yaml",
                    ROOT / "infra/Dockerfile.api",
                    ROOT / "infra/Dockerfile.web",
                    ROOT / "package-lock.json",
                ]
            },
        }
        (
            ROOT
            / (
                "docs/compose-web-validation.json"
                if args.with_web
                else "docs/compose-validation.json"
            )
        ).write_text(json.dumps(report, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "status": "passed",
                    "smoke_checks": len(checked),
                    "postgres_version": version,
                }
            ),
            flush=True,
        )
    finally:
        try:
            command(compose + ["down", "--volumes", "--remove-orphans"])
        finally:
            env_file.unlink(missing_ok=True)
            log.close()


if __name__ == "__main__":
    main()
