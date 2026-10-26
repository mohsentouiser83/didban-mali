from __future__ import annotations
from psycopg import Connection, sql
from psycopg.types.json import Jsonb


class CompanyRepository:
    def __init__(self, conn: Connection):
        self.conn = conn

    def company(self, company_id: str, *, lock: bool = False) -> dict | None:
        return self.conn.execute(
            "SELECT * FROM app.companies WHERE id=%s" + (" FOR UPDATE" if lock else ""),
            (company_id,),
        ).fetchone()

    def role(self, company_id: str) -> str | None:
        return self.conn.execute(
            "SELECT app.member_role(%s) AS role", (company_id,)
        ).fetchone()["role"]

    def patch_company(self, company_id: str, fields: dict) -> dict:
        columns = {
            "name": "name",
            "display_unit": "display_unit",
            "archived": "archived_at",
        }
        assignments, values = [], []
        for key, value in fields.items():
            column = sql.Identifier(columns[key])
            if key == "archived":
                assignments.append(
                    sql.SQL(
                        "{}=CASE WHEN %s THEN coalesce(archived_at,clock_timestamp()) ELSE NULL END"
                    ).format(column)
                )
            else:
                assignments.append(sql.SQL("{}=%s").format(column))
            values.append(value)
        statement = sql.SQL(
            "UPDATE app.companies SET {} WHERE id=%s RETURNING *"
        ).format(sql.SQL(",").join(assignments))
        return self.conn.execute(statement, (*values, company_id)).fetchone()

    def members(self, company_id: str, cursor: tuple | None, limit: int) -> list[dict]:
        where = " AND (created_at,id)>(%s,%s)" if cursor else ""
        return self.conn.execute(
            "SELECT * FROM app.company_memberships WHERE company_id=%s"
            + where
            + " ORDER BY created_at,id LIMIT %s",
            (company_id, *cursor, limit) if cursor else (company_id, limit),
        ).fetchall()

    def member(
        self, company_id: str, member_id: str, *, lock: bool = False
    ) -> dict | None:
        return self.conn.execute(
            "SELECT * FROM app.company_memberships WHERE company_id=%s AND id=%s"
            + (" FOR UPDATE" if lock else ""),
            (company_id, member_id),
        ).fetchone()

    def add_member(self, company_id: str, user_id: str, role: str) -> dict:
        return self.conn.execute(
            "INSERT INTO app.company_memberships(company_id,user_id,role) VALUES(%s,%s,%s) RETURNING *",
            (company_id, user_id, role),
        ).fetchone()

    def patch_member(self, member: dict, fields: dict) -> dict:
        assignments = sql.SQL(",").join(
            sql.SQL("{}=%s").format(sql.Identifier(k)) for k in fields
        )
        return self.conn.execute(
            sql.SQL(
                "UPDATE app.company_memberships SET {} WHERE company_id=%s AND id=%s RETURNING *"
            ).format(assignments),
            (*fields.values(), member["company_id"], member["id"]),
        ).fetchone()

    def permission(self, company_id: str, member_id: str) -> bool:
        row = self.conn.execute(
            "SELECT enabled FROM app.permission_grants WHERE company_id=%s AND membership_id=%s",
            (company_id, member_id),
        ).fetchone()
        return row["enabled"] if row else False

    def set_permission(
        self, member: dict, enabled: bool, reason: str, actor_id: str
    ) -> dict:
        self.conn.execute(
            """INSERT INTO app.permission_grants(company_id,membership_id,permission,enabled,changed_by,reason)
          VALUES(%s,%s,'approve_financial_report',%s,%s,%s) ON CONFLICT(company_id,membership_id,permission)
          DO UPDATE SET enabled=excluded.enabled,changed_by=excluded.changed_by,reason=excluded.reason""",
            (member["company_id"], member["id"], enabled, actor_id, reason),
        )
        return self.conn.execute(
            "UPDATE app.company_memberships SET active=active WHERE company_id=%s AND id=%s RETURNING *",
            (member["company_id"], member["id"]),
        ).fetchone()

    def can_approve(self, company_id: str) -> bool:
        return bool(
            self.conn.execute(
                "SELECT app.can_approve(%s) AS allowed", (company_id,)
            ).fetchone()["allowed"]
        )

    def report(self, company_id: str, report_id: str) -> dict | None:
        return self.conn.execute(
            "SELECT r.* FROM app.report_snapshots r JOIN app.result_manifests m ON m.company_id=r.company_id AND m.id=r.manifest_id WHERE r.company_id=%s AND r.id=%s AND m.status='published'",
            (company_id, report_id),
        ).fetchone()

    def approve(self, company_id: str, report_id: str, actor_id: str) -> dict:
        return self.conn.execute(
            "INSERT INTO app.report_approvals(company_id,report_id,actor_id,authority) VALUES(%s,%s,%s,'finance_manager') RETURNING *",
            (company_id, report_id, actor_id),
        ).fetchone()

    def approval_ids(self, company_id: str, report_id: str) -> list:
        return [
            row["id"]
            for row in self.conn.execute(
                "SELECT id FROM app.report_approvals WHERE company_id=%s AND report_id=%s ORDER BY created_at,id",
                (company_id, report_id),
            ).fetchall()
        ]

    def require_session(self, actor: dict) -> bool:
        return bool(
            self.conn.execute(
                "SELECT app.assert_current_session(%s) AS allowed",
                (actor["token_hash"],),
            ).fetchone()["allowed"]
        )

    def audit(
        self,
        company_id: str,
        actor_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        request_id: str,
        details: dict | None = None,
    ) -> None:
        self.conn.execute(
            "INSERT INTO app.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,safe_details) VALUES(%s,%s,%s,%s,%s,%s,%s)",
            (
                company_id,
                actor_id,
                action,
                entity_type,
                entity_id,
                request_id,
                Jsonb(details or {}),
            ),
        )
