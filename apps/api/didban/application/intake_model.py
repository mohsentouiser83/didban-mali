"""Budget-backed model suggestions within the existing session checkpoint protocol."""

from dataclasses import replace
import os
import psycopg
from ..adapters.intake_model_provider import IntakeResponsesProvider
from ..adapters.model_provider import ModelSettings, ProviderFailure
from ..domain.interpretation import fingerprint
from ..domain.model_interpretation import POLICY, accept_proposal, model_context
from ..domain.intake import DependencyUnavailable
from ..infrastructure.model import ModelRepository
from ..infrastructure.intake_model import IntakeModelRepository

SUPPORTED_QUESTIONS = {
    "interpretation_kind",
    "interpretation_mapping",
    "interpretation_account_role",
}


class IntakeModel:
    def __init__(self, settings=None, provider=None, enabled=None):
        self.settings = replace(
            settings or ModelSettings.from_env(), max_output_tokens=2048
        )
        self.provider = provider or IntakeResponsesProvider(self.settings)
        self.enabled = (
            os.environ.get("DIDBAN_MODEL_INTAKE_ENABLED", "false") == "true"
            if enabled is None
            else enabled
        )

    def propose(self, conn, job, version, step, file, tables, analysis):
        # Each pass has its own budget reservation, evidence and replay receipt.
        for _ in range(3):
            before = fingerprint(file["interpretation_settings"])
            analysis = self.propose_once(
                conn, job, version, step, file, tables, analysis
            )
            if (
                not analysis.question
                or analysis.question.code != "interpretation_account_role"
                or before == fingerprint(file["interpretation_settings"])
            ):
                break
        return analysis

    def propose_once(self, conn, job, version, step, file, tables, analysis):
        if (
            not self.enabled
            or not analysis.question
            or analysis.question.code not in SUPPORTED_QUESTIONS
        ):
            return analysis
        if not self.settings.configured:
            raise DependencyUnavailable("model_unavailable")
        context = model_context(
            tables, file["interpretation_settings"], analysis.question
        )
        if context is None:
            return analysis
        digest = fingerprint(
            [
                file["sha256"],
                context,
                str(step["policy_id"]),
                POLICY,
                self.settings.provider,
                self.settings.model_id,
            ]
        )
        try:
            reservation = self.provider.reservation(context)
        except ProviderFailure:
            return analysis
        repo = IntakeModelRepository(conn)
        with conn.transaction():
            repo.checkpoint(job, version, step)
            old = repo.prior(job, digest)
            attempt_number = 1
            if old:
                if old["outcome"] == "accepted":
                    accepted = accept_proposal(
                        tables,
                        file["interpretation_settings"],
                        old["proposal"],
                        old["request_id"],
                    )
                    if accepted:
                        return self.apply(conn, job, file, accepted)
                elif old["outcome"] == "pending":
                    # A lost response may already be billed. Never repeat the external call.
                    ModelRepository(conn).finish_receipt(
                        {"id": old["request_id"]}, old["dispatch_token"]
                    )
                    repo.finish(
                        old["request_id"],
                        "unavailable"
                        if old["billing_status"] == "settled"
                        else "usage_unknown",
                    )
                if (
                    old["outcome"] == "unavailable"
                    and old["safe_to_retry"]
                    and old["attempt_number"] < 3
                ):
                    attempt_number = old["attempt_number"] + 1
                else:
                    return analysis
            try:
                with conn.transaction():
                    purpose = {
                        "interpretation_kind": "classify_document",
                        "interpretation_mapping": "propose_mapping",
                        "interpretation_account_role": "suggest_account_role",
                    }[analysis.question.code]
                    request, token = repo.reserve(
                        job,
                        step,
                        self.settings,
                        reservation,
                        purpose,
                        digest,
                        attempt_number,
                    )
            except psycopg.errors.CheckViolation as failure:
                code = (
                    "budget_not_configured"
                    if "installation_budget_not_configured"
                    in failure.diag.message_primary
                    else "budget_exhausted"
                )
                raise DependencyUnavailable(code) from None
        result, outcome = None, "unavailable"
        retry_safe = False
        try:
            result = self.provider.complete(context, str(request["id"]))
            actual = self.settings.cost(result.input_tokens, result.output_tokens)
        except ProviderFailure as failure:
            actual = None if failure.sent else 0
            outcome = "usage_unknown" if failure.sent else "unavailable"
            retry_safe = not failure.sent
        # Billing receipt must survive permission revocation or a new question barrier.
        with conn.transaction():
            ModelRepository(conn).finish_receipt(
                request, token, result, actual, safe_retry=retry_safe
            )
        with conn.transaction():
            repo.checkpoint(job, version, step)
            accepted = (
                accept_proposal(
                    tables,
                    file["interpretation_settings"],
                    result.selection,
                    request["id"],
                )
                if result and result.selection
                else None
            )
            if result:
                outcome = "accepted" if accepted else "rejected"
            repo.finish(request["id"], outcome, result.selection if result else None)
            answer = self.apply(conn, job, file, accepted) if accepted else analysis
        if retry_safe and attempt_number < 3:
            raise DependencyUnavailable("model_unavailable")
        return answer

    @staticmethod
    def apply(conn, job, file, accepted):
        settings, analysis = accepted
        IntakeModelRepository(conn).save_settings(job, settings)
        file["interpretation_settings"] = settings
        return analysis
