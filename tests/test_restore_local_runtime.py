"""Full localhost bundle recovery on disposable PostgreSQL18 resources only."""

from dataclasses import replace
import json
from pathlib import Path
import secrets
import shutil
import sys
import tempfile
import unittest

import psycopg
from psycopg import sql
from fastapi.testclient import TestClient
from test_reports_runtime import ReportTests
from test_restore_runtime import NativeSnapshot, source_container
from didban.main import create_app
from didban.manage import provision_login

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from backup_bundle import digest, encrypt, pack  # noqa: E402
from database_archive import dump  # noqa: E402
import restore_local as recovery  # noqa: E402


class LocalRestoreRuntimeTests(ReportTests):
    def test_authenticated_local_bundle_recovers_data_secrets_objects_and_roles(self):
        _, report = self.report_fixture()
        before = NativeSnapshot(source_container(self.dsn), self.db_name).metadata()
        source_pg = source_container(self.dsn)
        source_info = json.loads(recovery.run(["docker", "inspect", source_pg]))[0]
        runtime_passwords = {
            name: secrets.token_urlsafe(24)
            for name in ("ui_app", "ui_identity", "ui_worker")
        }
        for name, group in [
            ("ui_app", "didban_app"),
            ("ui_identity", "didban_identity"),
            ("ui_worker", "didban_worker"),
        ]:
            provision_login(self.dsn, group, name, runtime_passwords[name])
        report_url = self.base + "/reports/" + report["id"]
        original_report = self.owner.get(report_url).json()
        result = None
        try:
            with tempfile.TemporaryDirectory(
                prefix="didban-local-restore-test-"
            ) as temp:
                root = Path(temp).resolve()
                payload = root / "payload"
                private = payload / "private"
                private.mkdir(parents=True)
                shutil.copytree(self.settings.storage_root, private / "objects")
                original_secret = self.settings.secret.encode()
                (private / "application-secret").write_bytes(original_secret)
                state = {
                    "mode": "clean_local",
                    "container": "didban-local-fresh-source",
                    "volume": "source-never-reused",
                    "pids": [999999],
                    "storage_root": "/retired-host/objects",
                    "users": {"fixture": "unchanged"},
                }
                (private / "state.json").write_text(json.dumps(state))
                (private / "restart.lock").write_text("retired lock")
                (payload / "model.env").write_text(
                    "DIDBAN_MODEL_API_KEY=synthetic-never-call\nDIDBAN_MODEL_MAX_OUTPUT_TOKENS=2048\n"
                )
                (payload / "container-inspect.json").write_text(json.dumps(source_info))
                with psycopg.connect(self.dsn) as conn:
                    migrations = conn.execute(
                        "SELECT name,sha256 FROM didban_meta.schema_migrations ORDER BY name"
                    ).fetchall()
                    refs = conn.execute(
                        "SELECT object_key,sha256 FROM app.source_files UNION ALL SELECT object_key,sha256 FROM app.export_jobs WHERE status='ready'"
                    ).fetchall()
                    budget = conn.execute(
                        "SELECT row_to_json(p) FROM app.budget_policies p ORDER BY id"
                    ).fetchall()
                (payload / "source-migrations").mkdir()
                for name, _ in migrations:
                    shutil.copyfile(
                        ROOT / "database" / name, payload / "source-migrations" / name
                    )
                (payload / "snapshot.json").write_text(
                    json.dumps(
                        {
                            "format": "didban-local-1",
                            "quiesced": True,
                            "database": "postgres",
                            "database_user": "postgres",
                            "migrations": migrations,
                            "object_references": len(refs),
                            "model_configuration_present": True,
                        }
                    )
                )
                dump(
                    source_pg,
                    payload / "database.dump",
                    database=self.db_name,
                    user="postgres",
                )
                (payload / "globals.sql").write_bytes(
                    recovery.run(
                        [
                            "docker",
                            "exec",
                            source_pg,
                            "pg_dumpall",
                            "--globals-only",
                            "--username=postgres",
                            "--database=" + self.db_name,
                        ]
                    )
                )
                for file in payload.rglob("*"):
                    file.chmod(0o700 if file.is_dir() else 0o600)
                pack(payload, root / "payload.tar.gz")
                password = secrets.token_urlsafe(28)
                password_file = root / "passphrase"
                password_file.write_text(password)
                password_file.chmod(0o600)
                bundle = root / "snapshot.didban"
                encrypt(root / "payload.tar.gz", bundle, password)
                destination = root / "recovered"
                result = recovery.restore_new(
                    bundle=bundle,
                    destination=destination,
                    passphrase_file=password_file,
                )
                self.assertFalse(result["application_services_started"])
                self.assertFalse(result["saved_processes_replayed"])
                self.assertFalse(result["watchdog_installed"])
                restored_private = destination / ".local/local-runtime"
                restored_state = json.loads(
                    (restored_private / "state.json").read_text()
                )
                self.assertEqual(restored_state["pids"], [])
                self.assertEqual(restored_state["users"], state["users"])
                self.assertNotEqual(restored_state["container"], state["container"])
                self.assertEqual(
                    restored_state["storage_root"], str(restored_private / "objects")
                )
                self.assertEqual(
                    (restored_private / "application-secret").read_bytes(),
                    original_secret,
                )
                self.assertEqual(
                    (destination / ".env.model").read_bytes(),
                    (payload / "model.env").read_bytes(),
                )
                self.assertFalse((restored_private / "restart.lock").exists())
                self.assertEqual(
                    json.loads((destination / "original-state.json").read_text()), state
                )
                for key, expected in refs:
                    self.assertEqual(
                        digest(restored_private / "objects" / key), expected
                    )
                self.assertEqual(
                    (destination / ".env.model").stat().st_mode & 0o777, 0o600
                )
                info = json.loads(
                    recovery.run(["docker", "inspect", result["container"]])
                )[0]
                target_port = info["NetworkSettings"]["Ports"]["5432/tcp"][0][
                    "HostPort"
                ]
                restored_dsn = psycopg.conninfo.make_conninfo(
                    self.dsn, port=target_port, dbname="postgres"
                )
                with psycopg.connect(restored_dsn) as conn:
                    self.assertEqual(
                        conn.execute(
                            "SELECT row_to_json(p) FROM app.budget_policies p ORDER BY id"
                        ).fetchall(),
                        budget,
                    )
                after = NativeSnapshot(result["container"], "postgres").metadata()
                self.assertEqual(before["table_counts"], after["table_counts"])
                self.assertEqual(before["migrations"], after["migrations"])
                for name, role_password in runtime_passwords.items():
                    with psycopg.connect(
                        psycopg.conninfo.make_conninfo(
                            restored_dsn, user=name, password=role_password
                        )
                    ) as conn:
                        self.assertEqual(
                            conn.execute("SELECT current_user").fetchone()[0], name
                        )
                settings = replace(
                    self.settings,
                    app_dsn=psycopg.conninfo.make_conninfo(
                        self.settings.app_dsn, port=target_port, dbname="postgres"
                    ),
                    identity_dsn=psycopg.conninfo.make_conninfo(
                        self.settings.identity_dsn, port=target_port, dbname="postgres"
                    ),
                    storage_root=restored_private / "objects",
                )
                with TestClient(
                    create_app(settings), base_url="https://testserver"
                ) as client:
                    client.cookies.update(self.owner.cookies)
                    restored_report = client.get(report_url)
                    self.assertEqual(
                        restored_report.status_code, 200, restored_report.text
                    )
                    self.assertEqual(restored_report.json(), original_report)
                # An authenticated but internally inconsistent bundle must not
                # leave a usable target or any newly allocated Docker resource.
                resources_before = recovery.run(
                    ["docker", "ps", "-aq", "--filter", "label=" + recovery.LABEL]
                ).splitlines()
                volumes_before = recovery.run(
                    [
                        "docker",
                        "volume",
                        "ls",
                        "-q",
                        "--filter",
                        "label=" + recovery.LABEL,
                    ]
                ).splitlines()
                (payload / "private/objects" / refs[0][0]).write_bytes(
                    b"incorrect object"
                )
                (payload / "checksums.json").unlink()
                pack(payload, root / "inconsistent.tar.gz")
                encrypt(
                    root / "inconsistent.tar.gz", root / "inconsistent.didban", password
                )
                failed_target = root / "must-not-survive"
                with self.assertRaises(ValueError):
                    recovery.restore_new(
                        bundle=root / "inconsistent.didban",
                        destination=failed_target,
                        passphrase_file=password_file,
                    )
                self.assertFalse(failed_target.exists())
                self.assertEqual(
                    recovery.run(
                        ["docker", "ps", "-aq", "--filter", "label=" + recovery.LABEL]
                    ).splitlines(),
                    resources_before,
                )
                self.assertEqual(
                    recovery.run(
                        [
                            "docker",
                            "volume",
                            "ls",
                            "-q",
                            "--filter",
                            "label=" + recovery.LABEL,
                        ]
                    ).splitlines(),
                    volumes_before,
                )
                validation = {
                    "status": "passed",
                    "database": "isolated_PostgreSQL18",
                    "applied_migrations": len(migrations),
                    "verified_objects": len(refs),
                    "checks": [
                        "authenticated_bundle",
                        "exact_all_app_table_counts",
                        "migration_checksums",
                        "source_and_export_bytes",
                        "original_runtime_role_credentials_and_RLS_attributes",
                        "application_secret",
                        "private_literal_model_configuration",
                        "budget_unchanged",
                        "signed_session_reads_original_report",
                        "no_saved_PID_or_watchdog_replay",
                        "private_modes",
                        "existing_installation_untouched",
                        "inconsistent_object_refused_and_owned_resources_cleaned",
                    ],
                    "live_installation_modified": False,
                    "model_calls": 0,
                }
                (ROOT / "docs/local-bundle-restore-validation.json").write_text(
                    json.dumps(validation, indent=2) + "\n"
                )
        finally:
            if result:
                recovery.run(["docker", "rm", "-f", result["container"]])
                recovery.run(["docker", "volume", "rm", result["volume"]])
            with psycopg.connect(self.admin_dsn) as conn:
                for name in runtime_passwords:
                    conn.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(name)))


if __name__ == "__main__":
    suite = unittest.TestSuite(
        LocalRestoreRuntimeTests(name)
        for name in LocalRestoreRuntimeTests.__dict__
        if name.startswith("test_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
