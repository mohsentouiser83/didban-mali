"""Immutable operational balance snapshots after allocation commands."""

from datetime import date
from decimal import Decimal
from psycopg.types.json import Jsonb
from ..domain.financial.common import decimal_text, LIMIT
from ..domain.settlements import exact_context, invoice_aging
from .settlement_records import projection, allocation_view


@exact_context
def snapshot(conn, company, manifest):
    p = projection(conn, company, manifest)
    if p is None:
        raise ValueError("projection_not_ready")
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":settlement-workspace",),
    )
    head = conn.execute(
        "SELECT * FROM app.settlement_workspace_heads WHERE company_id=%s AND manifest_id=%s FOR UPDATE",
        (company, manifest),
    ).fetchone()
    version = head["version"] + 1 if head else 1
    invoice_ids = [i["invoice_id"] for i in p["invoices"]]
    event_rows = conn.execute(
        "SELECT e.*,coalesce((SELECT sum(a.amount) FROM app.allocations a WHERE a.company_id=e.company_id AND a.settlement_event_id=e.id AND NOT EXISTS(SELECT 1 FROM app.allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id)),0) AS allocated FROM app.settlement_events e WHERE e.company_id=%s AND (e.id=ANY(%s::uuid[]) OR e.bank_movement_id=ANY(%s::uuid[])) ORDER BY e.created_at,e.id",
        (company, p["event_ids"], p["bank_ids"]),
    ).fetchall()
    allocs = conn.execute(
        "SELECT a.*,EXISTS(SELECT 1 FROM app.allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id) AS reversed,e.settled_on FROM app.allocations a JOIN app.settlement_events e ON e.company_id=a.company_id AND e.id=a.settlement_event_id WHERE a.company_id=%s AND a.invoice_id=ANY(%s::uuid[]) ORDER BY a.created_at,a.id",
        (company, invoice_ids),
    ).fetchall()
    invoices = []
    for invoice in p["invoices"]:
        item = dict(invoice)
        changed = conn.execute(
            "SELECT 1 FROM app.invoices old JOIN app.allocations a ON a.company_id=old.company_id AND a.invoice_id=old.id WHERE old.company_id=%s AND old.source_invoice_id=%s AND old.party_id=%s AND old.direction=%s AND old.id<>%s AND NOT EXISTS(SELECT 1 FROM app.allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id) LIMIT 1",
            (
                company,
                item["source_invoice_id"],
                item["party_id"],
                item["direction"],
                item["invoice_id"],
            ),
        ).fetchone()
        if changed:
            item.update(
                remaining_as_of=None,
                settled_as_of=None,
                status="unavailable",
                reason_codes=["allocation_source_changed"],
            )
        if item["remaining_as_of"] is not None:
            paid = sum(
                (
                    a["amount"]
                    for a in allocs
                    if str(a["invoice_id"]) == item["invoice_id"]
                    and not a["reversed"]
                    and str(a["settled_on"]) <= p["as_of_date"]
                ),
                Decimal(0),
            )
            # Imported allocations replace, rather than add to, the imported paid total.
            item["settled_as_of"] = decimal_text(paid)
            item["remaining_as_of"] = decimal_text(Decimal(item["gross"]) - paid)
        item["overdue_days"], aging_reasons = invoice_aging(
            item["remaining_as_of"], item["due_on"], date.fromisoformat(p["as_of_date"])
        )
        item["reason_codes"] = list(
            dict.fromkeys(
                [code for code in item["reason_codes"] if code != "due_date_missing"]
                + aging_reasons
            )
        )
        invoices.append(item)
    data = {k: p[k] for k in ("manifest_id", "dataset_revision_id", "as_of_date")} | {
        "version": version,
        "invoices": invoices,
        "events": [
            {
                "id": str(e["id"]),
                "bank_movement_id": str(e["bank_movement_id"])
                if e["bank_movement_id"]
                else None,
                "party_id": str(e["party_id"]) if e["party_id"] else None,
                "settled_on": str(e["settled_on"]),
                "direction": e["direction"],
                "amount": str(e["amount"]),
                "allocated": str(e["allocated"]),
                "version": e["row_version"],
            }
            for e in event_rows
        ],
        "allocations": [allocation_view(a) for a in allocs],
        "bank_movements": [
            {
                "id": str(b["id"]),
                "date": str(b["movement_on"]),
                "amount": str(b["amount"]),
                "reference": b["reference"],
                "event_id": next(
                    (
                        str(e["id"])
                        for e in event_rows
                        if e["bank_movement_id"] == b["id"]
                    ),
                    None,
                ),
            }
            for b in conn.execute(
                "SELECT * FROM app.bank_movements WHERE company_id=%s AND id=ANY(%s::uuid[]) ORDER BY movement_on,id",
                (company, p["bank_ids"]),
            )
        ],
        "reason_codes": [],
    }
    base_metrics = {
        m["metric_key"]: m
        for m in conn.execute(
            "SELECT metric_key,value,status FROM app.metric_observations WHERE company_id=%s AND manifest_id=%s",
            (company, manifest),
        )
    }
    totals = {
        k: str(base_metrics[k]["value"])
        if k in base_metrics and base_metrics[k]["value"] is not None
        else None
        for k in ("ar_ledger", "ap_trade_ledger", "debt_total_ledger")
    }
    for direction, invoice_key, ledger_key, difference in (
        ("sales", "ar_invoice", "ar_ledger", "ar_difference"),
        ("purchase", "ap_invoice", "ap_trade_ledger", "ap_difference"),
    ):
        relevant = [i for i in invoices if i["direction"] == direction]
        totals[invoice_key] = (
            decimal_text(
                sum((Decimal(i["remaining_as_of"]) for i in relevant), Decimal(0))
            )
            if relevant and all(i["remaining_as_of"] is not None for i in relevant)
            else None
        )
        totals[difference] = (
            decimal_text(Decimal(totals[ledger_key]) - Decimal(totals[invoice_key]))
            if totals[ledger_key] is not None
            and totals[invoice_key] is not None
            and base_metrics.get(difference, {}).get("status") == "available"
            else None
        )
    for key, value in totals.items():
        if value is not None and abs(Decimal(value)) >= LIMIT:
            totals[key] = None
            data["reason_codes"].append("aggregate_out_of_range")
    data["totals"] = totals
    row = conn.execute(
        "INSERT INTO app.settlement_balance_snapshots(company_id,manifest_id,version,content) VALUES(%s,%s,%s,%s) RETURNING id",
        (company, manifest, version, Jsonb(data)),
    ).fetchone()
    conn.execute(
        "INSERT INTO app.settlement_workspace_heads(company_id,manifest_id,snapshot_id,version) VALUES(%s,%s,%s,%s) ON CONFLICT(company_id,manifest_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,version=excluded.version",
        (company, manifest, row["id"], version),
    )
    return str(row["id"])
