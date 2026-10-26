"""Pinned period report, real restricted projections and immutable daily evidence."""

from pathlib import Path
import hashlib
import json
import unittest
import psycopg
from psycopg.rows import dict_row
from test_reconciliation_runtime import ReconciliationTests
from didban.infrastructure.cashflow import ensure_cashflow_snapshot

ROOT = Path(__file__).resolve().parents[1]


class CashflowTests(ReconciliationTests):
    def snapshot(self, manifest):
        with psycopg.connect(self.settings.app_dsn, row_factory=dict_row) as conn:
            conn.execute("SET LOCAL search_path=app,pg_catalog")
            conn.execute(
                "SELECT set_config('app.user_id',%s,true),set_config('app.company_id',%s,true)",
                (self.users["owner"], self.company),
            )
            return ensure_cashflow_snapshot(conn, self.company, manifest)

    def test_daily_report_pagination_unknown_anchor_and_external_proof(self):
        manifest = self.reference_manifest()
        run = self.start_run(manifest)
        snapshot = self.snapshot(manifest)
        path = self.base + "/results/" + manifest + "/cash-days"
        result = self.owner.get(path + "?limit=2")
        self.assertEqual(result.status_code, 200, result.text)
        first = result.json()
        self.assertEqual(len(first["items"]), 2)
        self.assertEqual(first["items"][0]["inflow_recorded"], "100")
        self.assertEqual(first["items"][0]["inflow_external"], "100")
        self.assertIsNone(first["items"][0]["closing"])
        self.assertTrue(first["snapshot_created_at"])
        self.assertTrue(first["next_cursor"])
        nextpage = self.owner.get(path + "?limit=100&cursor=" + first["next_cursor"])
        self.assertEqual(nextpage.status_code, 200, nextpage.text)
        self.assertEqual(len(nextpage.json()["items"]), 28)
        viewer = self.client("viewer")
        bad = viewer.get(path + "?cursor=" + first["next_cursor"])
        self.assertEqual(bad.status_code, 422)
        with psycopg.connect(self.dsn) as conn:
            conn.execute("SET LOCAL search_path=app,pg_catalog")
            self.assertTrue(snapshot["payload"]["comparison_decision_ids"])
            with self.assertRaises(psycopg.errors.CheckViolation):
                conn.execute(
                    "UPDATE app.cashflow_period_snapshots SET payload='{}' WHERE id=%s",
                    (snapshot["id"],),
                )
        candidate = next(
            c for c in self.candidates(run) if c["classification"] == "exact_unique"
        )
        changed = self.mutate(
            self.owner,
            "POST",
            self.base + "/reconciliation-proposals/" + candidate["id"] + "/decisions",
            {"action": "reject", "reason": "بررسی دوباره پس از انتشار"},
            version=candidate["version"],
        )
        self.assertEqual(changed.status_code, 201, changed.text)
        self.assertEqual(self.owner.get(path + "?limit=2").json(), first)

    def test_missing_bank_never_returns_zero_cash_or_gross_flow(self):
        session = self.prepared()
        self.start_financial(session)
        manifest = self.finish_financial(session)["manifest_id"]
        self.snapshot(manifest)
        result = self.owner.get(
            self.base + "/results/" + manifest + "/cash-days?limit=100"
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(
            all(
                d["closing"] is None and d["inflow_recorded"] is None
                for d in result.json()["items"]
            )
        )
        self.assertEqual(
            self.owner.get(
                self.base + "/results/" + manifest + "/cash-accounts"
            ).json()["items"],
            [],
        )


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.TestSuite(
            CashflowTests(name)
            for name in CashflowTests.__dict__
            if name.startswith("test_")
        )
    )
    (ROOT / "docs/cashflow-validation.json").write_text(
        json.dumps(
            {
                "status": "passed"
                if result.wasSuccessful() and not result.skipped
                else "failed_or_not_run",
                "tests_run": result.testsRun,
                "failures": len(result.failures),
                "errors": len(result.errors),
                "skipped": len(result.skipped),
                "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
