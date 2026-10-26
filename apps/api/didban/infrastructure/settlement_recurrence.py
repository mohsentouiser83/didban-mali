"""Conservative monthly-pattern proposals; never financial effects without a decision."""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from psycopg.types.json import Jsonb
from ..errors import ApiError, missing, conflict
from .settlement_records import identity


def generate(conn, company, manifest):
    movements = conn.execute(
        "SELECT b.*,a.name FROM app.bank_movements b JOIN app.bank_accounts a ON a.company_id=b.company_id AND a.id=b.bank_account_id JOIN app.revision_records rr ON rr.company_id=b.company_id AND rr.record_revision_id=b.record_revision_id JOIN app.result_manifests m ON m.company_id=rr.company_id AND m.dataset_revision_id=rr.dataset_revision_id WHERE b.company_id=%s AND m.id=%s AND b.movement_on<=m.as_of_date AND b.amount<0 ORDER BY movement_on,b.id",
        (company, manifest),
    ).fetchall()
    groups = defaultdict(list)
    for m in movements:
        if not m["reference"] or not m["description"].strip():
            continue
        groups[
            (
                str(m["bank_account_id"]),
                str(m["amount"]),
                m["reference"],
                m["description"],
            )
        ].append(m)
    for (account, amount, reference, description), rows in groups.items():
        if len(rows) < 3:
            continue
        last = rows[-3:]
        if any(
            not 25 <= (last[i + 1]["movement_on"] - last[i]["movement_on"]).days <= 35
            for i in range(2)
        ):
            continue
        suggested = last[-1]["movement_on"] + timedelta(days=30)
        pid = identity(
            company, "recurrence:" + account + ":" + reference + ":" + str(suggested)
        )
        evidence = [
            str(e["id"])
            for e in conn.execute(
                "SELECT e.id FROM app.evidence e JOIN app.source_rows sr ON sr.company_id=e.company_id AND sr.id=e.source_row_id JOIN app.record_revisions r ON r.company_id=sr.company_id AND r.source_row_id=sr.id WHERE e.company_id=%s AND e.manifest_id=%s AND r.id=ANY(%s::uuid[])",
                (company, manifest, [r["record_revision_id"] for r in last]),
            )
        ]
        conn.execute(
            "INSERT INTO app.recurrence_proposals(id,company_id,title,suggested_amount,suggested_on,evidence,state) VALUES(%s,%s,%s,%s,%s,%s,'proposed') ON CONFLICT DO NOTHING",
            (
                pid,
                company,
                description,
                abs(Decimal(amount)),
                suggested,
                Jsonb(
                    {
                        "manifest_id": str(manifest),
                        "evidence_refs": evidence,
                        "source_movement_ids": [str(r["id"]) for r in last],
                        "rule": "three_observed_monthly_payments_proposal_v1",
                    }
                ),
            ),
        )


def view(row):
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "suggested_on": str(row["suggested_on"]),
        "suggested_amount": str(row["suggested_amount"]),
        "state": row["state"],
        "evidence_refs": row["evidence"].get("evidence_refs", []),
        "version": row["row_version"],
    }


def decide(conn, company, actor, proposal, body, expected):
    row = conn.execute(
        "SELECT * FROM app.recurrence_proposals WHERE company_id=%s AND id=%s FOR UPDATE",
        (company, proposal),
    ).fetchone()
    if not row:
        raise missing()
    if row["row_version"] != expected or row["state"] != "proposed":
        raise conflict()
    obligation = None
    if body["action"] == "accept":
        overlap = conn.execute(
            "SELECT 1 FROM app.planned_payment_versions p WHERE p.company_id=%s AND p.scheduled_on=%s AND p.total_amount=%s AND p.state='confirmed' AND NOT EXISTS(SELECT 1 FROM app.planned_payment_versions n WHERE n.company_id=p.company_id AND n.supersedes_id=p.id)",
            (company, row["suggested_on"], row["suggested_amount"]),
        ).fetchone()
        if overlap:
            raise ApiError(
                409,
                "possible_obligation_overlap",
                "برنامه‌ای با همین تاریخ و مبلغ وجود دارد؛ هم‌پوشانی را بررسی کنید.",
            )
        obligation = conn.execute(
            "INSERT INTO app.obligations(company_id,title) VALUES(%s,%s) RETURNING id",
            (company, row["title"]),
        ).fetchone()["id"]
        conn.execute(
            "INSERT INTO app.planned_payment_versions(company_id,obligation_id,scheduled_on,total_amount,state,actor_id,title_snapshot) VALUES(%s,%s,%s,%s,'confirmed',%s,%s)",
            (
                company,
                obligation,
                row["suggested_on"],
                row["suggested_amount"],
                actor["id"],
                row["title"],
            ),
        )
    updated = conn.execute(
        "UPDATE app.recurrence_proposals SET state=%s,resulting_obligation_id=%s,decided_by=%s,row_version=row_version+1 WHERE company_id=%s AND id=%s RETURNING *",
        (
            "accepted" if body["action"] == "accept" else "rejected",
            obligation,
            actor["id"],
            company,
            proposal,
        ),
    ).fetchone()
    return view(updated)
