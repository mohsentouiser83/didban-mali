"""Audited, version-checked payroll access administration (E02/E03)."""

from __future__ import annotations

from ..errors import ApiError, forbidden, missing, conflict
from ..infrastructure.company import CompanyRepository
from ..infrastructure.extension_access import ExtensionAccessRepository
from ..infrastructure.identity import IdentityRepository
from .auth import response


class ExtensionAccessService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = CompanyRepository(conn)
            if not access.require_session(actor):
                raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
            if not access.company(company):
                raise missing()
            repo = ExtensionAccessRepository(conn)
            if op == "getPayrollAccess":
                return response({"company_id": company, **repo.allowed(company)})
            if access.role(company) != "owner":
                raise forbidden()
            if op == "listExtensionAccessEvents":
                position = self.intake.security.read_cursor(
                    cursor, "extension-events", str(actor["id"]), company
                )
                rows = conn.execute(
                    "SELECT * FROM app.extension_access_events WHERE company_id=%s AND (%s::timestamptz IS NULL OR (created_at,id)>(%s::timestamptz,%s::uuid)) ORDER BY created_at,id LIMIT %s",
                    (
                        company,
                        position[0] if position else None,
                        position[0] if position else None,
                        position[1] if position else None,
                        limit + 1,
                    ),
                ).fetchall()
                recipients = {
                    r["id"]: r["user_id"]
                    for r in conn.execute(
                        "SELECT id,user_id FROM app.company_memberships WHERE company_id=%s AND id=ANY(%s::uuid[])",
                        (
                            company,
                            [
                                r["entity_id"]
                                for r in rows[:limit]
                                if r["kind"] == "payroll_permissions"
                            ],
                        ),
                    ).fetchall()
                }
                with self.intake.db.transaction(identity=True) as identity_conn:
                    profiles = IdentityRepository(identity_conn).member_profiles(
                        [r["actor_id"] for r in rows[:limit]]
                        + list(recipients.values())
                    )
                return response(
                    {
                        "items": [
                            {
                                k: r[k]
                                for k in (
                                    "id",
                                    "created_at",
                                    "kind",
                                    "reason",
                                    "before_value",
                                    "after_value",
                                )
                            }
                            | {
                                "actor_name": profiles.get(r["actor_id"], {}).get(
                                    "display_name", "کاربر پیشین"
                                ),
                                "recipient_name": profiles.get(
                                    recipients.get(r["entity_id"]), {}
                                ).get("display_name")
                                if r["kind"] == "payroll_permissions"
                                else None,
                            }
                            for r in rows[:limit]
                        ],
                        "next_cursor": self.intake.security.cursor(
                            "extension-events",
                            str(actor["id"]),
                            company,
                            rows[limit - 1],
                        )
                        if len(rows) > limit
                        else None,
                    }
                )
            # Serialize absent-row creation and membership changes on the same member.
            member = access.member(company, ids["membership_id"], lock=True)
            if not member:
                raise missing()

            def action():
                current = repo.permissions(company, member)
                if op == "getPayrollPermissions":
                    return response(current, etag=current["version"])
                if current["version"] != expected:
                    raise conflict()
                if not member["active"] or member["role"] not in (
                    "owner",
                    "advisor_accountant",
                ):
                    raise ApiError(
                        422,
                        "ineligible_payroll_recipient",
                        "این عضو امکان دریافت مجوز حقوق را ندارد.",
                    )
                updated = repo.set_permissions(company, member, body, str(actor["id"]))
                return response(updated, etag=updated["version"])

            if op == "getPayrollPermissions":
                return action()
            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + ids["membership_id"],
                key=key,
                payload={"body": body, "expected_version": expected},
                action=action,
            )
