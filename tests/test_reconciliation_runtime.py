"""Restricted real DB/HTTP comparisons, versions, decisions and capacity history."""

import hashlib
import json
from pathlib import Path
import unittest
from uuid import uuid4
from unittest.mock import patch
import psycopg
from test_financial_runtime import FinancialTests

ROOT = Path(__file__).resolve().parents[1]


class ReconciliationTests(FinancialTests):
    query_measurements = {}

    def reference_manifest(self, duplicate=False):
        session = self.session(
            self.period(starts_on="2026-09-01", ends_on="2026-09-30")
        )
        ledger = "entry_id,date,account,debit,credit,entry_type,role,reference,currency\nE1,2026-09-01,101,100,0,regular,bank,R1,IRR\nE1,2026-09-01,701,0,100,regular,revenue,R1,IRR\n"
        bank = "row_id,date,amount,reference,bank_account,currency\nB1,2026-09-01,100,R1,101,IRR\n"
        if duplicate:
            bank += "B2,2026-09-01,100,R1,101,IRR\n"
        for name, raw in [("ledger.csv", ledger), ("bank.csv", bank)]:
            result = self.upload(session, raw.encode(), name=name)
            self.assertEqual(result.status_code, 202, result.text)
        self.assertEqual(self.seal(session).status_code, 202)
        self.complete_coverage(session)
        self.start_financial(session)
        return self.finish_financial(session)["manifest_id"]

    def start_run(self, manifest, kind="bank_ledger"):
        result = self.mutate(
            self.owner,
            "POST",
            self.base + "/results/" + manifest + "/reconciliations",
            {"kind": kind},
        )
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()

    def candidates(self, run):
        response = self.owner.get(
            self.base + "/reconciliations/" + run["id"] + "/candidates?limit=100"
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["items"]

    def test_exact_auto_decision_replay_and_immutable_evidence(self):
        manifest = self.reference_manifest()
        run = self.start_run(manifest)
        again = self.start_run(manifest)
        self.assertEqual(run["id"], again["id"])
        items = self.candidates(run)
        exact = next(c for c in items if c["classification"] == "exact_unique")
        self.assertEqual(exact["provenance"], "validated_automatic")
        self.assertEqual(exact["decision"]["action"], "accept")
        self.assertEqual(len(exact["source_refs"]), 2)
        with psycopg.connect(self.dsn) as conn:
            conn.execute("SET LOCAL search_path=app,pg_catalog")
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.reconciliation_claims WHERE run_id=%s",
                    (run["id"],),
                ).fetchone()[0],
                2,
            )
            with self.assertRaises(psycopg.errors.CheckViolation):
                conn.execute(
                    "UPDATE app.reconciliation_candidates SET evidence='{}' WHERE id=%s",
                    (exact["id"],),
                )

    def test_manual_decision_permissions_versions_and_competing_capacity(self):
        manifest = self.reference_manifest(duplicate=True)
        run = self.start_run(manifest)
        items = self.candidates(run)
        candidates = [c for c in items if c["classification"] == "ambiguous"]
        self.assertEqual(len(candidates), 2)
        first, second = candidates
        path = self.base + "/reconciliation-proposals/" + first["id"] + "/decisions"
        viewer = self.mutate(
            self.client("viewer"),
            "POST",
            path,
            {"action": "accept", "reason": "آزمون"},
            version=first["version"],
        )
        self.assertEqual(viewer.status_code, 403)
        advisor = self.client("advisor")
        key = uuid4().hex
        accepted = self.mutate(
            advisor,
            "POST",
            path,
            {"action": "accept", "reason": "مرجع بررسی شد"},
            version=first["version"],
            key=key,
        )
        self.assertEqual(accepted.status_code, 201, accepted.text)
        replay = self.mutate(
            advisor,
            "POST",
            path,
            {"action": "accept", "reason": "مرجع بررسی شد"},
            version=first["version"],
            key=key,
        )
        self.assertEqual(accepted.json(), replay.json())
        conflict = self.mutate(
            advisor,
            "POST",
            self.base + "/reconciliation-proposals/" + second["id"] + "/decisions",
            {"action": "accept", "reason": "آزمون رقابت"},
            version=second["version"],
        )
        self.assertEqual(conflict.status_code, 409, conflict.text)
        updated = next(c for c in self.candidates(run) if c["id"] == first["id"])
        reversed = self.mutate(
            advisor,
            "POST",
            path,
            {"action": "reject", "reason": "بررسی دوباره"},
            version=updated["version"],
        )
        self.assertEqual(reversed.status_code, 201, reversed.text)
        now = self.mutate(
            advisor,
            "POST",
            self.base + "/reconciliation-proposals/" + second["id"] + "/decisions",
            {"action": "accept", "reason": "نامزد درست"},
            version=second["version"],
        )
        self.assertEqual(now.status_code, 201, now.text)
        self.assertEqual(
            self.client("outsider")
            .get(self.base + "/reconciliations/" + run["id"])
            .status_code,
            404,
        )

    def test_changed_source_revision_does_not_create_fresh_bank_capacity(self):
        from psycopg.rows import dict_row
        from didban.infrastructure import reconciliation as repository

        manifest = self.reference_manifest()
        self.start_run(manifest)
        with psycopg.connect(self.settings.app_dsn, row_factory=dict_row) as conn:
            conn.execute("SET LOCAL search_path=app,pg_catalog")
            conn.execute(
                "SELECT set_config('app.user_id',%s,true),set_config('app.company_id',%s,true)",
                (self.users["owner"], self.company),
            )
            original = next(
                r
                for r in repository.pinned_rows(conn, self.company, manifest)
                if r["kind"] == "bank"
            )
            newer = conn.execute(
                "INSERT INTO app.record_revisions(company_id,logical_record_id,source_row_id,revision_number,content_hash) SELECT company_id,logical_record_id,source_row_id,revision_number+1,%s FROM app.record_revisions WHERE company_id=%s AND id=%s RETURNING id",
                ("f" * 64, self.company, original["record_revision_id"]),
            ).fetchone()["id"]
            changed = {
                **original,
                "record_revision_id": newer,
                "values": {**original["values"], "amount": "110"},
            }
            # Only the DTO selection is supplied; lineage, prior active claims and writes are real SQL.
            with patch.object(repository, "pinned_rows", return_value=[changed]):
                self.assertEqual(
                    repository.project_banks(conn, self.company, manifest), {}
                )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) AS n FROM app.bank_movements WHERE company_id=%s AND record_revision_id=%s",
                    (self.company, newer),
                ).fetchone()["n"],
                0,
            )

    def test_unchanged_human_rejection_is_preserved_and_changed_binding_needs_review(
        self,
    ):
        first = self.reference_manifest()
        run = self.start_run(first)
        candidate = next(
            c for c in self.candidates(run) if c["classification"] == "exact_unique"
        )
        advisor = self.client("advisor")
        rejected = self.mutate(
            advisor,
            "POST",
            self.base + "/reconciliation-proposals/" + candidate["id"] + "/decisions",
            {"action": "reject", "reason": "مرجع بررسی شد؛ تطبیق پذیرفته نیست"},
            version=candidate["version"],
        )
        self.assertEqual(rejected.status_code, 201, rejected.text)
        second = self.reference_manifest()
        second_run = self.start_run(second)
        preserved = next(
            c
            for c in self.candidates(second_run)
            if c["classification"] == "exact_unique"
        )
        self.assertEqual(preserved["decision"]["action"], "reject")
        self.assertEqual(preserved["provenance"], "preserved_human")
        self.assertEqual(preserved["source_decision_id"], rejected.json()["id"])
        self.assertEqual(preserved["decision"]["actor_id"], self.users["owner"])
        self.assertEqual(rejected.json()["actor_id"], self.users["advisor"])
        original_answer = self.answer

        def changed_answer(session, value, **kwargs):
            issue = self.issue(session)
            if issue["constraints"].get("financial_key", "").startswith("binding|"):
                value = "bank"
            return original_answer(session, value, **kwargs)

        with patch.object(self, "answer", side_effect=changed_answer):
            third = self.reference_manifest()
        third_run = self.start_run(third)
        changed = next(
            c
            for c in self.candidates(third_run)
            if any(r["side"] == "bank" for r in c["source_refs"])
        )
        self.assertEqual(changed["classification"], "needs_review")
        self.assertIsNone(changed["decision"])
        self.assertIn("prior_decision_requires_review", changed["reason_codes"])
        self.assertEqual(changed["source_decision_id"], preserved["decision"]["id"])

    def test_bulk_unmatched_bank_projection_has_bounded_queries_and_reuses_ids(self):
        from didban.infrastructure.reconciliation import (
            pinned_rows,
            ensure_runs,
            project_banks,
        )

        count = 1000
        bank = "row_id,date,amount,reference,bank_account,currency\n" + "".join(
            f"B{i},2026-09-01,1,R{i},101,IRR\n" for i in range(count)
        )
        session = self.prepared(kind="bank", data=bank.encode())
        self.start_financial(session)
        manifest = self.finish_financial(session)["manifest_id"]
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            raw = pinned_rows(conn, self.company, manifest)

            class Counted:
                calls = 0

                def execute(inner, *args, **kwargs):
                    inner.calls += 1
                    return conn.execute(*args, **kwargs)

            counted = Counted()
            run = ensure_runs(
                counted,
                self.company,
                manifest,
                self.users["owner"],
                "bank_ledger",
                raw=raw,
            )
            self.query_measurements["unmatched_1000_bank_rows"] = counted.calls
            self.query_measurements["exact_100_bank_ledger_pairs"] = counted.calls
            self.assertLess(counted.calls, 30)
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) AS n FROM app.reconciliation_candidates WHERE company_id=%s AND run_id=%s",
                    (self.company, run["id"]),
                ).fetchone()["n"],
                count,
            )
            before = project_banks(counted, self.company, manifest, raw)
            after = project_banks(counted, self.company, manifest, raw)
            self.assertEqual(len(before), count)
            self.assertEqual(before, after)
        with self.app.state.db.transaction(
            identity=False, actor=self.users["outsider"], company=self.company
        ) as conn:
            self.assertEqual(pinned_rows(conn, self.company, manifest), [])

    def test_bulk_unique_acceptance_keeps_all_exact_claims_and_decision_provenance(
        self,
    ):
        from didban.infrastructure.reconciliation import pinned_rows, ensure_runs

        count = 100
        ledger = (
            "entry_id,date,account,debit,credit,entry_type,role,reference,currency\n"
            + "".join(
                f"E{i},2026-09-01,101,1,0,regular,bank,R{i},IRR\nE{i},2026-09-01,701,0,1,regular,revenue,R{i},IRR\n"
                for i in range(count)
            )
        )
        bank = "row_id,date,amount,reference,bank_account,currency\n" + "".join(
            f"B{i},2026-09-01,1,R{i},101,IRR\n" for i in range(count)
        )
        session = self.session(
            self.period(starts_on="2026-09-01", ends_on="2026-09-30")
        )
        for name, raw in [("ledger.csv", ledger), ("bank.csv", bank)]:
            self.assertEqual(
                self.upload(session, raw.encode(), name=name).status_code, 202
            )
        self.assertEqual(self.seal(session).status_code, 202)
        self.complete_coverage(session)
        self.start_financial(session)
        manifest = self.finish_financial(session)["manifest_id"]
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            rows = pinned_rows(conn, self.company, manifest)

            class Counted:
                calls = 0

                def execute(inner, *args, **kwargs):
                    inner.calls += 1
                    return conn.execute(*args, **kwargs)

            counted = Counted()
            run = ensure_runs(
                counted,
                self.company,
                manifest,
                self.users["owner"],
                "bank_ledger",
                raw=rows,
            )
            self.assertLess(counted.calls, 30)
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) AS n FROM app.reconciliation_candidates WHERE company_id=%s AND run_id=%s AND accepted",
                    (self.company, run["id"]),
                ).fetchone()["n"],
                count,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) AS n FROM app.reconciliation_claims WHERE company_id=%s AND run_id=%s",
                    (self.company, run["id"]),
                ).fetchone()["n"],
                2 * count,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) AS n FROM app.decisions d JOIN app.reconciliation_candidates c ON c.company_id=d.company_id AND c.id=d.candidate_id WHERE d.company_id=%s AND c.run_id=%s AND d.provenance='validated_automatic' AND d.actor_id=%s",
                    (self.company, run["id"], self.users["owner"]),
                ).fetchone()["n"],
                count,
            )

    def test_missing_moadian_sources_stays_limited_without_financial_effect(self):
        manifest = self.reference_manifest()
        before = self.metrics(manifest)
        run = self.start_run(manifest, "moadian_sales")
        self.assertEqual(run["status"], "limited")
        self.assertIn("moadian_sales", run["missing_source_kinds"])
        self.assertFalse(self.candidates(run))
        self.assertEqual(self.metrics(manifest), before)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.TestSuite(
            ReconciliationTests(name)
            for name in ReconciliationTests.__dict__
            if name.startswith("test_")
        )
    )
    (ROOT / "docs/reconciliation-validation.json").write_text(
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
                "capacity_sql_calls": ReconciliationTests.query_measurements,
                "source_sha256": {
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in [
                        ROOT / "apps/api/didban/infrastructure" / name
                        for name in (
                            "reconciliation.py",
                            "reconciliation_projection.py",
                            "reconciliation_automatic.py",
                            "settlement_projection.py",
                            "cashflow.py",
                        )
                    ]
                },
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
