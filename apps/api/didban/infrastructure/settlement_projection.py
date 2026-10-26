"""Idempotent materialization of pinned source invoices, events and plans."""

from collections import Counter
from decimal import Decimal
from psycopg.types.json import Jsonb
from ..domain.financial.common import decimal_text
from ..domain.settlements import exact_context, invoice_aging
from .reconciliation import pinned_rows, project_banks
from .settlement_records import identity, active_manifest, projection
from .settlement_snapshot import snapshot


@exact_context
def project(conn, company, manifest, raw=None):
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":settlement-projection",),
    )
    if projection(conn, company, manifest):
        return
    base = active_manifest(conn, company, manifest)
    if not base:
        raise ValueError("manifest_not_published")
    rows = pinned_rows(conn, company, manifest) if raw is None else raw
    movements = project_banks(conn, company, manifest, rows)
    invoices = []
    events = []
    plans = []
    party_map = {}
    counts = Counter(
        (r["kind"], r["values"].get("invoice_id"))
        for r in rows
        if r["kind"] in ("sales_invoices", "purchase_invoices")
        and r["state"] == "valid"
    )
    metrics = {
        r["metric_key"]: r
        for r in conn.execute(
            "SELECT * FROM app.metric_observations WHERE company_id=%s AND manifest_id=%s",
            (company, manifest),
        )
    }
    details = {}
    for metric in ("ar_invoice", "ap_invoice"):
        e = conn.execute(
            "SELECT e.calculation FROM app.evidence e JOIN app.metric_evidence me ON me.company_id=e.company_id AND me.evidence_id=e.id JOIN app.metric_observations m ON m.company_id=me.company_id AND m.id=me.metric_id WHERE e.company_id=%s AND e.manifest_id=%s AND m.metric_key=%s AND e.source_row_id IS NULL ORDER BY e.created_at,e.id LIMIT 1",
            (company, manifest, metric),
        ).fetchone()
        details[metric] = (
            (e["calculation"].get("details") or {}).get("invoice_balances", {})
            if e
            else {}
        )
    for r in rows:
        v = r["values"]
        if r["state"] != "valid" or v.get("unit") != "IRR":
            continue
        if (
            r["kind"] in ("sales_invoices", "purchase_invoices")
            and counts[(r["kind"], v.get("invoice_id"))] == 1
        ):
            direction = "sales" if r["kind"] == "sales_invoices" else "purchase"
            pid = identity(company, "party:" + v["party_id"])
            party_map[v["party_id"]] = pid
            conn.execute(
                "INSERT INTO app.parties(id,company_id,display_name) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING",
                (pid, company, v["party_id"]),
            )
            iid = identity(company, "invoice:" + str(r["record_revision_id"]))
            conn.execute(
                "INSERT INTO app.invoices(id,company_id,record_revision_id,party_id,direction,source_invoice_id,issued_on,due_on,gross,vat,tax_id,opening_snapshot) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (
                    iid,
                    company,
                    r["record_revision_id"],
                    pid,
                    direction,
                    v["invoice_id"],
                    v["issued_on"],
                    v.get("due_on"),
                    v["gross"],
                    v.get("vat"),
                    v.get("tax_id"),
                    v.get("record_role") == "opening_invoice",
                ),
            )
            metric = "ar_invoice" if direction == "sales" else "ap_invoice"
            m = metrics.get(metric, {})
            known = (
                details[metric].get(v["invoice_id"])
                if m.get("status") != "unavailable"
                else None
            )
            gross = Decimal(v["gross"])
            left = Decimal(known) if known is not None else None
            overdue_days, aging_reasons = invoice_aging(
                known, v.get("due_on"), base["as_of_date"]
            )
            invoices.append(
                {
                    "invoice_id": iid,
                    "party_id": pid,
                    "party_display_name": v["party_id"],
                    "source_invoice_id": v["invoice_id"],
                    "direction": direction,
                    "issued_on": v["issued_on"],
                    "due_on": v.get("due_on"),
                    "gross": v["gross"],
                    "settled_as_of": decimal_text(gross - left)
                    if left is not None
                    else None,
                    "remaining_as_of": known,
                    "status": m.get("status", "unavailable"),
                    "overdue_days": overdue_days,
                    "reason_codes": list(
                        dict.fromkeys(
                            m.get("reason_codes", ["source_missing"]) + aging_reasons
                        )
                    ),
                    "evidence_refs": [
                        str(e["evidence_id"])
                        for e in conn.execute(
                            "SELECT e.id AS evidence_id FROM app.evidence e JOIN app.metric_evidence me ON me.company_id=e.company_id AND me.evidence_id=e.id WHERE e.company_id=%s AND me.metric_id=%s AND (e.source_row_id IS NULL OR e.source_row_id=%s) ORDER BY e.created_at,e.id",
                            (company, m["id"], r["source_row_id"]),
                        )
                    ]
                    if m
                    else [],
                }
            )
    for r in rows:
        v = r["values"]
        if r["state"] != "valid" or v.get("unit") != "IRR":
            continue
        if r["kind"] == "settlements":
            matches = [
                i
                for i in invoices
                if i["source_invoice_id"] == v["invoice_id"]
                and i["direction"]
                == ("sales" if v["direction"] == "receipt" else "purchase")
            ]
            if len(matches) != 1:
                continue
            inv = matches[0]
            banks = (
                [
                    str(b["id"])
                    for b in conn.execute(
                        "SELECT id FROM app.bank_movements WHERE company_id=%s AND record_revision_id=ANY(%s::uuid[]) AND reference=%s AND movement_on=%s AND amount=%s",
                        (
                            company,
                            list(movements),
                            v.get("bank_reference"),
                            v["date"],
                            v["amount"]
                            if v["direction"] == "receipt"
                            else "-" + v["amount"],
                        ),
                    )
                ]
                if v.get("bank_reference")
                else []
            )
            eid = identity(company, "event:" + str(r["record_revision_id"]))
            conn.execute(
                "INSERT INTO app.settlement_events(id,company_id,record_revision_id,party_id,bank_movement_id,settled_on,direction,amount,event_role) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,'financial') ON CONFLICT DO NOTHING",
                (
                    eid,
                    company,
                    r["record_revision_id"],
                    inv["party_id"],
                    banks[0] if len(banks) == 1 else None,
                    v["date"],
                    v["direction"],
                    v["amount"],
                ),
            )
            event = {
                "id": eid,
                "source_invoice_id": v["invoice_id"],
                "invoice_id": inv["invoice_id"],
                "date": v["date"],
                "amount": v["amount"],
            }
            events.append(event)
            # The source already explicitly relates this dated event and invoice.
            allocated = conn.execute(
                "SELECT id FROM app.allocations WHERE company_id=%s AND effect_key=%s",
                (company, "import:" + str(r["record_revision_id"])),
            ).fetchone()
            if (
                not allocated
                and inv["remaining_as_of"] is not None
                and v["date"] <= str(base["as_of_date"])
            ):
                conn.execute(
                    "INSERT INTO app.allocations(company_id,settlement_event_id,invoice_id,dataset_revision_id,amount,provenance,effect_key) VALUES(%s,%s,%s,%s,%s,'validated_automatic',%s)",
                    (
                        company,
                        eid,
                        inv["invoice_id"],
                        base["dataset_revision_id"],
                        v["amount"],
                        "import:" + str(r["record_revision_id"]),
                    ),
                )
    auto_bank_allocations(conn, company, base, rows, movements, invoices)
    for r in rows:
        v = r["values"]
        if (
            r["kind"] != "planned_payments"
            or r["state"] != "valid"
            or v.get("unit") != "IRR"
        ):
            continue
        matches = [
            i
            for i in invoices
            if i["direction"] == "purchase"
            and i["source_invoice_id"] == v.get("invoice_id")
        ]
        inv = matches[0] if len(matches) == 1 else None
        oid = identity(
            company,
            "obligation:invoice:" + inv["invoice_id"]
            if inv
            else "obligation:source:" + str(r["file_id"]) + ":" + v["obligation_id"],
        )
        conn.execute(
            "INSERT INTO app.obligations(id,company_id,invoice_id,party_id,title) VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            (
                oid,
                company,
                inv["invoice_id"] if inv else None,
                inv["party_id"] if inv else None,
                v["obligation_id"],
            ),
        )
        plan = identity(company, "plan:" + str(r["record_revision_id"]))
        if v.get("confirmed") is True:
            conn.execute(
                "INSERT INTO app.planned_payment_versions(id,company_id,obligation_id,scheduled_on,total_amount,state,source_row_id,title_snapshot) VALUES(%s,%s,%s,%s,%s,'confirmed',%s,%s) ON CONFLICT DO NOTHING",
                (
                    plan,
                    company,
                    oid,
                    v["date"],
                    v["total_obligation"],
                    r["source_row_id"],
                    v["obligation_id"],
                ),
            )
            plans.append(plan)
    content = {
        "manifest_id": str(manifest),
        "dataset_revision_id": str(base["dataset_revision_id"]),
        "as_of_date": str(base["as_of_date"]),
        "invoices": invoices,
        "event_ids": [e["id"] for e in events],
        "bank_ids": list(movements.values()),
        "plan_ids": plans,
        "history": [
            {
                **r["values"],
                "party_id": party_map.get(
                    r["values"].get("party_id"),
                    identity(company, "party:" + r["values"].get("party_id", "")),
                ),
            }
            for r in rows
            if r["kind"] == "receipt_history"
            and r["state"] == "valid"
            and r["values"].get("role") == "calibration_only"
        ],
        "has_payment_source": any(r["kind"] == "planned_payments" for r in rows),
    }
    conn.execute(
        "INSERT INTO app.settlement_projections(company_id,manifest_id,content) VALUES(%s,%s,%s)",
        (company, manifest, Jsonb(content)),
    )
    from .settlement_recurrence import generate

    generate(conn, company, manifest)
    snapshot(conn, company, manifest)


@exact_context
def auto_bank_allocations(conn, company, base, rows, movements, invoices):
    candidates = []
    for row in rows:
        value = row["values"]
        movement = movements.get(str(row["record_revision_id"]))
        if (
            row["kind"] != "bank"
            or row["state"] != "valid"
            or not movement
            or not value.get("invoice_id")
            or not value.get("party_id")
            or not value.get("reference")
            or value["date"] > str(base["as_of_date"])
        ):
            continue
        direction = "sales" if Decimal(value["amount"]) > 0 else "purchase"
        matches = [
            i
            for i in invoices
            if i["source_invoice_id"] == value["invoice_id"]
            and i["party_id"] == identity(company, "party:" + value["party_id"])
            and i["direction"] == direction
            and i["issued_on"] <= value["date"]
            and i["remaining_as_of"] is not None
        ]
        if len(matches) == 1:
            candidates.append((row, movement, matches[0]))
    counts = Counter(i["invoice_id"] for _, _, i in candidates)
    for row, movement, invoice in candidates:
        if counts[invoice["invoice_id"]] != 1:
            continue
        # Multiple source events citing this bank movement need a decision; no second effect.
        if conn.execute(
            "SELECT 1 FROM app.settlement_events WHERE company_id=%s AND bank_movement_id=%s",
            (company, movement),
        ).fetchone():
            continue
        value = row["values"]
        amount = abs(Decimal(value["amount"]))
        used = conn.execute(
            "SELECT coalesce(sum(a.amount),0) AS total FROM app.allocations a JOIN app.settlement_events e ON e.company_id=a.company_id AND e.id=a.settlement_event_id WHERE a.company_id=%s AND a.invoice_id=%s AND e.settled_on<=%s AND NOT EXISTS(SELECT 1 FROM app.allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id)",
            (company, invoice["invoice_id"], base["as_of_date"]),
        ).fetchone()["total"]
        if Decimal(invoice["gross"]) - used != amount:
            continue
        eid = identity(company, "bank-event:" + str(row["record_revision_id"]))
        conn.execute(
            "INSERT INTO app.settlement_events(id,company_id,record_revision_id,party_id,bank_movement_id,settled_on,direction,amount,event_role) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,'financial') ON CONFLICT DO NOTHING",
            (
                eid,
                company,
                row["record_revision_id"],
                invoice["party_id"],
                movement,
                value["date"],
                "receipt" if invoice["direction"] == "sales" else "payment",
                amount,
            ),
        )
        allocation = conn.execute(
            "INSERT INTO app.allocations(company_id,settlement_event_id,invoice_id,dataset_revision_id,amount,provenance,effect_key) VALUES(%s,%s,%s,%s,%s,'validated_automatic',%s) ON CONFLICT DO NOTHING RETURNING id",
            (
                company,
                eid,
                invoice["invoice_id"],
                base["dataset_revision_id"],
                amount,
                "bank-proof:" + str(row["record_revision_id"]),
            ),
        ).fetchone()
        conn.execute(
            "INSERT INTO app.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,safe_details) VALUES(%s,app.current_actor(),'allocation.automatic','allocation',%s,gen_random_uuid(),%s)",
            (
                company,
                allocation["id"],
                Jsonb(
                    {
                        "rule": "explicit_invoice_party_unique_reference_exact_remaining_v1",
                        "source_row_id": str(row["source_row_id"]),
                    }
                ),
            ),
        )
