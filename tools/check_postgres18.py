"""Run SQL and HTTP suites on an isolated, disposable PostgreSQL 18 cluster."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

import psycopg

ROOT = Path(__file__).resolve().parents[1]
IMAGE = (
    "postgres@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5"
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--suite",
        action="append",
        help="Run only a named test file; preserve the full-suite aggregate report.",
    )
    args = parser.parse_args()
    if args.suite and any(
        Path(name).name != name
        or not name.startswith("test_")
        or not (ROOT / "tests" / name).is_file()
        for name in args.suite
    ):
        parser.error("Each suite must name a test_*.py file in tests/")
    name = "didban-db-test-" + secrets.token_hex(6)
    scanner = None
    suite_env = dict(
        os.environ,
        PYTHONPATH=os.pathsep.join([str(ROOT / "apps/api"), str(ROOT / "tests")]),
    )
    password = secrets.token_urlsafe(32)
    env = dict(os.environ, POSTGRES_PASSWORD=password)

    def hashes():
        sources = sorted(
            list((ROOT / "database").glob("*.sql"))
            + list((ROOT / "apps/api/didban").rglob("*.py"))
            + list((ROOT / "tests").glob("*.py"))
            + list((ROOT / "contracts").rglob("*.json"))
            + list((ROOT / "tools").glob("*.py"))
            + [p for p in (ROOT / "docs/legal-sources").rglob("*") if p.is_file()]
        )
        return {
            str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sources
        }

    initial_hashes = hashes()
    suite_results = []
    try:
        if not suite_env.get("DIDBAN_TEST_SCANNER_PORT"):
            scanner = "didban-scanner-test-" + secrets.token_hex(6)
            subprocess.run(
                [
                    "docker",
                    "run",
                    "-d",
                    "--name",
                    scanner,
                    "-p",
                    "127.0.0.1::3310",
                    "-v",
                    str(ROOT / "infra/clamd.conf") + ":/etc/clamav/didban.conf:ro",
                    "--entrypoint",
                    "clamd",
                    "clamav/clamav-debian@sha256:4c975c439fcb7ab9cbdd72162c2802f5efcb4a11dcf5b0b37da1d746474ef20e",
                    "--config-file=/etc/clamav/didban.conf",
                ],
                check=True,
                capture_output=True,
            )
            scanner_port = int(
                subprocess.check_output(["docker", "port", scanner, "3310"], text=True)
                .strip()
                .rsplit(":", 1)[1]
            )
            for attempt in range(90):
                try:
                    with socket.create_connection(
                        ("127.0.0.1", scanner_port), timeout=2
                    ) as sock:
                        sock.sendall(b"zPING\0")
                        if b"PONG" in sock.recv(64):
                            break
                except OSError:
                    pass
                if attempt == 89:
                    raise RuntimeError("Isolated ClamAV did not become ready")
                time.sleep(1)
            suite_env["DIDBAN_TEST_SCANNER_PORT"] = str(scanner_port)
        subprocess.run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                name,
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
            subprocess.check_output(["docker", "port", name, "5432"], text=True)
            .strip()
            .rsplit(":", 1)[1]
        )
        dsn = psycopg.conninfo.make_conninfo(
            host="127.0.0.1",
            port=port,
            dbname="postgres",
            user="postgres",
            password=password,
            connect_timeout=2,
        )
        for attempt in range(25):
            try:
                with psycopg.connect(dsn) as conn:
                    version = conn.execute("SHOW server_version").fetchone()[0]
                break
            except psycopg.OperationalError:
                if attempt == 24:
                    raise RuntimeError(
                        "Disposable PostgreSQL did not become ready"
                    ) from None
                time.sleep(1)
        for suite in args.suite or [
            "test_schema.py",
            "test_runtime.py",
            "test_intake.py",
            "test_interpretation.py",
            "test_moadian_export.py",
            "test_moadian_export_runtime.py",
            "test_source_understanding.py",
            "test_source_understanding_runtime.py",
            "test_financial_domain.py",
            "test_financial_runtime.py",
            "test_reconciliation_domain.py",
            "test_reconciliation_runtime.py",
            "test_cashflow_domain.py",
            "test_cashflow_runtime.py",
            "test_forecast.py",
            "test_settlements_runtime.py",
            "test_forecast_workflow.py",
            "test_model_provider.py",
            "test_model_runtime.py",
            "test_intake_model.py",
            "test_intake_model_runtime.py",
            "test_analysis_runtime.py",
            "test_policy_runtime.py",
            "test_report_rendering.py",
            "test_management_domain.py",
            "test_statement_sources.py",
            "test_management_runtime.py",
            "test_statement_sources_runtime.py",
            "test_mvp_acceptance.py",
            "test_reports_runtime.py",
            "test_delivery_workflow.py",
            "test_backup_bundle.py",
            "test_backup_local.py",
            "test_restore_local.py",
            "test_restore_local_runtime.py",
            "test_installation_config.py",
            "test_restore_runtime.py",
            "test_extension_access_runtime.py",
            "test_input_review.py",
            "test_input_review_runtime.py",
            "test_actionable_analysis.py",
            "test_actionable_analysis_runtime.py",
            "test_actionable_automation_runtime.py",
            "test_module_workflow_runtime.py",
            "test_module_scope.py",
            "test_payroll_domain.py",
            "test_payroll_1405_tax.py",
            "test_payroll_catalog.py",
            "test_payroll_rulepack.py",
            "test_payroll_rulepack_runtime.py",
            "test_payroll_runtime.py",
            "test_extension_restore_runtime.py",
        ]:
            started = time.monotonic()
            subprocess.run(
                [sys.executable, str(ROOT / "tests" / suite)],
                env=dict(suite_env, DIDBAN_TEST_DSN=dsn),
                check=True,
            )
            suite_results.append(
                {
                    "suite": suite,
                    "status": "passed",
                    "seconds": round(time.monotonic() - started, 3),
                }
            )
        if args.suite:
            return
        if hashes() != initial_hashes:
            raise RuntimeError(
                "Source changed during PostgreSQL verification; rerun before declaring final acceptance."
            )
        (ROOT / "docs/postgres18-validation.json").write_text(
            json.dumps(
                {
                    "status": "passed",
                    "server_version": version,
                    "sql_tests": 17,
                    "http_tests": json.loads(
                        (ROOT / "docs/runtime-validation.json").read_text()
                    )["tests_run"],
                    "intake_tests": json.loads(
                        (ROOT / "docs/intake-validation.json").read_text()
                    )["tests_run"],
                    "interpretation_tests": json.loads(
                        (ROOT / "docs/interpretation-validation.json").read_text()
                    )["tests_run"],
                    "financial_tests": json.loads(
                        (ROOT / "docs/financial-validation.json").read_text()
                    )["tests_run"],
                    "reconciliation_tests": json.loads(
                        (ROOT / "docs/reconciliation-validation.json").read_text()
                    )["tests_run"],
                    "cashflow_tests": json.loads(
                        (ROOT / "docs/cashflow-validation.json").read_text()
                    )["tests_run"],
                    "settlement_tests": json.loads(
                        (ROOT / "docs/settlements-validation.json").read_text()
                    )["tests_run"],
                    "forecast_workflow_tests": json.loads(
                        (ROOT / "docs/forecast-workflow-validation.json").read_text()
                    )["tests_run"],
                    "model_tests": json.loads(
                        (ROOT / "docs/model-validation.json").read_text()
                    )["tests_run"],
                    "analysis_tests": json.loads(
                        (ROOT / "docs/analysis-validation.json").read_text()
                    )["tests_run"],
                    "policy_tests": json.loads(
                        (ROOT / "docs/policy-validation.json").read_text()
                    )["tests_run"],
                    "report_tests": json.loads(
                        (ROOT / "docs/reports-validation.json").read_text()
                    )["tests_run"],
                    "delivery_workflow_tests": json.loads(
                        (ROOT / "docs/delivery-workflow-validation.json").read_text()
                    )["tests_run"],
                    "restore_tests": json.loads(
                        (ROOT / "docs/restore-validation.json").read_text()
                    ).get("tests_run", 1),
                    "isolated_container": True,
                    "suite_results": suite_results,
                    "source_sha256": initial_hashes,
                    "verified_migration_count": len(
                        list((ROOT / "database").glob("*.sql"))
                    ),
                    "live_installation_modified": False,
                },
                indent=2,
            )
            + "\n"
        )
    finally:
        if scanner:
            subprocess.run(["docker", "rm", "-f", "-v", scanner], capture_output=True)
        subprocess.run(["docker", "rm", "-f", "-v", name], capture_output=True)


if __name__ == "__main__":
    main()
