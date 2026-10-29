"""Input-review gate, corrections and confirmations on disposable HTTP/SQL fixtures."""

from __future__ import annotations
import unittest
import psycopg
from test_financial_runtime import FinancialTests
from test_model_provider import SETTINGS
from didban.adapters.model_provider import ProviderResult, OpenAIResponsesProvider
from didban.application.input_review_worker import InputReviewWorker
from didban.application.interpretation_worker import InterpretationWorker


class CorrectionProvider:
    def reservation(self, context):
        return OpenAIResponsesProvider(SETTINGS).reservation(context)

    def complete(self, context, request_id):
        account = next(a for a in context["accounts"] if a["account_code"] == "701")
        return ProviderResult(
            {
                "action": "set_account_role",
                **{k: account[k] for k in ("file_id", "sheet_name", "account_code")},
                "role": "other_income",
                "evidence": account["account_name"],
                "reason": "درخواست صریح کاربر برای طبقه‌بندی این حساب",
            },
            10,
            20,
            "synthetic-review",
        )


class InputReviewTests(FinancialTests):
    def test_review_shows_unbalanced_ledger_and_preserves_independent_bank_results(
        self,
    ):
        period = self.period(starts_on="2026-09-01", ends_on="2026-09-30")
        session = self.session(period)
        ledger = b"entry_id,date,account,debit,credit,entry_type,role,currency\nE1,2026-09-01,101,100,0,regular,bank,IRR\nE1,2026-09-01,701,0,90,regular,revenue,IRR\n"
        bank = b"date,amount,balance,bank_account,row_type,currency\n2026-09-01,0,100,bank-A,opening,IRR\n"
        for filename, data in [("unbalanced.csv", ledger), ("bank.csv", bank)]:
            uploaded = self.upload(session, data, name=filename)
            self.assertEqual(uploaded.status_code, 202, uploaded.text)
        self.assertEqual(self.seal(session).status_code, 202)
        self.complete_coverage(session)
        review = self.review(session)
        source = next(
            f for f in review["overview"]["files"] if f["name"] == "unbalanced.csv"
        )
        self.assertEqual(source["rejected_rows"], 2)
        self.assertEqual(source["valid_rows"], 0)
        self.assertTrue(
            any(
                c["key"] == "journal_balance" and c["outcome"] == "failed"
                for c in source["controls"]
            )
        )
        self.assertEqual(source["ledger_totals"]["debit"], "100")
        self.assertEqual(source["ledger_totals"]["credit"], "90")
        self.assertEqual(source["ledger_totals"]["difference"], "10")
        # D02 permits the valid bank scope; confirmation never changes row validity.
        self.assertTrue(review["can_confirm"])
        confirmed = self.change(
            session, "/confirm", {"snapshot_hash": review["snapshot_hash"]}
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        final = self.finish_financial(session)
        metrics = self.metrics(final["manifest_id"])
        self.assertIsNone(metrics["revenue"]["value"])
        self.assertEqual(metrics["cash"]["value"], "100")
        with psycopg.connect(self.dsn) as conn:
            count = conn.execute(
                "SELECT count(*) FROM app.journal_lines WHERE company_id=%s",
                (self.company,),
            ).fetchone()[0]
        self.assertEqual(count, 0)

    def test_review_revocation_before_dispatch_releases_pending_proposal(self):
        session = self.prepared()
        review = self.review(session)
        advisor = self.client("advisor")
        comment = self.change(
            session,
            "/comments",
            {
                "snapshot_hash": review["snapshot_hash"],
                "body": "حساب نیاز به بررسی دارد.",
                "file_id": None,
                "sheet_name": None,
                "account_code": None,
            },
            client=advisor,
        )
        queued = self.change(
            session,
            "/proposals",
            {
                "snapshot_hash": review["snapshot_hash"],
                "comment_id": comment.json()["comments"][0]["id"],
            },
            client=advisor,
        )
        self.assertEqual(queued.status_code, 200, queued.text)
        revoked = self.mutate(
            self.owner,
            "PATCH",
            self.base + "/memberships/" + self.members["advisor"]["id"],
            {"active": False},
            version=self.members["advisor"]["version"],
        )
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertFalse(
            InputReviewWorker(
                self.worker_settings, SETTINGS, CorrectionProvider()
            ).run_once()
        )
        self.assertEqual(self.review(session)["proposals"][0]["status"], "unavailable")

    def test_review_authorized_advisor_can_confirm_without_owner_role(self):
        session = self.prepared()
        advisor = self.client("advisor")
        review = advisor.get(self.review_url(session))
        self.assertEqual(review.status_code, 200, review.text)
        confirmed = self.change(
            session,
            "/confirm",
            {"snapshot_hash": review.json()["snapshot_hash"]},
            client=advisor,
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertTrue(confirmed.json()["confirmed"])
        self.assertEqual(
            self.client("finance").get(self.review_url(session)).status_code, 200
        )

    def test_review_revocation_during_model_call_preserves_receipt_and_unblocks_owner(
        self,
    ):
        parent = self

        class RevokingProvider(CorrectionProvider):
            def complete(self, context, request_id):
                revoked = parent.mutate(
                    parent.owner,
                    "PATCH",
                    parent.base + "/memberships/" + parent.members["advisor"]["id"],
                    {"active": False},
                    version=parent.members["advisor"]["version"],
                )
                parent.assertEqual(revoked.status_code, 200, revoked.text)
                return super().complete(context, request_id)

        current = self.admin.get("/api/v1/admin/budget-policy")
        budget = self.mutate(
            self.admin,
            "POST" if current.status_code == 404 else "PATCH",
            "/api/v1/admin/budget-policy",
            {"ceiling_usd": "100"},
            version=current.json().get("version")
            if current.status_code == 200
            else None,
        )
        self.assertIn(budget.status_code, (200, 201), budget.text)
        session = self.prepared()
        review = self.review(session)
        advisor = self.client("advisor")
        comment = self.change(
            session,
            "/comments",
            {
                "snapshot_hash": review["snapshot_hash"],
                "body": "حساب 701 سایر درآمدهاست.",
                "file_id": None,
                "sheet_name": None,
                "account_code": None,
            },
            client=advisor,
        )
        queued = self.change(
            session,
            "/proposals",
            {
                "snapshot_hash": review["snapshot_hash"],
                "comment_id": comment.json()["comments"][0]["id"],
            },
            client=advisor,
        )
        self.assertEqual(queued.status_code, 200, queued.text)
        worker = InputReviewWorker(self.worker_settings, SETTINGS, RevokingProvider())
        self.assertTrue(worker.run_once())
        self.assertFalse(worker.run_once())
        after = self.review(session)
        self.assertEqual(after["proposals"][0]["status"], "unavailable")
        self.assertEqual(
            next(
                a for a in after["overview"]["accounts"] if a["account_code"] == "701"
            )["role"],
            "revenue",
        )
        with psycopg.connect(self.dsn) as conn:
            receipt = conn.execute(
                "SELECT r.billing_status FROM app.model_requests r JOIN app.input_review_proposals p ON p.model_request_id=r.id WHERE p.company_id=%s",
                (self.company,),
            ).fetchone()[0]
        self.assertEqual(receipt, "settled")
        proposal_id = after["proposals"][0]["id"]
        self.assertEqual(
            self.change(
                session,
                "/proposals/" + proposal_id + "/decision",
                {"accept": False, "reason": "با دسترسی مسئول فعلی بررسی شد."},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.change(
                session,
                "/comments/" + comment.json()["comments"][0]["id"] + "/resolve",
                {"reason": "برداشت فعلی حفظ می‌شود."},
            ).status_code,
            200,
        )

    def test_review_mapping_proposal_revalidates_without_editing_source(self):
        class MappingProvider(CorrectionProvider):
            def complete(self, context, request_id):
                sheet = context["sheets"][0]
                mapping = dict(sheet["mapping"]) | {"description": 9}
                return ProviderResult(
                    {
                        "action": "set_column_mapping",
                        "file_id": sheet["file_id"],
                        "sheet_name": sheet["sheet_name"],
                        "mapping": [
                            {
                                "field": k,
                                "column": v,
                                "evidence": sheet["columns"][v - 1],
                            }
                            for k, v in mapping.items()
                        ],
                        "reason": "ستون توضیحات طبق نظر کاربر مشخص شد.",
                    },
                    10,
                    20,
                    "synthetic-mapping",
                )

        budget = self.admin.get("/api/v1/admin/budget-policy")
        result = self.mutate(
            self.admin,
            "POST" if budget.status_code == 404 else "PATCH",
            "/api/v1/admin/budget-policy",
            {"ceiling_usd": "100"},
            version=budget.json().get("version") if budget.status_code == 200 else None,
        )
        self.assertIn(result.status_code, (200, 201), result.text)
        data = b"entry_id,date,account,debit,credit,entry_type,role,currency,misc\nE1,2026-09-01,101,100,0,regular,bank,IRR,banknote\nE1,2026-09-01,701,0,100,regular,revenue,IRR,salenote\n"
        session = self.prepared(data=data)
        review = self.review(session)
        created = self.change(
            session,
            "/comments",
            {
                "snapshot_hash": review["snapshot_hash"],
                "body": "ستون misc شرح آرتیکل است.",
                "file_id": review["overview"]["files"][0]["file_id"],
                "sheet_name": review["overview"]["files"][0]["sheets"][0],
                "account_code": None,
            },
        )
        proposed = self.change(
            session,
            "/proposals",
            {
                "snapshot_hash": review["snapshot_hash"],
                "comment_id": created.json()["comments"][0]["id"],
            },
        )
        self.assertEqual(proposed.status_code, 200, proposed.text)
        self.assertTrue(
            InputReviewWorker(
                self.worker_settings, SETTINGS, MappingProvider()
            ).run_once()
        )
        proposal = self.review(session)["proposals"][0]
        self.assertEqual(proposal["status"], "proposed", proposal)
        accepted = self.change(
            session,
            "/proposals/" + proposal["id"] + "/decision",
            {"accept": True, "reason": "نگاشت بررسی و پذیرفته شد."},
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertTrue(InterpretationWorker(self.worker_settings).run_once())
        after = self.review(session)
        self.assertNotEqual(after["snapshot_hash"], review["snapshot_hash"])
        rows = [
            {v["field"]: v["value"] for v in r["values"]}
            for r in after["overview"]["samples"]
        ]
        self.assertEqual(rows[0]["description"], "banknote")
        self.assertEqual(rows[0]["debit"], "100")
        self.assertEqual(rows[0]["date"], "2026-09-01")
        self.assertEqual(rows[0]["original_unit"], "IRR")
        with psycopg.connect(self.dsn) as conn:
            digest = conn.execute(
                "SELECT sha256 FROM app.source_files WHERE company_id=%s AND id=%s",
                (self.company, review["overview"]["files"][0]["file_id"]),
            ).fetchone()[0]
        import hashlib

        self.assertEqual(digest, hashlib.sha256(data).hexdigest())

    def test_review_stale_fingerprint_blocks_direct_manifest_publication(self):
        session = self.prepared()
        state = self.review(session)
        confirmed = self.change(
            session, "/confirm", {"snapshot_hash": state["snapshot_hash"]}
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        with psycopg.connect(self.dsn) as conn:
            conn.execute("SET search_path=app,pg_catalog")
            conn.execute(
                "SELECT set_config('app.company_id',%s,true),set_config('app.user_id',%s,true)",
                (self.company, self.users["owner"]),
            )
            dataset = conn.execute(
                "INSERT INTO app.dataset_revisions(company_id,session_id,state) VALUES(%s,%s,'building') RETURNING id",
                (self.company, session["id"]),
            ).fetchone()[0]
            policy = conn.execute(
                "SELECT policy_id FROM app.processing_steps WHERE company_id=%s AND session_id=%s AND step_kind='financial:core'",
                (self.company, session["id"]),
            ).fetchone()[0]
            conn.execute(
                "UPDATE app.processing_sessions SET interpretation_context=interpretation_context || '{\"review_test_change\":true}'::jsonb WHERE company_id=%s AND id=%s",
                (self.company, session["id"]),
            )
            with self.assertRaises(psycopg.errors.CheckViolation) as error:
                conn.execute(
                    "INSERT INTO app.result_manifests(company_id,dataset_revision_id,period_id,as_of_date,manifest_hash,financial_policy_id,status) VALUES(%s,%s,%s,'2026-09-30',%s,%s,'building')",
                    (
                        self.company,
                        dataset,
                        self.detail(session)["period_id"],
                        "a" * 64,
                        policy,
                    ),
                )
            self.assertIn("input_review_required", str(error.exception))

    def test_review_ambiguous_comment_opens_persistent_session_barrier(self):
        class AmbiguousProvider(CorrectionProvider):
            def complete(self, context, request_id):
                return ProviderResult(
                    {
                        "action": "ask_clarification",
                        "reason": "کدام حساب باید اصلاح شود؟",
                    },
                    10,
                    20,
                    "synthetic-ambiguous",
                )

        current = self.admin.get("/api/v1/admin/budget-policy")
        result = self.mutate(
            self.admin,
            "POST" if current.status_code == 404 else "PATCH",
            "/api/v1/admin/budget-policy",
            {"ceiling_usd": "100"},
            version=current.json().get("version")
            if current.status_code == 200
            else None,
        )
        self.assertIn(result.status_code, (200, 201), result.text)
        session = self.prepared()
        review = self.review(session)
        created = self.change(
            session,
            "/comments",
            {
                "snapshot_hash": review["snapshot_hash"],
                "body": "این طبقه‌بندی اشتباه است.",
                "file_id": None,
                "sheet_name": None,
                "account_code": None,
            },
        )
        proposed = self.change(
            session,
            "/proposals",
            {
                "snapshot_hash": review["snapshot_hash"],
                "comment_id": created.json()["comments"][0]["id"],
            },
        )
        self.assertEqual(proposed.status_code, 200, proposed.text)
        self.assertTrue(
            InputReviewWorker(
                self.worker_settings, SETTINGS, AmbiguousProvider()
            ).run_once()
        )
        self.assertEqual(self.detail(session)["status"], "waiting_input")
        issue = self.issue(session)
        self.assertEqual(issue["code"], "input_review_clarification")
        self.assertEqual(
            self.change(
                session, "/confirm", {"snapshot_hash": review["snapshot_hash"]}
            ).status_code,
            409,
        )
        answer = self.answer(session, "keep_current")
        self.assertEqual(answer.status_code, 201, answer.text)
        self.assertEqual(self.detail(session)["status"], "waiting_dependency")
        self.assertTrue(self.review(session)["can_confirm"])

    def review_url(self, session):
        return self.base + "/processing-sessions/" + session["id"] + "/input-review"

    def review(self, session):
        result = self.owner.get(self.review_url(session))
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def change(self, session, suffix, body, client=None, version=None):
        return self.mutate(
            client or self.owner,
            "POST",
            self.review_url(session) + suffix,
            body,
            version=version or self.detail(session)["session_version"],
        )

    def test_review_server_gate_and_confirmation(self):
        session = self.prepared()
        state = self.review(session)
        self.assertTrue(state["required"])
        self.assertFalse(state["confirmed"])
        self.assertEqual(len(state["overview"]["files"]), 1)
        bypass = self.mutate(
            self.owner,
            "POST",
            self.base + "/processing-sessions/" + session["id"] + "/calculate",
            None,
            version=state["session_version"],
        )
        self.assertEqual(bypass.status_code, 409, bypass.text)
        self.assertEqual(bypass.json()["code"], "input_review_required")
        with psycopg.connect(self.dsn) as conn:
            conn.execute(
                "SELECT set_config('app.company_id',%s,true),set_config('app.user_id',%s,true)",
                (self.company, self.users["owner"]),
            )
            with self.assertRaises(psycopg.errors.CheckViolation):
                conn.execute(
                    "INSERT INTO app.dataset_revisions(company_id,session_id,state) VALUES(%s,%s,'building')",
                    (self.company, session["id"]),
                )
        viewer = self.client("viewer")
        self.assertEqual(viewer.get(self.review_url(session)).status_code, 403)
        self.assertEqual(
            self.client("outsider").get(self.review_url(session)).status_code, 404
        )
        bad = self.change(session, "/confirm", {"snapshot_hash": "0" * 64})
        self.assertEqual(bad.status_code, 409)
        confirmed = self.change(
            session, "/confirm", {"snapshot_hash": state["snapshot_hash"]}
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertTrue(confirmed.json()["confirmed"])
        final = self.finish_financial(session)
        self.assertIsNotNone(final["manifest_id"])

    def test_review_comments_persist_and_block_confirmation(self):
        session = self.prepared()
        state = self.review(session)
        comment = self.change(
            session,
            "/comments",
            {
                "snapshot_hash": state["snapshot_hash"],
                "body": "لطفاً نوع حساب بررسی شود.",
                "file_id": None,
                "sheet_name": None,
                "account_code": None,
            },
        )
        self.assertEqual(comment.status_code, 200, comment.text)
        self.assertEqual(len(self.review(session)["comments"]), 1)
        blocked = self.change(
            session, "/confirm", {"snapshot_hash": state["snapshot_hash"]}
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["code"], "input_review_unresolved")
        id = comment.json()["comments"][0]["id"]
        resolved = self.change(
            session,
            "/comments/" + id + "/resolve",
            {"reason": "پس از بررسی اصلاح لازم نیست."},
        )
        self.assertEqual(resolved.status_code, 200, resolved.text)
        self.assertTrue(resolved.json()["can_confirm"])
        old = self.change(
            session,
            "/confirm",
            {"snapshot_hash": state["snapshot_hash"]},
            version=state["session_version"],
        )
        self.assertEqual(old.status_code, 409)

    def test_review_actual_worker_proposal_accept_reinterpret_reconfirm(self):
        budget = self.admin.get("/api/v1/admin/budget-policy")
        result = self.mutate(
            self.admin,
            "POST" if budget.status_code == 404 else "PATCH",
            "/api/v1/admin/budget-policy",
            {"ceiling_usd": "100"},
            version=budget.json().get("version") if budget.status_code == 200 else None,
        )
        self.assertIn(result.status_code, (200, 201), result.text)
        session = self.prepared()
        before = self.review(session)
        account = next(
            a for a in before["overview"]["accounts"] if a["account_code"] == "701"
        )
        created = self.change(
            session,
            "/comments",
            {
                "snapshot_hash": before["snapshot_hash"],
                "body": "این حساب سایر درآمد است.",
                **{k: account[k] for k in ("file_id", "sheet_name", "account_code")},
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        proposal = self.change(
            session,
            "/proposals",
            {
                "snapshot_hash": before["snapshot_hash"],
                "comment_id": created.json()["comments"][0]["id"],
            },
        )
        self.assertEqual(proposal.status_code, 200, proposal.text)
        worker = InputReviewWorker(self.worker_settings, SETTINGS, CorrectionProvider())
        self.assertTrue(worker.run_once())
        proposed = self.review(session)["proposals"][0]
        self.assertEqual(proposed["status"], "proposed", proposed)
        self.assertFalse(self.detail(session)["manifest_id"])
        accepted = self.change(
            session,
            "/proposals/" + proposed["id"] + "/decision",
            {"accept": True, "reason": "اصلاح بررسی و تأیید شد."},
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertFalse(accepted.json()["ready"])
        self.assertTrue(InterpretationWorker(self.worker_settings).run_once())
        after = self.review(session)
        self.assertNotEqual(before["snapshot_hash"], after["snapshot_hash"])
        self.assertFalse(after["confirmed"])
        self.assertEqual(
            next(
                a for a in after["overview"]["accounts"] if a["account_code"] == "701"
            )["role"],
            "other_income",
        )
        self.assertEqual(
            self.change(
                session, "/confirm", {"snapshot_hash": before["snapshot_hash"]}
            ).status_code,
            409,
        )
        confirmed = self.change(
            session, "/confirm", {"snapshot_hash": after["snapshot_hash"]}
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertTrue(confirmed.json()["confirmed"])


if __name__ == "__main__":
    suite = unittest.TestSuite(
        InputReviewTests(n)
        for n in unittest.defaultTestLoader.getTestCaseNames(InputReviewTests)
        if n.startswith("test_review_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
