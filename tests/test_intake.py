"""Actual multipart HTTP, scoped DB roles, outbox, faults and real ClamAV."""

from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import io
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
from threading import Event
import unittest
from uuid import uuid4
import zipfile

import openpyxl
from fastapi.testclient import TestClient
import psycopg
from psycopg import sql

from test_runtime import RuntimeTests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.main import create_app
from didban.manage import provision_login
from didban.application.preparation_worker import PreparationWorker, WorkerSettings
from didban.adapters.scanner import ClamScanner
from didban.domain.intake import DependencyUnavailable


class CleanScanner:
    def scan(self, path):
        return "synthetic-scanner-for-fault-tests"


class UnavailableScanner:
    def scan(self, path):
        raise DependencyUnavailable("scanner_unavailable")


@unittest.skipUnless(
    os.environ.get("DIDBAN_TEST_DSN"), "Disposable test cluster DSN required"
)
class IntakeTests(RuntimeTests):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.storage = tempfile.TemporaryDirectory()
        cls.settings = replace(cls.settings, storage_root=Path(cls.storage.name))
        cls.worker_login = "worker_" + uuid4().hex[:12]
        password = secrets.token_urlsafe(32)
        provision_login(cls.dsn, "didban_worker", cls.worker_login, password)
        cls.worker_settings = WorkerSettings(
            dsn=psycopg.conninfo.make_conninfo(
                cls.dsn, user=cls.worker_login, password=password
            ),
            storage_root=Path(cls.storage.name),
        )

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        with psycopg.connect(cls.admin_dsn, autocommit=True) as conn:
            conn.execute(
                sql.SQL("DROP ROLE {}").format(sql.Identifier(cls.worker_login))
            )
        cls.storage.cleanup()

    def period(self, client=None, **body):
        fields = {
            "name": "دوره " + uuid4().hex,
            "starts_on": "2026-01-01",
            "ends_on": "2026-12-31",
            "previous_period_id": None,
        } | body
        result = self.mutate(
            client or self.owner, "POST", self.base + "/financial-periods", fields
        )
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()

    def session(self, period=None, client=None):
        result = self.mutate(
            client or self.owner,
            "POST",
            self.base + "/processing-sessions",
            {"period_id": period["id"]} if period else {},
        )
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()

    def detail(self, session, client=None):
        return (
            (client or self.owner)
            .get(self.base + "/processing-sessions/" + session["id"])
            .json()
        )

    def upload(
        self,
        session,
        data=b"amount,date\n10,2026-01-01\n",
        name="bank.csv",
        client=None,
        key=None,
        version=None,
    ):
        client = client or self.owner
        csrf = client.get("/api/v1/auth/csrf").json()["token"]
        version = version or self.detail(session, client)["session_version"]
        return client.post(
            self.base + "/processing-sessions/" + session["id"] + "/files",
            files={"file": (name, data, "application/octet-stream")},
            headers={
                "X-CSRF-Token": csrf,
                "Idempotency-Key": key or uuid4().hex,
                "If-Match": f'"v{version}"',
                "Origin": self.settings.public_origin,
            },
        )

    def seal(self, session):
        files = self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/files"
        ).json()["items"]
        return self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/seal",
            {"expected_file_ids": [f["id"] for f in files]},
            version=self.detail(session)["session_version"],
        )

    def worker(self, scanner=None):
        return PreparationWorker(
            self.worker_settings, scanner=scanner or CleanScanner()
        )

    def test_period_crud_scope_versions_dependency_and_finance_role(self):
        finance = self.client("finance")
        advisor = self.client("advisor")
        viewer = self.client("viewer")
        period = self.period(finance)
        path = self.base + "/financial-periods/" + period["id"]
        self.assertEqual(viewer.get(path).status_code, 200)
        self.assertEqual(
            self.mutate(
                advisor, "PATCH", path, {"name": "مجاز نیست"}, version=1
            ).status_code,
            403,
        )
        self.assertEqual(
            self.mutate(
                finance, "PATCH", path, {"ends_on": "2025-01-01"}, version=1
            ).status_code,
            422,
        )
        patch = self.mutate(finance, "PATCH", path, {"name": "دوره تازه"}, version=1)
        self.assertEqual(patch.status_code, 200, patch.text)
        self.assertEqual(
            self.mutate(
                finance, "PATCH", path, {"name": "نسخه قدیمی"}, version=1
            ).status_code,
            409,
        )
        self.assertEqual(self.client("outsider").get(path).status_code, 404)
        session = self.session(patch.json())
        self.assertEqual(self.detail(session)["period_id"], period["id"])
        self.assertEqual(
            self.mutate(
                finance,
                "PATCH",
                path,
                {"starts_on": "2026-02-01"},
                version=patch.json()["version"],
            ).status_code,
            409,
        )
        self.assertEqual(
            self.mutate(
                finance, "DELETE", path, version=patch.json()["version"]
            ).status_code,
            409,
        )
        unused = self.period(finance)
        self.assertEqual(
            self.mutate(
                finance,
                "DELETE",
                self.base + "/financial-periods/" + unused["id"],
                version=unused["version"],
            ).status_code,
            200,
        )

    def test_previous_period_and_cursor_scope(self):
        prior = self.period(starts_on="2025-01-01", ends_on="2025-12-31")
        self.period(previous_period_id=prior["id"])
        bad = self.mutate(
            self.owner,
            "POST",
            self.base + "/financial-periods",
            {
                "name": "ناسازگار",
                "starts_on": "2025-02-01",
                "ends_on": "2025-03-01",
                "previous_period_id": prior["id"],
            },
        )
        self.assertEqual(bad.status_code, 422)
        first = self.owner.get(self.base + "/financial-periods?limit=1").json()
        self.assertTrue(first["next_cursor"])
        second = self.owner.get(
            self.base + "/financial-periods", params={"cursor": first["next_cursor"]}
        ).json()
        self.assertNotEqual(first["items"][0]["id"], second["items"][0]["id"])
        self.assertEqual(
            self.client("finance")
            .get(
                self.base + "/financial-periods",
                params={"cursor": first["next_cursor"]},
            )
            .status_code,
            422,
        )

    def test_upload_private_dedupe_replay_and_seal_exact_set(self):
        session = self.session()
        key = uuid4().hex
        first = self.upload(session, key=key, version=1)
        self.assertEqual(first.status_code, 202, first.text)
        self.assertNotIn("object_key", first.text)
        replay = self.upload(session, key=key, version=1)
        self.assertEqual(replay.json(), first.json())
        self.assertEqual(
            self.upload(session, data=b"different\n", key=key, version=1).status_code,
            409,
        )
        duplicate = self.upload(session, name="again.csv")
        self.assertEqual(duplicate.status_code, 202, duplicate.text)
        self.assertTrue(duplicate.json()["duplicate"])
        self.assertEqual(
            len(
                list(
                    (
                        self.settings.storage_root / self.company.replace("-", "")
                    ).iterdir()
                )
            ),
            1,
        )
        files = self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/files"
        ).json()["items"]
        self.assertEqual(len(files), 1)
        bad = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/seal",
            {"expected_file_ids": [str(uuid4())]},
            version=self.detail(session)["session_version"],
        )
        self.assertEqual(bad.status_code, 409)
        self.assertEqual(self.seal(session).status_code, 202)
        self.assertEqual(self.upload(session, data=b"late\n").status_code, 409)
        self.assertTrue(self.worker().run_once())
        self.assertFalse(self.worker().run_once())
        detail = self.detail(session)
        self.assertIsNotNone(detail["preparation_finished_at"])
        self.assertEqual(detail["status"], "waiting_dependency")
        self.assertIsNone(detail["manifest_id"])
        file = self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/files"
        ).json()["items"][0]
        self.assertEqual(file["status"], "pending_interpretation")
        self.assertEqual(file["preparation_summary"]["nonempty_rows"], 2)
        self.assertIsNone(file["preparation_summary"]["financial_data_rows"])

    def test_csv_encoding_question_pauses_whole_session_and_resumes_once(self):
        session = self.session()
        self.upload(session, "مبلغ,تاریخ\n۱۰,۱۴۰۵\n".encode("cp1256", errors="replace"))
        self.upload(session, b"a,b\n1,2\n", name="other.csv")
        self.seal(session)
        worker = self.worker()
        self.assertTrue(worker.run_once())
        detail = self.detail(session)
        self.assertEqual(detail["status"], "waiting_input")
        self.assertFalse(worker.run_once())
        question = self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/issues"
        ).json()["items"][0]
        self.assertEqual(
            self.detail(session)["session_version"], detail["session_version"]
        )
        advisor = self.client("advisor")
        path = self.base + "/processing-issues/" + question["id"] + "/answers"
        self.assertEqual(
            self.mutate(
                self.client("viewer"),
                "POST",
                path,
                {"answer": {"kind": "choice", "value": "windows-1256"}},
                version=detail["session_version"],
            ).status_code,
            403,
        )
        self.assertEqual(
            self.mutate(
                advisor,
                "POST",
                path,
                {"answer": {"kind": "choice", "value": "unknown"}},
                version=detail["session_version"],
            ).status_code,
            422,
        )
        key = uuid4().hex
        body = {"answer": {"kind": "choice", "value": "windows-1256"}}
        answer = self.mutate(
            advisor, "POST", path, body, key=key, version=detail["session_version"]
        )
        self.assertEqual(answer.status_code, 201, answer.text)
        repeated = self.mutate(
            advisor, "POST", path, body, key=key, version=detail["session_version"]
        )
        self.assertEqual(repeated.json(), answer.json())
        for _ in range(4):
            worker.run_once()
        final = self.detail(session)
        self.assertIsNotNone(final["preparation_finished_at"])
        self.assertFalse(final["open_required_issue_ids"])
        self.assertEqual(
            self.mutate(
                advisor, "POST", path, body, version=final["session_version"]
            ).status_code,
            409,
        )
        notifications = self.owner.get(self.base + "/notifications").json()["items"]
        self.assertEqual(len(notifications), 2)
        self.assertEqual(
            self.client("viewer").get(self.base + "/notifications").json()["items"], []
        )

    def test_dependency_restart_and_retry_do_not_repeat_successful_effects(self):
        session = self.session()
        self.upload(session)
        self.seal(session)
        worker = self.worker(UnavailableScanner())
        self.assertTrue(worker.run_once())
        detail = self.detail(session)
        self.assertEqual(detail["status"], "waiting_dependency")
        self.assertEqual(detail["steps"][0]["dependency_code"], "scanner_unavailable")
        retry = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/retry",
            {"step_ids": [detail["steps"][0]["id"]]},
            version=detail["session_version"],
        )
        self.assertEqual(retry.status_code, 202, retry.text)
        self.worker().run_once()
        self.assertFalse(self.worker().run_once())
        self.assertIsNotNone(self.detail(session)["preparation_finished_at"])
        self.assertEqual(
            len(self.owner.get(self.base + "/notifications").json()["items"]), 1
        )

    def test_cancel_while_worker_outside_database_prevents_late_effect(self):
        session = self.session()
        self.upload(session)
        self.seal(session)
        entered = Event()
        release = Event()

        class SlowScanner:
            def scan(self, path):
                entered.set()
                release.wait(8)
                return "slow-test"

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(self.worker(SlowScanner()).run_once)
            self.assertTrue(entered.wait(5))
            result = self.mutate(
                self.owner,
                "POST",
                self.base + "/processing-sessions/" + session["id"] + "/cancel",
                version=self.detail(session)["session_version"],
            )
            self.assertEqual(result.status_code, 202, result.text)
            release.set()
            future.result(timeout=10)
        detail = self.detail(session)
        self.assertEqual(detail["status"], "cancelled")
        self.assertIsNone(detail["preparation_finished_at"])
        self.assertFalse(self.worker().run_once())

    def test_lease_takeover_blocks_stale_worker_and_ack_is_atomic(self):
        session = self.session()
        self.upload(session)
        self.seal(session)
        entered = Event()
        release = Event()

        class SlowScanner:
            def scan(self, path):
                entered.set()
                release.wait(8)
                return "old-test"

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(self.worker(SlowScanner()).run_once)
            self.assertTrue(entered.wait(5))
            with psycopg.connect(self.dsn) as conn:
                conn.execute(
                    "UPDATE app.outbox_events SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE company_id=%s AND session_id=%s",
                    (self.company, session["id"]),
                )
                conn.execute(
                    "UPDATE app.processing_steps SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE company_id=%s AND session_id=%s",
                    (self.company, session["id"]),
                )
            self.assertTrue(self.worker().run_once())
            release.set()
            future.result(timeout=10)
        self.assertIsNotNone(self.detail(session)["preparation_finished_at"])
        self.assertEqual(
            len(self.owner.get(self.base + "/notifications").json()["items"]), 1
        )

    def test_limits_scope_missing_csrf_and_cleanup(self):
        session = self.session()
        viewer = self.client("viewer")
        self.assertEqual(
            self.upload(session, client=viewer, version=1).status_code, 403
        )
        path = self.base + "/processing-sessions/" + session["id"] + "/files"
        self.assertEqual(
            self.owner.post(path, files={"file": ("a.csv", b"a\n")}).status_code, 403
        )
        self.assertEqual(self.upload(session, name="fake.xlsx").status_code, 415)
        self.assertEqual(self.upload(session, name="bad.pdf").status_code, 415)
        self.assertEqual(self.upload(session, data=b"").status_code, 422)
        for i in range(10):
            self.assertEqual(
                self.upload(
                    session, data=f"a\n{i}\n".encode(), name=f"{i}.csv"
                ).status_code,
                202,
            )
        self.assertEqual(self.upload(session, data=b"a\n11\n").status_code, 413)
        self.assertEqual(
            self.owner.get(
                self.base + "/processing-sessions/" + session["id"] + "/files?limit=1"
            ).status_code,
            200,
        )
        self.assertEqual(self.client("outsider").get(path).status_code, 404)

    def test_total_rows_and_zip_bomb_are_rejected_without_financial_result(self):
        session = self.session()
        for i in range(2):
            self.upload(
                session, (f"v{i}\n" + ("1\n" * 11000)).encode(), name=f"{i}.csv"
            )
        self.seal(session)
        worker = self.worker()
        worker.run_once()
        worker.run_once()
        detail = self.detail(session)
        self.assertEqual(detail["status"], "failed")
        self.assertIsNone(detail["manifest_id"])
        files = self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/files"
        ).json()["items"]
        self.assertIn("row_limit", [f["error_code"] for f in files])
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("large.xml", b"0" * (67108864 + 1))
        second = self.session()
        self.assertEqual(
            self.upload(second, output.getvalue(), name="bomb.xlsx").status_code, 202
        )
        self.seal(second)
        worker.run_once()
        self.assertEqual(self.detail(second)["status"], "failed")

    def test_xlsx_bounded_formula_is_never_executed(self):
        book = openpyxl.Workbook()
        sheet = book.active
        sheet.title = "بانک"
        sheet.append(["مبلغ", "شرح"])
        sheet.append([10, "=1/0"])
        stream = io.BytesIO()
        book.save(stream)
        session = self.session()
        self.upload(session, stream.getvalue(), name="bank.xlsx")
        self.seal(session)
        self.worker().run_once()
        file = self.owner.get(
            self.base + "/processing-sessions/" + session["id"] + "/files"
        ).json()["items"][0]
        self.assertEqual(file["preparation_summary"]["nonempty_rows"], 2)
        self.assertIsNotNone(self.detail(session)["preparation_finished_at"])

    def test_multipart_byte_and_field_limits_leave_no_private_orphans(self):
        session = self.session()
        path = self.base + "/processing-sessions/" + session["id"] + "/files"
        headers = {
            "X-CSRF-Token": self.owner.get("/api/v1/auth/csrf").json()["token"],
            "Origin": self.settings.public_origin,
            "If-Match": '"v1"',
            "Idempotency-Key": uuid4().hex,
        }
        malformed = self.owner.post(
            path,
            files=[("file", ("a.csv", b"a\n")), ("file", ("b.csv", b"b\n"))],
            headers=headers,
        )
        self.assertEqual(malformed.status_code, 422, malformed.text)
        oversized = self.upload(session, b"a" * (self.settings.max_file_bytes + 1))
        self.assertEqual(oversized.status_code, 413, oversized.text)
        self.assertEqual(self.owner.get(path).json()["items"], [])
        folder = Path(self.storage.name) / self.company.replace("-", "")
        self.assertEqual(list(folder.glob("*")), [])

    def test_http_and_worker_login_boundaries_are_distinct(self):
        with psycopg.connect(self.settings.app_dsn) as conn:
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                conn.execute("SELECT app.claim_intake_job(%s)", (uuid4(),))
        unsafe = create_app(replace(self.settings, app_dsn=self.worker_settings.dsn))
        with self.assertRaises(RuntimeError):
            with TestClient(unsafe, base_url="https://testserver"):
                pass
        with self.assertRaises(RuntimeError):
            PreparationWorker(replace(self.worker_settings, dsn=self.settings.app_dsn))

    def test_revoked_creator_cannot_commit_preparation(self):
        advisor = self.client("advisor")
        session = self.session(client=advisor)
        self.assertEqual(self.upload(session, client=advisor).status_code, 202)
        self.seal(session)
        revoked = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + self.members["advisor"]["id"],
            {"active": False},
            version=self.members["advisor"]["version"],
        )
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertFalse(self.worker().run_once())
        detail = self.detail(session)
        self.assertEqual(detail["status"], "waiting_dependency")
        self.assertEqual(detail["steps"][0]["dependency_code"], "permission_revoked")
        self.assertIsNone(detail["preparation_finished_at"])
        self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/cancel",
            version=detail["session_version"],
        )

    @unittest.skipUnless(
        os.environ.get("DIDBAN_TEST_SCANNER_PORT"),
        "Explicit real ClamAV test port required",
    )
    def test_real_clamav_clean_and_eicar_quarantine(self):
        scanner = ClamScanner("127.0.0.1", int(os.environ["DIDBAN_TEST_SCANNER_PORT"]))
        session = self.session()
        self.upload(session)
        self.seal(session)
        self.worker(scanner).run_once()
        self.assertIsNotNone(self.detail(session)["preparation_finished_at"])
        eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        infected = self.session()
        self.upload(infected, eicar, name="scan-test.csv")
        self.seal(infected)
        self.worker(scanner).run_once()
        file = self.owner.get(
            self.base + "/processing-sessions/" + infected["id"] + "/files"
        ).json()["items"][0]
        self.assertEqual(file["status"], "rejected")
        self.assertEqual(file["error_code"], "malware_detected")
        self.assertEqual(self.detail(infected)["status"], "failed")
        self.assertEqual(
            self.upload(self.session(), eicar, name="again.csv").status_code, 422
        )


if __name__ == "__main__":
    names = [name for name in IntakeTests.__dict__ if name.startswith("test_")]
    suite = unittest.TestSuite(IntakeTests(name) for name in sorted(names))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {
        "scope": "periods_private_upload_durable_preparation",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "status": "passed"
        if result.wasSuccessful() and not result.skipped
        else "failed_or_not_run",
        "real_clamav": bool(os.environ.get("DIDBAN_TEST_SCANNER_PORT")),
        "model_calls": 0,
        "financial_engine": "not_implemented",
        "source_sha256": {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / "apps/api/didban").rglob("*.py"))
        },
        "migration_sha256": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / "database").glob("*.sql"))
        },
    }
    (ROOT / "docs/intake-validation.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
