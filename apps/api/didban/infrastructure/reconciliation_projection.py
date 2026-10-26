"""Bounded bulk bank projection preserving stable record revisions and bindings."""

from decimal import Decimal
from psycopg.types.json import Jsonb


def chunks(rows, size=500):
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def project_bank_rows(conn, company, pinned, bindings):
    valid = [
        r
        for r in pinned
        if r["kind"] == "bank"
        and r["state"] == "valid"
        and not r["error_codes"]
        and bindings.get(str(r["file_id"]) + ":" + r["sheet"])
    ]
    if not valid:
        return {}
    revisions = [r["record_revision_id"] for r in valid]
    changed = {
        str(r["id"])
        for r in conn.execute(
            "SELECT newer.id FROM app.record_revisions newer WHERE newer.company_id=%s AND newer.id=ANY(%s::uuid[]) AND EXISTS(SELECT 1 FROM app.record_revisions old WHERE old.company_id=newer.company_id AND old.logical_record_id=newer.logical_record_id AND old.id<>newer.id AND (EXISTS(SELECT 1 FROM app.reconciliation_claims claim WHERE claim.company_id=old.company_id AND claim.normalized_row_id=old.normalized_row_id) OR EXISTS(SELECT 1 FROM app.bank_movements b JOIN app.settlement_events e ON e.company_id=b.company_id AND e.bank_movement_id=b.id JOIN app.allocations a ON a.company_id=e.company_id AND a.settlement_event_id=e.id WHERE b.company_id=old.company_id AND b.record_revision_id=old.id AND NOT EXISTS(SELECT 1 FROM app.allocation_reversals reversal WHERE reversal.company_id=a.company_id AND reversal.allocation_id=a.id))))",
            (company, revisions),
        )
    }
    existing = {
        str(r["record_revision_id"]): r
        for r in conn.execute(
            "SELECT b.id,b.record_revision_id,a.source_identity FROM app.bank_movements b JOIN app.bank_accounts a ON a.company_id=b.company_id AND a.id=b.bank_account_id WHERE b.company_id=%s AND b.record_revision_id=ANY(%s::uuid[])",
            (company, revisions),
        )
    }
    valid = [
        row
        for row in valid
        if str(row["record_revision_id"]) not in changed
        and (
            str(row["record_revision_id"]) not in existing
            or existing[str(row["record_revision_id"])]["source_identity"]
            == "declared:" + bindings[str(row["file_id"]) + ":" + row["sheet"]]
        )
    ]
    # Account writes scale with declared groups, never with the number of rows.
    accounts = {}
    required_bindings = {
        bindings[str(row["file_id"]) + ":" + row["sheet"]] for row in valid
    }
    for binding in sorted(required_bindings):
        accounts[binding] = conn.execute(
            "INSERT INTO app.bank_accounts(company_id,name,source_identity) VALUES(%s,%s,%s) ON CONFLICT(company_id,source_identity) DO UPDATE SET source_identity=excluded.source_identity RETURNING id",
            (company, binding, "declared:" + binding),
        ).fetchone()["id"]
    pending = []
    result = {}
    for row in valid:
        revision = str(row["record_revision_id"])
        binding = bindings[str(row["file_id"]) + ":" + row["sheet"]]
        old = existing.get(revision)
        if revision in changed or (
            old and old["source_identity"] != "declared:" + binding
        ):
            continue
        value = row["values"]
        if value.get("row_type") == "opening" or Decimal(value.get("amount", "0")) == 0:
            continue
        if old:
            result[revision] = str(old["id"])
            continue
        pending.append(
            {
                "record_revision_id": revision,
                "bank_account_id": str(accounts[binding]),
                "movement_on": value["date"],
                "amount": value["amount"],
                "reference": value.get("reference"),
                "description": value.get("description", ""),
            }
        )
    for batch in chunks(pending):
        conn.execute(
            "INSERT INTO app.bank_movements(company_id,bank_account_id,record_revision_id,movement_on,amount,reference,description) SELECT %s,v.bank_account_id,v.record_revision_id,v.movement_on,v.amount,v.reference,v.description FROM jsonb_to_recordset(%s) AS v(bank_account_id uuid,record_revision_id uuid,movement_on date,amount app.money_irr,reference text,description text) ON CONFLICT(company_id,record_revision_id) DO NOTHING",
            (company, Jsonb(batch)),
        )
    if pending:
        # Concurrent idempotent projection may win an insert; read authoritative IDs.
        created = conn.execute(
            "SELECT b.id,b.record_revision_id,a.source_identity FROM app.bank_movements b JOIN app.bank_accounts a ON a.company_id=b.company_id AND a.id=b.bank_account_id WHERE b.company_id=%s AND b.record_revision_id=ANY(%s::uuid[])",
            (company, [r["record_revision_id"] for r in pending]),
        ).fetchall()
        expected = {r["record_revision_id"]: r["bank_account_id"] for r in pending}
        binding_by_account = {str(v): "declared:" + k for k, v in accounts.items()}
        for row in created:
            revision = str(row["record_revision_id"])
            if row["source_identity"] == binding_by_account[expected[revision]]:
                result[revision] = str(row["id"])
    return result
