"""Company-scoped reads and stable financial source identities."""

from decimal import Decimal, localcontext
from uuid import UUID, uuid5
from ..domain.financial.common import decimal_text


def identity(company, text):
    return str(uuid5(UUID(str(company)), text))


def active_manifest(conn, company, manifest):
    return conn.execute(
        "SELECT m.*,d.session_id FROM app.result_manifests m JOIN app.dataset_revisions d ON d.company_id=m.company_id AND d.id=m.dataset_revision_id WHERE m.company_id=%s AND m.id=%s AND m.status='published'",
        (company, manifest),
    ).fetchone()


def projection(conn, company, manifest):
    row = conn.execute(
        "SELECT content FROM app.settlement_projections WHERE company_id=%s AND manifest_id=%s",
        (company, manifest),
    ).fetchone()
    return row["content"] if row else None


def allocation_view(row):
    return {
        k: str(row[k])
        if k in ("id", "settlement_event_id", "invoice_id", "amount")
        else row[k]
        for k in ("id", "settlement_event_id", "invoice_id", "amount")
    } | {"reversed": row["reversed"], "version": 2 if row["reversed"] else 1}


def plans(conn, company, cutoff):
    rows = conn.execute(
        "SELECT DISTINCT ON (p.obligation_id) p.*,o.invoice_id,o.party_id,o.title FROM app.planned_payment_versions p JOIN app.obligations o ON o.company_id=p.company_id AND o.id=p.obligation_id WHERE p.company_id=%s ORDER BY p.obligation_id,p.created_at DESC,p.id DESC",
        (company,),
    ).fetchall()
    output = []
    for row in rows:
        paid = (
            conn.execute(
                "SELECT coalesce(sum(a.amount),0) AS total FROM app.allocations a JOIN app.settlement_events e ON e.company_id=a.company_id AND e.id=a.settlement_event_id WHERE a.company_id=%s AND a.invoice_id=%s AND e.settled_on<=%s AND NOT EXISTS(SELECT 1 FROM app.allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id)",
                (company, row["invoice_id"], cutoff),
            ).fetchone()["total"]
            if row["invoice_id"]
            else conn.execute(
                "SELECT coalesce(sum(os.amount),0) AS total FROM app.obligation_settlements os JOIN app.settlement_events e ON e.company_id=os.company_id AND e.id=os.settlement_event_id WHERE os.company_id=%s AND os.obligation_id=%s AND e.settled_on<=%s",
                (company, row["obligation_id"], cutoff),
            ).fetchone()["total"]
        )
        with localcontext() as ctx:
            ctx.prec = 96
            left = max(Decimal(0), row["total_amount"] - paid)
        paid_unknown = False
        if row["source_row_id"]:
            source = conn.execute(
                "SELECT canonical_values FROM app.normalized_source_rows WHERE company_id=%s AND source_row_id=%s AND state='valid' LIMIT 1",
                (company, row["source_row_id"]),
            ).fetchone()
            paid_unknown = bool(
                source
                and Decimal(source["canonical_values"].get("paid_as_of", "0")) > paid
            )
        output.append(
            {
                "id": str(row["id"]),
                "obligation_id": str(row["obligation_id"]),
                "invoice_id": str(row["invoice_id"]) if row["invoice_id"] else None,
                "title": row["title_snapshot"] or row["title"],
                "scheduled_on": str(row["scheduled_on"]),
                "total_amount": str(row["total_amount"]),
                "remaining_amount": None if paid_unknown else decimal_text(left),
                "unit": "IRR",
                "as_of_date": str(cutoff),
                "state": row["state"],
                "version": row["row_version"],
            }
        )
    return output


def workspace(conn, company, manifest):
    row = conn.execute(
        "SELECT s.id,s.content FROM app.settlement_workspace_heads h JOIN app.settlement_balance_snapshots s ON s.company_id=h.company_id AND s.id=h.snapshot_id WHERE h.company_id=%s AND h.manifest_id=%s",
        (company, manifest),
    ).fetchone()
    return {"id": str(row["id"]), **row["content"]} if row else None
