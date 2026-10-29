"""Restricted-role HTTP/SQL tests on a disposable database, never the live install."""

import unittest
import psycopg
from test_runtime import RuntimeTests


class ExtensionAccessTests(RuntimeTests):
    def test_extension_history_recipient_pagination_and_owner_scope(self):
        member = self.members["advisor"]["id"]
        self.assertEqual(
            self.set_grants(self.owner, member, view=True).status_code, 200
        )
        modules = self.owner.get(self.base + "/modules").json()
        modules["modules"]["forecast"] = False
        changed = self.mutate(
            self.owner,
            "PUT",
            self.base + "/modules",
            {"modules": modules["modules"], "reason": "آزمون تاریخچه"},
            version=1,
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        url = self.base + "/extension-access-events?limit=1"
        first = self.owner.get(url)
        self.assertEqual(first.status_code, 200, first.text)
        page = first.json()
        self.assertEqual(len(page["items"]), 1)
        event = page["items"][0]
        self.assertEqual(event["kind"], "payroll_permissions")
        self.assertTrue(event["recipient_name"])
        self.assertTrue(event["actor_name"])
        self.assertNotEqual(event["actor_name"], event["recipient_name"])
        self.assertTrue(event["after_value"]["view"])
        second = self.owner.get(url, params={"cursor": page["next_cursor"]}).json()
        self.assertEqual(second["items"][0]["kind"], "company_modules")
        self.assertIsNone(second["items"][0]["recipient_name"])
        self.assertIsNone(second["next_cursor"])
        self.assertEqual(self.client("finance").get(url).status_code, 403)
        self.assertEqual(self.client("advisor").get(url).status_code, 403)
        self.assertEqual(self.client("outsider").get(url).status_code, 404)

    def test_extension_owner_authority_is_locked_until_commit(self):
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            member = self.members["advisor"]
            conn.execute(
                "INSERT INTO app.payroll_permissions(company_id,membership_id,membership_version,can_view,changed_by,reason) VALUES(%s,%s,%s,true,%s,'authority lock test')",
                (self.company, member["id"], member["version"], self.users["owner"]),
            )
            with psycopg.connect(self.dsn) as competing:
                competing.execute("SET LOCAL lock_timeout='100ms'")
                with self.assertRaises(psycopg.errors.LockNotAvailable):
                    competing.execute(
                        "SELECT id FROM app.company_memberships WHERE company_id=%s AND user_id=%s FOR UPDATE",
                        (self.company, self.users["owner"]),
                    )
                competing.rollback()

    def test_extension_report_grant_does_not_revoke_payroll(self):
        member = self.members["advisor"]["id"]
        grant = self.set_grants(self.owner, member, view=True)
        self.assertEqual(grant.status_code, 200, grant.text)
        report_grant = self.mutate(
            self.owner,
            "PUT",
            self.base + "/memberships/" + member + "/report-approval-permission",
            {"enabled": True, "reason": "تأیید گزارش"},
            version=self.members["advisor"]["version"],
        )
        self.assertEqual(report_grant.status_code, 200, report_grant.text)
        advisor = self.client("advisor")
        self.assertTrue(advisor.get(self.base + "/payroll-access").json()["view"])
        self.assertFalse(advisor.get(self.base + "/payroll-access").json()["approve"])

    def set_grants(
        self,
        client,
        member,
        view=False,
        manage=False,
        approve=False,
        version=1,
        key=None,
    ):
        return self.mutate(
            client,
            "PUT",
            self.base + "/memberships/" + member + "/payroll-permissions",
            {
                "view": view,
                "manage": manage,
                "approve": approve,
                "reason": "آزمون مجوز",
            },
            version=version,
            key=key,
        )

    def test_extension_independent_permissions_and_owner_self_grant(self):
        url = self.base + "/payroll-access"
        self.assertEqual(
            self.owner.get(url).json(),
            {
                "company_id": self.company,
                "view": False,
                "manage": False,
                "approve": False,
            },
        )
        self.assertTrue(
            all(
                self.client("finance").get(url).json()[k]
                for k in ("view", "manage", "approve")
            )
        )
        member = self.members["advisor"]["id"]
        changed = self.set_grants(self.owner, member, view=True)
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["version"], 2)
        advisor = self.client("advisor")
        self.assertEqual(
            advisor.get(url).json(),
            {
                "company_id": self.company,
                "view": True,
                "manage": False,
                "approve": False,
            },
        )
        # Financial report approval remains independent.
        self.assertNotIn(
            "company.approve_report",
            advisor.get(self.base + "/access").json()["permissions"],
        )
        self.assertEqual(
            self.set_grants(advisor, member, approve=True, version=2).status_code, 403
        )
        self.assertEqual(
            self.set_grants(
                self.client("finance"), member, approve=True, version=2
            ).status_code,
            403,
        )
        self.assertEqual(
            self.set_grants(
                self.owner, self.members["viewer"]["id"], view=True
            ).status_code,
            422,
        )
        owner_member = next(
            m
            for m in self.owner.get(self.base + "/memberships").json()["items"]
            if m["role"] == "owner"
        )
        result = self.set_grants(
            self.owner, owner_member["id"], view=True, approve=True
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(self.owner.get(url).json()["approve"])
        self.assertEqual(self.client("outsider").get(url).status_code, 404)

    def test_extension_grants_versions_revocation_and_membership_change(self):
        member = self.members["advisor"]["id"]
        first = self.set_grants(
            self.owner,
            member,
            view=True,
            manage=True,
            approve=True,
            key="extension-grant-one",
        )
        self.assertEqual(first.status_code, 200, first.text)
        replay = self.set_grants(
            self.owner,
            member,
            view=True,
            manage=True,
            approve=True,
            key="extension-grant-one",
        )
        self.assertEqual(first.json(), replay.json())
        self.assertEqual(
            self.set_grants(self.owner, member, view=True, version=1).status_code, 409
        )
        revoked = self.set_grants(self.owner, member, version=2)
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertFalse(
            self.client("advisor").get(self.base + "/payroll-access").json()["view"]
        )
        self.assertEqual(
            self.set_grants(self.owner, member, view=True, version=3).status_code, 200
        )
        update = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + member,
            {"active": False},
            version=self.members["advisor"]["version"],
        )
        self.assertEqual(update.status_code, 200, update.text)
        restored = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + member,
            {"active": True},
            version=update.json()["version"],
        )
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertFalse(
            self.client("advisor").get(self.base + "/payroll-access").json()["view"]
        )
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) AS n FROM app.extension_access_events WHERE company_id=%s AND kind='payroll_permissions'",
                    (self.company,),
                ).fetchone()["n"],
                4,
            )

    def test_extension_modules_owner_version_audit_and_active_session(self):
        url = self.base + "/modules"
        current = self.owner.get(url)
        self.assertEqual(current.status_code, 200, current.text)
        values = current.json()["modules"]
        self.assertFalse(values["payroll"])
        values["cash"] = False
        body = {"modules": values, "reason": "تنظیم ماژول"}
        self.assertEqual(
            self.mutate(
                self.client("finance"), "PUT", url, body, version=1
            ).status_code,
            403,
        )
        result = self.mutate(self.owner, "PUT", url, body, version=1)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["version"], 2)
        self.assertEqual(
            self.mutate(self.owner, "PUT", url, body, version=1).status_code, 409
        )
        self.assertEqual(self.client("outsider").get(url).status_code, 404)
        values["payroll"] = "yes"
        self.assertEqual(
            self.mutate(self.owner, "PUT", url, body, version=2).status_code, 422
        )
        values["payroll"] = False
        period = self.mutate(
            self.owner,
            "POST",
            self.base + "/financial-periods",
            {
                "name": "دوره آزمون",
                "starts_on": "2026-09-01",
                "ends_on": "2026-09-30",
                "previous_period_id": None,
            },
        )
        self.assertEqual(period.status_code, 201, period.text)
        session = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions",
            {"period_id": period.json()["id"]},
        )
        self.assertEqual(session.status_code, 201, session.text)
        values["forecast"] = False
        blocked = self.mutate(self.owner, "PUT", url, body, version=2)
        self.assertEqual(blocked.status_code, 409, blocked.text)
        self.assertEqual(blocked.json()["code"], "module_has_active_processing")
        self.assertTrue(self.owner.get(url).json()["modules"]["forecast"])

    def test_extension_disabled_settlement_blocks_new_actions(self):
        from didban.infrastructure.company_modules import require_module
        from didban.errors import ApiError

        current = self.owner.get(self.base + "/modules").json()
        current["modules"]["settlements"] = False
        result = self.mutate(
            self.owner,
            "PUT",
            self.base + "/modules",
            {"modules": current["modules"], "reason": "غیرفعال‌سازی"},
            version=1,
        )
        self.assertEqual(result.status_code, 200, result.text)
        with self.app.state.db.transaction(
            identity=False, actor=self.users["owner"], company=self.company
        ) as conn:
            with self.assertRaises(ApiError) as error:
                require_module(conn, self.company, "settlements")
            self.assertEqual(error.exception.code, "company_module_disabled")


if __name__ == "__main__":
    suite = unittest.TestSuite(
        ExtensionAccessTests(name)
        for name in unittest.defaultTestLoader.getTestCaseNames(ExtensionAccessTests)
        if name.startswith("test_extension_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
