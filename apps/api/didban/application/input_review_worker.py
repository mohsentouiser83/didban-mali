"""Durable budget-backed correction proposals; model output never mutates sources."""

from __future__ import annotations
from uuid import uuid4
import psycopg
from psycopg.types.json import Jsonb
from ..adapters.model_provider import ModelSettings, ProviderFailure
from ..adapters.input_review_provider import InputReviewResponsesProvider
from ..domain.input_review import validate_correction
from ..infrastructure.input_review import fingerprint
from ..infrastructure.model import ModelRepository
from .preparation_worker import PreparationWorker


class InputReviewWorker(PreparationWorker):
    def __init__(self, settings, model_settings=None, provider=None):
        super().__init__(settings)
        self.model_settings = model_settings or ModelSettings.from_env()
        self.provider = provider or InputReviewResponsesProvider(self.model_settings)

    def context(self, conn, job):
        conn.execute(
            "SELECT set_config('search_path','app,pg_catalog',true),set_config('app.user_id',%s,true),set_config('app.company_id',%s,true)",
            (job["actor_id"], job["company_id"]),
        )

    def finish(self, conn, job, status, content=None):
        completed = conn.execute(
            "SELECT app.complete_input_review_job(%s,%s,%s,%s) AS outcome",
            (job["id"], job["claim"], status, Jsonb(content) if content else None),
        ).fetchone()["outcome"]
        if completed is None:
            return
        if completed == "ambiguous":
            session = conn.execute(
                "SELECT session_version FROM app.processing_sessions WHERE company_id=%s AND id=%s FOR UPDATE",
                (job["company_id"], job["session_id"]),
            ).fetchone()
            constraints = {
                "setting_key": "input_review",
                "proposal_id": job["proposal_id"],
                "choices": ["revise_comment", "keep_current"],
                "allow_unknown": False,
            }
            conn.execute(
                "INSERT INTO app.processing_issues(company_id,session_id,code,root_key,question_fa,answer_kind,answer_constraints,opened_session_version) VALUES(%s,%s,'input_review_clarification',%s,%s,'choice',%s,%s)",
                (
                    job["company_id"],
                    job["session_id"],
                    "input-review:" + job["proposal_id"],
                    (content or {}).get("reason", "نظر شما به توضیح بیشتر نیاز دارد.")
                    + " نظر را تکمیل می‌کنید یا برداشت فعلی حفظ شود؟",
                    Jsonb(constraints),
                    session["session_version"],
                ),
            )

    def lock_context(self, conn, job):
        if not conn.execute(
            "SELECT app.lock_input_review_actor(%s) AS allowed", (job["company_id"],)
        ).fetchone()["allowed"]:
            return None
        return conn.execute(
            "SELECT * FROM app.processing_sessions WHERE company_id=%s AND id=%s FOR UPDATE",
            (job["company_id"], job["session_id"]),
        ).fetchone()

    def run_once(self):
        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_input_review_job(%s) AS job", (uuid4(),)
            ).fetchone()["job"]
            if not job:
                return False
            request = None
            with conn.transaction():
                self.context(conn, job)
                self.lock_context(conn, job)
                if not conn.execute(
                    "SELECT app.can_operate(%s) AS allowed", (job["company_id"],)
                ).fetchone()["allowed"]:
                    self.finish(
                        conn,
                        job,
                        "unavailable",
                        {"reason": "دسترسی ثبت‌کننده تغییر کرده است."},
                    )
                    return True
                proposal = conn.execute(
                    "SELECT * FROM app.input_review_proposals WHERE company_id=%s AND id=%s FOR UPDATE",
                    (job["company_id"], job["proposal_id"]),
                ).fetchone()
                if proposal["snapshot_hash"] != fingerprint(conn, job["session_id"]):
                    self.finish(conn, job, "stale")
                    return True
                if proposal["model_request_id"]:
                    old = conn.execute(
                        "SELECT * FROM app.model_requests WHERE company_id=%s AND id=%s",
                        (job["company_id"], proposal["model_request_id"]),
                    ).fetchone()
                    if old["billing_status"] in ("held", "usage_unknown"):
                        ModelRepository(conn).finish_receipt(old, old["dispatch_token"])
                    self.finish(
                        conn,
                        job,
                        "usage_unknown"
                        if old["billing_status"] in ("held", "usage_unknown")
                        else "unavailable",
                    )
                    return True
                if not self.model_settings.configured:
                    self.finish(
                        conn,
                        job,
                        "unavailable",
                        {"reason": "سرویس پیشنهاد اصلاح در دسترس نیست."},
                    )
                    return True
                if not proposal["context"].get("accounts") and not proposal[
                    "context"
                ].get("sheets"):
                    self.finish(
                        conn,
                        job,
                        "ambiguous",
                        {
                            "reason": "مورد مرتبط را مشخص کنید؛ اصلاح مبلغ اصلی نیازمند فایل اصلاحی است."
                        },
                    )
                    return True
                settings = self.model_settings
                try:
                    with conn.transaction():
                        reserve = self.provider.reservation(proposal["context"])
                        conn.execute("SELECT app.ensure_model_budget_period()")
                        tariff = conn.execute(
                            "SELECT app.register_model_tariff(%s,%s,%s,%s) AS id",
                            (
                                settings.provider,
                                settings.model_id,
                                settings.input_rate,
                                settings.output_rate,
                            ),
                        ).fetchone()["id"]
                        token = uuid4()
                        request = conn.execute(
                            "INSERT INTO app.model_requests(company_id,purpose,tariff_id,status,dispatch_token) VALUES(%s,'suggest_account_role',%s,'reserved',%s) RETURNING *",
                            (job["company_id"], tariff, token),
                        ).fetchone()
                        conn.execute(
                            "SELECT app.reserve_model_budget(%s,%s)",
                            (request["id"], reserve),
                        )
                        conn.execute(
                            "UPDATE app.model_requests SET status='running' WHERE company_id=%s AND id=%s",
                            (job["company_id"], request["id"]),
                        )
                        conn.execute(
                            "UPDATE app.input_review_proposals SET model_request_id=%s WHERE company_id=%s AND id=%s",
                            (request["id"], job["company_id"], proposal["id"]),
                        )
                except (psycopg.errors.CheckViolation, ProviderFailure):
                    self.finish(
                        conn,
                        job,
                        "unavailable",
                        {
                            "reason": "بودجه یا تنظیمات سرویس پیشنهاد نیاز به بررسی دارد."
                        },
                    )
                    return True
            result = None
            actual = None
            safe_retry = False
            try:
                result = self.provider.complete(proposal["context"], str(request["id"]))
                actual = settings.cost(result.input_tokens, result.output_tokens)
            except ProviderFailure as failure:
                actual = None if failure.sent else 0
                safe_retry = not failure.sent
            with conn.transaction():
                self.context(conn, job)
                ModelRepository(conn).finish_receipt(
                    request, token, result, actual, safe_retry=safe_retry
                )
            with conn.transaction():
                self.context(conn, job)
                session = self.lock_context(conn, job)
                if not conn.execute(
                    "SELECT app.can_operate(%s) AS allowed", (job["company_id"],)
                ).fetchone()["allowed"]:
                    self.finish(
                        conn,
                        job,
                        "unavailable",
                        {"reason": "دسترسی ثبت‌کننده تغییر کرده است."},
                    )
                    return True
                if (
                    proposal["snapshot_hash"] != fingerprint(conn, job["session_id"])
                    or session["manifest_id"]
                    or session["status"]
                    in ("cancelled", "failed", "completed", "completed_limited")
                ):
                    self.finish(conn, job, "stale")
                    return True
                allowed = conn.execute(
                    "SELECT app.can_operate(%s) AS allowed", (job["company_id"],)
                ).fetchone()["allowed"]
                if not allowed:
                    self.finish(
                        conn,
                        job,
                        "unavailable",
                        {"reason": "دسترسی ثبت‌کننده تغییر کرده است."},
                    )
                    return True
                if session["status"] == "waiting_input":
                    self.finish(
                        conn,
                        job,
                        "unavailable",
                        {"reason": "ابتدا سؤال ضروری بسته را پاسخ دهید."},
                    )
                    return True
                if not result:
                    self.finish(
                        conn,
                        job,
                        "unavailable" if actual == 0 else "usage_unknown",
                        {"reason": "پیشنهاد دریافت نشد؛ نظر شما حفظ شده است."},
                    )
                else:
                    accepted = validate_correction(
                        result.selection, proposal["context"]
                    )
                    self.finish(
                        conn,
                        job,
                        "proposed" if accepted else "ambiguous",
                        accepted
                        or {
                            "reason": str(
                                (result.selection or {}).get(
                                    "reason",
                                    "مورد و اصلاح موردنظر را دقیق‌تر مشخص کنید.",
                                )
                            )[:1000]
                        },
                    )
            return True
