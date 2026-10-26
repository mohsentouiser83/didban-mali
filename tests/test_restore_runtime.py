"""Actual current-runtime DB + generated artifacts + approvals/archive recovery.

Uses native application fixtures and TWO disposable PostgreSQL18 containers. It
verifies the shared archive/encryption/recovery primitives, not a fresh Compose
image build or organizational deployment.
"""

from dataclasses import replace
from pathlib import Path
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

import psycopg
from psycopg import sql
from fastapi.testclient import TestClient
from test_forecast_workflow import ForecastWorkflowTests
from didban.main import create_app
from didban.application.report_worker import ReportWorker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from backup_bundle import pack, unpack, encrypt, decrypt, digest  # noqa: E402
from installation_snapshot import ComposeInstallation, POSTGRES_IMAGE, run  # noqa: E402
from database_archive import dump, recover  # noqa: E402

RESULT = {}


class NativeSnapshot(ComposeInstallation):
    def __init__(self, container, database):
        self.pg, self.database = container, database

    def psql(self, query):
        return (
            run(
                [
                    "docker",
                    "exec",
                    "-i",
                    self.pg,
                    "psql",
                    "-X",
                    "-At",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-U",
                    "postgres",
                    "-d",
                    self.database,
                ],
                data=query.encode(),
            )
            .decode()
            .strip()
        )


def source_container(dsn):
    port = psycopg.conninfo.conninfo_to_dict(dsn)["port"]
    candidates = (
        run(["docker", "ps", "-q", "--filter", "name=didban-db-test-"]).decode().split()
    )
    for container in candidates:
        info = json.loads(run(["docker", "inspect", container]))[0]
        mappings = info["NetworkSettings"]["Ports"].get("5432/tcp") or []
        if any(p["HostPort"] == port and p["HostIp"] == "127.0.0.1" for p in mappings):
            return container
    raise RuntimeError(
        "Disposable source database container not found; no arbitrary database dump attempted."
    )


class RestoreTests(ForecastWorkflowTests):
    def test_generated_report_approval_archive_and_originals_survive_authenticated_restore(
        self,
    ):
        session, manifest = self.publish_fixture()
        self.start_analysis(session)
        forecast, _ = self.finish_forecast(session)
        worker = ReportWorker(self.worker_settings)
        for _ in range(3):
            self.assertTrue(worker.run_once())
        reports = self.owner.get(self.base + "/reports?limit=100").json()["items"]
        edition = next(r for r in reports if r["manifest_id"] == manifest)
        self.assertTrue(
            all(e["status"] == "ready" for e in edition["exports"]), edition
        )
        original = {
            e["id"]: self.owner.get(
                self.base + "/exports/" + e["id"] + "/content"
            ).content
            for e in edition["exports"]
        }
        finance = self.client("finance")
        approval = self.mutate(
            finance,
            "POST",
            self.base + "/reports/" + edition["id"] + "/approvals",
            {"confirmed": True},
            version=edition["version"],
        )
        self.assertEqual(approval.status_code, 201, approval.text)
        source = self.files(session)[0]
        archived = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/source-files/" + source["id"] + "/archive",
            {"archived": True},
            version=source["version"],
        )
        self.assertEqual(archived.status_code, 200, archived.text)
        other = self.mutate(
            self.admin,
            "POST",
            "/api/v1/admin/companies",
            {
                "name": "Independent restore fixture",
                "owner_user_id": self.users["outsider"],
                "timezone": "Asia/Tehran",
                "display_unit": "IRR",
            },
        )
        self.assertEqual(other.status_code, 201, other.text)
        source_pg = source_container(self.dsn)
        source_db = psycopg.conninfo.conninfo_to_dict(self.dsn)["dbname"]
        before = NativeSnapshot(source_pg, source_db).metadata()
        self.assertEqual(before["table_counts"]["report_approvals"], 1)
        self.assertEqual(len(before["objects"]), 9)
        self.app.state.db.close()  # All in-process app writers closed before dump/copy.
        with psycopg.connect(self.dsn) as guard:
            self.assertEqual(
                guard.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'"
                ).fetchone()[0],
                0,
            )
        name = "didban-restore-test-" + secrets.token_hex(7)
        with tempfile.TemporaryDirectory(prefix="didban-restore-proof-") as temporary:
            work = Path(temporary)
            payload = work / "payload"
            payload.mkdir()
            dump(
                source_pg,
                payload / "database.dump",
                database=source_db,
                user="postgres",
            )
            shutil.copytree(self.settings.storage_root, payload / "objects")
            config = {
                "secret": self.settings.secret,
                "app": psycopg.conninfo.conninfo_to_dict(self.settings.app_dsn),
                "identity": psycopg.conninfo.conninfo_to_dict(
                    self.settings.identity_dsn
                ),
                "worker": psycopg.conninfo.conninfo_to_dict(self.worker_settings.dsn),
            }
            (payload / "configuration.json").write_text(json.dumps(config))
            (payload / "snapshot.json").write_text(json.dumps(before))
            pack(payload, work / "payload.tar.gz")
            password = secrets.token_urlsafe(32)
            encrypt(work / "payload.tar.gz", work / "backup.didban", password)
            decrypt(work / "backup.didban", work / "verified.tar.gz", password)
            unpack(work / "verified.tar.gz", work / "restored")
            restored = work / "restored"
            pgpassword = secrets.token_urlsafe(32)
            container_created = False
            try:
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
                        POSTGRES_IMAGE,
                    ],
                    env=dict(os.environ, POSTGRES_PASSWORD=pgpassword),
                    capture_output=True,
                    check=True,
                )
                container_created = True
                port = (
                    run(["docker", "port", name, "5432"])
                    .decode()
                    .strip()
                    .rsplit(":", 1)[1]
                )
                admin = psycopg.conninfo.make_conninfo(
                    host="127.0.0.1",
                    port=port,
                    dbname="postgres",
                    user="postgres",
                    password=pgpassword,
                )
                for attempt in range(30):
                    try:
                        with psycopg.connect(admin):
                            pass
                        break
                    except psycopg.OperationalError:
                        if attempt == 29:
                            raise
                        time.sleep(0.2)
                settings = json.loads((restored / "configuration.json").read_text())
                with psycopg.connect(admin) as conn:
                    for group in ["didban_app", "didban_identity", "didban_worker"]:
                        conn.execute(
                            sql.SQL(
                                "CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS"
                            ).format(sql.Identifier(group))
                        )
                    for boundary, group in [
                        ("app", "didban_app"),
                        ("identity", "didban_identity"),
                        ("worker", "didban_worker"),
                    ]:
                        login = settings[boundary]
                        conn.execute(
                            sql.SQL(
                                "CREATE ROLE {} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD {}"
                            ).format(
                                sql.Identifier(login["user"]),
                                sql.Literal(login["password"]),
                            )
                        )
                        conn.execute(
                            sql.SQL("GRANT {} TO {}").format(
                                sql.Identifier(group), sql.Identifier(login["user"])
                            )
                        )
                        if boundary == "worker":
                            conn.execute(
                                sql.SQL("GRANT didban_app TO {}").format(
                                    sql.Identifier(login["user"])
                                )
                            )
                recover(
                    name,
                    restored / "database.dump",
                    database="postgres",
                    user="postgres",
                )
                after = NativeSnapshot(name, "postgres").metadata()
                self.assertEqual(before["table_counts"], after["table_counts"])
                self.assertEqual(before["migrations"], after["migrations"])
                self.assertEqual(before["runtime_version"], after["runtime_version"])
                for item in after["objects"]:
                    self.assertEqual(
                        digest(restored / "objects" / item["key"]), item["sha256"]
                    )
                with psycopg.connect(admin) as conn:
                    self.assertEqual(
                        conn.execute(
                            "SELECT count(*) FROM app.source_files WHERE archived_at IS NOT NULL"
                        ).fetchone()[0],
                        1,
                    )
                restored_settings = replace(
                    self.settings,
                    app_dsn=psycopg.conninfo.make_conninfo(
                        admin,
                        user=settings["app"]["user"],
                        password=settings["app"]["password"],
                    ),
                    identity_dsn=psycopg.conninfo.make_conninfo(
                        admin,
                        user=settings["identity"]["user"],
                        password=settings["identity"]["password"],
                    ),
                    storage_root=restored / "objects",
                    secret=settings["secret"],
                )
                app = create_app(restored_settings)
                with TestClient(app, base_url="https://testserver"):
                    client = self.client("owner", app=app)
                    report = client.get(self.base + "/reports/" + edition["id"])
                    self.assertEqual(report.status_code, 200, report.text)
                    self.assertEqual(
                        report.json()["content_hash"], edition["content_hash"]
                    )
                    self.assertIn(approval.json()["id"], report.json()["approval_ids"])
                    self.assertEqual(report.json()["forecast_closing"], "2628")
                    for export_id, content in original.items():
                        download = client.get(
                            self.base + "/exports/" + export_id + "/content"
                        )
                        self.assertEqual(
                            download.status_code,
                            200,
                            download.text[:80] if download.status_code != 200 else "",
                        )
                        self.assertEqual(download.content, content)
                    self.assertEqual(
                        client.get(
                            "/api/v1/companies/" + other.json()["id"]
                        ).status_code,
                        404,
                    )
                    viewer = self.client("viewer", app=app)
                    denied = self.mutate(
                        viewer,
                        "POST",
                        self.base + "/reports/" + edition["id"] + "/approvals",
                        {"confirmed": True},
                        version=edition["version"],
                    )
                    self.assertEqual(denied.status_code, 403)
                RESULT.update(
                    {
                        "status": "passed",
                        "runtime_version": after["runtime_version"],
                        "verified_migrations": len(after["migrations"]),
                        "verified_app_tables": len(after["table_counts"]),
                        "original_and_generated_objects": len(after["objects"]),
                        "generated_exports_verified": 3,
                        "report_approvals_preserved": 1,
                        "archived_sources_preserved": 1,
                        "forecast_closing_irr": "2628",
                        "membership_and_cross_company_authorization": "verified after restore using restricted logins",
                        "scope": "current host application + actual two disposable PostgreSQL18 clusters + shared production archive/encryption/recovery primitives; not fresh Compose image startup",
                        "model_calls": 0,
                        "encrypted_bundle_sha256": digest(work / "backup.didban"),
                    }
                )
            finally:
                if container_created:
                    subprocess.run(
                        ["docker", "rm", "-f", "-v", name], capture_output=True
                    )


if __name__ == "__main__":
    suite = unittest.TestSuite(
        [
            RestoreTests(
                "test_generated_report_approval_archive_and_originals_survive_authenticated_restore"
            )
        ]
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    RESULT["status"] = "passed" if result.wasSuccessful() else "failed"
    RESULT["test_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (ROOT / "docs/restore-validation.json").write_text(
        json.dumps(RESULT, indent=2) + "\n"
    )
    raise SystemExit(not result.wasSuccessful())
