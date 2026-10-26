"""Real HTTP/SQL integration against disposable DB and restricted login roles."""

from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg
from psycopg import sql
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

from didban.config import Settings
from didban.main import create_app
from didban.manage import bootstrap, migrate, provision_login
from didban.security import HASHER, Security
from didban.api.contracts import DOCUMENT

PASSWORD = "synthetic-test-password-only-426!"


@unittest.skipUnless(
    os.environ.get("DIDBAN_TEST_DSN"), "Explicit disposable test cluster DSN required"
)
class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin_dsn = os.environ["DIDBAN_TEST_DSN"]
        suffix = uuid4().hex[:12]
        cls.db_name = "didban_http_" + suffix
        cls.logins = ["http_fin_" + suffix, "http_identity_" + suffix]
        with psycopg.connect(cls.admin_dsn, autocommit=True) as conn:
            conn.execute(
                sql.SQL("CREATE DATABASE {}").format(sql.Identifier(cls.db_name))
            )
        cls.dsn = psycopg.conninfo.make_conninfo(cls.admin_dsn, dbname=cls.db_name)
        cls.migrations = migrate(cls.dsn)
        cls.assert_migrations_replay = migrate(cls.dsn)
        cls.users = {
            "admin": bootstrap(cls.dsn, "admin@fixture.invalid", "مدیر نصب", PASSWORD)
        }
        with psycopg.connect(cls.dsn) as conn:
            for name in ("owner", "finance", "advisor", "viewer", "outsider"):
                row = conn.execute(
                    """INSERT INTO app.users(email,display_name,password_hash,activated_at)
                  VALUES(%s,%s,%s,clock_timestamp()) RETURNING id""",
                    (name + "@fixture.invalid", name, HASHER.hash(PASSWORD)),
                ).fetchone()
                cls.users[name] = str(row[0])
        passwords = {login: secrets.token_urlsafe(32) for login in cls.logins}
        for role, login in zip(("didban_app", "didban_identity"), cls.logins):
            provision_login(cls.dsn, role, login, passwords[login])
        cls.settings = Settings(
            app_dsn=psycopg.conninfo.make_conninfo(
                cls.dsn, user=cls.logins[0], password=passwords[cls.logins[0]]
            ),
            identity_dsn=psycopg.conninfo.make_conninfo(
                cls.dsn, user=cls.logins[1], password=passwords[cls.logins[1]]
            ),
            secret=secrets.token_urlsafe(48),
            public_origin="https://testserver",
            login_attempts=1000,
            auto_interpretation=False,
            auto_financial=False,
            auto_analysis=False,
        )

    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(cls.admin_dsn, autocommit=True) as conn:
            conn.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                    sql.Identifier(cls.db_name)
                )
            )
            for login in cls.logins:
                conn.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(login)))

    def setUp(self):
        self.app = create_app(self.settings)
        self.lifetime = TestClient(self.app, base_url="https://testserver")
        self.lifetime.__enter__()
        self.clients = []
        self.admin = self.client("admin")
        self.owner = self.client("owner")
        result = self.mutate(
            self.admin,
            "POST",
            "/api/v1/admin/companies",
            {
                "name": "شرکت " + uuid4().hex,
                "owner_user_id": self.users["owner"],
                "timezone": "Asia/Tehran",
                "display_unit": "IRR",
            },
        )
        self.assertEqual(result.status_code, 201, result.text)
        self.company = result.json()["id"]
        self.base = "/api/v1/companies/" + self.company
        self.members = {}
        for user, role in [
            ("finance", "finance_manager"),
            ("advisor", "advisor_accountant"),
            ("viewer", "viewer"),
        ]:
            result = self.mutate(
                self.owner,
                "POST",
                self.base + "/memberships",
                {"user_id": self.users[user], "role": role},
            )
            self.assertEqual(result.status_code, 201, result.text)
            self.members[user] = result.json()

    def tearDown(self):
        for client in self.clients:
            client.close()
        self.lifetime.__exit__(None, None, None)

    def client(
        self, user: str | None = None, *, app=None, address="testclient"
    ) -> TestClient:
        client = TestClient(
            app or self.app, base_url="https://testserver", client=(address, 50000)
        )
        self.clients.append(client)
        if user:
            result = self.mutate(
                client,
                "POST",
                "/api/v1/auth/login",
                {"email": user + "@fixture.invalid", "password": PASSWORD},
            )
            self.assertEqual(result.status_code, 200, result.text)
        return client

    def mutate(
        self,
        client: TestClient,
        method: str,
        path: str,
        body=None,
        *,
        version=None,
        key=None,
    ):
        csrf = client.get("/api/v1/auth/csrf")
        self.assertEqual(csrf.status_code, 200, csrf.text)
        headers = {
            "X-CSRF-Token": csrf.json()["token"],
            "Idempotency-Key": key or uuid4().hex,
            "Origin": self.settings.public_origin,
        }
        if version is not None:
            headers["If-Match"] = f'"v{version}"'
        return (
            client.request(method, path, json=body, headers=headers)
            if body is not None
            else client.request(method, path, headers=headers)
        )

    def assert_contract(self, name: str, value) -> None:
        validator = Draft202012Validator(
            {
                "$ref": "#/components/schemas/" + name,
                "components": DOCUMENT["components"],
            },
            format_checker=FormatChecker(),
        )
        errors = list(validator.iter_errors(value))
        self.assertFalse(errors, str([e.message for e in errors]))

    def seed_reports(self, count=1, *, published=True) -> list[str]:
        reports = []
        with psycopg.connect(self.dsn) as conn:
            period = conn.execute(
                "INSERT INTO app.financial_periods(company_id,name,starts_on,ends_on) VALUES(%s,'fixture','2026-09-01','2026-09-30') RETURNING id",
                (self.company,),
            ).fetchone()[0]
            policies = []
            for kind in ("financial", "forecast"):
                policies.append(
                    conn.execute(
                        "INSERT INTO app.policy_versions(company_id,kind,version,effective_from,parameters,validation_status,actor_id) VALUES(%s,%s,1,'2026-09-01','{}','approved',%s) RETURNING id",
                        (self.company, kind, self.users["owner"]),
                    ).fetchone()[0]
                )
            for _ in range(count):
                session = conn.execute(
                    "INSERT INTO app.processing_sessions(company_id,requested_by,status,period_id) VALUES(%s,%s,'completed',%s) RETURNING id",
                    (self.company, self.users["owner"], period),
                ).fetchone()[0]
                revision = conn.execute(
                    "INSERT INTO app.dataset_revisions(company_id,session_id,state,sealed_at) VALUES(%s,%s,'sealed',clock_timestamp()) RETURNING id",
                    (self.company, session),
                ).fetchone()[0]
                manifest = conn.execute(
                    "INSERT INTO app.result_manifests(company_id,dataset_revision_id,period_id,as_of_date,manifest_hash,financial_policy_id,forecast_policy_id,status) VALUES(%s,%s,%s,'2026-09-30',%s,%s,%s,'building') RETURNING id",
                    (self.company, revision, period, uuid4().hex * 2, *policies),
                ).fetchone()[0]
                report = conn.execute(
                    "INSERT INTO app.report_snapshots(company_id,manifest_id,content_hash,content) VALUES(%s,%s,%s,'{}') RETURNING id",
                    (self.company, manifest, hashlib.sha256(b"{}").hexdigest()),
                ).fetchone()[0]
                if published:
                    conn.execute(
                        "UPDATE app.result_manifests SET status='published',published_at=clock_timestamp() WHERE id=%s",
                        (manifest,),
                    )
                reports.append(str(report))
        return reports

    def test_admin_directory_is_private_paginated_and_excludes_secrets(self):
        first = self.admin.get("/api/v1/admin/users?limit=2")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(len(first.json()["items"]), 2)
        for row in first.json()["items"]:
            self.assertEqual(
                set(row),
                {
                    "id",
                    "email",
                    "display_name",
                    "is_installation_admin",
                    "activated",
                    "disabled",
                },
            )
        cursor = first.json()["next_cursor"]
        self.assertTrue(cursor)
        second = self.admin.get("/api/v1/admin/users", params={"cursor": cursor})
        self.assertEqual(second.status_code, 200)
        self.assertTrue(
            set(r["id"] for r in first.json()["items"]).isdisjoint(
                r["id"] for r in second.json()["items"]
            )
        )
        self.assertEqual(self.owner.get("/api/v1/admin/users").status_code, 403)
        company_cursor = self.admin.get(
            "/api/v1/admin/users",
            params={
                "cursor": self.owner.get(self.base + "/memberships?limit=1").json()[
                    "next_cursor"
                ]
            },
        )
        self.assertEqual(company_cursor.status_code, 422)

    def test_membership_email_and_company_scoped_profiles(self):
        for client in (self.admin, self.client("viewer"), self.client("outsider")):
            self.assertIn(
                client.get(self.base + "/memberships").status_code, (403, 404)
            )
        result = self.mutate(
            self.owner,
            "POST",
            self.base + "/memberships",
            {"email": "OUTSIDER@fixture.invalid", "role": "viewer"},
        )
        self.assertEqual(result.status_code, 201, result.text)
        rows = self.owner.get(self.base + "/memberships").json()["items"]
        item = next(row for row in rows if row["user_id"] == self.users["outsider"])
        self.assertEqual(item["email"], "outsider@fixture.invalid")
        self.assertEqual(item["display_name"], "outsider")
        self.assertFalse(
            any("password" in str(row) or "token" in str(row) for row in rows)
        )
        mixed = self.mutate(
            self.owner,
            "POST",
            self.base + "/memberships",
            {
                "email": "outsider@fixture.invalid",
                "user_id": self.users["outsider"],
                "role": "viewer",
            },
        )
        self.assertEqual(mixed.status_code, 422)

    def test_reissued_invitation_revokes_previous_code_and_requires_admin(self):
        email = uuid4().hex + "@fixture.invalid"
        first = self.mutate(
            self.admin,
            "POST",
            "/api/v1/admin/users",
            {"email": email, "display_name": "دعوت دوباره"},
        ).json()
        path = "/api/v1/admin/users/" + first["user_id"] + "/invitation"
        self.assertEqual(self.mutate(self.owner, "POST", path).status_code, 403)
        second = self.mutate(self.admin, "POST", path)
        self.assertEqual(second.status_code, 201, second.text)
        anonymous = self.client()
        old = self.mutate(
            anonymous,
            "POST",
            "/api/v1/auth/accept-invitation",
            {"token": first["token"], "new_password": PASSWORD},
        )
        self.assertEqual(old.status_code, 422)
        new = self.mutate(
            anonymous,
            "POST",
            "/api/v1/auth/accept-invitation",
            {"token": second.json()["token"], "new_password": PASSWORD},
        )
        self.assertEqual(new.status_code, 201, new.text)
        self.assertEqual(self.mutate(self.admin, "POST", path).status_code, 404)

    def test_migrations_are_repeatable_and_bootstrap_not_public(self):
        self.assertEqual(
            len(self.migrations), len(list((ROOT / "database").glob("*.sql")))
        )
        self.assertEqual(self.assert_migrations_replay, [])
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / "database").mkdir()
            original = (ROOT / "database/001_schema.sql").read_text()
            (root / "database/001_schema.sql").write_text(original + "\n-- changed\n")
            with patch("didban.manage.ROOT", root):
                with self.assertRaises(RuntimeError):
                    migrate(self.dsn)
            (root / "database/001_schema.sql").unlink()
            (root / "database/999_broken.sql").write_text(
                "BEGIN;\nCREATE TABLE app.must_rollback(id integer);\nSELECT 1/0;\nCOMMIT;\n"
            )
            with patch("didban.manage.ROOT", root):
                with self.assertRaises(psycopg.errors.DivisionByZero):
                    migrate(self.dsn)
        with psycopg.connect(self.dsn) as conn:
            self.assertIsNone(
                conn.execute("SELECT to_regclass('app.must_rollback')").fetchone()[0]
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM didban_meta.schema_migrations"
                ).fetchone()[0],
                len(self.migrations),
            )
        with self.assertRaises(RuntimeError):
            bootstrap(self.dsn, "another@fixture.invalid", "دیگر", PASSWORD)
        self.assertEqual(self.lifetime.get("/health/ready").status_code, 200)
        for path in (
            "/api/v1/auth/signup",
            "/api/v1/auth/register",
            "/api/v1/bootstrap",
        ):
            result = self.lifetime.post(path)
            self.assertEqual(result.status_code, 404)
            self.assert_contract("Error", result.json())

    def test_runtime_roles_and_live_openapi(self):
        for dsn, expected in [
            (self.settings.app_dsn, self.logins[0]),
            (self.settings.identity_dsn, self.logins[1]),
        ]:
            with psycopg.connect(dsn) as conn:
                self.assertEqual(
                    conn.execute("SELECT current_user").fetchone()[0], expected
                )
                self.assertFalse(
                    conn.execute(
                        "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user"
                    ).fetchone()[0]
                )
        with psycopg.connect(self.settings.app_dsn) as conn:
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                conn.execute("SELECT * FROM app.users")
        with psycopg.connect(self.settings.identity_dsn) as conn:
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                conn.execute("SELECT * FROM app.invoices")
        doc = self.lifetime.get("/openapi.json").json()
        implemented = [
            operation["operationId"]
            for methods in doc["paths"].values()
            for operation in methods.values()
        ]
        self.assertIn("login", implemented)
        self.assertIn("uploadFile", implemented)
        self.assertIn("getResultManifest", implemented)
        self.assertIn("getForecast", implemented)
        self.assertIn("downloadExport", implemented)

    def test_session_cookie_flags_logout_and_no_plaintext_storage(self):
        client = self.client()
        csrf = client.get("/api/v1/auth/csrf").json()["token"]
        result = client.post(
            "/api/v1/auth/login",
            json={"email": "viewer@fixture.invalid", "password": PASSWORD},
            headers={"X-CSRF-Token": csrf, "Idempotency-Key": uuid4().hex},
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.assert_contract("User", result.json())
        self.assertNotIn("token", result.json())
        cookie = result.headers.get_list("set-cookie")[0].lower()
        self.assertIn("httponly", cookie)
        self.assertIn("secure", cookie)
        self.assertIn("samesite=lax", cookie)
        raw = client.cookies.get("didban_session")
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.auth_sessions WHERE token_hash=%s", (raw,)
                ).fetchone()[0],
                0,
            )
            stored = conn.execute(
                "SELECT password_hash FROM app.users WHERE id=%s",
                (self.users["viewer"],),
            ).fetchone()[0]
            self.assertTrue(stored.startswith("$argon2id$"))
        self.assertEqual(client.get("/api/v1/auth/me").status_code, 200)
        self.assertEqual(
            self.mutate(client, "POST", "/api/v1/auth/logout").status_code, 200
        )
        self.assertEqual(client.get("/api/v1/auth/me").status_code, 401)
        client.cookies.set("didban_session", raw, domain="testserver.local", path="/")
        self.assertEqual(client.get("/api/v1/auth/me").status_code, 401)

    def test_csrf_origin_and_closed_request_validation(self):
        path = self.base
        result = self.owner.patch(
            path,
            json={"name": "نام"},
            headers={"Idempotency-Key": uuid4().hex, "If-Match": '"v1"'},
        )
        self.assertEqual(result.status_code, 403)
        token = self.owner.get("/api/v1/auth/csrf").json()["token"]
        headers = {
            "X-CSRF-Token": token,
            "Idempotency-Key": uuid4().hex,
            "If-Match": '"v1"',
            "Origin": "https://other.invalid",
        }
        self.assertEqual(
            self.owner.patch(path, json={"name": "نام"}, headers=headers).status_code,
            403,
        )
        result = self.mutate(
            self.owner,
            "PATCH",
            path,
            {"name": "نام", "company_id": str(uuid4())},
            version=1,
        )
        self.assertEqual(result.status_code, 422)
        self.assert_contract("Error", result.json())
        self.assertEqual(
            self.mutate(self.owner, "PATCH", path, {"name": "نام"}).status_code, 428
        )
        headers.update(
            {"Origin": self.settings.public_origin, "Content-Type": "application/json"}
        )
        result = self.owner.patch(
            path, content='{"name":"a","name":"b"}', headers=headers
        )
        self.assertEqual(result.status_code, 422)
        for malformed in ('{"name":"\\ud800"}', '{"name":"\\u0000"}'):
            result = self.owner.patch(path, content=malformed, headers=headers)
            self.assertEqual(result.status_code, 422)
        result = self.owner.patch(
            path, content='{"name":"' + "a" * 70000 + '"}', headers=headers
        )
        self.assertEqual(result.status_code, 413)

    def test_invalid_credentials_have_same_error_and_rate_limit_is_durable(self):
        client = self.client()
        for email in ("owner@fixture.invalid", uuid4().hex + "@fixture.invalid"):
            result = self.mutate(
                client,
                "POST",
                "/api/v1/auth/login",
                {"email": email, "password": "wrong"},
            )
            self.assertEqual(result.status_code, 401)
            self.assertEqual(result.json()["code"], "invalid_credentials")
        limited = create_app(replace(self.settings, login_attempts=2))
        with TestClient(limited, base_url="https://testserver"):
            rate_client = self.client(app=limited, address="only-rate-test")
            email = uuid4().hex + "@fixture.invalid"
            statuses = [
                self.mutate(
                    rate_client,
                    "POST",
                    "/api/v1/auth/login",
                    {"email": email, "password": "wrong"},
                ).status_code
                for _ in range(3)
            ]
            self.assertEqual(statuses, [401, 401, 429])

    def test_company_isolation_and_no_implicit_admin_membership(self):
        viewer, outsider = self.client("viewer"), self.client("outsider")
        self.assertEqual(viewer.get(self.base).status_code, 200)
        self.assertEqual(outsider.get(self.base).status_code, 404)
        self.assertEqual(self.admin.get(self.base).status_code, 404)
        listed = outsider.get("/api/v1/companies").json()
        self.assertEqual(listed["items"], [])
        self.assertEqual(viewer.get(self.base + "/memberships").status_code, 403)
        result = self.mutate(
            viewer,
            "POST",
            "/api/v1/admin/users",
            {"email": "x@fixture.invalid", "display_name": "x"},
        )
        self.assertEqual(result.status_code, 403)

    def test_access_capabilities_follow_roles_and_explicit_permission(self):
        access_path = self.base + "/access"
        owner = self.owner.get(access_path)
        self.assertEqual(owner.status_code, 200, owner.text)
        self.assert_contract("CompanyAccess", owner.json())
        self.assertIn("company.owner", owner.json()["permissions"])
        self.assertNotIn("company.approve_report", owner.json()["permissions"])
        self.assertIn(
            "company.approve_report",
            self.client("finance").get(access_path).json()["permissions"],
        )
        self.assertEqual(
            self.client("viewer").get(access_path).json()["permissions"],
            ["company.read"],
        )
        advisor = self.client("advisor")
        self.assertIn("company.operate", advisor.get(access_path).json()["permissions"])
        self.assertNotIn(
            "company.approve_report", advisor.get(access_path).json()["permissions"]
        )
        member = self.members["advisor"]
        result = self.mutate(
            self.owner,
            "PUT",
            self.base + "/memberships/" + member["id"] + "/report-approval-permission",
            {"enabled": True, "reason": "مجوز صریح"},
            version=1,
        )
        self.assertEqual(result.status_code, 200)
        self.assertIn(
            "company.approve_report", advisor.get(access_path).json()["permissions"]
        )
        self.assertEqual(self.admin.get(access_path).status_code, 404)

    def test_login_replay_does_not_restore_revoked_session(self):
        client = self.client()
        body = {"email": "viewer@fixture.invalid", "password": PASSWORD}
        key = uuid4().hex
        first = self.mutate(client, "POST", "/api/v1/auth/login", body, key=key)
        self.assertEqual(first.status_code, 200)
        original = client.cookies.get("didban_session")
        again = self.mutate(client, "POST", "/api/v1/auth/login", body, key=key)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(client.cookies.get("didban_session"), original)
        self.assertEqual(
            self.mutate(client, "POST", "/api/v1/auth/logout").status_code, 200
        )
        replay = self.mutate(client, "POST", "/api/v1/auth/login", body, key=key)
        self.assertEqual(replay.status_code, 409)
        self.assertEqual(client.get("/api/v1/auth/me").status_code, 401)

    def test_expired_session_disabled_user_and_expired_invitation(self):
        client = self.client("outsider")
        security = Security(self.settings.secret, self.settings.session_seconds)
        hashed = security.digest("session", client.cookies.get("didban_session"))
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=%s",
                (hashed,),
            )
        self.assertEqual(client.get("/api/v1/auth/me").status_code, 401)
        active = self.client("outsider")
        try:
            with psycopg.connect(self.dsn) as conn:
                conn.execute(
                    "UPDATE app.users SET disabled_at=clock_timestamp() WHERE id=%s",
                    (self.users["outsider"],),
                )
            self.assertEqual(active.get("/api/v1/auth/me").status_code, 401)
        finally:
            with psycopg.connect(self.dsn) as conn:
                conn.execute(
                    "UPDATE app.users SET disabled_at=NULL WHERE id=%s",
                    (self.users["outsider"],),
                )
        created = self.mutate(
            self.admin,
            "POST",
            "/api/v1/admin/users",
            {"email": uuid4().hex + "@fixture.invalid", "display_name": "دعوت منقضی"},
        )
        self.assertEqual(created.status_code, 201)
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "UPDATE app.identity_tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=%s",
                (created.json()["user_id"],),
            )
        expired = self.mutate(
            self.client(),
            "POST",
            "/api/v1/auth/accept-invitation",
            {"token": created.json()["token"], "new_password": PASSWORD},
        )
        self.assertEqual(expired.status_code, 422)

    def test_privileged_runtime_connection_is_rejected(self):
        unsafe = create_app(replace(self.settings, app_dsn=self.dsn))
        with self.assertRaises(RuntimeError):
            with TestClient(unsafe, base_url="https://testserver"):
                pass

    def test_parallel_permission_change_uses_membership_version(self):
        token = self.owner.get("/api/v1/auth/csrf").json()["token"]
        path = (
            self.base
            + "/memberships/"
            + self.members["advisor"]["id"]
            + "/report-approval-permission"
        )

        def send(enabled):
            return self.owner.put(
                path,
                json={"enabled": enabled, "reason": "رقابت نسخه"},
                headers={
                    "X-CSRF-Token": token,
                    "Idempotency-Key": uuid4().hex,
                    "If-Match": '"v1"',
                },
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = [
                f.result(timeout=15)
                for f in [pool.submit(send, True), pool.submit(send, False)]
            ]
        self.assertEqual(sorted(r.status_code for r in outcomes), [200, 409])
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.permission_events WHERE company_id=%s AND membership_id=%s",
                    (self.company, self.members["advisor"]["id"]),
                ).fetchone()[0],
                1,
            )

    def test_company_versions_and_replay_do_not_duplicate_effects(self):
        payload = {"name": "تغییر نام"}
        key = uuid4().hex
        first = self.mutate(self.owner, "PATCH", self.base, payload, version=1, key=key)
        self.assertEqual(first.status_code, 200, first.text)
        again = self.mutate(self.owner, "PATCH", self.base, payload, version=1, key=key)
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(first.json(), again.json())
        self.assertEqual(first.headers["etag"], '"v2"')
        changed = self.mutate(
            self.owner, "PATCH", self.base, {"name": "دیگر"}, version=1, key=key
        )
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(
            self.mutate(self.owner, "PATCH", self.base, payload, version=1).status_code,
            409,
        )
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.audit_events WHERE company_id=%s AND action='company.updated'",
                    (self.company,),
                ).fetchone()[0],
                1,
            )

    def test_parallel_company_creation_is_idempotent(self):
        token = self.admin.get("/api/v1/auth/csrf").json()["token"]
        headers = {"X-CSRF-Token": token, "Idempotency-Key": uuid4().hex}
        body = {
            "name": "ساخت هم‌زمان",
            "owner_user_id": self.users["owner"],
            "timezone": "Asia/Tehran",
            "display_unit": "IRR",
        }

        def send():
            return self.admin.post(
                "/api/v1/admin/companies", json=body, headers=headers
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = [
                f.result(timeout=15) for f in [pool.submit(send), pool.submit(send)]
            ]
        self.assertEqual([r.status_code for r in results], [201, 201])
        self.assertEqual(results[0].json()["id"], results[1].json()["id"])

    def test_memberships_owner_only_and_last_owner(self):
        finance = self.client("finance")
        payload = {"user_id": self.users["outsider"], "role": "viewer"}
        self.assertEqual(
            self.mutate(
                finance, "POST", self.base + "/memberships", payload
            ).status_code,
            403,
        )
        self.assertEqual(
            self.mutate(
                self.owner, "POST", self.base + "/memberships", payload
            ).status_code,
            201,
        )
        self.assertEqual(
            self.mutate(
                self.owner, "POST", self.base + "/memberships", payload
            ).status_code,
            409,
        )
        members = self.owner.get(self.base + "/memberships").json()["items"]
        owner = next(row for row in members if row["user_id"] == self.users["owner"])
        result = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + owner["id"],
            {"active": False},
            version=owner["version"],
        )
        self.assertEqual(result.status_code, 409, result.text)
        self.assertEqual(result.json()["code"], "last_owner_required")

    def test_self_deactivation_with_another_owner_commits_receipt(self):
        added = self.mutate(
            self.owner,
            "POST",
            self.base + "/memberships",
            {"user_id": self.users["outsider"], "role": "owner"},
        )
        self.assertEqual(added.status_code, 201)
        owner = next(
            row
            for row in self.owner.get(self.base + "/memberships").json()["items"]
            if row["user_id"] == self.users["owner"]
        )
        result = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + owner["id"],
            {"active": False},
            version=owner["version"],
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(result.json()["active"])
        self.assertEqual(self.owner.get(self.base).status_code, 404)

    def test_approval_permissions_grant_revoke_and_snapshot_scope(self):
        reports = self.seed_reports(2)
        advisor, finance = self.client("advisor"), self.client("finance")
        permission_path = (
            self.base
            + "/memberships/"
            + self.members["advisor"]["id"]
            + "/report-approval-permission"
        )
        report_path = self.base + "/reports/" + reports[0]
        self.assertEqual(
            self.mutate(
                advisor,
                "POST",
                report_path + "/approvals",
                {"confirmed": True},
                version=1,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.mutate(
                self.owner,
                "POST",
                report_path + "/approvals",
                {"confirmed": True},
                version=1,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.mutate(
                finance,
                "PUT",
                permission_path,
                {"enabled": True, "reason": "test"},
                version=1,
            ).status_code,
            403,
        )
        allowed = self.mutate(
            self.owner,
            "PUT",
            permission_path,
            {"enabled": True, "reason": "مجوز صریح"},
            version=1,
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertTrue(allowed.json()["enabled"])
        self.assertEqual(allowed.headers["etag"], '"v2"')
        self.assertEqual(
            self.mutate(
                advisor,
                "POST",
                report_path + "/approvals",
                {"confirmed": True},
                version=1,
            ).status_code,
            201,
        )

        self.assertEqual(
            advisor.get(self.base + "/reports/" + reports[1]).json()["approval_ids"], []
        )
        revoked = self.mutate(
            self.owner,
            "PUT",
            permission_path,
            {"enabled": False, "reason": "لغو مجوز"},
            version=2,
        )
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(
            self.mutate(
                advisor,
                "POST",
                self.base + "/reports/" + reports[1] + "/approvals",
                {"confirmed": True},
                version=1,
            ).status_code,
            403,
        )
        self.assertEqual(len(advisor.get(report_path).json()["approval_ids"]), 1)
        self.assertEqual(
            self.mutate(
                finance,
                "POST",
                self.base + "/reports/" + reports[1] + "/approvals",
                {"confirmed": True},
                version=1,
            ).status_code,
            201,
        )

    def test_unpublished_report_cannot_be_read_or_approved(self):
        report = self.seed_reports(published=False)[0]
        finance = self.client("finance")
        path = self.base + "/reports/" + report
        self.assertEqual(finance.get(path).status_code, 404)
        result = self.mutate(
            finance, "POST", path + "/approvals", {"confirmed": True}, version=1
        )
        self.assertEqual(result.status_code, 404)

    def test_permission_is_revoked_before_demotion(self):
        member = self.members["advisor"]
        permission_path = (
            self.base + "/memberships/" + member["id"] + "/report-approval-permission"
        )
        self.assertEqual(
            self.mutate(
                self.owner,
                "PUT",
                permission_path,
                {"enabled": True, "reason": "test"},
                version=1,
            ).status_code,
            200,
        )
        result = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + member["id"],
            {"role": "viewer"},
            version=2,
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(self.owner.get(permission_path).json()["enabled"])

    def test_invitation_activation_reset_and_old_sessions_revoked(self):
        email = uuid4().hex + "@fixture.invalid"
        body = {"email": email, "display_name": "کاربر دعوت‌شده"}
        key = uuid4().hex
        first = self.mutate(self.admin, "POST", "/api/v1/admin/users", body, key=key)
        self.assertEqual(first.status_code, 201, first.text)
        again = self.mutate(self.admin, "POST", "/api/v1/admin/users", body, key=key)
        self.assertEqual(first.json(), again.json())
        token = first.json()["token"]
        anonymous = self.client()
        accepted = self.mutate(
            anonymous,
            "POST",
            "/api/v1/auth/accept-invitation",
            {"token": token, "new_password": PASSWORD},
        )
        self.assertEqual(accepted.status_code, 201, accepted.text)
        self.assertEqual(anonymous.get("/api/v1/auth/me").status_code, 401)
        used = self.mutate(
            anonymous,
            "POST",
            "/api/v1/auth/accept-invitation",
            {"token": token, "new_password": PASSWORD},
        )
        self.assertEqual(used.status_code, 422)
        self.assertEqual(
            self.mutate(
                anonymous,
                "POST",
                "/api/v1/auth/login",
                {"email": email, "password": PASSWORD},
            ).status_code,
            200,
        )
        new_password = PASSWORD + "-changed"
        reset = self.mutate(
            self.admin,
            "POST",
            "/api/v1/admin/users/" + first.json()["user_id"] + "/password-reset",
        )
        self.assertEqual(reset.status_code, 201, reset.text)
        reset_client = self.client()
        done = self.mutate(
            reset_client,
            "POST",
            "/api/v1/auth/reset-password",
            {"token": reset.json()["token"], "new_password": new_password},
        )
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(anonymous.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(
            self.mutate(
                reset_client,
                "POST",
                "/api/v1/auth/login",
                {"email": email, "password": PASSWORD},
            ).status_code,
            401,
        )
        self.assertEqual(
            self.mutate(
                reset_client,
                "POST",
                "/api/v1/auth/login",
                {"email": email, "password": new_password},
            ).status_code,
            200,
        )
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.identity_tokens WHERE token_hash=%s",
                    (token,),
                ).fetchone()[0],
                0,
            )
            replay_rows = conn.execute(
                "SELECT response_encrypted FROM app.identity_idempotency"
            ).fetchall()
            self.assertTrue(
                all(
                    token not in row[0] and PASSWORD not in row[0]
                    for row in replay_rows
                )
            )

    def test_revoked_membership_and_signed_cursor_binding(self):
        viewer = self.client("viewer")
        member = self.members["viewer"]
        result = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + member["id"],
            {"active": False},
            version=member["version"],
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(viewer.get(self.base).status_code, 404)
        page = self.owner.get("/api/v1/companies?limit=1").json()
        self.assert_contract("CompanyPage", page)
        cursor = page["next_cursor"]
        if cursor:
            self.assertEqual(
                self.owner.get(
                    "/api/v1/companies", params={"cursor": cursor, "limit": 1}
                ).status_code,
                200,
            )
            self.assertEqual(
                self.client("advisor")
                .get("/api/v1/companies", params={"cursor": cursor})
                .status_code,
                422,
            )
            self.assertEqual(
                self.owner.get(
                    self.base + "/memberships", params={"cursor": cursor}
                ).status_code,
                422,
            )


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(RuntimeTests)
    )
    report = {
        "scope": "runtime_identity_company_permission_http_and_postgresql",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "status": "passed"
        if result.wasSuccessful() and not result.skipped
        else "failed_or_not_run",
        "restricted_database_logins": True,
        "outbound_notifications": 0,
        "model_calls": 0,
        "ui_tests": "not_run_by_this_suite",
        "source_sha256": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / "database").glob("*.sql"))
        },
        "api_source_sha256": {
            str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((ROOT / "apps/api/didban").rglob("*.py"))
        },
        "openapi_sha256": hashlib.sha256(
            (ROOT / "contracts/openapi.json").read_bytes()
        ).hexdigest(),
        "runtime_versions": {
            name: importlib.metadata.version(name)
            for name in (
                "fastapi",
                "starlette",
                "uvicorn",
                "psycopg",
                "argon2-cffi",
                "cryptography",
            )
        },
    }
    (ROOT / "docs/runtime-validation.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    raise SystemExit(0 if result.wasSuccessful() and not result.skipped else 1)
