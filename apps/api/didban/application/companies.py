from __future__ import annotations
from typing import Callable

from ..db import Database
from ..errors import ApiError, conflict, forbidden, missing
from ..infrastructure.company import CompanyRepository
from ..infrastructure.identity import IdentityRepository
from ..security import Security
from .auth import response
from .idempotency import Replay


def company_view(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "timezone": row["timezone"],
        "display_unit": row["display_unit"],
        "archived": row["archived_at"] is not None,
        "version": row["row_version"],
    }


def member_view(row: dict) -> dict:
    return {
        key: row[key] for key in ("id", "company_id", "user_id", "role", "active")
    } | {"version": row["row_version"]}


class CompanyService:
    def __init__(self, db: Database, security: Security):
        self.db, self.security, self.replay = db, security, Replay(security)

    def list(self, actor: dict, limit: int, cursor: str | None) -> dict:
        position = self.security.read_cursor(cursor, "companies", str(actor["id"]), "")
        with self.db.transaction(identity=True, actor=str(actor["id"])) as conn:
            self._session_live(conn, actor)
            rows = IdentityRepository(conn).companies(position, limit + 1)
        return self._page(rows, limit, company_view, "companies", actor, "")

    def users(self, actor: dict, limit: int, cursor: str | None) -> dict:
        if not actor["is_installation_admin"]:
            raise forbidden()
        position = self.security.read_cursor(cursor, "users", str(actor["id"]), "")
        with self.db.transaction(identity=True, actor=str(actor["id"])) as conn:
            self._session_live(conn, actor)
            repo = IdentityRepository(conn)
            live = repo.user(str(actor["id"]), share=True)
            if not live or not live["is_installation_admin"]:
                raise forbidden()
            rows = repo.directory(position, limit + 1)

        def present(row):
            return {
                key: row[key]
                for key in ("id", "email", "display_name", "is_installation_admin")
            } | {
                "activated": row["activated_at"] is not None,
                "disabled": row["disabled_at"] is not None,
            }

        return self._page(rows, limit, present, "users", actor, "")

    def create(self, actor: dict, body: dict, key: str) -> dict:
        if not actor["is_installation_admin"]:
            raise forbidden()
        with self.db.transaction(identity=True, actor=str(actor["id"])) as conn:
            repo = IdentityRepository(conn)
            self._session_live(conn, actor)
            live = repo.user(str(actor["id"]), share=True)
            if not live or live["disabled_at"] or not live["is_installation_admin"]:
                raise forbidden()

            def action() -> dict:
                row = repo.create_company(
                    body["name"].strip(),
                    body["owner_user_id"],
                    body["timezone"],
                    body["display_unit"],
                )
                return response(company_view(row), 201, etag=row["row_version"])

            return self.replay.run(
                conn,
                identity=True,
                scope=str(actor["id"]),
                actor=str(actor["id"]),
                company=None,
                route="createCompany",
                key=key,
                payload=body,
                action=action,
            )

    def execute(
        self,
        operation: str,
        actor: dict,
        company: str,
        ids: dict,
        body: dict,
        *,
        key: str | None,
        expected: int | None,
        request_id: str,
        limit: int,
        cursor: str | None,
    ) -> dict:
        # An existing global account is required; the owner cannot create users.
        if operation == "addMembership":
            with self.db.transaction(identity=True) as identity_conn:
                identity = IdentityRepository(identity_conn)
                user = (
                    identity.user(body["user_id"])
                    if "user_id" in body
                    else identity.user_email(body["email"].strip().lower())
                )
                eligible_user = bool(user and user["disabled_at"] is None)
                target_user_id = str(user["id"]) if eligible_user else None
        else:
            eligible_user = True
        with self.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            repo = CompanyRepository(conn)
            if not repo.require_session(actor):
                raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
            current = repo.company(company)
            if not current:
                raise missing()
            role = repo.role(company)
            if (
                operation
                in {
                    "updateCompany",
                    "listMemberships",
                    "addMembership",
                    "updateMembership",
                    "readApprovalPermission",
                    "setApprovalPermission",
                }
                and role != "owner"
            ):
                raise forbidden()
            if operation == "approveReport" and not repo.can_approve(company):
                raise forbidden()

            def action() -> dict:
                if operation == "getCompanyAccess":
                    permissions = ["company.read"]
                    if role in ("owner", "finance_manager", "advisor_accountant"):
                        permissions.append("company.operate")
                    if role in ("owner", "finance_manager"):
                        permissions.append("company.financial_policy")
                    if role == "owner":
                        permissions.append("company.owner")
                    if repo.can_approve(company):
                        permissions.append("company.approve_report")
                    return response(
                        {
                            "company_id": company,
                            "role": role,
                            "permissions": permissions,
                        }
                    )
                if operation == "getCompany":
                    return response(company_view(current), etag=current["row_version"])
                if operation == "updateCompany":
                    row = repo.company(company, lock=True)
                    self._version(row, expected)
                    updated = repo.patch_company(company, body)
                    repo.audit(
                        company,
                        str(actor["id"]),
                        "company.updated",
                        "company",
                        company,
                        request_id,
                    )
                    return response(company_view(updated), etag=updated["row_version"])
                if operation == "listMemberships":
                    position = self.security.read_cursor(
                        cursor, "memberships", str(actor["id"]), company
                    )
                    members = repo.members(company, position, limit + 1)
                    # Only IDs obtained after company-owner authorization cross the identity boundary.
                    with self.db.transaction(identity=True) as identity_conn:
                        profiles = IdentityRepository(identity_conn).member_profiles(
                            [row["user_id"] for row in members]
                        )
                    return self._page(
                        members,
                        limit,
                        lambda row: member_view(row)
                        | {
                            key: profiles[row["user_id"]][key]
                            for key in ("display_name", "email")
                        },
                        "memberships",
                        actor,
                        company,
                    )
                if operation == "addMembership":
                    if not eligible_user:
                        raise missing()
                    row = repo.add_member(company, target_user_id, body["role"])
                    repo.audit(
                        company,
                        str(actor["id"]),
                        "membership.created",
                        "membership",
                        str(row["id"]),
                        request_id,
                        {"role": row["role"]},
                    )
                    return response(member_view(row), 201, etag=row["row_version"])
                if operation in {
                    "updateMembership",
                    "readApprovalPermission",
                    "setApprovalPermission",
                }:
                    row = repo.member(
                        company,
                        ids["membership_id"],
                        lock=operation != "readApprovalPermission",
                    )
                    if not row:
                        raise missing()
                    if operation == "updateMembership":
                        self._version(row, expected)
                        changed_role = "role" in body and body["role"] != row["role"]
                        if (
                            (changed_role or body.get("active") is False)
                            and row["role"] in ("owner", "advisor_accountant")
                            and repo.permission(company, str(row["id"]))
                        ):
                            repo.set_permission(
                                row,
                                False,
                                "تغییر نقش یا غیرفعال‌شدن عضویت",
                                str(actor["id"]),
                            )
                        repo.audit(
                            company,
                            str(actor["id"]),
                            "membership.updated",
                            "membership",
                            str(row["id"]),
                            request_id,
                            {
                                "before_role": row["role"],
                                "after_role": body.get("role", row["role"]),
                                "before_active": row["active"],
                                "after_active": body.get("active", row["active"]),
                            },
                        )
                        updated = repo.patch_member(row, body)
                        return response(
                            member_view(updated), etag=updated["row_version"]
                        )
                    if operation == "setApprovalPermission":
                        self._version(row, expected)
                        if not row["active"] or row["role"] not in (
                            "owner",
                            "advisor_accountant",
                        ):
                            raise ApiError(
                                422,
                                "ineligible_approval_recipient",
                                "نقش این عضو اجازه دریافت مجوز را ندارد.",
                            )
                        row = repo.set_permission(
                            row,
                            body["enabled"],
                            body["reason"].strip(),
                            str(actor["id"]),
                        )
                    return response(
                        {
                            "membership_id": row["id"],
                            "permission": "approve_financial_report",
                            "enabled": repo.permission(company, str(row["id"])),
                            "version": row["row_version"],
                        },
                        etag=row["row_version"],
                    )
                if operation in {"getReport", "approveReport"}:
                    report = repo.report(company, ids["report_id"])
                    if not report:
                        raise missing()
                    if operation == "getReport":
                        return response(
                            {
                                k: report[k]
                                for k in (
                                    "id",
                                    "manifest_id",
                                    "label",
                                    "content_hash",
                                    "created_at",
                                )
                            }
                            | {
                                "approval_ids": repo.approval_ids(
                                    company, str(report["id"])
                                ),
                                "version": report["row_version"],
                            },
                            etag=report["row_version"],
                        )
                    self._version(report, expected)
                    row = repo.approve(company, ids["report_id"], str(actor["id"]))
                    repo.audit(
                        company,
                        str(actor["id"]),
                        "report.approved",
                        "report",
                        ids["report_id"],
                        request_id,
                    )
                    return response(
                        {
                            k: row[k]
                            for k in (
                                "id",
                                "report_id",
                                "actor_id",
                                "created_at",
                                "authority",
                            )
                        },
                        201,
                    )
                raise missing()

            if key is None:
                return action()
            return self.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=operation + ":" + str(ids),
                key=key,
                payload={"body": body, "expected_version": expected},
                action=action,
            )

    def _page(
        self,
        rows: list[dict],
        limit: int,
        presenter: Callable,
        resource: str,
        actor: dict,
        company: str,
    ) -> dict:
        visible = rows[:limit]
        cursor = (
            self.security.cursor(resource, str(actor["id"]), company, visible[-1])
            if len(rows) > limit
            else None
        )
        return response(
            {"items": [presenter(row) for row in visible], "next_cursor": cursor}
        )

    @staticmethod
    def _version(row: dict, expected: int | None) -> None:
        if row["row_version"] != expected:
            raise conflict()

    @staticmethod
    def _session_live(conn, actor: dict) -> None:
        if not IdentityRepository(conn).require_session(actor):
            raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
