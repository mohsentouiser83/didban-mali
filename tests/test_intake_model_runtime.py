"""Restricted DB/HTTP intake proposals, budgets, barriers and dispatch recovery."""

from dataclasses import replace
from decimal import Decimal
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import psycopg
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_interpretation import InterpretationTests
from test_intake_model import BANK, proposal
from didban.domain.source_tables import Sheet, Row
from test_model_provider import SETTINGS
from didban.application.intake_model import IntakeModel
from didban.application.interpretation_worker import InterpretationWorker
from didban.adapters.intake_model_provider import IntakeResponsesProvider
from didban.adapters.model_provider import ProviderFailure, ProviderResult


class FakeIntakeProvider:
    def __init__(self, output=None, failure=None, hook=None):
        self.output = output or proposal()
        self.failure, self.hook, self.calls = failure, hook, 0

    def reservation(self, context):
        return IntakeResponsesProvider(
            replace(SETTINGS, max_output_tokens=2048)
        ).reservation(context)

    def complete(self, context, request_id):
        from copy import deepcopy

        self.calls += 1
        if self.hook:
            self.hook()
        if self.failure:
            raise self.failure
        output = deepcopy(self.output)
        output["sheet_name"] = context["sheet_name"]
        return ProviderResult(output, 100, 200, "synthetic-proposal")


class IntakeModelRuntimeTests(InterpretationTests):
    def prepared_model(self, provider, table=BANK):
        admin = self.client("admin")
        policy = admin.get("/api/v1/admin/budget-policy")
        if policy.status_code == 404:
            r = self.mutate(
                admin, "POST", "/api/v1/admin/budget-policy", {"ceiling_usd": "1"}
            )
            self.assertEqual(r.status_code, 201, r.text)
        else:
            current = policy.json()
            self.assertEqual(
                self.mutate(
                    admin,
                    "PATCH",
                    "/api/v1/admin/budget-policy",
                    {"ceiling_usd": "1"},
                    version=current["version"],
                ).status_code,
                200,
            )
        session = self.session(self.period())
        import csv
        import io

        stream = io.StringIO()
        writer = csv.writer(stream)
        for row in table.rows:
            writer.writerow(row.values)
        self.upload_csv(session, stream.getvalue())
        self.assertTrue(self.worker().run_once())
        worker = InterpretationWorker(
            self.worker_settings, model=IntakeModel(SETTINGS, provider, True)
        )
        return session, worker

    def test_automatic_role_evidence_is_preserved_privately_with_accurate_public_provenance(
        self,
    ):
        table = Sheet(
            "دفتر",
            [
                Row(
                    1,
                    [
                        "شماره سند",
                        "تاریخ",
                        "کد حساب",
                        "نام حساب",
                        "بدهکار",
                        "بستانکار",
                        "واحد",
                        "نوع سند",
                    ],
                ),
                Row(
                    2,
                    [
                        "J1",
                        "2026-01-01",
                        "001",
                        "موجودی بانک",
                        "100",
                        "0",
                        "IRR",
                        "regular",
                    ],
                ),
                Row(
                    3,
                    ["J1", "2026-01-01", "002", "سرمایه", "0", "100", "IRR", "regular"],
                ),
            ],
        )
        fields = (
            "entry_id",
            "date",
            "account",
            "account_name",
            "debit",
            "credit",
            "currency",
            "entry_type",
        )
        output = proposal(
            table,
            fields,
            "ledger",
            [
                {"account_code": "001", "role": "bank", "evidence": "موجودی بانک"},
                {"account_code": "002", "role": "capital", "evidence": "سرمایه"},
            ],
        )
        session, worker = self.prepared_model(FakeIntakeProvider(output), table)
        # Exercise the provider fallback independently of the checked source adapter.
        with patch(
            "didban.domain.source_understanding.ledger_layout", return_value=None
        ):
            worker.run_once()
        self.assertEqual(self.issue(session)["code"], "interpretation_coverage")
        file = self.files(session)[0]
        rows = self.owner.get(self.file_path(session, file) + "/rows").json()["items"]
        self.assertEqual(len(rows), 2)
        for row in rows:
            values = {v["field"]: v["value"] for v in row["values"]}
            self.assertEqual(values["role_provenance"], "validated_policy")
            self.assertEqual(values["role_controls_passed"], "true")
            self.assertNotIn("role_evidence", values)
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.normalized_source_rows WHERE company_id=%s AND canonical_values->'role_evidence'->>'request_id' IS NOT NULL",
                    (self.company,),
                ).fetchone()[0],
                2,
            )

    def test_accepted_proposal_is_budgeted_persisted_once_and_coverage_still_asks(self):
        provider = FakeIntakeProvider()
        session, worker = self.prepared_model(provider)
        self.assertTrue(worker.run_once())
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.issue(session)["code"], "interpretation_coverage")
        self.assertFalse(worker.run_once())
        with psycopg.connect(self.dsn) as conn:
            row = conn.execute(
                "SELECT p.outcome,r.billing_status,r.actual_cost_usd FROM app.intake_model_proposals p JOIN app.model_requests r ON r.id=p.request_id WHERE p.company_id=%s",
                (self.company,),
            ).fetchone()
            self.assertEqual(row[:2], ("accepted", "settled"))
            self.assertGreater(row[2], Decimal("0"))
            file_id = self.files(session)[0]["id"]
            dependencies = conn.execute(
                "SELECT entity_type FROM app.source_dependency_rows(%s,%s)",
                (self.company, file_id),
            ).fetchall()
            self.assertIn(("intake_model_proposals",), dependencies)
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.normalized_source_rows WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                2,
            )
            with self.assertRaises(psycopg.errors.CheckViolation):
                conn.execute(
                    "UPDATE app.intake_model_proposals SET proposal='{}' WHERE company_id=%s",
                    (self.company,),
                )
        self.assertEqual(self.answer(session, "unknown").status_code, 201)
        self.assertIsNotNone(self.process(session)["interpretation_finished_at"])
        self.assertEqual(provider.calls, 1)

    def test_false_semantics_return_to_shared_question_without_accepting_rows(self):
        bad = proposal()
        bad["mapping"][1]["evidence"] = "fake header"
        provider = FakeIntakeProvider(bad)
        session, worker = self.prepared_model(provider)
        worker.run_once()
        self.assertEqual(self.detail(session)["status"], "waiting_input")
        self.assertEqual(self.issue(session)["code"], "interpretation_mapping")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT outcome FROM app.intake_model_proposals WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                "rejected",
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.normalized_source_rows WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                0,
            )

    def test_unknown_cost_is_held_and_never_automatically_redispatched(self):
        provider = FakeIntakeProvider(
            failure=ProviderFailure("model_unavailable", sent=True)
        )
        session, worker = self.prepared_model(provider)
        worker.run_once()
        self.assertFalse(worker.run_once())
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.detail(session)["status"], "waiting_input")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT billing_status FROM app.model_requests WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                "usage_unknown",
            )

    def test_confirmed_preconnect_failure_retries_once_then_succeeds(self):
        provider = FakeIntakeProvider(
            failure=ProviderFailure("model_unavailable", sent=False)
        )
        session, worker = self.prepared_model(provider)
        worker.run_once()
        self.assertEqual(self.detail(session)["status"], "waiting_dependency")
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.outbox_events SET available_at=clock_timestamp() WHERE company_id=%s AND event_kind='intake.interpret'",
                (self.company,),
            )
        provider.failure = None
        worker.run_once()
        self.assertEqual(provider.calls, 2)
        self.assertEqual(self.issue(session)["code"], "interpretation_coverage")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT outcome,attempt_number FROM app.intake_model_proposals WHERE company_id=%s ORDER BY attempt_number",
                    (self.company,),
                ).fetchall(),
                [("unavailable", 1), ("accepted", 2)],
            )

    def test_preconnect_retries_are_bounded_and_exhausted_budget_sends_nothing(self):
        provider = FakeIntakeProvider(
            failure=ProviderFailure("model_unavailable", sent=False)
        )
        session, worker = self.prepared_model(provider)
        for _ in range(4):
            with psycopg.connect(self.dsn) as conn:
                conn.execute(
                    "UPDATE app.outbox_events SET available_at=clock_timestamp() WHERE company_id=%s AND event_kind='intake.interpret'",
                    (self.company,),
                )
            worker.run_once()
        self.assertEqual(provider.calls, 3)
        self.assertEqual(self.detail(session)["status"], "waiting_input")
        self.assertEqual(self.issue(session)["code"], "interpretation_mapping")
        admin = self.client("admin")
        p = admin.get("/api/v1/admin/budget-policy").json()
        self.assertEqual(
            self.mutate(
                admin,
                "PATCH",
                "/api/v1/admin/budget-policy",
                {"ceiling_usd": "0"},
                version=p["version"],
            ).status_code,
            200,
        )
        second = self.session(self.period())
        from io import StringIO
        import csv

        stream = StringIO()
        writer = csv.writer(stream)
        for row in BANK.rows:
            writer.writerow(row.values)
        self.upload_csv(second, stream.getvalue())
        self.worker().run_once()
        worker.run_once()
        self.assertEqual(provider.calls, 3)
        self.assertEqual(self.detail(second)["status"], "waiting_dependency")

    def test_process_crash_recovers_as_unknown_without_second_provider_call(self):
        provider = FakeIntakeProvider(failure=RuntimeError("simulated process crash"))
        session, worker = self.prepared_model(provider)
        worker.run_once()
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.outbox_events SET available_at=clock_timestamp(),lease_expires_at=clock_timestamp()-interval '1 second' WHERE company_id=%s AND event_kind='intake.interpret'",
                (self.company,),
            )
        worker.run_once()
        self.assertEqual(provider.calls, 1)
        self.assertEqual(self.detail(session)["status"], "waiting_input")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT outcome FROM app.intake_model_proposals WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                "usage_unknown",
            )

    def test_new_session_barrier_during_call_blocks_publication_but_settles_cost(self):
        provider = FakeIntakeProvider()
        session, worker = self.prepared_model(provider)

        def barrier():
            with psycopg.connect(self.dsn) as conn:
                conn.execute("SET LOCAL search_path=app,pg_catalog")
                v = conn.execute(
                    "SELECT session_version FROM app.processing_sessions WHERE id=%s",
                    (session["id"],),
                ).fetchone()[0]
                conn.execute(
                    "INSERT INTO app.processing_issues(company_id,session_id,code,root_key,question_fa,answer_kind,answer_constraints,opened_session_version) VALUES(%s,%s,'test_barrier','test_barrier','سؤال لازم','choice',%s,%s)",
                    (
                        self.company,
                        session["id"],
                        Jsonb({"choices": ["yes"], "allow_unknown": False}),
                        v,
                    ),
                )

        provider.hook = barrier
        worker.run_once()
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.normalized_source_rows WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                0,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT billing_status FROM app.model_requests WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                "settled",
            )
        self.assertEqual(self.detail(session)["status"], "waiting_input")


if __name__ == "__main__":
    suite = unittest.TestSuite(
        IntakeModelRuntimeTests(n)
        for n in IntakeModelRuntimeTests.__dict__
        if n.startswith("test_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {
        "status": "passed"
        if result.wasSuccessful() and not result.skipped
        else "failed_or_not_run",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "live_provider_calls": 0,
    }
    (
        Path(__file__).resolve().parents[1] / "docs/intake-model-validation.json"
    ).write_text(json.dumps(report, indent=2) + "\n")
    raise SystemExit(0 if report["status"] == "passed" else 1)
