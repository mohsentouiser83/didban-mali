"""Durable assistant dispatch. Unknown usage is held and never automatically retried."""

import logging
from uuid import uuid4
import psycopg
from ..adapters.model_provider import (
    ModelSettings,
    OpenAIResponsesProvider,
    ProviderFailure,
)
from ..infrastructure.model import ModelRepository
from .model_answers import render_answer
from .preparation_worker import PreparationWorker

LOGGER = logging.getLogger("didban.model")


class ModelWorker(PreparationWorker):
    def __init__(self, settings, model_settings=None, provider=None):
        super().__init__(settings)
        self.model_settings = model_settings or ModelSettings.from_env()
        self.provider = provider or OpenAIResponsesProvider(self.model_settings)

    def context(self, conn, job):
        conn.execute(
            "SELECT set_config('search_path','app,pg_catalog',true),set_config('app.user_id',%s,true),set_config('app.company_id',%s,true)",
            (job["actor_id"], job["company_id"]),
        )

    def run_once(self):
        with self.connection() as conn:
            job = conn.execute(
                "SELECT app.claim_assistant_job(%s) AS job", (uuid4(),)
            ).fetchone()["job"]
            if not job:
                return False
            repo = ModelRepository(conn)
            request = None
            try:
                with conn.transaction():
                    self.context(conn, job)
                    question = repo.question(
                        job["company_id"], job["question_id"], True
                    )
                    if not question:
                        repo.finish_job(
                            job, dependency="permission_revoked", terminal=True
                        )
                        return True
                    old = repo.active_request(question)
                    if old and not old["safe_to_retry"]:
                        if old["billing_status"] in ("held", "usage_unknown"):
                            repo.finish_receipt(old, old["dispatch_token"])
                        repo.finish_job(
                            job,
                            dependency="usage_unknown"
                            if old["billing_status"] in ("held", "usage_unknown")
                            else "model_result_unavailable",
                            terminal=True,
                        )
                        return True
                    context = repo.snapshot(
                        job["company_id"], question["manifest_id"], question["question"]
                    )
                    if not context:
                        repo.finish_job(
                            job, dependency="snapshot_unavailable", terminal=True
                        )
                        return True
                    if not self.model_settings.configured:
                        repo.finish_job(job, dependency="model_unavailable")
                        return True
                    reservation = self.provider.reservation(context)
                    try:
                        with conn.transaction():
                            request = repo.reserve(
                                question, self.model_settings, reservation, job["claim"]
                            )
                    except psycopg.errors.CheckViolation as error:
                        code = (
                            "budget_not_configured"
                            if "installation_budget_not_configured"
                            in error.diag.message_primary
                            else "budget_exhausted"
                        )
                        repo.finish_job(job, dependency=code)
                        return True
                try:
                    result = self.provider.complete(context, str(request["id"]))
                except ProviderFailure as error:
                    with conn.transaction():
                        self.context(conn, job)
                        repo.finish_receipt(
                            request,
                            job["claim"],
                            actual=None if error.sent else 0,
                            safe_retry=not error.sent,
                        )
                    with conn.transaction():
                        self.context(conn, job)
                        repo.finish_job(
                            job,
                            dependency="usage_unknown" if error.sent else error.code,
                            terminal=error.sent or error.code == "model_input_limit",
                        )
                    return True
                actual = self.model_settings.cost(
                    result.input_tokens, result.output_tokens
                )
                # Billing cleanup remains permitted after membership loss; answer publication does not.
                with conn.transaction():
                    self.context(conn, job)
                    repo.finish_receipt(request, job["claim"], result, actual)
                with conn.transaction():
                    self.context(conn, job)
                    if result.selection is None:
                        repo.finish_job(
                            job, dependency="model_output_invalid", terminal=True
                        )
                    else:
                        answer, refs, path = render_answer(
                            result.selection,
                            context,
                            job["company_id"],
                            question["manifest_id"],
                        )
                        repo.finish_job(job, answer, refs, path)
            except ProviderFailure as error:
                with conn.transaction():
                    self.context(conn, job)
                    repo.finish_job(
                        job,
                        dependency=error.code,
                        terminal=error.code == "model_input_limit",
                    )
            except Exception as error:
                # Never log provider content, credentials, DSNs or exception messages.
                LOGGER.error(
                    "model_job_failure question_id=%s type=%s",
                    job["question_id"],
                    type(error).__name__,
                )
                # A committed running request is never dispatched again after a process crash.
                # Its next lease owner conservatively records unknown usage.
            return True
