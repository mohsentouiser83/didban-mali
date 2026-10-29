"""Disabled financial branches must still finish with immutable limited reports."""

import unittest
from test_reports_runtime import ReportTests
from didban.application.analysis_worker import AnalysisWorker
from didban.application.report_worker import ReportWorker


class ModuleWorkflowTests(ReportTests):
    def _run_disabled(self, keys):
        state = self.owner.get(self.base + "/modules").json()
        for key in keys:
            state["modules"][key] = False
        changed = self.mutate(
            self.owner,
            "PUT",
            self.base + "/modules",
            {"modules": state["modules"], "reason": "آزمون شاخه‌های غیرفعال"},
            version=state["version"],
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        session, manifest = self.publish_fixture()
        self.start_analysis(session)
        worker = AnalysisWorker(self.worker_settings)
        for _ in range(20):
            current = self.detail(session)
            if current.get("analysis_finished_at"):
                break
            self.assertNotEqual(current["status"], "waiting_input", current)
            self.assertTrue(worker.run_once())
        else:
            self.fail("Disabled branches failed to finish")
        self.assertFalse(worker.run_once())
        reports = self.owner.get(self.base + "/reports").json()["items"]
        self.assertEqual(len(reports), 1)
        report = reports[0]
        self.assertEqual(report["manifest_id"], manifest)
        runs = self.owner.get(
            self.base + "/results/" + manifest + "/reconciliations"
        ).json()["items"]
        self.assertEqual(runs, [])
        self.drain()
        after = self.detail(session)
        self.assertIn(after["status"], ("completed", "completed_limited"))
        self.assertFalse(ReportWorker(self.worker_settings).run_once())

    def test_disabled_cash_moadian_forecast_finish_without_loop(self):
        self._run_disabled(("cash", "moadian", "forecast"))

    def test_all_specialist_modules_disabled_still_finish(self):
        self._run_disabled(
            (
                "accounting",
                "cash",
                "balances",
                "invoices",
                "settlements",
                "moadian",
                "forecast",
                "payroll",
            )
        )


if __name__ == "__main__":
    suite = unittest.TestSuite(
        ModuleWorkflowTests(name)
        for name in ModuleWorkflowTests.__dict__
        if name.startswith("test_")
    )
    r = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not r.wasSuccessful())
