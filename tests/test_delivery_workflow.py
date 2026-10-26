"""Real source files through private artifacts, approval and a revised forecast."""

from __future__ import annotations
import hashlib
from io import BytesIO
import json
from pathlib import Path
import unittest

from openpyxl import load_workbook
import psycopg

from test_forecast_workflow import ForecastWorkflowTests
from didban.application.report_worker import ReportWorker

ROOT = Path(__file__).resolve().parents[1]


class DeliveryWorkflowTests(ForecastWorkflowTests):
    def finish_delivery(self, session):
        state = self.detail(session)
        self.assertIsNotNone(state["analysis_finished_at"])
        self.assertIsNotNone(state["report_id"])
        worker = ReportWorker(self.worker_settings)
        for _ in range(6):
            state = self.detail(session)
            if state["status"] in ("completed", "completed_limited"):
                break
            self.assertTrue(worker.run_once())
        else:
            self.fail("Report artifacts did not complete the session")
        self.assertFalse(worker.run_once())
        report = self.owner.get(self.base + "/reports/" + state["report_id"])
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(
            {r["format"] for r in report.json()["exports"]},
            {"pdf", "xlsx", "error_csv"},
        )
        self.assertTrue(all(r["status"] == "ready" for r in report.json()["exports"]))
        return state, report.json()

    def test_upload_to_exports_approval_and_new_forecast_preserve_old_report(self):
        session, manifest = self.publish_fixture()
        self.start_analysis(session)
        self.finish_forecast(session, check_authorization=True)
        state, report = self.finish_delivery(session)
        self.assertEqual(state["status"], "completed_limited")  # Moadian files absent.
        self.assertEqual(report["label"], "تولیدشده سامانه")
        files = {}
        for export in report["exports"]:
            result = self.owner.get(self.base + "/exports/" + export["id"] + "/content")
            self.assertEqual(
                result.status_code, 200, result.text[:200] if result.is_error else ""
            )
            self.assertTrue(
                result.headers["content-disposition"].startswith("attachment;")
            )
            self.assertEqual(result.headers["x-content-type-options"], "nosniff")
            self.assertEqual(
                hashlib.sha256(result.content).hexdigest(), export["sha256"]
            )
            files[export["format"]] = result.content
        self.assertTrue(files["pdf"].startswith(b"%PDF-"))
        self.assertTrue(files["error_csv"].startswith(b"\xef\xbb\xbf"))
        book = load_workbook(BytesIO(files["xlsx"]), data_only=False)
        self.assertTrue(book.worksheets)
        self.assertTrue(
            all(c.data_type != "f" for sheet in book for row in sheet for c in row)
        )
        book.close()

        report_path = self.base + "/reports/" + report["id"]
        viewer = self.client("viewer")
        self.assertEqual(
            self.mutate(
                viewer,
                "POST",
                report_path + "/approvals",
                {"confirmed": True},
                version=report["version"],
            ).status_code,
            403,
        )
        self.assertEqual(
            self.mutate(
                self.owner,
                "POST",
                report_path + "/approvals",
                {"confirmed": True},
                version=report["version"],
            ).status_code,
            403,
        )
        finance = self.client("finance")
        approval = self.mutate(
            finance,
            "POST",
            report_path + "/approvals",
            {"confirmed": True},
            version=report["version"],
        )
        self.assertEqual(approval.status_code, 201, approval.text)
        original = self.owner.get(report_path).json()
        self.assertEqual(original["approval_ids"], [approval.json()["id"]])

        created = self.mutate(
            self.owner, "POST", self.base + "/results/" + manifest + "/forecasts", {}
        )
        self.assertEqual(created.status_code, 201, created.text)
        continuation = {"id": created.json()["session_id"]}
        self.assertNotEqual(continuation["id"], session["id"])
        self.assertEqual(self.detail(session), state)
        self.finish_forecast(continuation, unknown_dates=True)
        _, revised = self.finish_delivery(continuation)
        self.assertNotEqual(revised["id"], original["id"])
        self.assertNotEqual(revised["content_hash"], original["content_hash"])
        self.assertEqual(revised["approval_ids"], [])
        self.assertEqual(self.owner.get(report_path).json(), original)
        for export in original["exports"]:
            content = self.owner.get(
                self.base + "/exports/" + export["id"] + "/content"
            ).content
            self.assertEqual(content, files[export["format"]])
        with psycopg.connect(self.dsn) as conn:
            with self.assertRaises(psycopg.errors.CheckViolation):
                with conn.transaction():
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='sealed' WHERE id=%s",
                        (session["id"],),
                    )
        self.assert_no_model_requests()


if __name__ == "__main__":
    suite = unittest.TestSuite(
        DeliveryWorkflowTests(name)
        for name in DeliveryWorkflowTests.__dict__
        if name.startswith("test_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {
        "status": "passed"
        if result.wasSuccessful() and not result.skipped
        else "failed_or_not_run",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "model_calls": 0,
        "source_sha256": {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / "apps/api/didban").rglob("*.py"))
        },
    }
    (ROOT / "docs/delivery-workflow-validation.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
