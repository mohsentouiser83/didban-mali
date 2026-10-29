"""Versioned decisions only; no monetary source editing through these commands."""

from __future__ import annotations
from uuid import UUID
from psycopg.types.json import Jsonb
from ..errors import ApiError, conflict, missing
from ..infrastructure.interpretation import enqueue
from .auth import response


def resume(conn, repo, company, session, file):
    step = conn.execute(
        "UPDATE app.processing_steps SET status='pending',fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND session_id=%s AND step_kind=%s RETURNING id",
        (company, session, "interpret:" + str(file)),
    ).fetchone()
    if not step:
        raise conflict("interpretation_not_started")
    enqueue(conn, company, session, file, step["id"])
    remaining = any(
        i["required"] and not i["resolved_at"] and not i["superseded_at"]
        for i in repo.issues(company, session)
    )
    return conn.execute(
        "UPDATE app.processing_sessions SET status=%s,interpretation_finished_at=NULL,session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING *",
        ("waiting_input" if remaining else "sealed", company, session),
    ).fetchone()


def answer(conn, repo, actor, company, session, issue, body, key, request_id, access):
    constraints = issue["answer_constraints"]
    value = body["answer"].get("value")
    if body["answer"]["kind"] != "choice" or issue["code"] == "interpretation_mapping":
        raise ApiError(
            422, "answer_not_allowed", "نگاشت را از تنظیمات تشخیص اصلاح کنید."
        )
    field = constraints["setting_key"]
    file = constraints["file_id"]
    if field == "period_id":
        try:
            UUID(value)
        except (ValueError, TypeError):
            raise ApiError(
                422, "answer_not_allowed", "دوره معتبر انتخاب کنید."
            ) from None
        if not conn.execute(
            "SELECT 1 FROM app.financial_periods WHERE company_id=%s AND id=%s",
            (company, value),
        ).fetchone():
            raise missing()
        conn.execute(
            "UPDATE app.processing_sessions SET period_id=%s WHERE company_id=%s AND id=%s",
            (value, company, session["id"]),
        )
    else:
        if value not in constraints.get("choices", []):
            raise ApiError(
                422, "answer_not_allowed", "یکی از گزینه‌های مجاز را انتخاب کنید."
            )
        if field == "coverage":
            conn.execute(
                "UPDATE app.processing_sessions SET interpretation_context=%s WHERE company_id=%s AND id=%s",
                (
                    Jsonb(
                        {
                            "coverage": value,
                            "provenance": "user_declaration",
                            "actor_id": str(actor["id"]),
                        }
                    ),
                    company,
                    session["id"],
                ),
            )
        else:
            row = conn.execute(
                "SELECT interpretation_settings FROM app.session_files WHERE company_id=%s AND session_id=%s AND source_file_id=%s FOR UPDATE",
                (company, session["id"], file),
            ).fetchone()
            settings = row["interpretation_settings"]
            if field == "overlap":
                settings["overlap"] = value
            elif field == "account_role":
                settings.setdefault("sheets", {}).setdefault(
                    constraints["sheet_name"], {}
                ).setdefault("account_roles", {})[constraints["account_code"]] = value
            elif field in (
                "unit",
                "source_kind",
                "trial_balance_level",
                "trial_balance_flows",
            ):
                settings.setdefault("sheets", {}).setdefault(
                    constraints["sheet_name"], {}
                )[field] = value
                settings["sheets"][constraints["sheet_name"]].setdefault(
                    "human_decisions", {}
                )[field] = {"actor_id": str(actor["id"]), "value": value}
            else:
                raise ApiError(
                    422, "answer_not_allowed", "پاسخ با این سؤال سازگار نیست."
                )
            conn.execute(
                "UPDATE app.session_files SET interpretation_settings=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                (Jsonb(settings), company, session["id"], file),
            )
    receipt = conn.execute(
        "INSERT INTO app.issue_answers(company_id,issue_id,actor_id,expected_session_version,answer,idempotency_key) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
        (
            company,
            issue["id"],
            actor["id"],
            session["session_version"],
            Jsonb(body["answer"]),
            key,
        ),
    ).fetchone()
    conn.execute(
        "UPDATE app.processing_issues SET resolved_at=clock_timestamp() WHERE company_id=%s AND id=%s",
        (company, issue["id"]),
    )
    updated = resume(conn, repo, company, session["id"], file)
    access.audit(
        company,
        str(actor["id"]),
        "issue.answered",
        "processing_issue",
        str(issue["id"]),
        request_id,
    )
    return response(
        {
            "id": receipt["id"],
            "issue_id": issue["id"],
            "session_id": session["id"],
            "session_version": updated["session_version"],
            "status": updated["status"],
        },
        201,
        etag=updated["session_version"],
    )
