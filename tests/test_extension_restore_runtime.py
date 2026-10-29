"""Restore populated extension tables and retain payroll confidentiality.

Reuses the authenticated backup/restore scenario against two disposable PG18
containers. Synthetic employee data only; never points at the user's installation.
"""

import unittest
import json
from pathlib import Path
from test_restore_runtime import RestoreTests, RESULT


class ExtensionRestoreTests(RestoreTests):
    def publish_fixture(self, **kwargs):
        modules = self.owner.get(self.base + "/modules").json()
        modules["modules"]["payroll"] = True
        changed = self.mutate(
            self.owner,
            "PUT",
            self.base + "/modules",
            {"modules": modules["modules"], "reason": "آزمون بازیابی"},
            version=modules["version"],
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        finance = self.client("finance")
        result = self.mutate(
            finance,
            "POST",
            self.base + "/payroll/employees",
            {
                "personnel_code": "RESTORE01",
                "profile": {
                    "name": "کارمند محرمانه بازیابی",
                    "hired_on": "2026-01-01",
                    "insurance_number": "00001234",
                },
            },
        )
        self.assertEqual(result.status_code, 201, result.text)
        member = self.members["advisor"]
        grant = self.mutate(
            self.owner,
            "PUT",
            self.base + "/memberships/" + member["id"] + "/payroll-permissions",
            {
                "view": True,
                "manage": False,
                "approve": False,
                "reason": "آزمون بازیابی مجوز",
            },
            version=1,
        )
        self.assertEqual(grant.status_code, 200, grant.text)
        return super().publish_fixture(**kwargs)

    def finish_forecast(self, session, **kwargs):
        result = super().finish_forecast(session, **kwargs)
        report = self.owner.get(self.base + "/reports").json()["items"][-1]
        generated = self.mutate(
            self.owner,
            "POST",
            self.base + "/reports/" + report["id"] + "/actionable-analysis",
        )
        self.assertEqual(generated.status_code, 200, generated.text)
        item = generated.json()["items"][0]
        followed = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/analysis-proposals/" + item["id"] + "/followup",
            {"status": "in_progress", "reason": "آزمون سابقه"},
            version=item["version"],
        )
        self.assertEqual(followed.status_code, 200, followed.text)
        finance = self.client("finance")
        settings = self.mutate(
            finance,
            "PUT",
            self.base + "/analysis-settings",
            {"materiality_ratio": "0.2", "reason": "آزمون بازیابی تنظیم"},
            version=1,
        )
        self.assertEqual(settings.status_code, 200, settings.text)
        return result

    def client(self, user=None, *, app=None, **kwargs):
        client = super().client(user, app=app, **kwargs)
        if app is not None and app is not self.app and user in ("owner", "viewer"):
            self.assertEqual(
                client.get(self.base + "/payroll/employees").status_code, 403
            )
            finance = super().client("finance", app=app)
            restored = finance.get(self.base + "/payroll/employees")
            self.assertEqual(restored.status_code, 200, restored.text)
            person = next(
                p
                for p in restored.json()["items"]
                if p["personnel_code"] == "RESTORE01"
            )
            self.assertEqual(person["profile"]["insurance_number"], "00001234")
            advisor = super().client("advisor", app=app)
            access = advisor.get(self.base + "/payroll-access")
            self.assertEqual(access.status_code, 200, access.text)
            self.assertTrue(access.json()["view"])
            self.assertFalse(access.json()["manage"])
            self.assertFalse(access.json()["approve"])
            settings = finance.get(self.base + "/analysis-settings")
            self.assertEqual(settings.status_code, 200, settings.text)
            self.assertEqual(settings.json()["materiality_ratio"], "0.2")
            reports = client.get(self.base + "/reports").json()["items"]
            proposals = client.get(
                self.base + "/reports/" + reports[-1]["id"] + "/actionable-analysis"
            )
            self.assertEqual(proposals.status_code, 200, proposals.text)
            self.assertTrue(
                any(p["followup"] == "in_progress" for p in proposals.json()["items"])
            )

        return client


if __name__ == "__main__":
    case = ExtensionRestoreTests(
        "test_generated_report_approval_archive_and_originals_survive_authenticated_restore"
    )
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([case]))
    report = {
        **RESULT,
        "status": "passed" if result.wasSuccessful() else "failed",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "extension_fixture": "payroll employee + explicit grant + modules + actionable proposal/followup/settings",
        "restored_payroll_finance_access": "verified"
        if result.wasSuccessful()
        else "not_verified",
        "restored_payroll_owner_viewer_denial": "verified"
        if result.wasSuccessful()
        else "not_verified",
        "live_installation_modified": False,
        "legal_acceptance": False,
    }
    (
        Path(__file__).resolve().parents[1] / "docs/extension-restore-validation.json"
    ).write_text(json.dumps(report, indent=2) + "\n")
    raise SystemExit(not result.wasSuccessful())
