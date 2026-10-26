from __future__ import annotations
from datetime import date
from psycopg import sql

from ..db import Database
from ..errors import ApiError, missing, forbidden, conflict
from ..infrastructure.company import CompanyRepository
from ..infrastructure.intake import period_view
from ..security import Security
from .auth import response
from .idempotency import Replay


class PeriodService:
    def __init__(self, db: Database, security: Security):
        self.db, self.security, self.replay = db, security, Replay(security)

    def execute(
        self,
        op: str,
        actor: dict,
        company: str,
        ids: dict,
        body: dict,
        key: str | None,
        expected: int | None,
        request_id: str,
        limit: int,
        cursor: str | None,
    ) -> dict:
        with self.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = CompanyRepository(conn)
            if not access.require_session(actor):
                raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
            if not access.company(company):
                raise missing()
            if op not in ("listPeriods", "getPeriod") and access.role(company) not in (
                "owner",
                "finance_manager",
            ):
                raise forbidden()

            def action():
                if op == "listPeriods":
                    position = self.security.read_cursor(
                        cursor, "periods", str(actor["id"]), company
                    )
                    clause = " AND (created_at,id)>(%s,%s)" if position else ""
                    rows = conn.execute(
                        "SELECT * FROM app.financial_periods WHERE company_id=%s"
                        + clause
                        + " ORDER BY created_at,id LIMIT %s",
                        (company, *position, limit + 1)
                        if position
                        else (company, limit + 1),
                    ).fetchall()
                    visible = rows[:limit]
                    return response(
                        {
                            "items": list(map(period_view, visible)),
                            "next_cursor": self.security.cursor(
                                "periods", str(actor["id"]), company, visible[-1]
                            )
                            if len(rows) > limit
                            else None,
                        }
                    )
                row = None
                if "period_id" in ids:
                    row = conn.execute(
                        "SELECT * FROM app.financial_periods WHERE company_id=%s AND id=%s"
                        + (" FOR UPDATE" if op != "getPeriod" else ""),
                        (company, ids["period_id"]),
                    ).fetchone()
                    if not row:
                        raise missing()
                    if op == "getPeriod":
                        return response(period_view(row), etag=row["row_version"])
                    if row["row_version"] != expected:
                        raise conflict()
                if op == "deletePeriod":
                    conn.execute(
                        "DELETE FROM app.financial_periods WHERE company_id=%s AND id=%s",
                        (company, row["id"]),
                    )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "period.deleted",
                        "financial_period",
                        str(row["id"]),
                        request_id,
                    )
                    return response({"ok": True})
                merged = (dict(row) if row else {}) | body
                start = date.fromisoformat(str(merged["starts_on"]))
                end = date.fromisoformat(str(merged["ends_on"]))
                if start > end:
                    raise ApiError(
                        422,
                        "invalid_period_range",
                        "پایان دوره نباید قبل از شروع آن باشد.",
                    )
                previous = merged.get("previous_period_id")
                if previous:
                    prior = conn.execute(
                        "SELECT * FROM app.financial_periods WHERE company_id=%s AND id=%s FOR SHARE",
                        (company, previous),
                    ).fetchone()
                    if (
                        not prior
                        or prior["ends_on"] >= start
                        or (row and str(row["id"]) == previous)
                    ):
                        raise ApiError(
                            422,
                            "invalid_previous_period",
                            "دوره قبل باید متعلق به همین شرکت و پیش از این دوره باشد.",
                        )
                if row and any(
                    k in body and str(body[k]) != str(row[k])
                    for k in ("starts_on", "ends_on", "previous_period_id")
                ):
                    if conn.execute(
                        "SELECT 1 FROM app.processing_sessions WHERE company_id=%s AND period_id=%s LIMIT 1",
                        (company, row["id"]),
                    ).fetchone():
                        raise ApiError(
                            409,
                            "period_in_use",
                            "بازه دوره استفاده‌شده قابل تغییر نیست.",
                        )
                if row:
                    columns = sql.SQL(",").join(
                        sql.SQL("{}=%s").format(sql.Identifier(k)) for k in body
                    )
                    row = conn.execute(
                        sql.SQL(
                            "UPDATE app.financial_periods SET {} WHERE company_id=%s AND id=%s RETURNING *"
                        ).format(columns),
                        (
                            *[v.strip() if k == "name" else v for k, v in body.items()],
                            company,
                            row["id"],
                        ),
                    ).fetchone()
                else:
                    row = conn.execute(
                        "INSERT INTO app.financial_periods(company_id,name,starts_on,ends_on,previous_period_id) VALUES(%s,%s,%s,%s,%s) RETURNING *",
                        (company, body["name"].strip(), start, end, previous),
                    ).fetchone()
                access.audit(
                    company,
                    str(actor["id"]),
                    "period.created" if op == "createPeriod" else "period.updated",
                    "financial_period",
                    str(row["id"]),
                    request_id,
                )
                return response(
                    period_view(row),
                    201 if op == "createPeriod" else 200,
                    etag=row["row_version"],
                )

            if key is None:
                return action()
            return self.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + str(ids),
                key=key,
                payload={"body": body, "version": expected},
                action=action,
            )
