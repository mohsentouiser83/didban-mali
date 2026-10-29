"""Disposable report-bound proposal lifecycle tests."""

import unittest
from test_reports_runtime import ReportTests


class ActionableRuntimeTests(ReportTests):
    def test_approved_payroll_is_pinned_privately_to_analysis(self):
        from test_payroll_runtime import PayrollRuntimeTests

        modules = self.owner.get(self.base + "/modules").json()
        modules["modules"]["payroll"] = True
        changed = self.mutate(
            self.owner,
            "PUT",
            self.base + "/modules",
            {"modules": modules["modules"], "reason": "آزمون اتصال حقوق"},
            version=modules["version"],
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        self.finance = self.client("finance")
        self.pay = self.base + "/payroll"
        self.employee = lambda: PayrollRuntimeTests.employee(self)
        employee, run, _ = PayrollRuntimeTests.prepare(self)
        approved = self.mutate(
            self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
        )
        self.assertEqual(approved.status_code, 201, approved.text)
        _, report = self.report_fixture()
        settings_url = self.base + "/analysis-settings"
        pinned = self.finance.get(settings_url).json()
        changed = self.mutate(
            self.finance,
            "PUT",
            settings_url,
            {"materiality_ratio": "0.8", "reason": "تغییر پس از انتشار گزارش"},
            version=pinned["version"],
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        url = self.base + "/reports/" + report["id"] + "/actionable-analysis"
        result = self.mutate(self.finance, "POST", url)
        self.assertEqual(result.status_code, 200, result.text)
        proposal = next(p for p in result.json()["items"] if p["axis"] == "payroll")
        self.assertEqual(
            proposal["content"]["priority_components"]["threshold"],
            pinned["materiality_ratio"],
        )
        self.assertNotEqual(
            proposal["content"]["priority_components"]["threshold"],
            changed.json()["materiality_ratio"],
        )
        snapshot = proposal["content"]["payroll_snapshot"]
        self.assertEqual(snapshot["periods"][0]["run_ids"], [run["id"]])
        self.assertEqual(
            snapshot["periods"][0]["employer_cost"],
            run["content"]["totals"]["employer_cost"],
        )
        self.assertNotIn("employee_scope", snapshot["periods"][0])
        self.assertNotIn(
            "payroll", {p["axis"] for p in self.owner.get(url).json()["items"]}
        )
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            content = conn.execute(
                "SELECT content FROM app.report_snapshots WHERE company_id=%s AND id=%s",
                (self.company, report["id"]),
            ).fetchone()["content"]
            self.assertNotIn("payroll_analysis", content)

    def test_actionable_snapshot_replay_followup_and_settings(self):
        modules = self.owner.get(self.base + "/modules").json()
        modules["modules"]["payroll"] = True
        enabled = self.mutate(
            self.owner,
            "PUT",
            self.base + "/modules",
            {"modules": modules["modules"], "reason": "آزمون تحلیل حقوق"},
            version=modules["version"],
        )
        self.assertEqual(enabled.status_code, 200, enabled.text)
        _, report = self.report_fixture()
        path = self.base + "/reports/" + report["id"] + "/actionable-analysis"
        result = self.mutate(self.owner, "POST", path)
        self.assertEqual(result.status_code, 200, result.text)
        items = result.json()["items"]
        self.assertEqual(
            {p["axis"] for p in items}, {"cash", "balances", "profit", "quality"}
        )
        again = self.mutate(self.owner, "POST", path)
        self.assertEqual(result.json(), again.json())
        finance = self.client("finance")
        payroll = self.mutate(finance, "POST", path)
        self.assertEqual(payroll.status_code, 200, payroll.text)
        self.assertIn("payroll", {p["axis"] for p in payroll.json()["items"]})
        self.assertNotIn(
            "payroll",
            {p["axis"] for p in self.client("viewer").get(path).json()["items"]},
        )
        proposal = items[0]
        follow = self.base + "/analysis-proposals/" + proposal["id"] + "/followup"
        rejected = self.mutate(
            self.owner,
            "PATCH",
            follow,
            {"status": "rejected", "reason": " "},
            version=1,
        )
        self.assertEqual(rejected.status_code, 422, rejected.text)
        done = self.mutate(
            self.owner,
            "PATCH",
            follow,
            {"status": "done", "reason": "بررسی شد"},
            version=1,
        )
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(done.json()["content"]["resolution"], "not_evaluated")
        stale = self.mutate(
            self.owner,
            "PATCH",
            follow,
            {"status": "in_progress", "reason": ""},
            version=1,
        )
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(
            self.mutate(
                self.client("viewer"),
                "PATCH",
                follow,
                {"status": "done", "reason": ""},
                version=2,
            ).status_code,
            403,
        )
        self.assertEqual(self.client("outsider").get(path).status_code, 404)
        settings = self.base + "/analysis-settings"
        self.assertEqual(
            self.mutate(
                self.owner,
                "PUT",
                settings,
                {"materiality_ratio": "0.2", "reason": "آستانه"},
                version=1,
            ).status_code,
            403,
        )
        changed = self.mutate(
            self.client("finance"),
            "PUT",
            settings,
            {"materiality_ratio": "0.2", "reason": "آستانه"},
            version=1,
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["version"], 2)


if __name__ == "__main__":
    suite = unittest.TestSuite(
        ActionableRuntimeTests(name)
        for name in ActionableRuntimeTests.__dict__
        if name.startswith("test_")
    )
    r = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not r.wasSuccessful())
