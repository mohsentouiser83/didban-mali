"""Real HTTP/DB forecast lifecycle; typed questions, barriers and immutable runs.

Uses synthetic files and deterministic workers only. A GET with an unanswered
question models a disconnected/closed UI; this is not a browser interaction test.
"""

from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import unittest
import psycopg
from test_analysis_runtime import AnalysisTests
from didban.application.analysis_worker import AnalysisWorker
from didban.application.financial_worker import FinancialWorker

ROOT = Path(__file__).resolve().parents[1]


class ForecastWorkflowTests(AnalysisTests):
    def publish_fixture(self, *, bank=True):
        previous = self.period(starts_on="2026-08-01", ends_on="2026-08-31")
        current = self.period(
            starts_on="2026-09-01",
            ends_on="2026-09-30",
            previous_period_id=previous["id"],
        )
        session = self.session(current)
        names = (
            "ledger.xlsx",
            "bank.xlsx",
            "invoices.xlsx",
            "settlements.csv",
            "planned-payments.csv",
            "receipt-history.csv",
        )
        for name in names:
            if name == "bank.xlsx" and not bank:
                continue
            path = ROOT / "docs/validation/rebuild-v1/inputs/baseline" / name
            uploaded = self.upload(session, path.read_bytes(), name=name)
            self.assertEqual(uploaded.status_code, 202, uploaded.text)
        self.assertEqual(self.seal(session).status_code, 202)
        self.complete_coverage(session)
        self.start_financial(session)
        worker = FinancialWorker(self.worker_settings)
        for _ in range(100):
            state = self.detail(session)
            if state["manifest_id"]:
                self.assertEqual(
                    self.metrics(state["manifest_id"])["ar_invoice"]["value"], "600"
                )
                self.assertEqual(
                    self.metrics(state["manifest_id"])["cash"]["value"],
                    "2798" if bank else None,
                )
                return session, state["manifest_id"]
            if state["status"] == "waiting_input":
                issue = self.issue(session)
                key = issue["constraints"]["financial_key"]
                choices = issue["constraints"]["choices"]
                if key.startswith("income_tax|"):
                    value = (
                        "recognized"
                        if key.endswith(current["id"])
                        else "zero_confirmed"
                    )
                elif key.startswith("cogs|"):
                    value = (
                        "recognized" if key.endswith(current["id"]) else "not_required"
                    )
                elif key.startswith("binding|"):
                    value = (
                        "بانک الف" if "بانک الف" in issue["question_fa"] else "بانک ب"
                    )
                else:
                    value = next(
                        c
                        for c in (
                            "declared_complete",
                            "affirmed",
                            "recognized",
                            "start_of_day",
                        )
                        if c in choices
                    )
                answered = self.answer(session, value)
                self.assertEqual(answered.status_code, 201, answered.text)
            self.assertTrue(worker.run_once())
        self.fail("Core fixture did not publish")

    def forecast_answer(self, session, issue, answer, *, client=None, version=None):
        state = self.detail(session)
        return self.mutate(
            client or self.owner,
            "POST",
            self.base + "/processing-issues/" + issue["id"] + "/answers",
            {"answer": answer},
            version=state["session_version"] if version is None else version,
        )

    def finish_forecast(
        self, session, *, unknown_dates=False, check_authorization=False
    ):
        worker = AnalysisWorker(self.worker_settings)
        checked = False
        date_keys = []
        choice_keys = []
        for _ in range(80):
            state = self.detail(session)
            if state["analysis_finished_at"]:
                self.assertTrue(
                    date_keys,
                    "The baseline must exercise an actual expected-date question",
                )
                self.assertIn("policy", choice_keys)
                self.assertIn("payments_complete", choice_keys)
                self.assertFalse(worker.run_once())
                forecast = self.owner.get(
                    self.base + "/forecasts/" + state["manifest_id"]
                )
                self.assertEqual(forecast.status_code, 200, forecast.text)
                return forecast.json(), date_keys
            if state["status"] == "waiting_input":
                issue = self.issue(session)
                self.assertTrue(issue["code"].startswith("forecast_"), issue)
                key = issue["constraints"]["forecast_key"]
                # The whole session stays paused after reads and worker wakeups;
                # neither a closed UI nor elapsed time supplies an answer.
                self.assertFalse(worker.run_once())
                self.assertEqual(self.issue(session)["id"], issue["id"])
                self.assertEqual(
                    self.detail(session)["session_version"], state["session_version"]
                )
                if issue["answer_kind"] == "choice":
                    choice_keys.append(key)
                    self.assertIn("affirmed", issue["constraints"]["choices"])
                    answer = {"kind": "choice", "value": "affirmed"}
                else:
                    self.assertEqual(issue["answer_kind"], "date")
                    date_keys.append(key)
                    when = (
                        "2026-10-05"
                        if key.startswith("receipt|")
                        else "2026-10-12"
                        if key.startswith("payment|")
                        else str(
                            date.fromisoformat(issue["constraints"]["min_date"])
                            + timedelta(days=4)
                        )
                    )
                    valid = {"kind": "date", "value": when}
                    if check_authorization and not checked:
                        viewer = self.client("viewer")
                        denied = self.forecast_answer(
                            session, issue, valid, client=viewer
                        )
                        self.assertEqual(denied.status_code, 403, denied.text)
                        stale = self.forecast_answer(
                            session, issue, valid, version=state["session_version"] - 1
                        )
                        self.assertEqual(stale.status_code, 409, stale.text)
                        invalid = self.forecast_answer(
                            session, issue, {"kind": "date", "value": "2026-09-30"}
                        )
                        self.assertEqual(invalid.status_code, 422, invalid.text)
                        self.assertEqual(
                            self.detail(session)["status"], "waiting_input"
                        )
                        self.assertEqual(self.issue(session)["id"], issue["id"])
                        checked = True
                    answer = {"kind": "unknown"} if unknown_dates else valid
                result = self.forecast_answer(session, issue, answer)
                self.assertEqual(result.status_code, 201, result.text)
            self.assertTrue(worker.run_once())
        self.fail("Forecast workflow did not finish")

    def assert_no_model_requests(self):
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            count = conn.execute(
                "SELECT count(*) AS n FROM app.model_requests WHERE company_id=%s",
                (self.company,),
            ).fetchone()["n"]
        self.assertEqual(count, 0)

    def test_typed_date_barrier_permissions_and_immutable_previous_forecast(self):
        session, manifest = self.publish_fixture()
        before = self.owner.get(
            self.base + "/results/" + manifest + "/metrics?limit=100"
        ).json()
        self.start_analysis(session)
        forecast, keys = self.finish_forecast(session, check_authorization=True)
        self.assertTrue(any(key.startswith("receipt|") for key in keys))
        self.assertEqual(forecast["status"], "estimated")
        self.assertEqual(len(forecast["days"]), 30)
        self.assertEqual(forecast["days"][0]["date"], "2026-10-01")
        self.assertEqual(forecast["days"][-1]["date"], "2026-10-30")
        self.assertEqual(forecast["days"][-1]["closing"], "2628")
        self.assertEqual(sum(d["expected_in"] == "600" for d in forecast["days"]), 1)
        self.assertEqual(
            next(
                d["expected_in"] for d in forecast["days"] if d["date"] == "2026-10-05"
            ),
            "600",
        )
        old_path = self.base + "/forecast-runs/" + forecast["run_id"]
        old = self.owner.get(old_path).json()
        self.assertEqual(old["status"], "published")
        # A fresh forecast is a separate revision, even for the same core snapshot.
        created = self.mutate(
            self.owner, "POST", self.base + "/results/" + manifest + "/forecasts", {}
        )
        self.assertEqual(created.status_code, 201, created.text)
        continuation = {"id": created.json()["session_id"]}
        self.assertNotEqual(continuation["id"], session["id"])
        original_state = self.detail(session)
        second, _ = self.finish_forecast(continuation, unknown_dates=True)
        self.assertEqual(self.detail(session), original_state)
        self.assertNotEqual(second["run_id"], forecast["run_id"])
        self.assertEqual(second["status"], "limited")
        self.assertTrue(all(d["status"] == "limited" for d in second["days"]))
        self.assertTrue(
            all("expected_date_unknown" in d["reason_codes"] for d in second["days"])
        )
        self.assertEqual(second["days"][0]["opening"], "2798")
        self.assertEqual(self.owner.get(old_path).json(), old)
        self.assertEqual(
            self.owner.get(
                self.base + "/results/" + manifest + "/metrics?limit=100"
            ).json(),
            before,
        )
        with psycopg.connect(self.dsn) as conn:
            conn.execute("SET LOCAL search_path=app,pg_catalog")
            with self.assertRaises(psycopg.errors.CheckViolation):
                with conn.transaction():
                    conn.execute(
                        "UPDATE app.forecast_runs SET content='{}'::jsonb WHERE company_id=%s AND id=%s",
                        (self.company, forecast["run_id"]),
                    )
        self.assert_no_model_requests()

    def test_unknown_date_and_missing_bank_keep_future_cash_null(self):
        session, manifest = self.publish_fixture(bank=False)
        self.start_analysis(session)
        forecast, _ = self.finish_forecast(session, unknown_dates=True)
        self.assertEqual(forecast["status"], "unavailable")
        self.assertEqual(len(forecast["days"]), 30)
        self.assertTrue(
            all(d["opening"] is None and d["closing"] is None for d in forecast["days"])
        )
        self.assertTrue(all(d["status"] == "unavailable" for d in forecast["days"]))
        self.assertTrue(
            all("balance_anchor_missing" in d["reason_codes"] for d in forecast["days"])
        )
        self.assertTrue(
            all("expected_date_unknown" in d["reason_codes"] for d in forecast["days"])
        )
        self.assertIsNone(self.metrics(manifest)["cash"]["value"])
        self.assertEqual(self.metrics(manifest)["ar_invoice"]["value"], "600")
        self.assert_no_model_requests()


if __name__ == "__main__":
    suite = unittest.TestSuite(
        ForecastWorkflowTests(name)
        for name in ForecastWorkflowTests.__dict__
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
        "browser_interactions_tested": False,
        "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "api_source_sha256": {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / "apps/api/didban").rglob("*.py"))
        },
    }
    (ROOT / "docs/forecast-workflow-validation.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
