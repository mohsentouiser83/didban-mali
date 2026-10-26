"""Company-authorized, audited payment allocations and versioned payment plans."""

from __future__ import annotations
from datetime import date
import psycopg
from ..errors import ApiError, missing
from ..domain.settlements import exact_context
from ..infrastructure import settlements as store
from .auth import response
from .settlement_context import current_manifest
from .settlement_allocation_commands import run_allocation
from .settlement_plan_commands import run_plan

MUTATIONS = {
    "createAllocation",
    "reverseAllocation",
    "createPlannedPayment",
    "revisePlannedPayment",
    "cancelPlannedPayment",
    "createSettlementEvent",
    "decideRecurrence",
}


def paginate(intake, actor, company, resource, items, limit, cursor):
    position = intake.security.read_cursor(cursor, resource, str(actor["id"]), company)

    def identity(row):
        # Plans and allocations have their own identity; invoice_id is nullable
        # or shared by several records. Invoice-balance rows only have invoice_id.
        return row["id"] if "id" in row else row["invoice_id"]

    rows = sorted(items, key=identity)
    if position:
        rows = [row for row in rows if identity(row) > str(position[1])]
    visible = rows[:limit]
    return {
        "items": visible,
        "next_cursor": intake.security.cursor(
            resource,
            str(actor["id"]),
            company,
            {
                "created_at": "1970-01-01T00:00:00+00:00",
                "id": identity(visible[-1]),
            },
        )
        if len(rows) > limit
        else None,
    }


class SettlementService:
    def __init__(self, intake):
        self.intake = intake

    @exact_context
    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(conn, actor, company, op in MUTATIONS)
            if op in ("listReceivables", "listPayables"):
                pinned = store.projection(conn, company, ids["manifest_id"])
                if not pinned:
                    raise missing()
                direction = "sales" if op == "listReceivables" else "purchase"
                return response(
                    paginate(
                        self.intake,
                        actor,
                        company,
                        op + ":" + ids["manifest_id"],
                        [i for i in pinned["invoices"] if i["direction"] == direction],
                        limit,
                        cursor,
                    )
                )
            if op == "getSettlementWorkspace":
                work = store.workspace(conn, company, ids["manifest_id"])
                if not work:
                    raise missing()
                return response(work, etag=work["version"])
            if op == "listRecurrenceProposals":
                from ..infrastructure.settlement_recurrence import view

                rows = conn.execute(
                    "SELECT * FROM app.recurrence_proposals WHERE company_id=%s ORDER BY created_at,id",
                    (company,),
                ).fetchall()
                return response(
                    paginate(
                        self.intake,
                        actor,
                        company,
                        op,
                        [view(r) for r in rows],
                        limit,
                        cursor,
                    )
                )
            if op == "listAllocations":
                rows = conn.execute(
                    "SELECT a.*,EXISTS(SELECT 1 FROM app.allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id) AS reversed FROM app.allocations a WHERE a.company_id=%s ORDER BY a.created_at,a.id",
                    (company,),
                ).fetchall()
                return response(
                    paginate(
                        self.intake,
                        actor,
                        company,
                        op,
                        [store.allocation_view(a) for a in rows],
                        limit,
                        cursor,
                    )
                )
            if op in ("listPlannedPayments", "getPlannedPayment"):
                latest = current_manifest(conn, company)
                cutoff = latest["as_of_date"] if latest else date.today()
                plans = store.plans(conn, company, cutoff)
                if op == "listPlannedPayments":
                    return response(
                        paginate(self.intake, actor, company, op, plans, limit, cursor)
                    )
                plan = next((p for p in plans if p["id"] == ids["plan_id"]), None)
                if not plan:
                    raise missing()
                return response(plan, etag=plan["version"])

            def action():
                if op == "decideRecurrence":
                    from ..infrastructure.settlement_recurrence import decide

                    result = decide(
                        conn, company, actor, ids["proposal_id"], body, expected
                    )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "recurrence.decided",
                        "recurrence_proposal",
                        ids["proposal_id"],
                        request_id,
                    )
                    return response(result, 201, etag=result["version"])
                handler = (
                    run_allocation
                    if op
                    in (
                        "createAllocation",
                        "reverseAllocation",
                        "createSettlementEvent",
                    )
                    else run_plan
                )
                return handler(
                    conn,
                    company,
                    actor,
                    access,
                    op,
                    ids,
                    body,
                    expected,
                    key,
                    request_id,
                )

            try:
                return self.intake.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route=op
                    + ":"
                    + str(
                        ids.get(
                            "allocation_id",
                            ids.get("plan_id", ids.get("manifest_id", "")),
                        )
                    ),
                    key=key,
                    payload={"body": body, "version": expected, "resource": ids},
                    action=action,
                )
            except psycopg.errors.CheckViolation as error:
                code = error.diag.message_primary
                if code in ("allocation_capacity_conflict", "bank_capacity_conflict"):
                    raise ApiError(
                        409,
                        code,
                        "ظرفیت دریافت، پرداخت یا فاکتور کافی نیست؛ مانده‌ها را دوباره بررسی کنید.",
                    ) from None
                if code in ("allocation_scope_direction", "bank_direction_mismatch"):
                    raise ApiError(
                        422, code, "جهت یا طرف حساب رویداد با فاکتور سازگار نیست."
                    ) from None
                raise
