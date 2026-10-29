"""Isolated worker acceptance; real taxpayer files remain private and unchanged."""

import hashlib
import io
import json
import os
from pathlib import Path
import unittest

import openpyxl
import psycopg
from test_financial_runtime import FinancialTests
from test_source_understanding import source_bundle


class UnderstandingRuntimeTests(FinancialTests):
    def ingest(self, names_and_content):
        session = self.session(
            self.period(starts_on="2024-03-20", ends_on="2025-03-20")
        )
        for name, content in names_and_content:
            response = self.upload(session, content, name=name)
            self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(self.seal(session).status_code, 202)
        questions = []
        for _ in range(12):
            state = self.process(session)
            if state["interpretation_finished_at"]:
                return session, questions
            self.assertEqual(state["status"], "waiting_input", state)
            issue = self.issue(session)
            questions.append(issue["code"])
            self.assertFalse(
                self.interpreter().run_once(), "A real question blocks all workers"
            )
            if issue["code"] == "interpretation_account_role":
                self.assertIn("جاري", issue["question_fa"].replace("ی", "ي"))
                value = "other_liability"  # Test-only declaration; never submitted to live installation.
            elif issue["code"] == "interpretation_overlap":
                value = "keep_excluded"
            elif issue["code"] == "interpretation_coverage":
                value = (
                    "declared_complete"  # Synthetic/disposable test assumption only.
                )
            else:
                self.fail("Unexpected technical question: " + str(issue))
            response = self.answer(session, value)
            self.assertEqual(response.status_code, 201, response.text)
        self.fail("Repeated unresolved question")

    def test_structural_rows_and_checked_postings_survive_restricted_worker(self):
        table, refs = source_bundle()

        def encode(source):
            book = openpyxl.Workbook()
            sheet = book.active
            sheet.title = source.name
            for row in source.rows:
                sheet.append(row.values)
            stream = io.BytesIO()
            book.save(stream)
            return stream.getvalue()

        session, questions = self.ingest(
            [("ledger.xlsx", encode(table))]
            + [
                (str(index) + ".xlsx", encode(ref.tables[0]))
                for index, ref in enumerate(refs)
            ]
        )
        self.assertEqual(questions, ["interpretation_coverage"])
        file = next(
            file
            for file in self.files(session)
            if file["original_name"] == "ledger.xlsx"
        )
        self.assertEqual(file["interpretation_summary"]["skipped_rows"], 2)
        with psycopg.connect(self.dsn) as conn:
            run_id = conn.execute(
                "SELECT interpretation_run_id FROM app.session_files WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                (self.company, session["id"], file["id"]),
            ).fetchone()[0]
            raw = conn.execute(
                "SELECT count(*) FROM app.source_rows r JOIN app.interpretation_versions v ON v.company_id=r.company_id AND v.id=r.interpretation_id WHERE r.company_id=%s AND v.run_id=%s",
                (self.company, run_id),
            ).fetchone()[0]
            normalized = conn.execute(
                "SELECT count(*) FROM app.normalized_source_rows WHERE company_id=%s AND run_id=%s",
                (self.company, run_id),
            ).fetchone()[0]
            self.assertEqual(raw, normalized + 2)
        self.start_financial(session)
        state = self.finish_financial(session)
        metrics = self.metrics(state["manifest_id"])
        self.assertEqual(metrics["net_profit"]["value"], "120")
        with psycopg.connect(self.dsn) as conn:
            codes = conn.execute(
                "SELECT code FROM app.processing_issues WHERE company_id=%s",
                (self.company,),
            ).fetchall()
            self.assertEqual(codes, [("interpretation_coverage",)])

    def verify_supplied_files(self):
        directory = Path(os.environ["DIDBAN_UNDERSTANDING_REAL_SOURCE_DIR"])
        paths = [directory / f"report ({i}).xlsx" for i in range(7, 15)] + [
            directory / "روزنامه 1403.xls",
            directory / "روزنامه 14031.xls",
        ]
        hashes = {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in paths
        }
        session, questions = self.ingest(
            [(path.name, path.read_bytes()) for path in paths]
        )
        self.assertEqual(questions.count("interpretation_account_role"), 1)
        self.assertEqual(questions.count("interpretation_overlap"), 1)
        self.assertEqual(questions.count("interpretation_coverage"), 1)
        files = self.files(session)
        self.assertEqual(
            sum(file["interpretation_summary"]["valid_rows"] for file in files), 1952
        )
        self.assertEqual(
            sum(file["interpretation_summary"]["excluded_rows"] for file in files), 2046
        )
        self.assertEqual(
            sum(file["interpretation_summary"]["rejected_rows"] for file in files), 0
        )
        self.assertEqual(
            sum(file["interpretation_summary"]["skipped_rows"] for file in files), 13
        )
        self.start_financial(session)
        state = self.finish_financial(session)
        metrics = self.metrics(state["manifest_id"])
        self.assertEqual(metrics["revenue"]["value"], "55863965545")
        self.assertEqual(metrics["profit_before_tax"]["value"], "1384899735")
        self.assertEqual(metrics["net_profit"]["value"], "1038674802")
        with psycopg.connect(self.dsn) as conn:
            calls = conn.execute(
                "SELECT count(*) FROM app.model_requests WHERE company_id=%s",
                (self.company,),
            ).fetchone()[0]
            self.assertEqual(calls, 0)
            issues = conn.execute(
                "SELECT code FROM app.processing_issues WHERE company_id=%s",
                (self.company,),
            ).fetchall()
            self.assertEqual(len(issues), 3, issues)
            linked = conn.execute(
                "SELECT count(*) FROM app.normalized_source_rows WHERE company_id=%s AND canonical_values->'role_evidence'->>'answer_id' IS NOT NULL",
                (self.company,),
            ).fetchone()[0]
            self.assertGreater(linked, 0)
        self.assertTrue(
            all(
                hashlib.sha256(path.read_bytes()).hexdigest() == hashes[path.name]
                for path in paths
            )
        )
        output = Path(__file__).resolve().parents[1] / ".local/understanding-validation"
        output.mkdir(parents=True, exist_ok=True)
        (output / "real-http.json").write_text(
            json.dumps(
                {
                    "status": "passed",
                    "files": len(files),
                    "valid_rows": 1952,
                    "excluded_duplicate_rows": 2046,
                    "structural_rows": 13,
                    "rejected_rows": 0,
                    "questions": questions,
                    "model_calls": calls,
                    "original_files_unchanged": True,
                    "test_only_assumptions": [
                        "shareholder account other_liability",
                        "exclude flat duplicate",
                        "declared_complete",
                    ],
                    "metrics": {
                        key: metrics[key]["value"]
                        for key in ("revenue", "profit_before_tax", "net_profit")
                    },
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n"
        )


if __name__ == "__main__":
    suite = unittest.TestSuite(
        UnderstandingRuntimeTests(name)
        for name in UnderstandingRuntimeTests.__dict__
        if name.startswith("test_")
    )
    if os.environ.get("DIDBAN_UNDERSTANDING_REAL_SOURCE_DIR"):
        suite.addTest(UnderstandingRuntimeTests("verify_supplied_files"))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
