from __future__ import annotations
from psycopg import Connection
from psycopg.types.json import Jsonb


class IntakeRepository:
    def __init__(self, conn: Connection):
        self.conn = conn

    def session(self, company: str, id: str, lock: bool = False) -> dict | None:
        return self.conn.execute(
            "SELECT * FROM app.processing_sessions WHERE company_id=%s AND id=%s"
            + (" FOR UPDATE" if lock else ""),
            (company, id),
        ).fetchone()

    def files(self, company: str, session: str) -> list[dict]:
        return self.conn.execute(
            """SELECT f.*,sf.status AS intake_status,sf.preparation_summary,sf.preparation_settings,sf.interpretation_settings,sf.interpretation_preview,sf.interpretation_summary,sf.interpretation_run_id,sf.error_code,sf.id AS link_id,sf.created_at AS linked_at
         FROM app.session_files sf JOIN app.source_files f ON f.id=sf.source_file_id AND f.company_id=sf.company_id
         WHERE sf.company_id=%s AND sf.session_id=%s ORDER BY sf.created_at,sf.id""",
            (company, session),
        ).fetchall()

    def steps(self, company: str, session: str) -> list[dict]:
        return self.conn.execute(
            "SELECT * FROM app.processing_steps WHERE company_id=%s AND session_id=%s ORDER BY created_at,id",
            (company, session),
        ).fetchall()

    def issues(self, company: str, session: str) -> list[dict]:
        return self.conn.execute(
            "SELECT * FROM app.processing_issues WHERE company_id=%s AND session_id=%s ORDER BY created_at,id",
            (company, session),
        ).fetchall()

    def enqueue(self, company: str, session: str, step: str, file: str) -> None:
        self.conn.execute(
            """INSERT INTO app.outbox_events(company_id,session_id,event_kind,dedupe_key,payload)
         VALUES(%s,%s,'intake.prepare',%s,%s) ON CONFLICT(company_id,dedupe_key) DO UPDATE SET published_at=NULL,lease_token=NULL,lease_expires_at=NULL,available_at=clock_timestamp()""",
            (
                company,
                session,
                "prepare:" + step,
                Jsonb({"file_id": file, "step_id": step}),
            ),
        )

    def notify(
        self,
        company: str,
        user: str,
        session: str,
        title: str,
        issue: str | None = None,
    ) -> None:
        self.conn.execute(
            "INSERT INTO app.notifications(company_id,user_id,session_id,issue_id,title_fa) VALUES(%s,%s,%s,%s,%s)",
            (company, user, session, issue, title),
        )


def period_view(row: dict) -> dict:
    return {
        k: row[k] for k in ("id", "name", "starts_on", "ends_on", "previous_period_id")
    } | {"version": row["row_version"]}


def file_view(row: dict, duplicate: bool = False) -> dict:
    from .interpretation import summary_view

    return {
        k: row[k] for k in ("id", "original_name", "sha256", "byte_size", "format")
    } | {
        "status": row["intake_status"],
        "duplicate": duplicate,
        "archived": row["archived_at"] is not None,
        "version": row["row_version"],
        "preparation_summary": row.get("preparation_summary"),
        "error_code": row.get("error_code"),
        "interpretation_summary": summary_view(row.get("interpretation_summary")),
    }


def session_view(repo: IntakeRepository, row: dict) -> dict:
    steps = repo.steps(row["company_id"], row["id"])
    issues = repo.issues(row["company_id"], row["id"])
    return {
        k: row[k]
        for k in (
            "id",
            "company_id",
            "status",
            "session_version",
            "period_id",
            "as_of_date",
            "created_at",
        )
    } | {
        "steps": [
            {
                k: step[k]
                for k in (
                    "id",
                    "status",
                    "completed_items",
                    "total_items",
                    "dependency_code",
                )
            }
            | {"kind": step["step_kind"]}
            for step in steps
        ],
        "open_required_issue_ids": [
            i["id"]
            for i in issues
            if i["required"] and not i["resolved_at"] and not i["superseded_at"]
        ],
        "input_review_required": row["input_review_required"],
        "input_review_confirmed": bool(
            repo.conn.execute(
                "SELECT app.input_review_ready(%s) AS ready", (row["id"],)
            ).fetchone()["ready"]
        ),
        "manifest_id": row["manifest_id"],
        "financial_finished_at": row["financial_finished_at"],
        "analysis_finished_at": row["analysis_finished_at"],
        "report_id": row["analysis_context"].get("report_id"),
        "purpose": row["analysis_context"].get("purpose", "upload"),
        "source_session_id": row["analysis_context"].get("source_session_id"),
        "preparation_finished_at": row["preparation_finished_at"],
        "interpretation_finished_at": row["interpretation_finished_at"],
        "interpretation_context": {
            "coverage": row["interpretation_context"].get("coverage")
        },
    }
