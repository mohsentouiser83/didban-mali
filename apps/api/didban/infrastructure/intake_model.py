"""Company-scoped persistence for source-model dispatch and final proposals."""

from uuid import uuid4
from psycopg.types.json import Jsonb


class IntakeModelRepository:
    def __init__(self, conn):
        self.conn = conn

    def checkpoint(self, job, version, step):
        self.conn.execute(
            "SELECT set_config('app.user_id',%s,true),set_config('app.company_id',%s,true),set_config('timezone','UTC',true),set_config('search_path','app,pg_catalog',true)",
            (job["actor_id"], job["company_id"]),
        )
        self.conn.execute(
            "SELECT app.assert_checkpoint(%s,%s,%s,%s)",
            (job["session_id"], version, job["step_id"], step["fence"]),
        )

    def prior(self, job, digest):
        return self.conn.execute(
            "SELECT p.*,r.status,r.billing_status,r.dispatch_token,r.safe_to_retry FROM app.intake_model_proposals p "
            "JOIN app.model_requests r ON r.company_id=p.company_id AND r.id=p.request_id "
            "WHERE p.company_id=%s AND p.step_id=%s AND p.context_fingerprint=%s ORDER BY p.attempt_number DESC LIMIT 1",
            (job["company_id"], job["step_id"], digest),
        ).fetchone()

    def reserve(
        self, job, step, settings, reservation, purpose, digest, attempt_number=1
    ):
        self.conn.execute("SELECT app.ensure_model_budget_period()")
        tariff = self.conn.execute(
            "SELECT app.register_model_tariff(%s,%s,%s,%s) AS id",
            (
                settings.provider,
                settings.model_id,
                settings.input_rate,
                settings.output_rate,
            ),
        ).fetchone()["id"]
        token = uuid4()
        request = self.conn.execute(
            "INSERT INTO app.model_requests(company_id,step_id,purpose,tariff_id,status,dispatch_token) VALUES(%s,%s,%s,%s,'reserved',%s) RETURNING *",
            (job["company_id"], job["step_id"], purpose, tariff, token),
        ).fetchone()
        self.conn.execute(
            "SELECT app.reserve_model_budget(%s,%s)", (request["id"], reservation)
        )
        self.conn.execute(
            "UPDATE app.model_requests SET status='running' WHERE id=%s",
            (request["id"],),
        )
        self.conn.execute(
            "INSERT INTO app.intake_model_proposals(company_id,request_id,step_id,source_file_id,policy_id,context_fingerprint,attempt_number) VALUES(%s,%s,%s,%s,%s,%s,%s)",
            (
                job["company_id"],
                request["id"],
                job["step_id"],
                job["file_id"],
                step["policy_id"],
                digest,
                attempt_number,
            ),
        )
        return request, token

    def finish(self, request_id, outcome, proposal=None):
        self.conn.execute(
            "UPDATE app.intake_model_proposals SET outcome=%s,proposal=%s WHERE request_id=%s AND outcome='pending'",
            (outcome, Jsonb(proposal) if proposal is not None else None, request_id),
        )

    def save_settings(self, job, settings):
        self.conn.execute(
            "UPDATE app.session_files SET interpretation_settings=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
            (Jsonb(settings), job["company_id"], job["session_id"], job["file_id"]),
        )
