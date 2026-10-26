"""Allocation and reversal use cases, protected by capacity locks and audited receipts."""

from decimal import Decimal
from ..errors import ApiError, conflict, missing
from ..infrastructure import settlements as store
from .auth import response
from .settlement_context import current_manifest


def run_allocation(
    conn, company, actor, access, op, ids, body, expected, key, request_id
):
    latest = current_manifest(conn, company)
    if op in (
        "createAllocation",
        "reverseAllocation",
        "createSettlementEvent",
    ):
        if not latest:
            raise conflict("financial_not_ready")
        # Serialize the workspace head before the documented bank/event/invoice locks.
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
            (str(company) + ":settlement-workspace",),
        )
        work = store.workspace(conn, company, latest["id"])
        if not work:
            raise conflict("projection_not_ready")
        if op == "createSettlementEvent":
            if str(latest["id"]) != ids["manifest_id"]:
                raise conflict("stale_dataset")
            movement = next(
                (
                    m
                    for m in work["bank_movements"]
                    if m["id"] == body["bank_movement_id"]
                ),
                None,
            )
            if not movement:
                raise missing()
            if movement["event_id"]:
                event = next(
                    e for e in work["events"] if e["id"] == movement["event_id"]
                )
                return response(event, 201, etag=event["version"])
            raw = store.pinned_rows(conn, company, latest["id"])
            if any(
                r["kind"] == "settlements"
                and r["values"].get("bank_reference") == movement["reference"]
                and r["values"].get("date") == movement["date"]
                and Decimal(r["values"].get("amount", "0"))
                == abs(Decimal(movement["amount"]))
                for r in raw
                if movement["reference"]
            ):
                raise ApiError(
                    409,
                    "settlement_reference_ambiguous",
                    "این گردش در سوابق تسویه آمده؛ ارتباط آن را ابتدا مشخص کنید.",
                )
            bank = conn.execute(
                "SELECT * FROM app.bank_movements WHERE company_id=%s AND id=%s FOR UPDATE",
                (company, movement["id"]),
            ).fetchone()
            eid = store.identity(
                company, "bank-event:" + str(bank["record_revision_id"])
            )
            row = conn.execute(
                "INSERT INTO app.settlement_events(id,company_id,record_revision_id,bank_movement_id,settled_on,direction,amount,event_role) VALUES(%s,%s,%s,%s,%s,%s,%s,'financial') RETURNING *",
                (
                    eid,
                    company,
                    bank["record_revision_id"],
                    bank["id"],
                    bank["movement_on"],
                    "receipt" if bank["amount"] > 0 else "payment",
                    abs(bank["amount"]),
                ),
            ).fetchone()
            store.snapshot(conn, company, latest["id"])
            access.audit(
                company,
                str(actor["id"]),
                "settlement.created",
                "settlement_event",
                str(row["id"]),
                request_id,
            )
            return response(
                {
                    "id": str(row["id"]),
                    "bank_movement_id": str(bank["id"]),
                    "party_id": None,
                    "settled_on": str(row["settled_on"]),
                    "direction": row["direction"],
                    "amount": str(row["amount"]),
                    "allocated": "0",
                    "version": 1,
                },
                201,
                etag=1,
            )
        if op == "createAllocation":
            if str(latest["dataset_revision_id"]) != body["dataset_revision_id"]:
                raise conflict("stale_dataset")
            invoice = next(
                (i for i in work["invoices"] if i["invoice_id"] == body["invoice_id"]),
                None,
            )
            event = next(
                (e for e in work["events"] if e["id"] == body["settlement_event_id"]),
                None,
            )
            if invoice is None or event is None:
                raise missing()
            if "allocation_source_changed" in invoice["reason_codes"]:
                raise conflict("allocation_source_changed")
            # Baseline trigger additionally locks bank -> settlement -> invoice and
            # rejects direction, party and aggregate-capacity violations.
            row = conn.execute(
                "INSERT INTO app.allocations(company_id,settlement_event_id,invoice_id,dataset_revision_id,amount,provenance,actor_id,effect_key) VALUES(%s,%s,%s,%s,%s,'human',%s,%s) RETURNING *",
                (
                    company,
                    event["id"],
                    invoice["invoice_id"],
                    latest["dataset_revision_id"],
                    body["amount"],
                    actor["id"],
                    "human:" + str(actor["id"]) + ":" + key,
                ),
            ).fetchone()
            result = store.allocation_view({**row, "reversed": False})
            resource = str(row["id"])
            audit = "allocation.created"
        else:
            allocation = conn.execute(
                "SELECT a.*,EXISTS(SELECT 1 FROM app.allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id) AS reversed FROM app.allocations a WHERE a.company_id=%s AND a.id=%s",
                (company, ids["allocation_id"]),
            ).fetchone()
            if not allocation:
                raise missing()
            if allocation["reversed"] or expected != 1:
                raise conflict()
            reversal = conn.execute(
                "INSERT INTO app.allocation_reversals(company_id,allocation_id,actor_id,reason) VALUES(%s,%s,%s,%s) RETURNING *",
                (
                    company,
                    allocation["id"],
                    actor["id"],
                    body["reason"].strip(),
                ),
            ).fetchone()
            result = {
                k: reversal[k]
                for k in (
                    "id",
                    "allocation_id",
                    "actor_id",
                    "reason",
                    "created_at",
                )
            }
            resource = str(allocation["id"])
            audit = "allocation.reversed"
        store.snapshot(conn, company, latest["id"])
        access.audit(
            company,
            str(actor["id"]),
            audit,
            "allocation",
            resource,
            request_id,
        )
        return response(result, 201, etag=result.get("version", 2))
