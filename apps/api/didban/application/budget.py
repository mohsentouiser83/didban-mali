"""Installation-only cap management; operating-cost usage remains company scoped."""

import psycopg
from ..errors import ApiError, conflict, forbidden, missing
from ..infrastructure.company import CompanyRepository
from ..adapters.model_provider import ModelSettings, rate
from .auth import response


def policy_view(row):
    return {
        "id": row["id"],
        "ceiling_usd": format(row["ceiling_usd"], "f"),
        "period_kind": row["period_kind"],
        "version": row["row_version"],
    }


class BudgetService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        if op == "companyUsage":
            with self.intake.db.transaction(
                identity=False, actor=str(actor["id"]), company=company
            ) as conn:
                self.intake.authorize(conn, actor, company)
                return response(
                    conn.execute(
                        "SELECT app.read_model_usage(%s) AS usage", (company,)
                    ).fetchone()["usage"]
                )
        with self.intake.db.transaction(identity=True, actor=str(actor["id"])) as conn:
            if not CompanyRepository(conn).require_session(actor):
                raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
            if not conn.execute("SELECT app.model_admin() AS allowed").fetchone()[
                "allowed"
            ]:
                raise forbidden()
            if op == "listUncertainModelRequests":
                resource = "uncertain_model_requests"
                position = self.intake.security.read_cursor(
                    cursor, resource, str(actor["id"]), ""
                )
                rows = conn.execute(
                    "SELECT * FROM app.list_uncertain_model_requests(%s,%s,%s)",
                    (
                        position[0] if position else None,
                        position[1] if position else None,
                        limit + 1,
                    ),
                ).fetchall()
                return response(
                    {
                        "items": [
                            {
                                "id": r["id"],
                                "created_at": r["created_at"],
                                "reserved_usd": format(r["reserved_usd"], "f"),
                            }
                            for r in rows[:limit]
                        ],
                        "next_cursor": self.intake.security.cursor(
                            resource, str(actor["id"]), "", rows[limit - 1]
                        )
                        if len(rows) > limit
                        else None,
                    }
                )
            if op == "getInstallationUsage":
                return response(
                    conn.execute(
                        "SELECT app.read_model_usage(NULL) AS usage"
                    ).fetchone()["usage"]
                )
            if op == "getInstallationBudget":
                row = conn.execute("SELECT * FROM app.model_budget_policy()").fetchone()
                if not row:
                    raise missing()
                return response(policy_view(row), etag=row["row_version"])

            def action():
                value = rate(
                    body.get("actual_cost_usd")
                    if op == "reconcileModelUsage"
                    else body.get("ceiling_usd")
                )
                if value is None:
                    raise ApiError(422, "invalid_usd", "مبلغ دلار معتبر وارد کنید.")
                try:
                    with conn.transaction():
                        if op == "reconcileModelUsage":
                            conn.execute(
                                "SELECT app.reconcile_model_receipt(%s,%s)",
                                (ids["model_request_id"], value),
                            )
                            return response({"ok": True}, 201)
                        row = conn.execute(
                            "SELECT * FROM app.model_budget_policy(%s,%s,%s)",
                            (value, expected, op == "createInstallationBudget"),
                        ).fetchone()
                        return response(
                            policy_view(row),
                            201 if op == "createInstallationBudget" else 200,
                            etag=row["row_version"],
                        )
                except psycopg.errors.CheckViolation:
                    raise conflict("budget_state_conflict") from None

            return self.intake.replay.run(
                conn,
                identity=True,
                scope=str(actor["id"]),
                actor=str(actor["id"]),
                company=None,
                route=op + ":" + str(ids.get("model_request_id", "installation")),
                key=key,
                payload={"body": body, "version": expected},
                action=action,
            )


class ModelService:
    def __init__(self, intake, settings: ModelSettings | None = None):
        self.intake, self.settings = intake, settings

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            self.intake.authorize(conn, actor, company)
            settings = self.settings or ModelSettings.from_env()
            return response(
                {
                    "configured": settings.configured,
                    "provider": settings.provider
                    if settings.provider in ("openai", "avalai")
                    else "openai",
                    "model_identifier": settings.model_id or None,
                    "rates_configured": settings.input_rate is not None
                    and settings.output_rate is not None,
                }
            )
