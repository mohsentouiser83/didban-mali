"""Authorized questions about a pinned published snapshot; no financial mutations."""

from ..errors import ApiError, conflict, forbidden, missing
from .auth import response


def answer_view(row):
    return {
        "id": row["id"],
        "manifest_id": row["manifest_id"],
        "question": row["question"],
        "created_at": row["created_at"],
        "status": row["status"],
        "answer_fa": row["answer_fa"],
        "evidence_refs": row["evidence_ids"],
        "dependency_code": row["dependency_code"],
        "related_path": row["related_path"],
        "version": row["row_version"],
    }


class AssistantService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            self.intake.authorize(conn, actor, company)
            if op == "listAssistantQuestions":
                resource = "assistant_questions"
                position = self.intake.security.read_cursor(
                    cursor, resource, str(actor["id"]), company
                )
                rows = conn.execute(
                    "SELECT * FROM app.assistant_questions WHERE company_id=%s AND actor_id=%s AND (%s::timestamptz IS NULL OR (created_at,id)>(%s::timestamptz,%s::uuid)) ORDER BY created_at,id LIMIT %s",
                    (
                        company,
                        actor["id"],
                        position[0] if position else None,
                        position[0] if position else None,
                        position[1] if position else None,
                        limit + 1,
                    ),
                ).fetchall()
                return response(
                    {
                        "items": [answer_view(r) for r in rows[:limit]],
                        "next_cursor": self.intake.security.cursor(
                            resource, str(actor["id"]), company, rows[limit - 1]
                        )
                        if len(rows) > limit
                        else None,
                    }
                )
            question = None
            if op in ("getAssistantAnswer", "retryAssistantQuestion"):
                question = conn.execute(
                    "SELECT * FROM app.assistant_questions WHERE company_id=%s AND id=%s"
                    + (" FOR UPDATE" if op == "retryAssistantQuestion" else ""),
                    (company, ids["question_id"]),
                ).fetchone()
                if not question:
                    raise missing()
                if op == "getAssistantAnswer":
                    return response(answer_view(question), etag=question["row_version"])

            def action():
                if op == "askReadOnlyAssistant":
                    text = body["question"].strip()
                    if not text:
                        raise ApiError(422, "question_required", "پرسش را بنویسید.")
                    if not conn.execute(
                        "SELECT 1 FROM app.result_manifests WHERE company_id=%s AND id=%s AND status='published'",
                        (company, body["manifest_id"]),
                    ).fetchone():
                        raise missing()
                    row = conn.execute(
                        "INSERT INTO app.assistant_questions(company_id,actor_id,manifest_id,question,status) VALUES(%s,%s,%s,%s,'pending') RETURNING *",
                        (company, actor["id"], body["manifest_id"], text),
                    ).fetchone()
                else:
                    if str(question["actor_id"]) != str(actor["id"]):
                        raise forbidden()
                    if question["row_version"] != expected:
                        raise conflict("version_conflict")
                    if question["status"] != "waiting_dependency" or question[
                        "dependency_code"
                    ] not in (
                        "model_unavailable",
                        "budget_exhausted",
                        "budget_not_configured",
                    ):
                        raise conflict("assistant_not_retryable")
                    row = conn.execute(
                        "UPDATE app.assistant_questions SET status='pending',dependency_code=NULL,row_version=row_version+1 WHERE company_id=%s AND id=%s RETURNING *",
                        (company, question["id"]),
                    ).fetchone()
                conn.execute("SELECT app.enqueue_assistant_question(%s)", (row["id"],))
                return response(answer_view(row), 202, etag=row["row_version"])

            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + str(ids.get("question_id", "new")),
                key=key,
                payload={"body": body, "version": expected},
                action=action,
            )
