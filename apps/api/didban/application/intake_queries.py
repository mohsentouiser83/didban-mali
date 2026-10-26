"""Scoped intake pagination and public read presenters; never exposes object keys."""

from ..security import Security
from .auth import response


class IntakeQueries:
    security: Security

    @staticmethod
    def _issue(row, version):
        return {
            k: row[k]
            for k in (
                "id",
                "code",
                "question_fa",
                "required",
                "answer_kind",
                "session_id",
            )
        } | {
            "constraints": row["answer_constraints"],
            "evidence": [],
            "status": "resolved"
            if row["resolved_at"]
            else "superseded"
            if row["superseded_at"]
            else "open",
            "session_version": version,
        }

    @staticmethod
    def _notification(row):
        return {
            k: row[k]
            for k in (
                "id",
                "title_fa",
                "session_id",
                "issue_id",
                "manifest_id",
                "read_at",
            )
        } | {"version": row["row_version"]}

    def _rows(self, conn, table, company, actor, limit, cursor):
        from psycopg import sql

        position = self.security.read_cursor(cursor, table, str(actor["id"]), company)
        clause = sql.SQL(" AND (created_at,id)>(%s,%s)") if position else sql.SQL("")
        return conn.execute(
            sql.SQL(
                "SELECT * FROM app.{} WHERE company_id=%s{} ORDER BY created_at,id LIMIT %s"
            ).format(sql.Identifier(table), clause),
            (company, *position, limit + 1) if position else (company, limit + 1),
        ).fetchall()

    def _page(
        self,
        rows,
        limit,
        presenter,
        resource,
        actor,
        company,
        cursor=None,
        date_key="created_at",
    ):
        rows = sorted(rows, key=lambda row: (row[date_key], row["id"]))
        if cursor:
            position = self.security.read_cursor(
                cursor, resource, str(actor["id"]), company
            )
            rows = [row for row in rows if (row[date_key], row["id"]) > position]
        visible = rows[:limit]
        last = dict(visible[-1], created_at=visible[-1][date_key]) if visible else None
        return response(
            {
                "items": [presenter(row) for row in visible],
                "next_cursor": self.security.cursor(
                    resource, str(actor["id"]), company, last
                )
                if len(rows) > limit
                else None,
            }
        )
