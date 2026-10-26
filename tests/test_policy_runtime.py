"""Real scoped policy changes, pinned worker parameters and source preservation."""

from datetime import date, timedelta
from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import hashlib
import io
import json
from pathlib import Path
from uuid import uuid4
import unittest
import psycopg
from test_financial_runtime import FinancialTests
from didban.adapters.private_files import PrivateFiles
from didban.application.source_cleanup_worker import SourceCleanupWorker
from didban.infrastructure.policies import configured_policy
from didban.infrastructure.settlements import project
from didban.application.forecast import new_run

ROOT = Path(__file__).resolve().parents[1]


class PolicyTests(FinancialTests):
    def policy(
        self, *, kind="upload", parameters=None, client=None, day=None, key=None
    ):
        if day is None:
            with self.app.state.db.transaction(
                identity=False, actor=self.users["owner"], company=self.company
            ) as conn:
                day = (
                    conn.execute(
                        "SELECT (clock_timestamp() AT TIME ZONE timezone)::date AS today FROM app.companies WHERE id=%s",
                        (self.company,),
                    )
                    .fetchone()["today"]
                    .isoformat()
                )
        return self.mutate(
            client or self.owner,
            "POST",
            self.base + "/policies",
            {
                "kind": kind,
                "parameters": parameters
                or {
                    "max_files": 1,
                    "max_data_rows": 20,
                    "max_file_bytes": 10000,
                    "max_expanded_bytes": 10000,
                },
                "effective_from": day or date.today().isoformat(),
                "reason": "synthetic explicit policy change",
            },
            key=key,
        )

    def test_policy_config_is_validated_versioned_role_guarded_and_consumed(self):
        denied = self.policy(client=self.client("advisor"))
        self.assertEqual(denied.status_code, 403, denied.text)
        bad = self.policy(
            parameters={
                "max_files": 11,
                "max_data_rows": 20,
                "max_file_bytes": 10000,
                "max_expanded_bytes": 10000,
            }
        )
        self.assertEqual(bad.status_code, 422, bad.text)
        key = uuid4().hex
        created = self.policy(client=self.client("finance"), key=key)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["validation_status"], "evaluated")
        self.assertEqual(
            self.policy(client=self.client("finance"), key=key).json()["id"],
            created.json()["id"],
        )
        session = self.session()
        self.assertEqual(self.upload(session, b"a,b\n1,2\n").status_code, 202)
        rejected = self.upload(session, b"a,b\n3,4\n", name="second.csv")
        self.assertEqual(rejected.status_code, 413, rejected.text)
        self.assertEqual(self.seal(session).status_code, 202)
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            step = conn.execute(
                "SELECT policy_id FROM app.processing_steps WHERE company_id=%s AND session_id=%s LIMIT 1",
                (self.company, session["id"]),
            ).fetchone()
            self.assertEqual(str(step["policy_id"]), created.json()["id"])
            with self.assertRaises(psycopg.errors.CheckViolation):
                with conn.transaction():
                    conn.execute(
                        "UPDATE app.policy_versions SET parameters='{}' WHERE company_id=%s AND id=%s",
                        (self.company, created.json()["id"]),
                    )

    def test_future_policy_not_active_and_forecast_remains_proposed(self):
        future = self.policy(day=(date.today() + timedelta(days=3)).isoformat())
        self.assertEqual(future.status_code, 201, future.text)
        session = self.session()
        self.assertEqual(self.upload(session, b"a,b\n1,2\n").status_code, 202)
        self.assertEqual(
            self.upload(session, b"a,b\n3,4\n", name="second.csv").status_code, 202
        )
        self.assertEqual(self.seal(session).status_code, 202)
        forecast = self.policy(
            kind="forecast",
            parameters={
                "minimum_events": 5,
                "lookback_days": 90,
                "delay_method": "amount_weighted_median",
            },
        )
        self.assertEqual(forecast.status_code, 201, forecast.text)
        self.assertEqual(forecast.json()["validation_status"], "proposed")
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            configured = configured_policy(conn, self.company, "forecast")
            self.assertEqual(configured["parameters"]["minimum_events"], 5)
            rows = conn.execute(
                "SELECT p.* FROM app.processing_steps s JOIN app.policy_versions p ON p.id=s.policy_id AND p.company_id=s.company_id WHERE s.company_id=%s AND s.session_id=%s",
                (self.company, session["id"]),
            ).fetchall()
            self.assertTrue(all(str(r["id"]) != future.json()["id"] for r in rows))

    def test_new_upload_caps_are_rechecked_when_sealing_existing_draft(self):
        session = self.session()
        self.assertEqual(self.upload(session, b"a,b\n1,2\n").status_code, 202)
        self.assertEqual(
            self.upload(session, b"a,b\n3,4\n", name="second.csv").status_code, 202
        )
        self.assertEqual(self.policy().status_code, 201)
        blocked = self.seal(session)
        self.assertEqual(blocked.status_code, 413, blocked.text)
        self.assertEqual(self.detail(session)["status"], "receiving")

    def test_retention_defaults_null_versioned_owner_only_no_automatic_purge(self):
        path = self.base + "/retention-policy"
        original = self.owner.get(path)
        self.assertEqual(original.status_code, 200, original.text)
        self.assertIsNone(original.json()["retention_days"])
        body = {"retention_days": 30, "reason": "test retention"}
        denied = self.mutate(self.client("finance"), "PATCH", path, body, version=1)
        self.assertEqual(denied.status_code, 403, denied.text)
        changed = self.mutate(self.owner, "PATCH", path, body, version=1)
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["version"], 2)
        self.assertFalse(changed.json()["automatic_deletion"])
        self.assertEqual(
            self.mutate(self.owner, "PATCH", path, body, version=1).status_code, 409
        )

    def test_archive_preserves_historical_metrics_and_blocks_delete(self):
        session = self.prepared()
        self.start_financial(session)
        manifest = self.finish_financial(session)["manifest_id"]
        metric_path = self.base + "/results/" + manifest + "/metrics?limit=100"
        before = self.owner.get(metric_path).json()
        configured = self.policy(
            kind="forecast",
            parameters={
                "minimum_events": 5,
                "lookback_days": 90,
                "delay_method": "amount_weighted_median",
            },
        )
        self.assertEqual(configured.status_code, 201, configured.text)
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            project(conn, self.company, manifest)
            session_row = conn.execute(
                "SELECT * FROM app.processing_sessions WHERE company_id=%s AND id=%s",
                (self.company, session["id"]),
            ).fetchone()
            run = new_run(conn, self.company, session_row, manifest)
            self.assertEqual(run["inputs"]["policy"]["minimum_events"], 5)
            self.assertEqual(run["inputs"]["policy"]["lookback_days"], 90)
            self.assertFalse(run["answers"].get("policy", False))
        file = self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/files"
        ).json()["items"][0]
        path = self.base + "/source-files/" + file["id"]
        denied = self.mutate(
            self.client("finance"),
            "PATCH",
            path + "/archive",
            {"archived": True},
            version=file["version"],
        )
        self.assertEqual(denied.status_code, 403)
        archived = self.mutate(
            self.owner,
            "PATCH",
            path + "/archive",
            {"archived": True},
            version=file["version"],
        )
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertTrue(archived.json()["archived"])
        self.assertEqual(self.owner.get(metric_path).json(), before)
        impact = self.owner.get(path + "/deletion-impact").json()
        self.assertFalse(impact["hard_delete_allowed"])
        self.assertTrue(impact["dependencies"])
        deleted = self.mutate(
            self.owner,
            "POST",
            path + "/deletion",
            {"confirmed": True, "reason": "test"},
            version=archived.json()["version"],
        )
        self.assertEqual(deleted.status_code, 409, deleted.text)
        self.assertTrue(
            self.owner.get(path + "/deletion-impact").json()["dependencies"]
        )

    def test_concurrent_upload_and_delete_cannot_purge_referenced_original(self):
        storage = PrivateFiles(self.settings.storage_root, self.settings.max_file_bytes)
        data = b"a,b\n1,2\n"
        stored = storage.store(self.company, "race.csv", io.BytesIO(data))
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            row = conn.execute(
                "INSERT INTO app.source_files(company_id,sha256,original_name,object_key,byte_size,format,scan_status,uploaded_by) VALUES(%s,%s,'race.csv',%s,%s,'csv','clean',%s) RETURNING *",
                (
                    self.company,
                    stored.sha256,
                    stored.key,
                    stored.byte_size,
                    self.users["owner"],
                ),
            ).fetchone()
        session = self.session()
        delete_client, upload_client = self.client("owner"), self.client("owner")
        barrier = Barrier(2)

        def remove():
            barrier.wait()
            return self.mutate(
                delete_client,
                "POST",
                self.base + "/source-files/" + str(row["id"]) + "/deletion",
                {"confirmed": True, "reason": "race synthetic"},
                version=1,
            )

        def upload():
            barrier.wait()
            return self.upload(session, data, name="race.csv", client=upload_client)

        with ThreadPoolExecutor(max_workers=2) as pool:
            a, b = pool.submit(remove), pool.submit(upload)
            removed, uploaded = a.result(), b.result()
        self.assertIn(removed.status_code, (202, 409), removed.text)
        self.assertEqual(uploaded.status_code, 202, uploaded.text)
        worker = SourceCleanupWorker(self.worker_settings)
        while worker.run_once():
            pass
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            live = conn.execute(
                "SELECT object_key FROM app.source_files WHERE company_id=%s AND id=%s",
                (self.company, uploaded.json()["id"]),
            ).fetchone()
        self.assertTrue(storage.path(live["object_key"]).exists())
        if removed.status_code == 202:
            self.assertNotEqual(uploaded.json()["id"], str(row["id"]))

    def test_dependency_free_delete_is_durable_physical_cleanup_not_fake_success(self):
        storage = PrivateFiles(self.settings.storage_root, self.settings.max_file_bytes)
        stored = storage.store(self.company, "orphan.csv", io.BytesIO(b"a,b\n1,2\n"))
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            row = conn.execute(
                "INSERT INTO app.source_files(company_id,sha256,original_name,object_key,byte_size,format,scan_status,uploaded_by) VALUES(%s,%s,'orphan.csv',%s,%s,'csv','clean',%s) RETURNING *",
                (
                    self.company,
                    stored.sha256,
                    stored.key,
                    stored.byte_size,
                    self.users["owner"],
                ),
            ).fetchone()
        path = self.base + "/source-files/" + str(row["id"])
        key = uuid4().hex
        result = self.mutate(
            self.owner,
            "POST",
            path + "/deletion",
            {"confirmed": True, "reason": "orphan only"},
            version=1,
            key=key,
        )
        self.assertEqual(result.status_code, 202, result.text)
        self.assertTrue(storage.path(stored.key).exists())
        op = self.owner.get(self.base + "/operations/" + result.json()["operation_id"])
        self.assertEqual(op.json()["status"], "accepted")
        with self.assertRaises(RuntimeError):
            SourceCleanupWorker(replace(self.worker_settings, dsn=self.dsn))
        worker = SourceCleanupWorker(self.worker_settings)
        self.assertTrue(worker.run_once())
        self.assertFalse(worker.run_once())
        self.assertFalse(storage.path(stored.key).exists())
        self.assertEqual(
            self.owner.get(
                self.base + "/operations/" + result.json()["operation_id"]
            ).json()["status"],
            "succeeded",
        )
        self.assertEqual(
            self.mutate(
                self.owner,
                "POST",
                path + "/deletion",
                {"confirmed": True, "reason": "orphan only"},
                version=1,
                key=key,
            ).json(),
            result.json(),
        )


if __name__ == "__main__":
    suite = unittest.TestSuite(
        [PolicyTests(n) for n in PolicyTests.__dict__ if n.startswith("test_")]
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sources = [
        ROOT / "tests/test_policy_runtime.py",
        ROOT / "database/014_policy_retention_runtime.sql",
        *sorted((ROOT / "apps/api/didban").rglob("*polic*.py")),
        ROOT / "apps/api/didban/application/source_cleanup_worker.py",
        ROOT / "apps/api/didban/application/intake.py",
        ROOT / "apps/api/didban/application/forecast.py",
        ROOT / "apps/api/didban/infrastructure/financial.py",
        ROOT / "apps/api/didban/infrastructure/interpretation.py",
    ]
    (ROOT / "docs/policy-validation.json").write_text(
        json.dumps(
            {
                "status": "passed" if result.wasSuccessful() else "failed",
                "tests_run": result.testsRun,
                "failures": len(result.failures),
                "errors": len(result.errors),
                "model_calls": 0,
                "source_sha256": {
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sources
                },
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(not result.wasSuccessful())
