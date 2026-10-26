"""Real ingestion/interpretation HTTP and restricted worker regression scenarios."""

from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import json
import hashlib
import tempfile
from uuid import uuid4

import openpyxl
import xlwt
import os
from pathlib import Path
import sys
from threading import Event
import unittest
from unittest.mock import patch

import psycopg
from test_intake import IntakeTests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.application.interpretation_worker import InterpretationWorker
from didban.adapters.source_reader import SourceReader, Sheet, Row
from didban.domain.intake import PreparationFailure
from didban.domain.interpretation import analyze
from didban.domain.normalization import money, financial_date, identifier, InvalidValue


class ScalarTests(unittest.TestCase):
    def test_exact_money_dates_ids_and_invalid_precision(self):
        self.assertEqual(money("۱۲۳٬۴۵۶٫۱۲۳۴۵۶", "IRT"), "1234561.234560")
        self.assertEqual(money("0", "IRR"), "0")
        self.assertEqual(
            money("9999999999999999999999999999999.123456", "IRT"),
            "99999999999999999999999999999991.234560",
        )
        self.assertEqual(financial_date("۱۴۰۵/۰۱/۰۱"), "2026-03-21")
        self.assertEqual(financial_date("1403/12/30"), "2025-03-20")
        self.assertEqual(identifier("00001"), "00001")
        for invalid in [
            "1.0000001",
            "1,23",
            "NaN",
            "1e4",
            "100000000000000000000000000000000",
        ]:
            with self.assertRaises(InvalidValue):
                money(invalid, "IRR")
        for invalid in ["1404/12/30", "2026-02-30", "03/04/2026", 45200]:
            with self.assertRaises(InvalidValue):
                financial_date(invalid)

    def test_reference_files_have_independent_expected_row_counts(self):
        counts = {
            "bank.xlsx": 13,
            "invoices.xlsx": 5,
            "ledger.xlsx": 36,
            "planned-payments.csv": 7,
            "receipt-history.csv": 3,
            "settlements.csv": 5,
        }
        for name, expected in counts.items():
            path = ROOT / "docs/validation/rebuild-v1/inputs/baseline" / name
            result = analyze(SourceReader().read(path, path.suffix[1:], {}), {})
            self.assertIsNone(result.question, name)
            rows = [r for s in result.sheets for r in s.rows]
            self.assertEqual(len(rows), expected, name)
            self.assertFalse([r.errors for r in rows if r.errors], name)

    def test_persian_separate_flow_columns_and_reversed_balance_sequence(self):
        table = Sheet(
            "بانک",
            [
                Row(1, ["گزارش آزمایشی"]),
                Row(2, ["تاریخ", "واریز (ریال)", "برداشت (ریال)", "مانده", "واحد"]),
                Row(3, ["1405/01/03", None, "20", "130", "IRR"]),
                Row(4, ["1405/01/02", "50", None, "150", "IRR"]),
                Row(5, ["1405/01/01", "100", None, "100", "IRR"]),
            ],
        )
        result = analyze([table], {})
        self.assertIsNone(result.question)
        self.assertEqual(result.sheets[0].header_row, 2)
        self.assertFalse([r.errors for r in result.sheets[0].rows if r.errors])
        self.assertEqual(result.sheets[0].rows[0].values["amount"], "-20")
        self.assertEqual(
            result.sheets[0].controls[-1]["evidence"]["orders"], ["reversed"]
        )

    def test_repeated_invoice_identifiers_and_conflicting_account_roles_fail(self):
        result = analyze(
            [
                Sheet(
                    "فروش",
                    [
                        Row(
                            1,
                            [
                                "invoice_id",
                                "party_id",
                                "issued_on",
                                "gross",
                                "currency",
                            ],
                        ),
                        Row(2, ["I1", "C1", "2026-01-01", "10", "IRR"]),
                        Row(3, ["I1", "C1", "2026-01-02", "20", "IRR"]),
                    ],
                )
            ],
            {},
        )
        self.assertTrue(
            all("duplicate_logical_key" in r.errors for r in result.sheets[0].rows)
        )
        result = analyze(
            [
                Sheet(
                    "دفتر",
                    [
                        Row(
                            1,
                            [
                                "entry_id",
                                "date",
                                "account",
                                "debit",
                                "credit",
                                "currency",
                                "role",
                            ],
                        ),
                        Row(2, ["J1", "2026-01-01", "A", "10", "0", "IRR", "bank"]),
                        Row(3, ["J1", "2026-01-01", "A", "0", "10", "IRR", "capital"]),
                    ],
                )
            ],
            {},
        )
        self.assertTrue(
            all("account_role_conflict" in r.errors for r in result.sheets[0].rows)
        )

    def test_unknown_account_role_requires_an_explicit_evidenced_answer(self):
        result = analyze(
            [
                Sheet(
                    "دفتر",
                    [
                        Row(
                            1,
                            [
                                "entry_id",
                                "date",
                                "account",
                                "debit",
                                "credit",
                                "currency",
                            ],
                        ),
                        Row(2, ["J1", "2026-01-01", "98765", "10", "0", "IRR"]),
                    ],
                )
            ],
            {},
        )
        self.assertEqual(result.question.code, "interpretation_account_role")
        self.assertEqual(result.question.account_code, "98765")
        self.assertEqual(result.sheets, [])

    def test_real_xls_values_and_formula_cache_rejection_and_xlsx_formula_rows(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "source.xls"
            for formula in (False, True):
                book = xlwt.Workbook()
                sheet = book.add_sheet("بانک")
                for i, value in enumerate(["date", "amount", "currency"]):
                    sheet.write(0, i, value)
                sheet.write(1, 0, "2026-01-01")
                sheet.write(1, 1, xlwt.Formula("10+1") if formula else 10)
                sheet.write(1, 2, "IRR")
                book.save(str(path))
                if formula:
                    with self.assertRaises(PreparationFailure) as error:
                        SourceReader().read(path, "xls", {})
                    self.assertEqual(error.exception.code, "untrusted_formula_cache")
                else:
                    result = analyze(SourceReader().read(path, "xls", {}), {})
                    self.assertEqual(result.sheets[0].rows[0].values["amount"], "10.0")
            path = Path(folder) / "source.xlsx"
            book = openpyxl.Workbook()
            sheet = book.active
            sheet.append(["date", "amount", "currency"])
            sheet.append(["2026-01-01", "=1+1", "IRR"])
            book.save(path)
            result = analyze(SourceReader().read(path, "xlsx", {}), {})
            self.assertIn("formula_not_evaluated", result.sheets[0].rows[0].errors)


@unittest.skipUnless(os.environ.get("DIDBAN_TEST_DSN"), "Disposable DB required")
class InterpretationTests(IntakeTests):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.settings = replace(cls.settings, auto_interpretation=True)

    def interpreter(self):
        return InterpretationWorker(self.worker_settings)

    def process(self, session):
        for _ in range(40):
            state = self.detail(session)
            if (
                state["status"] in ("waiting_input", "failed", "cancelled")
                or state["interpretation_finished_at"]
            ):
                return state
            if not self.worker().run_once():
                self.interpreter().run_once()
        self.fail("Interpretation failed to reach a durable checkpoint")

    def issue(self, session):
        return next(
            i
            for i in self.owner.get(
                self.base
                + "/processing-sessions/"
                + session["id"]
                + "/issues?status=open&limit=100"
            ).json()["items"]
            if i["status"] == "open"
        )

    def answer(self, session, value, client=None, key=None):
        issue = self.issue(session)
        return self.mutate(
            client or self.owner,
            "POST",
            self.base + "/processing-issues/" + issue["id"] + "/answers",
            {"answer": {"kind": "choice", "value": value}},
            version=self.detail(session)["session_version"],
            key=key,
        )

    def files(self, session):
        return self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/files"
        ).json()["items"]

    def file_path(self, session, file):
        return (
            self.base + "/processing-sessions/" + session["id"] + "/files/" + file["id"]
        )

    def complete_coverage(self, session):
        state = self.process(session)
        if (
            state["status"] == "waiting_input"
            and self.issue(session)["code"] == "interpretation_coverage"
        ):
            self.assertEqual(self.answer(session, "unknown").status_code, 201)
            state = self.process(session)
        return state

    def upload_csv(self, session, data):
        result = self.upload(session, data.encode(), name="source.csv")
        self.assertEqual(result.status_code, 202, result.text)
        self.assertEqual(self.seal(session).status_code, 202)

    def test_prepared_legacy_session_can_start_once_without_duplicate_steps(self):
        self.period()
        original = self.settings
        try:
            self.settings = replace(self.settings, auto_interpretation=False)
            # Existing live app uses the original settings; inject a preparation-only policy snapshot to model a v6 session.
            session = self.session()
            self.upload_csv(session, "date,amount,currency\n2026-01-01,10,IRR\n")
            with psycopg.connect(self.dsn) as conn:
                conn.execute("SET search_path=app,pg_catalog")
                conn.execute(
                    "UPDATE app.processing_steps SET checkpoint='{}' WHERE company_id=%s",
                    (self.company,),
                )
            self.worker().run_once()
            # v6 had no interpretation steps; remove only test-created pending dispatch under privileged synthetic setup.
            with psycopg.connect(self.dsn) as conn:
                conn.execute("SET search_path=app,pg_catalog")
                conn.execute(
                    "DELETE FROM app.outbox_events WHERE company_id=%s AND event_kind='intake.interpret'",
                    (self.company,),
                )
                conn.execute(
                    "DELETE FROM app.processing_steps WHERE company_id=%s AND step_kind LIKE 'interpret:%%'",
                    (self.company,),
                )
                conn.execute(
                    "UPDATE app.processing_sessions SET status='waiting_dependency' WHERE company_id=%s AND id=%s",
                    (self.company, session["id"]),
                )
            path = self.base + "/processing-sessions/" + session["id"] + "/interpret"
            version = self.detail(session)["session_version"]
            key = uuid4().hex
            first = self.mutate(self.owner, "POST", path, key=key, version=version)
            self.assertEqual(first.status_code, 202, first.text)
            repeated = self.mutate(self.owner, "POST", path, key=key, version=version)
            self.assertEqual(first.json(), repeated.json())
            self.assertIsNotNone(
                self.complete_coverage(session)["interpretation_finished_at"]
            )
        finally:
            self.settings = original

    def test_expired_interpretation_worker_is_fenced_from_staging(self):
        session = self.session(self.period())
        self.upload_csv(session, "date,amount,currency\n2026-01-01,10,IRR\n")
        self.worker().run_once()
        entered = Event()
        release = Event()
        original = SourceReader.read
        calls = 0

        def slow_first(reader, *args):
            nonlocal calls
            calls += 1
            if calls == 1:
                entered.set()
                release.wait(10)
            return original(reader, *args)

        with patch.object(SourceReader, "read", slow_first):
            with ThreadPoolExecutor(max_workers=1) as pool:
                old = pool.submit(self.interpreter().run_once)
                self.assertTrue(entered.wait(5))
                with psycopg.connect(self.dsn) as conn:
                    conn.execute(
                        "UPDATE app.outbox_events SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE company_id=%s AND event_kind='intake.interpret'",
                        (self.company,),
                    )
                self.assertTrue(self.interpreter().run_once())
                release.set()
                old.result(10)
        self.assertIsNotNone(
            self.complete_coverage(session)["interpretation_finished_at"]
        )
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.interpretation_runs WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                1,
            )

    def test_capacity_20000_physical_rows_retains_exact_row_count(self):
        session = self.session(self.period())
        data = "date,amount,currency,reference\n" + "".join(
            f"2026-09-01,1.123456,IRR,{i:08d}\n" for i in range(19999)
        )
        self.upload_csv(session, data)
        self.assertIsNotNone(
            self.complete_coverage(session)["interpretation_finished_at"]
        )
        file = self.files(session)[0]
        self.assertEqual(file["preparation_summary"]["nonempty_rows"], 20000)
        self.assertEqual(file["interpretation_summary"]["valid_rows"], 19999)
        self.assertEqual(file["interpretation_summary"]["rejected_rows"], 0)
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.normalized_source_rows WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                19999,
            )

    def test_reference_bundle_normalizes_with_provenance_and_no_financial_effects(self):
        period = self.period()
        session = self.session(period)
        for name in [
            "bank.xlsx",
            "invoices.xlsx",
            "ledger.xlsx",
            "planned-payments.csv",
            "receipt-history.csv",
            "settlements.csv",
        ]:
            path = ROOT / "docs/validation/rebuild-v1/inputs/baseline" / name
            self.assertEqual(
                self.upload(session, path.read_bytes(), name=name).status_code, 202
            )
        self.seal(session)
        final = self.complete_coverage(session)
        self.assertIsNotNone(final["interpretation_finished_at"])
        self.assertIsNone(final["manifest_id"])
        files = self.files(session)
        self.assertEqual(
            sum(f["interpretation_summary"]["valid_rows"] for f in files), 69
        )
        self.assertTrue(
            all(f["interpretation_summary"]["rejected_rows"] == 0 for f in files)
        )
        rowpath = self.file_path(session, files[0]) + "/rows?limit=2"
        rows = self.owner.get(rowpath).json()
        self.assertEqual(len(rows["items"]), 2)
        self.assertIsNotNone(rows["next_cursor"])
        self.assertEqual(self.client("outsider").get(rowpath).status_code, 404)
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.interpretation_runs WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                6,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.journal_lines WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                0,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.interpretation_versions WHERE company_id=%s AND provenance='validated_automatic' AND actor_id IS NULL",
                    (self.company,),
                ).fetchone()[0],
                8,
            )
        with psycopg.connect(self.settings.app_dsn) as conn:
            conn.execute("SET LOCAL search_path=app,pg_catalog")
            conn.execute(
                "SELECT set_config('app.user_id',%s,true),set_config('app.company_id',%s,true)",
                (self.users["outsider"], self.company),
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.normalized_source_rows"
                ).fetchone()[0],
                0,
            )
            self.assertEqual(
                conn.execute("SELECT count(*) FROM app.interpretation_runs").fetchone()[
                    0
                ],
                0,
            )
        with psycopg.connect(self.dsn) as conn:
            with self.assertRaises(psycopg.errors.CheckViolation):
                with conn.transaction():
                    conn.execute(
                        "UPDATE app.interpretation_runs SET settings='{}' WHERE company_id=%s",
                        (self.company,),
                    )
        self.assertFalse(self.interpreter().run_once())

    def test_unknown_unit_pauses_all_work_and_toman_converts_exactly(self):
        session = self.session(self.period())
        self.upload_csv(session, "date,amount,reference\n1405/01/01,123.123456,00001\n")
        self.assertEqual(self.process(session)["status"], "waiting_input")
        self.assertEqual(self.issue(session)["code"], "interpretation_unit")
        self.assertFalse(self.interpreter().run_once())
        self.assertEqual(self.answer(session, "USD").status_code, 422)
        self.assertEqual(
            self.answer(session, "IRT", self.client("viewer")).status_code, 403
        )
        self.assertEqual(
            self.answer(session, "IRT", self.client("advisor")).status_code, 201
        )
        self.assertIsNotNone(
            self.complete_coverage(session)["interpretation_finished_at"]
        )
        rows = self.owner.get(
            self.file_path(session, self.files(session)[0]) + "/rows"
        ).json()["items"]
        values = {x["field"]: x["value"] for x in rows[0]["values"]}
        self.assertEqual(values["amount"], "1231.234560")
        self.assertEqual(values["date"], "2026-03-21")
        self.assertEqual(values["reference"], "00001")

    def test_moadian_direction_is_not_invented_from_filename(self):
        session = self.session(self.period())
        p = ROOT / "docs/validation/rebuild-v1/inputs/baseline/moadian-sales.csv"
        self.upload(session, p.read_bytes(), name="moadian-purchases.csv")
        self.seal(session)
        self.process(session)
        self.assertEqual(self.issue(session)["code"], "interpretation_kind")
        self.assertEqual(self.answer(session, "moadian_sales").status_code, 201)
        self.assertIsNotNone(
            self.complete_coverage(session)["interpretation_finished_at"]
        )
        self.assertEqual(
            self.files(session)[0]["interpretation_summary"]["sheets"][0][
                "source_kind"
            ],
            "moadian_sales",
        )

    def test_manual_mapping_versions_preserve_original_rows_and_actor(self):
        session = self.session(self.period())
        self.upload_csv(session, "when,how_much,ref\n2026-04-01,10,0001\n")
        self.process(session)
        self.assertEqual(self.issue(session)["code"], "interpretation_mapping")
        file = self.files(session)[0]
        path = self.file_path(session, file) + "/interpretation"
        settings = {
            "sheet_name": "CSV",
            "header_row": 1,
            "source_kind": "bank",
            "unit": "IRT",
            "calendar": "gregorian",
            "mapping": [
                {"target_field": "date", "source_column": "1"},
                {"target_field": "amount", "source_column": "2"},
                {"target_field": "reference", "source_column": "3"},
            ],
            "reason": "نگاشت معتبر فایل",
        }
        advisor = self.client("advisor")
        first = self.mutate(
            advisor,
            "PUT",
            path,
            settings,
            version=self.detail(session)["session_version"],
        )
        self.assertEqual(first.status_code, 202, first.text)
        self.assertIsNotNone(
            self.complete_coverage(session)["interpretation_finished_at"]
        )
        self.assertEqual(self.owner.get(path).json()["previews"][0]["unit"], "IRT")
        old = self.owner.get(path).json()["run_id"]
        settings["unit"] = "IRR"
        second = self.mutate(
            advisor,
            "PUT",
            path,
            settings,
            version=self.detail(session)["session_version"],
        )
        self.assertEqual(second.status_code, 202, second.text)
        self.assertIsNotNone(self.process(session)["interpretation_finished_at"])
        self.assertNotEqual(self.owner.get(path).json()["run_id"], old)
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.interpretation_runs WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                2,
            )
            rows = conn.execute(
                "SELECT actor_id FROM app.interpretation_versions WHERE company_id=%s",
                (self.company,),
            ).fetchall()
            self.assertTrue(all(str(r[0]) == self.users["advisor"] for r in rows))
            self.assertEqual(
                conn.execute(
                    "SELECT count(DISTINCT raw_fingerprint) FROM app.source_rows WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                1,
            )
        bad = settings | {"amount": "999"}
        self.assertEqual(
            self.mutate(
                advisor,
                "PUT",
                path,
                bad,
                version=self.detail(session)["session_version"],
            ).status_code,
            422,
        )

    def test_foreign_currency_precision_and_unbalanced_journal_are_not_valid(self):
        session = self.session(self.period())
        self.upload_csv(
            session,
            "entry_id,date,account,debit,credit,currency,role\nJ1,2026-01-01,110,10,0,IRR,bank\nJ1,2026-01-01,210,0,9,IRR,capital\nJ2,2026-01-02,110,1.0000001,0,IRR,bank\nJ2,2026-01-02,210,0,1,IRR,capital\nJ3,2026-01-03,110,10,0,USD,bank\nJ3,2026-01-03,210,0,10,USD,capital\n",
        )
        self.assertIsNotNone(self.process(session)["interpretation_finished_at"])
        summary = self.files(session)[0]["interpretation_summary"]
        self.assertEqual(summary["valid_rows"], 0)
        self.assertEqual(summary["rejected_rows"], 6)
        rows = self.owner.get(
            self.file_path(session, self.files(session)[0]) + "/rows"
        ).json()["items"]
        self.assertTrue(all(r["state"] == "rejected" for r in rows))
        foreign = [
            {f["field"]: f["value"] for f in r["values"]}
            for r in rows
            if any(
                f["field"] == "original_unit" and f["value"] == "USD"
                for f in r["values"]
            )
        ]
        self.assertEqual(len(foreign), 2)
        self.assertTrue(all(v["unit"] is None for v in foreign))

    def test_possible_overlap_stays_excluded_without_rewriting_previous_run(self):
        period = self.period()
        first = self.session(period)
        self.upload_csv(
            first,
            "invoice_id,party_id,issued_on,gross,currency\n0001,C1,2026-04-01,100,IRR\n",
        )
        self.process(first)
        self.answer(first, "sales_invoices")
        self.complete_coverage(first)
        old = self.files(first)[0]["interpretation_summary"]
        second = self.session(period)
        self.upload_csv(
            second,
            "party_id,invoice_id,issued_on,gross,currency\nC1,0001,2026-04-01,100,IRR\n",
        )
        self.process(second)
        self.answer(second, "sales_invoices")
        self.process(second)
        self.assertEqual(self.issue(second)["code"], "interpretation_overlap")
        self.assertEqual(self.answer(second, "keep_excluded").status_code, 201)
        self.assertIsNotNone(self.process(second)["interpretation_finished_at"])
        self.assertEqual(
            self.files(second)[0]["interpretation_summary"]["excluded_rows"], 1
        )
        self.assertEqual(self.files(first)[0]["interpretation_summary"], old)

    def test_cancel_during_interpretation_blocks_late_staging_commit(self):
        session = self.session(self.period())
        self.upload_csv(session, "date,amount,currency\n2026-01-01,10,IRR\n")
        self.worker().run_once()
        entered = Event()
        release = Event()
        original = SourceReader.read

        def blocked(reader, *args):
            entered.set()
            release.wait(10)
            return original(reader, *args)

        with patch.object(SourceReader, "read", blocked):
            with ThreadPoolExecutor(max_workers=1) as pool:
                running = pool.submit(self.interpreter().run_once)
                self.assertTrue(entered.wait(5))
                result = self.mutate(
                    self.owner,
                    "POST",
                    self.base + "/processing-sessions/" + session["id"] + "/cancel",
                    version=self.detail(session)["session_version"],
                )
                self.assertEqual(result.status_code, 202)
                release.set()
                running.result(10)
        self.assertEqual(self.detail(session)["status"], "cancelled")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.interpretation_runs WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                0,
            )


if __name__ == "__main__":
    suite = unittest.TestSuite(
        [
            unittest.defaultTestLoader.loadTestsFromTestCase(ScalarTests),
            unittest.TestSuite(
                InterpretationTests(n)
                for n in sorted(InterpretationTests.__dict__)
                if n.startswith("test_")
            ),
        ]
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    (ROOT / "docs/interpretation-validation.json").write_text(
        json.dumps(
            {
                "status": "passed"
                if result.wasSuccessful() and not result.skipped
                else "failed_or_not_run",
                "tests_run": result.testsRun,
                "failures": len(result.failures),
                "errors": len(result.errors),
                "skipped": len(result.skipped),
                "financial_effects": "none_staging_only",
                "model_calls": 0,
                "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "capacity_case": {
                    "physical_rows": 20000,
                    "data_rows": 19999,
                    "concurrent_users": 1,
                },
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
