"""Real end-to-end private exports, approval scopes, failure and fencing."""

import hashlib
from io import BytesIO
import json
from pathlib import Path
import unittest
import psycopg
from psycopg import sql
import tempfile
import shutil
from unittest.mock import patch
from uuid import uuid4
from openpyxl import load_workbook
from test_forecast_workflow import ForecastWorkflowTests
from didban.manage import migrate
from didban.application.report_worker import ReportWorker
from didban.adapters.report_rendering import render as real_render

ROOT = Path(__file__).resolve().parents[1]


class ReportTests(ForecastWorkflowTests):
    def report_fixture(self):
        session, manifest = self.publish_fixture()
        self.start_analysis(session)
        self.finish_forecast(session)
        reports = self.owner.get(self.base + "/reports").json()["items"]
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0]["manifest_id"], manifest)
        return session, reports[0]

    def drain(self):
        worker = ReportWorker(self.worker_settings)
        for _ in range(30):
            if not worker.run_once():
                return
        self.fail("export worker did not drain")

    def test_export_layout_revision_keeps_old_snapshot_exports_and_metrics(self):
        _, first = self.report_fixture()
        self.drain()
        with psycopg.connect(self.dsn) as conn:
            original = conn.execute(
                "SELECT content_hash,content FROM app.report_snapshots WHERE id=%s",
                (first["id"],),
            ).fetchone()
            hashes = conn.execute(
                "SELECT id,sha256 FROM app.export_jobs WHERE report_id=%s ORDER BY id",
                (first["id"],),
            ).fetchall()
        with patch(
            "didban.infrastructure.reports.EXPORT_LAYOUT_VERSION",
            "report-rows-next-test",
        ):
            response = self.mutate(
                self.owner,
                "POST",
                self.base + "/results/" + first["manifest_id"] + "/reports",
                None,
            )
            self.assertEqual(response.status_code, 201, response.text)
            second = response.json()
            repeated = self.mutate(
                self.owner,
                "POST",
                self.base + "/results/" + first["manifest_id"] + "/reports",
                None,
            )
            self.assertEqual(repeated.json()["id"], second["id"])
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(second["revision_number"], first["revision_number"] + 1)
        self.assertEqual(second["approval_ids"], [])
        self.drain()
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT content_hash,content FROM app.report_snapshots WHERE id=%s",
                    (first["id"],),
                ).fetchone(),
                original,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT id,sha256 FROM app.export_jobs WHERE report_id=%s ORDER BY id",
                    (first["id"],),
                ).fetchall(),
                hashes,
            )
            fresh = conn.execute(
                "SELECT content FROM app.report_snapshots WHERE id=%s", (second["id"],)
            ).fetchone()[0]
            self.assertEqual(fresh["metrics"], original[1]["metrics"])

    def test_report_outputs_exact_pinned_approved_and_download_authorized(self):
        session, report = self.report_fixture()
        self.assertEqual(self.detail(session)["status"], "waiting_dependency")
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            conn.execute(
                "UPDATE app.processing_sessions SET analysis_context=analysis_context-'report_id' WHERE company_id=%s AND id=%s",
                (self.company, session["id"]),
            )
        linked = self.mutate(
            self.owner,
            "POST",
            self.base + "/results/" + report["manifest_id"] + "/reports",
            None,
        )
        self.assertEqual(linked.status_code, 201, linked.text)
        self.assertEqual(self.detail(session)["report_id"], report["id"])
        self.drain()
        loaded = self.owner.get(self.base + "/reports/" + report["id"])
        self.assertEqual(loaded.status_code, 200, loaded.text)
        result = loaded.json()
        self.assertIn("row_review", result)
        with psycopg.connect(self.dsn) as conn:
            stored_rows = conn.execute(
                "SELECT content->'rows' FROM app.report_snapshots WHERE id=%s",
                (report["id"],),
            ).fetchone()[0]
        from didban.domain.reports import row_disposition

        self.assertEqual(
            result["row_review"],
            {
                "errors": sum(row_disposition(row) == "error" for row in stored_rows),
                "excluded_overlap": sum(
                    row_disposition(row) == "excluded_overlap" for row in stored_rows
                ),
            },
        )
        self.assertEqual(self.detail(session)["status"], "completed_limited")
        self.assertEqual(result["label"], "تولیدشده سامانه")
        self.assertEqual(result["forecast_closing"], "2628")
        self.assertEqual(
            {e["format"] for e in result["exports"]}, {"pdf", "xlsx", "error_csv"}
        )
        self.assertTrue(all(e["status"] == "ready" for e in result["exports"]))
        viewer = self.client("viewer")
        outside = self.client("outsider")
        for job in result["exports"]:
            url = self.base + "/exports/" + job["id"] + "/content"
            downloaded = viewer.get(url)
            self.assertEqual(downloaded.status_code, 200, downloaded.text[:100])
            self.assertEqual(
                hashlib.sha256(downloaded.content).hexdigest(), job["sha256"]
            )
            self.assertIn("attachment;", downloaded.headers["content-disposition"])
            self.assertEqual(outside.get(url).status_code, 404)
            if job["format"] == "xlsx":
                book = load_workbook(BytesIO(downloaded.content), data_only=False)
                self.assertFalse(
                    any(c.data_type == "f" for ws in book for row in ws for c in row)
                )
                values = [c.value for row in book["شاخص‌ها"] for c in row]
                self.assertIn("2798", values)
            if job["format"] == "pdf":
                self.assertTrue(downloaded.content.startswith(b"%PDF"))
                output = ROOT / ".local/report-validation/baseline.pdf"
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(downloaded.content)
                with self.app.state.db.transaction(
                    identity=False, actor=self.users["owner"], company=self.company
                ) as conn:
                    original = conn.execute(
                        "SELECT content,content_hash,revision_number FROM app.report_snapshots WHERE company_id=%s AND id=%s",
                        (self.company, report["id"]),
                    ).fetchone()
                payload = original["content"] | {
                    "_report": {
                        "id": report["id"],
                        "content_hash": original["content_hash"],
                        "revision_number": original["revision_number"],
                    }
                }
                (output.parent / "baseline-content.json").write_text(
                    json.dumps(payload, ensure_ascii=False)
                )
        denied = self.mutate(
            self.owner,
            "POST",
            self.base + "/reports/" + report["id"] + "/approvals",
            {"confirmed": True},
            version=1,
        )
        self.assertEqual(denied.status_code, 403)
        finance = self.client("finance")
        approved = self.mutate(
            finance,
            "POST",
            self.base + "/reports/" + report["id"] + "/approvals",
            {"confirmed": True},
            version=1,
        )
        self.assertEqual(approved.status_code, 201, approved.text)
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            candidate = conn.execute(
                "SELECT c.* FROM app.reconciliation_candidates c JOIN app.reconciliation_runs r ON r.company_id=c.company_id AND r.id=c.run_id WHERE r.company_id=%s AND r.manifest_id=%s LIMIT 1",
                (self.company, report["manifest_id"]),
            ).fetchone()
        changed = self.mutate(
            self.owner,
            "POST",
            self.base
            + "/reconciliation-proposals/"
            + str(candidate["id"])
            + "/decisions",
            {"action": "needs_review", "reason": "بررسی دوباره نمونه"},
            version=candidate["row_version"],
        )
        self.assertEqual(changed.status_code, 201, changed.text)
        revised = self.mutate(
            self.owner,
            "POST",
            self.base + "/results/" + report["manifest_id"] + "/reports",
            None,
        )
        self.assertEqual(revised.status_code, 201, revised.text)
        self.assertNotEqual(revised.json()["id"], report["id"])
        self.assertEqual(revised.json()["approval_ids"], [])
        self.assertEqual(self.detail(session)["status"], "completed_limited")
        historical = self.owner.get(self.base + "/reports/" + report["id"]).json()
        self.assertEqual(historical["content_hash"], report["content_hash"])
        self.assertEqual(len(historical["approval_ids"]), 1)
        self.drain()

    def test_render_failure_retry_and_stale_claim_never_publish(self):
        session, report = self.report_fixture()
        worker = ReportWorker(self.worker_settings)
        with patch(
            "didban.application.report_worker.render", side_effect=OSError("synthetic")
        ):
            self.assertTrue(worker.run_once())
        jobs = self.owner.get(self.base + "/reports/" + report["id"]).json()["exports"]
        failed = next(j for j in jobs if j["status"] == "failed")
        self.assertEqual(
            self.owner.get(
                self.base + "/exports/" + failed["id"] + "/content"
            ).status_code,
            409,
        )
        self.assertEqual(self.detail(session)["status"], "waiting_dependency")
        retried = self.mutate(
            self.owner, "POST", self.base + "/exports/" + failed["id"] + "/retry", None
        )
        self.assertEqual(retried.status_code, 202, retried.text)
        replacement = str(uuid4())

        def stolen(format, content, fonts):
            with self.app.state.db.transaction(
                identity=False, actor=self.users["owner"], company=self.company
            ) as conn:
                active = conn.execute(
                    "SELECT id FROM app.export_jobs WHERE company_id=%s AND report_id=%s AND status='running' ORDER BY created_at,id LIMIT 1",
                    (self.company, report["id"]),
                ).fetchone()
                conn.execute(
                    "UPDATE app.export_jobs SET lease_token=%s,lease_expires_at=clock_timestamp()+interval '1 hour' WHERE company_id=%s AND id=%s",
                    (replacement, self.company, active["id"]),
                )
            return real_render(format, content, fonts)

        with patch("didban.application.report_worker.render", side_effect=stolen):
            self.assertTrue(worker.run_once())
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            stolen_job = conn.execute(
                "SELECT * FROM app.export_jobs WHERE company_id=%s AND report_id=%s AND lease_token=%s",
                (self.company, report["id"], replacement),
            ).fetchone()
            self.assertEqual(stolen_job["status"], "running")
            self.assertIsNone(stolen_job["object_key"])
            conn.execute(
                "UPDATE app.export_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE company_id=%s AND id=%s",
                (self.company, stolen_job["id"]),
            )
        self.drain()
        self.assertEqual(self.detail(session)["status"], "completed_limited")
        self.assertTrue(
            all(
                j["status"] == "ready"
                for j in self.owner.get(self.base + "/reports/" + report["id"]).json()[
                    "exports"
                ]
            )
        )

    def test_revoked_requester_requires_explicit_audited_adoption(self):
        session, report = self.report_fixture()
        worker = ReportWorker(self.worker_settings)
        finance = self.client("finance")
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.users SET disabled_at=clock_timestamp() WHERE id=%s",
                (self.users["owner"],),
            )
        try:
            self.assertFalse(worker.run_once())
            jobs = finance.get(self.base + "/reports/" + report["id"]).json()["exports"]
            self.assertTrue(
                all(j["error_code"] == "export_permission_required" for j in jobs)
            )
            for job in jobs:
                adopted = self.mutate(
                    finance,
                    "POST",
                    self.base + "/exports/" + job["id"] + "/retry",
                    None,
                )
                self.assertEqual(adopted.status_code, 202, adopted.text)
            self.drain()
            self.assertTrue(
                all(
                    j["status"] == "ready"
                    for j in finance.get(self.base + "/reports/" + report["id"]).json()[
                        "exports"
                    ]
                )
            )
            with self.app.state.db.transaction(
                identity=False, actor=self.users["finance"], company=self.company
            ) as conn:
                rows = conn.execute(
                    "SELECT requested_by,generation_actor_id FROM app.export_jobs WHERE company_id=%s AND report_id=%s",
                    (self.company, report["id"]),
                ).fetchall()
                self.assertTrue(
                    all(
                        str(r["requested_by"]) == self.users["owner"]
                        and str(r["generation_actor_id"]) == self.users["finance"]
                        for r in rows
                    )
                )
                audit = conn.execute(
                    "SELECT safe_details FROM app.audit_events WHERE company_id=%s AND action='export.retried'",
                    (self.company,),
                ).fetchall()
                self.assertEqual(len(audit), 3)
                self.assertTrue(
                    all(
                        r["safe_details"]["before_actor"] == self.users["owner"]
                        and r["safe_details"]["after_actor"] == self.users["finance"]
                        for r in audit
                    )
                )
        finally:
            with psycopg.connect(self.dsn) as conn:
                conn.execute(
                    "UPDATE app.users SET disabled_at=NULL WHERE id=%s",
                    (self.users["owner"],),
                )

    def test_forward_upgrade_preserves_existing_report_and_immutability(self):
        db_name = "report_upgrade_" + uuid4().hex[:12]
        with psycopg.connect(self.admin_dsn, autocommit=True) as conn:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
        upgrade_dsn = psycopg.conninfo.make_conninfo(self.admin_dsn, dbname=db_name)
        original_dsn = self.dsn
        try:
            with tempfile.TemporaryDirectory(prefix="didban-report-upgrade-") as folder:
                temp = Path(folder)
                (temp / "database").mkdir()
                for source in sorted((ROOT / "database").glob("*.sql")):
                    if int(source.name[:3]) <= 12:
                        shutil.copy(source, temp / "database" / source.name)
                with patch("didban.manage.ROOT", temp):
                    migrate(upgrade_dsn)
            with psycopg.connect(upgrade_dsn) as conn:
                conn.execute(
                    "INSERT INTO app.users(id,email,password_hash,display_name) VALUES(%s,'upgrade@fixture.invalid','synthetic','upgrade')",
                    (self.users["owner"],),
                )
                conn.execute(
                    "INSERT INTO app.companies(id,name) VALUES(%s,'upgrade')",
                    (self.company,),
                )
                conn.execute(
                    "INSERT INTO app.company_memberships(company_id,user_id,role) VALUES(%s,%s,'owner')",
                    (self.company, self.users["owner"]),
                )
            self.dsn = upgrade_dsn
            report_id = self.seed_reports()[0]
            self.dsn = original_dsn
            migrate(upgrade_dsn)
            with psycopg.connect(upgrade_dsn) as conn:
                row = conn.execute(
                    "SELECT content,content_hash,input_fingerprint FROM app.report_snapshots WHERE id=%s",
                    (report_id,),
                ).fetchone()
                self.assertEqual(row[0], {})
                self.assertEqual(row[1], row[2])
                with self.assertRaises(psycopg.errors.CheckViolation):
                    with conn.transaction():
                        conn.execute(
                            "UPDATE app.report_snapshots SET content='{\"changed\":true}' WHERE id=%s",
                            (report_id,),
                        )
        finally:
            self.dsn = original_dsn
            with psycopg.connect(self.admin_dsn, autocommit=True) as conn:
                conn.execute(
                    sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                        sql.Identifier(db_name)
                    )
                )


if __name__ == "__main__":
    suite = unittest.TestSuite(
        ReportTests(name) for name in ReportTests.__dict__ if name.startswith("test_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    (ROOT / "docs/reports-validation.json").write_text(
        json.dumps(
            {
                "status": "passed"
                if result.wasSuccessful() and not result.skipped
                else "failed_or_not_run",
                "tests_run": result.testsRun,
                "failures": len(result.failures),
                "errors": len(result.errors),
                "skipped": len(result.skipped),
                "model_calls": 0,
                "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "api_source_sha256": {
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((ROOT / "apps/api/didban").rglob("*.py"))
                },
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
