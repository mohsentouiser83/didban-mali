"""Owner-only configuration; retain history and block unsafe in-flight changes."""

from __future__ import annotations
from ..errors import ApiError, missing, forbidden, conflict
from ..infrastructure.company import CompanyRepository
from ..infrastructure.company_modules import module_settings, save_modules
from .auth import response


class CompanyModuleService:
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
            if op == "getCompanyModules":
                state = module_settings(conn, company)
                return response(state, etag=state["version"])
            if access.role(company) != "owner":
                raise forbidden()
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (company + ":modules",),
            )
            access.company(company, lock=True)

            def action():
                state = module_settings(conn, company)
                if state["version"] != expected:
                    raise conflict()
                disabling = any(
                    enabled and not body["modules"][name]
                    for name, enabled in state["modules"].items()
                )
                if (
                    disabling
                    and conn.execute(
                        "SELECT 1 FROM app.processing_sessions WHERE company_id=%s AND status NOT IN ('completed','completed_limited','cancelled','failed') LIMIT 1",
                        (company,),
                    ).fetchone()
                ):
                    raise ApiError(
                        409,
                        "module_has_active_processing",
                        "ابتدا پردازش‌های باز شرکت را تعیین تکلیف کنید.",
                    )
                updated = save_modules(conn, company, body, str(actor["id"]))
                return response(updated, etag=updated["version"])

            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op,
                key=key,
                payload={"body": body, "expected_version": expected},
                action=action,
            )
