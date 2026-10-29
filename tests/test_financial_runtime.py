"""Real restricted worker/database publication, evidence, barriers and revision tests."""

import hashlib
import json
from pathlib import Path
import unittest
import psycopg
from test_interpretation import InterpretationTests
from didban.application.financial_worker import FinancialWorker

ROOT = Path(__file__).resolve().parents[1]


class FinancialTests(InterpretationTests):
    def prepared(self, kind="ledger", data=None):
        period = self.period(starts_on="2026-09-01", ends_on="2026-09-30")
        session = self.session(period)
        if data is None:
            data = b"entry_id,date,account,debit,credit,entry_type,role,currency\nE1,2026-09-01,101,100,0,regular,bank,IRR\nE1,2026-09-01,701,0,100,regular,revenue,IRR\n"
        self.upload_csv(session, data.decode())
        self.complete_coverage(session)
        return session

    def start_financial(self, session):
        state = self.detail(session)
        if state.get("input_review_required") and not state.get(
            "input_review_confirmed"
        ):
            review_url = (
                self.base + "/processing-sessions/" + session["id"] + "/input-review"
            )
            review = self.owner.get(review_url)
            self.assertEqual(review.status_code, 200, review.text)
            result = self.mutate(
                self.owner,
                "POST",
                review_url + "/confirm",
                {"snapshot_hash": review.json()["snapshot_hash"]},
                version=review.json()["session_version"],
            )
            self.assertEqual(result.status_code, 200, result.text)
            return
        result = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/calculate",
            None,
            version=self.detail(session)["session_version"],
        )
        self.assertEqual(result.status_code, 202, result.text)

    def finish_financial(self, session, unknown=False):
        worker = FinancialWorker(self.worker_settings)
        for _ in range(100):
            state = self.detail(session)
            if state.get("manifest_id"):
                return state
            if state["status"] == "waiting_input":
                issue = self.issue(session)
                self.assertEqual(issue["code"], "financial_declaration")
                choices = issue["constraints"]["choices"]
                value = (
                    "unknown"
                    if unknown
                    else (
                        "declared_complete"
                        if "declared_complete" in choices
                        else "affirmed"
                        if "affirmed" in choices
                        else "zero_confirmed"
                        if "zero_confirmed" in choices
                        else "not_required"
                        if "not_required" in choices
                        else choices[0]
                    )
                )
                self.assertEqual(self.answer(session, value).status_code, 201)
            self.assertTrue(worker.run_once())
        self.fail("Financial stage did not publish")

    def metrics(self, manifest):
        result = self.owner.get(
            self.base + "/results/" + manifest + "/metrics?limit=100"
        )
        self.assertEqual(result.status_code, 200, result.text)
        return {m["metric_key"]: m for m in result.json()["items"]}

    def test_upload_policy_automatically_schedules_financial_stage(self):
        from dataclasses import replace
        from didban.main import create_app

        from fastapi.testclient import TestClient

        app = create_app(replace(self.settings, auto_financial=True))
        with TestClient(app, base_url="https://testserver"):
            self.owner = self.client("owner", app=app)
            session = self.prepared()
            self.assertFalse(self.detail(session)["manifest_id"])
            self.start_financial(session)
            state = self.finish_financial(session)
            self.assertEqual(
                self.metrics(state["manifest_id"])["revenue"]["value"], "100"
            )

    def test_reference_baseline_exact_metrics_and_comparison(self):
        previous = self.period(starts_on="2026-08-01", ends_on="2026-08-31")
        period = self.period(
            starts_on="2026-09-01",
            ends_on="2026-09-30",
            previous_period_id=previous["id"],
        )
        session = self.session(period)
        for name in ("ledger.xlsx", "bank.xlsx", "invoices.xlsx", "settlements.csv"):
            path = ROOT / "docs/validation/rebuild-v1/inputs/baseline" / name
            result = self.upload(session, path.read_bytes(), name=name)
            self.assertEqual(result.status_code, 202, result.text)
        self.assertEqual(self.seal(session).status_code, 202)
        self.complete_coverage(session)
        self.start_financial(session)
        worker = FinancialWorker(self.worker_settings)
        for _ in range(100):
            state = self.detail(session)
            if state.get("manifest_id"):
                break
            if state["status"] == "waiting_input":
                issue = self.issue(session)
                key = issue["constraints"]["financial_key"]
                choices = issue["constraints"]["choices"]
                if key.startswith("income_tax|"):
                    value = (
                        "recognized" if key.endswith(period["id"]) else "zero_confirmed"
                    )
                elif key.startswith("cogs|"):
                    value = (
                        "recognized" if key.endswith(period["id"]) else "not_required"
                    )
                elif key.startswith("binding|"):
                    value = (
                        "بانک الف" if "بانک الف" in issue["question_fa"] else "بانک ب"
                    )
                    if value not in choices:
                        value = next(c for c in choices if c in issue["question_fa"])
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
                self.assertEqual(self.answer(session, value).status_code, 201)
            self.assertTrue(worker.run_once())
        else:
            self.fail("Baseline did not publish")
        metrics = self.metrics(state["manifest_id"])
        self.assertEqual(
            {c["scope_key"] for c in metrics["revenue"]["coverage"]}, {"ledger"}
        )
        expected = {
            "revenue": ("1200", "800"),
            "expense": ("752", "400"),
            "net_profit": ("448", "400"),
            "cash": ("2798", "1900"),
            "ar_ledger": ("600", "300"),
            "ar_invoice": ("600", "300"),
            "ap_trade_ledger": ("500", "200"),
            "ap_invoice": ("500", "200"),
            "debt_total_ledger": ("1150", "200"),
        }
        for key, (now, prior) in expected.items():
            self.assertEqual(metrics[key]["value"], now, (key, metrics[key]))
            self.assertEqual(metrics[key]["comparison"]["value"], prior, key)

    def test_publication_evidence_missing_sources_and_barrier(self):
        session = self.prepared()
        self.start_financial(session)
        worker = FinancialWorker(self.worker_settings)
        self.assertTrue(worker.run_once())
        self.assertEqual(self.detail(session)["status"], "waiting_input")
        self.assertFalse(worker.run_once())
        state = self.finish_financial(session)
        self.assertEqual(state["status"], "waiting_dependency")
        self.assertIsNotNone(state["financial_finished_at"])
        manifest = state["manifest_id"]
        metrics = self.metrics(manifest)
        self.assertEqual(len(metrics), 12)
        self.assertEqual(metrics["revenue"]["value"], "100")
        self.assertEqual(metrics["cash"]["status"], "unavailable")
        self.assertIn("source_missing", metrics["cash"]["reason_codes"])
        self.assertIsNone(metrics["cash"]["value"])
        for metric in metrics.values():
            self.assertTrue(metric["evidence_refs"])
            evidence = self.owner.get(
                self.base + "/evidence/" + metric["evidence_refs"][0]
            )
            self.assertEqual(evidence.status_code, 200, evidence.text)
            self.assertEqual(evidence.json()["manifest_id"], manifest)
        self.assertFalse(worker.run_once())
        listing = self.owner.get(self.base + "/results").json()["items"]
        self.assertEqual([m["id"] for m in listing], [manifest])
        self.assertIsNone(listing[0]["forecast_policy_id"])
        self.assertEqual(listing[0]["scope_key"], "core_financial_v1")
        file = self.files(session)[0]
        denied_mapping = self.mutate(
            self.owner,
            "PUT",
            self.file_path(session, file) + "/interpretation",
            {
                "sheet_name": "CSV",
                "header_row": 1,
                "source_kind": "ignore",
                "unit": None,
                "calendar": None,
                "mapping": [],
                "reason": "آزمون حفظ نتیجه منتشرشده",
            },
            version=state["session_version"],
        )
        self.assertEqual(denied_mapping.status_code, 409, denied_mapping.text)
        denied = self.mutate(
            self.client("viewer"),
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/calculate",
            None,
            version=state["session_version"],
        )
        self.assertEqual(denied.status_code, 403)
        with psycopg.connect(self.dsn) as conn:
            conn.execute("SET LOCAL search_path=app,pg_catalog")
            with self.assertRaises(psycopg.errors.CheckViolation):
                conn.execute(
                    "UPDATE app.metric_observations SET value=999 WHERE manifest_id=%s",
                    (manifest,),
                )

    def test_head_race_rebases_and_reasks_dataset_declarations(self):
        from unittest.mock import patch
        from didban.application import financial_worker as module

        first = self.prepared()
        period = {"id": first["period_id"]}
        second = self.session(period)
        data = "entry_id,date,account,debit,credit,entry_type,role,currency\nE2,2026-09-02,101,200,0,regular,bank,IRR\nE2,2026-09-02,701,0,200,regular,revenue,IRR\n"
        self.upload_csv(second, data)
        self.complete_coverage(second)
        self.start_financial(first)
        worker = FinancialWorker(self.worker_settings)
        # Resolve every declaration of the first dataset, but stop before its final run.
        self.assertTrue(worker.run_once())
        while self.detail(first)["status"] == "waiting_input":
            issue = self.issue(first)
            choices = issue["constraints"]["choices"]
            value = next(
                c
                for c in (
                    "declared_complete",
                    "affirmed",
                    "zero_confirmed",
                    "not_required",
                )
                if c in choices
            )
            self.assertEqual(self.answer(first, value).status_code, 201)
            if issue["constraints"]["financial_key"] == "ledger_opening_complete":
                break
            self.assertTrue(worker.run_once())
        self.start_financial(second)
        original = module.publish
        raced = []

        def publish_with_competing_head(*args, **kwargs):
            if not raced:
                raced.append(True)
                # A real second worker transaction publishes a competing dataset.
                with patch.object(module, "publish", original):
                    self.finish_financial(second)
            return original(*args, **kwargs)

        with patch.object(module, "publish", publish_with_competing_head):
            self.assertTrue(worker.run_once())
        self.assertIsNone(self.detail(first)["manifest_id"])
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.outbox_events SET available_at=clock_timestamp() WHERE session_id=%s AND event_kind='financial.calculate' AND published_at IS NULL",
                (first["id"],),
            )
        self.assertTrue(worker.run_once())
        self.assertEqual(self.detail(first)["status"], "waiting_input")
        self.assertTrue(
            self.issue(first)["constraints"]["financial_key"].startswith("coverage|")
        )
        final = self.finish_financial(first)
        self.assertEqual(self.metrics(final["manifest_id"])["revenue"]["value"], "300")
        self.assertEqual(
            self.metrics(self.detail(second)["manifest_id"])["revenue"]["value"], "200"
        )

    def test_invoice_before_period_requires_dated_settlement_history(self):
        import io
        import openpyxl

        period = self.period(starts_on="2026-09-01", ends_on="2026-09-30")
        book = openpyxl.Workbook()
        sheet = book.active
        sheet.title = "فروش"
        sheet.append(
            ["invoice_id", "party_id", "issued_on", "gross", "record_role", "currency"]
        )
        sheet.append(["S-old", "C1", "2026-07-10", "100", "opening_invoice", "IRR"])
        stream = io.BytesIO()
        book.save(stream)
        events = b"event_id,invoice_id,date,amount,direction,currency\nR1,S-old,2026-07-20,40,receipt,IRR\nR2,S-old,2026-09-10,30,receipt,IRR\n"
        for complete in (False, True):
            session = self.session(period)
            self.assertEqual(
                self.upload(
                    session, stream.getvalue(), name="invoices.xlsx"
                ).status_code,
                202,
            )
            self.assertEqual(
                self.upload(session, events, name="settlements.csv").status_code, 202
            )
            self.assertEqual(self.seal(session).status_code, 202)
            self.complete_coverage(session)
            self.start_financial(session)
            worker = FinancialWorker(self.worker_settings)
            seen_history = False
            for _ in range(80):
                state = self.detail(session)
                if state.get("manifest_id"):
                    break
                if state["status"] == "waiting_input":
                    issue = self.issue(session)
                    choices = issue["constraints"]["choices"]
                    key = issue["constraints"]["financial_key"]
                    if key.startswith("history|settlements|"):
                        self.assertIn("2026-07-10", key)
                        seen_history = True
                        value = "declared_complete" if complete else "unknown"
                    else:
                        value = next(
                            c for c in ("declared_complete", "affirmed") if c in choices
                        )
                    self.assertEqual(self.answer(session, value).status_code, 201)
                self.assertTrue(worker.run_once())
            else:
                self.fail("Invoice history stage did not publish")
            self.assertTrue(seen_history)
            metric = self.metrics(state["manifest_id"])["ar_invoice"]
            if complete:
                self.assertEqual(metric["value"], "30")
            else:
                self.assertIsNone(metric["value"])
                self.assertIn("settlement_coverage_unknown", metric["reason_codes"])

    def test_missing_period_cannot_enqueue_financial_calculation(self):
        session = self.prepared()
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.processing_sessions SET period_id=NULL WHERE id=%s",
                (session["id"],),
            )
        result = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/calculate",
            None,
            version=self.detail(session)["session_version"],
        )
        self.assertEqual(result.status_code, 409, result.text)
        self.assertFalse(FinancialWorker(self.worker_settings).run_once())

    def test_unknown_declarations_do_not_fabricate_zero(self):
        session = self.prepared()
        self.start_financial(session)
        state = self.finish_financial(session, unknown=True)
        metrics = self.metrics(state["manifest_id"])
        self.assertIsNone(metrics["revenue"]["value"])
        self.assertEqual(metrics["revenue"]["status"], "unavailable")
        self.assertTrue(metrics["revenue"]["reason_codes"])

    def test_same_file_in_new_session_replaces_selection_without_double_counting(self):
        first = self.prepared()
        self.start_financial(first)
        before = self.finish_financial(first)
        second = self.session({"id": first["period_id"]})
        data = b"entry_id,date,account,debit,credit,entry_type,role,currency\nE1,2026-09-01,101,100,0,regular,bank,IRR\nE1,2026-09-01,701,0,100,regular,revenue,IRR\n"
        self.upload_csv(second, data.decode())
        self.complete_coverage(second)
        self.start_financial(second)
        after = self.finish_financial(second)
        self.assertEqual(self.metrics(after["manifest_id"])["revenue"]["value"], "100")
        self.assertEqual(self.metrics(before["manifest_id"])["revenue"]["value"], "100")
        self.assertNotEqual(before["manifest_id"], after["manifest_id"])
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.record_revisions WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                2,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.logical_records WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                2,
            )
        with psycopg.connect(self.dsn) as conn:
            rows = conn.execute(
                "SELECT d.parent_revision_id,(SELECT count(*) FROM app.dataset_file_selections s WHERE s.dataset_revision_id=d.id) FROM app.dataset_revisions d JOIN app.result_manifests m ON m.dataset_revision_id=d.id WHERE m.id=%s",
                (after["manifest_id"],),
            ).fetchone()
            self.assertIsNotNone(rows[0])
            self.assertEqual(rows[1], 1)


if __name__ == "__main__":
    suite = unittest.TestSuite(
        FinancialTests(name)
        for name in FinancialTests.__dict__
        if name.startswith("test_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    (ROOT / "docs/financial-validation.json").write_text(
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
                "api_source_sha256": {
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((ROOT / "apps/api/didban").rglob("*.py"))
                },
                "migration_sha256": {
                    p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((ROOT / "database").glob("*.sql"))
                },
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
