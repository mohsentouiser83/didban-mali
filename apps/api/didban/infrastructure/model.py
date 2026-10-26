"""Database access for pinned assistant inputs and budget-backed dispatch receipts."""

from ..adapters.model_provider import METRIC_KEYS


class ModelRepository:
    def __init__(self, conn):
        self.conn = conn

    def question(self, company, question, lock=False):
        return self.conn.execute(
            "SELECT * FROM app.assistant_questions WHERE company_id=%s AND id=%s"
            + (" FOR UPDATE" if lock else ""),
            (company, question),
        ).fetchone()

    def snapshot(self, company, manifest, question):
        if not self.conn.execute(
            "SELECT 1 FROM app.result_manifests WHERE company_id=%s AND id=%s AND status='published'",
            (company, manifest),
        ).fetchone():
            return None
        rows = self.conn.execute(
            "SELECT id,metric_key,value,status,reason_codes,comparison FROM app.metric_observations WHERE company_id=%s AND manifest_id=%s ORDER BY metric_key",
            (company, manifest),
        ).fetchall()
        metrics = {}
        for row in rows:
            if row["metric_key"] not in METRIC_KEYS:
                continue
            refs = [
                str(r["evidence_id"])
                for r in self.conn.execute(
                    "SELECT evidence_id FROM app.metric_evidence WHERE company_id=%s AND metric_id=%s ORDER BY created_at,id LIMIT 8",
                    (company, row["id"]),
                )
            ]
            metrics[row["metric_key"]] = {
                "value_irr": str(row["value"]) if row["value"] is not None else None,
                "status": row["status"],
                "reason_codes": row["reason_codes"],
                "comparison": row["comparison"],
                "evidence_refs": refs,
            }
        return {
            "question": question,
            "metrics": metrics,
            "report_scope": "core_financial_v1_only",
        }

    def active_request(self, question):
        if not question["active_model_request_id"]:
            return None
        return self.conn.execute(
            "SELECT * FROM app.model_requests WHERE company_id=%s AND id=%s",
            (question["company_id"], question["active_model_request_id"]),
        ).fetchone()

    def reserve(self, question, settings, reservation, claim):
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
        request = self.conn.execute(
            "INSERT INTO app.model_requests(company_id,manifest_id,assistant_question_id,purpose,tariff_id,status,dispatch_token) VALUES(%s,%s,%s,'answer_question',%s,'reserved',%s) RETURNING *",
            (
                question["company_id"],
                question["manifest_id"],
                question["id"],
                tariff,
                claim,
            ),
        ).fetchone()
        self.conn.execute(
            "SELECT app.reserve_model_budget(%s,%s)", (request["id"], reservation)
        )
        self.conn.execute(
            "UPDATE app.model_requests SET status='running' WHERE company_id=%s AND id=%s",
            (question["company_id"], request["id"]),
        )
        self.conn.execute(
            "UPDATE app.assistant_questions SET active_model_request_id=%s WHERE company_id=%s AND id=%s",
            (request["id"], question["company_id"], question["id"]),
        )
        return request

    def finish_receipt(
        self, request, claim, result=None, actual=None, safe_retry=False
    ):
        self.conn.execute(
            "SELECT app.finish_model_receipt(%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                request["id"],
                claim,
                result.input_tokens if result else None,
                result.output_tokens if result else None,
                actual,
                result.response_id if result else None,
                bool(result and result.selection),
                safe_retry,
            ),
        )

    def finish_job(
        self, job, answer=None, refs=(), path=None, dependency=None, terminal=False
    ):
        self.conn.execute(
            "SELECT app.complete_assistant_job(%s,%s,%s,%s::uuid[],%s,%s,%s)",
            (job["id"], job["claim"], answer, list(refs), path, dependency, terminal),
        )
