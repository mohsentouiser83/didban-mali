"""Real restricted DB/HTTP model dispatch with fake provider; no paid or external calls."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from threading import Event
import unittest
import psycopg
from test_financial_runtime import FinancialTests
from test_model_provider import SETTINGS, SELECTION
from didban.adapters.model_provider import (
    ProviderResult,
    ProviderFailure,
    OpenAIResponsesProvider,
)
from didban.application.model_worker import ModelWorker

ROOT = Path(__file__).resolve().parents[1]


class FakeProvider:
    def __init__(self, hook=None, failure=None):
        self.calls = 0
        self.hook = hook
        self.failure = failure

    def reservation(self, context):
        return OpenAIResponsesProvider(SETTINGS).reservation(context)

    def complete(self, context, request_id):
        self.calls += 1
        if self.hook:
            self.hook()
        if self.failure:
            raise self.failure
        return ProviderResult(SELECTION, 10, 20, "resp_fake")


class ModelRuntimeTests(FinancialTests):
    def test_avalai_dispatch_records_distinct_provider_tariff(self):
        prior = self.ask()
        self.assertTrue(self.worker_model().run_once())
        self.assertEqual(self.assistant_answer(prior)["status"], "ready")
        q = self.ask()
        self.assertTrue(
            self.worker_model(settings=replace(SETTINGS, provider="avalai")).run_once()
        )
        self.assertEqual(self.assistant_answer(q)["status"], "ready")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT t.provider FROM app.model_requests r JOIN app.model_tariffs t "
                    "ON t.id=r.tariff_id WHERE r.assistant_question_id=%s",
                    (q["id"],),
                ).fetchone()[0],
                "avalai",
            )
            original = conn.execute(
                "SELECT t.id,t.provider FROM app.model_requests r JOIN app.model_tariffs t "
                "ON t.id=r.tariff_id WHERE r.assistant_question_id=%s",
                (prior["id"],),
            ).fetchone()
            self.assertEqual(original[1], "openai")
            self.assertNotEqual(
                original[0],
                conn.execute(
                    "SELECT tariff_id FROM app.model_requests WHERE assistant_question_id=%s",
                    (q["id"],),
                ).fetchone()[0],
            )

    def setUp(self):
        super().setUp()
        self.admin = self.client("admin")
        current = self.admin.get("/api/v1/admin/budget-policy")
        if current.status_code == 404:
            r = self.mutate(
                self.admin,
                "POST",
                "/api/v1/admin/budget-policy",
                {"ceiling_usd": "100"},
            )
        else:
            r = self.mutate(
                self.admin,
                "PATCH",
                "/api/v1/admin/budget-policy",
                {"ceiling_usd": "100"},
                version=current.json()["version"],
            )
        self.assertIn(r.status_code, (200, 201), r.text)
        self.financial = self.prepared()
        self.start_financial(self.financial)
        self.snapshot = self.finish_financial(self.financial)["manifest_id"]

    def ask(self, client=None, key=None):
        r = self.mutate(
            client or self.owner,
            "POST",
            self.base + "/assistant/questions",
            {"manifest_id": self.snapshot, "question": "درآمد این دوره چقدر است؟"},
            key=key,
        )
        self.assertEqual(r.status_code, 202, r.text)
        return r.json()

    def assistant_answer(self, question, client=None):
        r = (client or self.owner).get(
            self.base + "/assistant/questions/" + question["id"]
        )
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def worker_model(self, provider=None, settings=SETTINGS):
        return ModelWorker(self.worker_settings, settings, provider or FakeProvider())

    def budget(self, value):
        p = self.admin.get("/api/v1/admin/budget-policy").json()
        r = self.mutate(
            self.admin,
            "PATCH",
            "/api/v1/admin/budget-policy",
            {"ceiling_usd": str(value)},
            version=p["version"],
        )
        self.assertEqual(r.status_code, 200, r.text)

    def retry(self, q, client=None):
        state = self.assistant_answer(q, client)
        return self.mutate(
            client or self.owner,
            "POST",
            self.base + "/assistant/questions/" + q["id"] + "/retry",
            version=state["version"],
        )

    def test_viewer_asks_readonly_and_receives_snapshot_evidence(self):
        viewer = self.client("viewer")
        q = self.ask(viewer)
        provider = FakeProvider()
        self.assertTrue(self.worker_model(provider).run_once())
        answer = self.assistant_answer(q, viewer)
        self.assertEqual(answer["status"], "ready")
        self.assertIn("۱۰۰", answer["answer_fa"])
        self.assertTrue(answer["evidence_refs"])
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.metrics(self.snapshot)["revenue"]["value"], "100")
        outsider = self.client("outsider")
        self.assertEqual(
            outsider.get(self.base + "/assistant/questions/" + q["id"]).status_code, 404
        )
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT billing_status FROM app.model_requests WHERE assistant_question_id=%s",
                    (q["id"],),
                ).fetchone()[0],
                "settled",
            )

    def test_missing_configuration_and_zero_cap_do_not_call_provider(self):
        from didban.adapters.model_provider import ModelSettings

        q = self.ask()
        provider = FakeProvider()
        self.worker_model(provider, ModelSettings()).run_once()
        self.assertEqual(
            self.assistant_answer(q)["dependency_code"], "model_unavailable"
        )
        self.assertEqual(provider.calls, 0)
        self.budget("0")
        self.assertEqual(self.retry(q).status_code, 202)
        self.worker_model(provider).run_once()
        self.assertEqual(
            self.assistant_answer(q)["dependency_code"], "budget_exhausted"
        )
        self.assertEqual(provider.calls, 0)
        self.budget("100")
        self.assertEqual(self.retry(q).status_code, 202)
        self.worker_model(provider).run_once()
        self.assertEqual(self.assistant_answer(q)["status"], "ready")
        self.assertEqual(provider.calls, 1)

    def test_unknown_usage_is_held_no_auto_retry_and_admin_can_reconcile(self):
        q = self.ask()
        provider = FakeProvider(failure=ProviderFailure("model_unavailable", sent=True))
        worker = self.worker_model(provider)
        worker.run_once()
        self.assertEqual(self.assistant_answer(q)["dependency_code"], "usage_unknown")
        self.assertFalse(worker.run_once())
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.retry(q).status_code, 409)
        charges = self.admin.get("/api/v1/admin/model-requests").json()["items"]
        self.assertTrue(charges)
        charge = charges[-1]
        self.assertGreater(Decimal(charge["reserved_usd"]), 0)
        self.assertEqual(
            self.owner.get("/api/v1/admin/model-requests").status_code, 403
        )
        r = self.mutate(
            self.admin,
            "POST",
            "/api/v1/admin/model-requests/" + charge["id"] + "/reconcile",
            {"actual_cost_usd": "0.2"},
        )
        self.assertEqual(r.status_code, 201, r.text)
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT billing_status,cost_overrun FROM app.model_requests WHERE id=%s",
                    (charge["id"],),
                ).fetchone(),
                ("settled", True),
            )

    def test_revocation_during_provider_call_blocks_answer_but_keeps_billing(self):
        viewer = self.client("viewer")
        q = self.ask(viewer)

        def revoke():
            with psycopg.connect(self.dsn) as conn:
                conn.execute("SET LOCAL search_path=app,pg_catalog")
                conn.execute(
                    "UPDATE app.company_memberships SET active=false WHERE company_id=%s AND user_id=%s",
                    (self.company, self.users["viewer"]),
                )

        self.worker_model(FakeProvider(hook=revoke)).run_once()
        answer = self.assistant_answer(q)
        self.assertEqual(answer["status"], "failed")
        self.assertEqual(answer["dependency_code"], "permission_revoked")
        self.assertIsNone(answer["answer_fa"])
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT billing_status FROM app.model_requests WHERE assistant_question_id=%s",
                    (q["id"],),
                ).fetchone()[0],
                "settled",
            )

    def test_committed_dispatch_crash_is_never_sent_again(self):
        q = self.ask()
        provider = FakeProvider(failure=RuntimeError("simulated crash"))
        worker = self.worker_model(provider)
        worker.run_once()
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.outbox_events SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE company_id=%s AND event_kind='assistant.answer'",
                (self.company,),
            )
        worker.run_once()
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.assistant_answer(q)["dependency_code"], "usage_unknown")

    def test_competing_dispatches_cannot_exceed_installation_cap(self):
        from didban.infrastructure.model import ModelRepository

        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            context = ModelRepository(conn).snapshot(
                self.company, self.snapshot, "درآمد این دوره چقدر است؟"
            )
        reservation = FakeProvider().reservation(context)
        usage = self.admin.get("/api/v1/admin/usage").json()
        self.budget(
            (
                Decimal(usage["spent"])
                + Decimal(usage["reserved"])
                + reservation * Decimal("1.5")
            ).quantize(Decimal(".00000001"))
        )
        first = self.ask()
        second = self.ask()
        entered = Event()
        release = Event()
        provider = FakeProvider(hook=lambda: (entered.set(), release.wait(10)))
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(self.worker_model(provider).run_once)
            self.assertTrue(entered.wait(5))
            self.worker_model(provider).run_once()
            self.assertEqual(
                self.assistant_answer(second)["dependency_code"], "budget_exhausted"
            )
            release.set()
            future.result(10)
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.assistant_answer(first)["status"], "ready")


if __name__ == "__main__":
    suite = unittest.TestSuite(
        ModelRuntimeTests(name)
        for name in ModelRuntimeTests.__dict__
        if name.startswith("test_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    (ROOT / "docs/model-validation.json").write_text(
        json.dumps(
            {
                "status": "passed"
                if result.wasSuccessful() and not result.skipped
                else "failed_or_not_run",
                "tests_run": result.testsRun,
                "failures": len(result.failures),
                "errors": len(result.errors),
                "skipped": len(result.skipped),
                "live_provider_calls": 0,
                "fake_provider_only": True,
                "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
