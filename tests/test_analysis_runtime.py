"""Real durable continuation, global clarification barrier and cancellation."""

from dataclasses import replace
import hashlib
import json
from pathlib import Path
import unittest
import psycopg
from starlette.testclient import TestClient
from test_financial_runtime import FinancialTests
from didban.main import create_app
from didban.application.analysis_worker import AnalysisWorker

ROOT = Path(__file__).resolve().parents[1]


class AnalysisTests(FinancialTests):
    def start_analysis(self, session):
        result = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/analyze",
            None,
            version=self.detail(session)["session_version"],
        )
        self.assertEqual(result.status_code, 202, result.text)
        return result

    def finish_analysis(self, session):
        worker = AnalysisWorker(self.worker_settings)
        questions = 0
        for _ in range(60):
            state = self.detail(session)
            if state["analysis_finished_at"]:
                return state, questions
            if state["status"] == "waiting_input":
                self.assertFalse(worker.run_once())
                issue = self.issue(session)
                self.assertTrue(issue["code"].startswith("forecast_"), issue)
                choices = issue["constraints"].get("choices", [])
                answer = (
                    {
                        "kind": "choice",
                        "value": "unknown" if "unknown" in choices else choices[0],
                    }
                    if choices
                    else {"kind": "unknown"}
                )
                result = self.mutate(
                    self.owner,
                    "POST",
                    self.base + "/processing-issues/" + issue["id"] + "/answers",
                    {"answer": answer},
                    version=state["session_version"],
                )
                self.assertEqual(result.status_code, 201, result.text)
                questions += 1
            self.assertTrue(worker.run_once())
        self.fail("Domain analysis did not finish")

    def test_pinned_core_continues_once_with_barrier_and_immutable_metrics(self):
        session = self.prepared()
        self.start_financial(session)
        state = self.finish_financial(session)
        path = self.base + "/results/" + state["manifest_id"]
        before = self.owner.get(path + "/metrics?limit=100").json()
        self.start_analysis(session)
        result, _ = self.finish_analysis(session)
        self.assertEqual(result["status"], "waiting_dependency")
        self.assertEqual(self.owner.get(path + "/metrics?limit=100").json(), before)
        self.assertFalse(AnalysisWorker(self.worker_settings).run_once())
        runs = self.owner.get(path + "/reconciliations").json()["items"]
        self.assertEqual(len(runs), 3)
        self.assertEqual(len({r["kind"] for r in runs}), 3)

    def test_cancel_before_domain_dispatch_has_no_late_effects(self):
        session = self.prepared()
        self.start_financial(session)
        self.finish_financial(session)
        self.start_analysis(session)
        result = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/cancel",
            None,
            version=self.detail(session)["session_version"],
        )
        self.assertEqual(result.status_code, 202, result.text)
        self.assertFalse(AnalysisWorker(self.worker_settings).run_once())
        self.assertEqual(self.detail(session)["status"], "cancelled")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.reconciliation_runs WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                0,
            )

    def test_upload_policy_schedules_post_core_analysis_automatically(self):
        app = create_app(replace(self.settings, auto_analysis=True))
        lifetime = TestClient(app, base_url="https://testserver")
        lifetime.__enter__()
        self.addCleanup(lifetime.__exit__, None, None, None)
        self.owner = self.client("owner", app=app)
        session = self.prepared()
        self.start_financial(session)
        self.finish_financial(session)
        state = self.detail(session)
        self.assertTrue(any(s["kind"] == "analysis:domains" for s in state["steps"]))
        result, _ = self.finish_analysis(session)
        self.assertIsNotNone(result["analysis_finished_at"])


if __name__ == "__main__":
    suite = unittest.TestSuite(
        AnalysisTests(name)
        for name in AnalysisTests.__dict__
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
        "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "api_source_sha256": {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / "apps/api/didban").rglob("*.py"))
        },
    }
    (ROOT / "docs/analysis-validation.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
