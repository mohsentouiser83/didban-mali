"""Company-scoped payroll grants; stale membership grants fail closed."""

from __future__ import annotations


class ExtensionAccessRepository:
    def __init__(self, conn):
        self.conn = conn

    def allowed(self, company: str) -> dict[str, bool]:
        row = self.conn.execute(
            "SELECT app.payroll_allowed(%s,'view') AS view, "
            "app.payroll_allowed(%s,'manage') AS manage, "
            "app.payroll_allowed(%s,'approve') AS approve",
            (company, company, company),
        ).fetchone()
        return dict(row)

    def permissions(self, company: str, member: dict) -> dict:
        row = self.conn.execute(
            "SELECT * FROM app.payroll_permissions WHERE company_id=%s AND membership_id=%s",
            (company, member["id"]),
        ).fetchone()
        valid = bool(
            row
            and member["active"]
            and member["role"] in ("owner", "advisor_accountant")
        )
        return {
            "membership_id": member["id"],
            **{
                key: bool(valid and row["can_" + key])
                for key in ("view", "manage", "approve")
            },
            "version": row["row_version"] if row else 1,
        }

    def set_permissions(
        self, company: str, member: dict, body: dict, actor: str
    ) -> dict:
        self.conn.execute(
            """INSERT INTO app.payroll_permissions(company_id,membership_id,membership_version,
            can_view,can_manage,can_approve,changed_by,reason) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT(company_id,membership_id) DO UPDATE SET
            membership_version=excluded.membership_version,can_view=excluded.can_view,
            can_manage=excluded.can_manage,can_approve=excluded.can_approve,
            changed_by=excluded.changed_by,reason=excluded.reason""",
            (
                company,
                member["id"],
                member["row_version"],
                body["view"],
                body["manage"],
                body["approve"],
                actor,
                body["reason"].strip(),
            ),
        )
        return self.permissions(company, member)
