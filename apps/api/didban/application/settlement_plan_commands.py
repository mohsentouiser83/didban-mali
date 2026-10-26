"""Immutable plan revision and cancellation use cases."""

from datetime import date
from ..errors import conflict, missing
from ..infrastructure import settlements as store
from .auth import response
from .settlement_context import current_manifest, payment_value


def run_plan(conn, company, actor, access, op, ids, body, expected, key, request_id):
    latest = current_manifest(conn, company)
    if op == "createPlannedPayment":
        invoice = None
        oid = body.get("obligation_id")
        if oid:
            obligation = conn.execute(
                "SELECT * FROM app.obligations WHERE company_id=%s AND id=%s FOR UPDATE",
                (company, oid),
            ).fetchone()
            if not obligation:
                raise missing()
            if body.get("invoice_id") not in (
                None,
                str(obligation["invoice_id"]),
            ) or body.get("party_id") not in (
                None,
                str(obligation["party_id"]),
            ):
                raise conflict("obligation_scope_conflict")
            if conn.execute(
                "SELECT 1 FROM app.planned_payment_versions WHERE company_id=%s AND obligation_id=%s",
                (company, oid),
            ).fetchone():
                raise conflict("obligation_already_planned")
        else:
            if body.get("invoice_id"):
                if not latest:
                    raise conflict("financial_not_ready")
                work = store.workspace(conn, company, latest["id"])
                invoice = next(
                    (
                        i
                        for i in (work or {}).get("invoices", [])
                        if i["invoice_id"] == body["invoice_id"]
                        and i["direction"] == "purchase"
                    ),
                    None,
                )
                if not invoice:
                    raise missing()
                if body.get("party_id") not in (None, invoice["party_id"]):
                    raise conflict("obligation_scope_conflict")
            oid = conn.execute(
                "INSERT INTO app.obligations(company_id,invoice_id,party_id,title) VALUES(%s,%s,%s,%s) RETURNING id",
                (
                    company,
                    invoice["invoice_id"] if invoice else None,
                    invoice["party_id"] if invoice else body.get("party_id"),
                    body["title"].strip(),
                ),
            ).fetchone()["id"]
        row = conn.execute(
            "INSERT INTO app.planned_payment_versions(company_id,obligation_id,scheduled_on,total_amount,state,actor_id,title_snapshot) VALUES(%s,%s,%s,%s,'confirmed',%s,%s) RETURNING *",
            (
                company,
                oid,
                body["scheduled_on"],
                payment_value(body),
                actor["id"],
                body["title"].strip(),
            ),
        ).fetchone()
    else:
        old = conn.execute(
            "SELECT * FROM app.planned_payment_versions WHERE company_id=%s AND id=%s",
            (company, ids["plan_id"]),
        ).fetchone()
        if not old:
            raise missing()
        conn.execute(
            "SELECT id FROM app.obligations WHERE company_id=%s AND id=%s FOR UPDATE",
            (company, old["obligation_id"]),
        )
        current = conn.execute(
            "SELECT * FROM app.planned_payment_versions WHERE company_id=%s AND obligation_id=%s ORDER BY created_at DESC,id DESC LIMIT 1",
            (company, old["obligation_id"]),
        ).fetchone()
        if (
            current["id"] != old["id"]
            or old["row_version"] != expected
            or old["state"] == "cancelled"
        ):
            raise conflict()
        row = conn.execute(
            "INSERT INTO app.planned_payment_versions(company_id,obligation_id,supersedes_id,scheduled_on,total_amount,state,actor_id,title_snapshot,row_version) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                company,
                old["obligation_id"],
                old["id"],
                body.get("scheduled_on", old["scheduled_on"]),
                payment_value(body, old),
                "cancelled" if op == "cancelPlannedPayment" else "confirmed",
                actor["id"],
                body.get("title", old["title_snapshot"]).strip(),
                old["row_version"] + 1,
            ),
        ).fetchone()
    access.audit(
        company,
        str(actor["id"]),
        "planned_payment." + op,
        "planned_payment",
        str(row["id"]),
        request_id,
    )
    cutoff = latest["as_of_date"] if latest else date.today()
    plan = next(
        p for p in store.plans(conn, company, cutoff) if p["id"] == str(row["id"])
    )
    return response(
        plan,
        201 if op == "createPlannedPayment" else 200,
        etag=row["row_version"],
    )
