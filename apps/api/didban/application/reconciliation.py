"""Company-scoped pinned comparisons with audited versioned review decisions."""

from __future__ import annotations
from ..infrastructure.reconciliation import (
    ensure_runs,
    lock_manifest_session,
    record_decision,
)
from ..errors import missing
from .auth import response

KINDS = {"bank_ledger", "moadian_sales", "moadian_purchases"}


def run_view(conn, company, row):
    count = conn.execute(
        "SELECT count(*) AS n FROM app.reconciliation_candidates WHERE company_id=%s AND run_id=%s",
        (company, row["id"]),
    ).fetchone()["n"]
    return {
        k: row[k]
        for k in (
            "id",
            "manifest_id",
            "kind",
            "policy_id",
            "missing_source_kinds",
            "status",
            "created_at",
        )
    } | {"candidate_count": count}


def decision_view(row):
    return {k: row[k] for k in ("id", "action", "actor_id", "created_at")}


def candidate_view(conn, company, row):
    decision = (
        conn.execute(
            "SELECT * FROM app.decisions WHERE company_id=%s AND id=%s",
            (company, row["latest_decision_id"]),
        ).fetchone()
        if row["latest_decision_id"]
        else None
    )
    return {
        k: row[k] for k in ("id", "classification", "bank_movement_id", "invoice_id")
    } | {
        "evidence_refs": [],
        "version": row["row_version"],
        **{
            k: row["evidence"][k]
            for k in ("source_refs", "reason_codes", "difference", "reference_chain")
        },
        "decision": decision_view(decision) if decision else None,
        "provenance": decision["provenance"] if decision else "unresolved",
        "source_decision_id": decision["source_decision_id"]
        if decision
        else row["evidence"].get("prior_decision_id"),
    }


class ReconciliationService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            mutating = op in ("startReconciliation", "decideReconciliation")
            access = self.intake.authorize(conn, actor, company, mutating)
            if op == "startReconciliation":

                def action():
                    run = ensure_runs(
                        conn, company, ids["manifest_id"], actor["id"], body["kind"]
                    )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "reconciliation.started",
                        "reconciliation_run",
                        str(run["id"]),
                        request_id,
                    )
                    return response(run_view(conn, company, run), 201)

                return self.intake.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route=op + ":" + ids["manifest_id"],
                    key=key,
                    payload=body,
                    action=action,
                )
            if op == "listReconciliations":
                manifest = conn.execute(
                    "SELECT id FROM app.result_manifests WHERE company_id=%s AND id=%s AND status='published'",
                    (company, ids["manifest_id"]),
                ).fetchone()
                if not manifest:
                    raise missing()
                resource = "reconciliation-runs:" + ids["manifest_id"]
                position = self.intake.security.read_cursor(
                    cursor, resource, str(actor["id"]), company
                )
                rows = conn.execute(
                    "SELECT * FROM app.reconciliation_runs WHERE company_id=%s AND manifest_id=%s AND (%s::timestamptz IS NULL OR (created_at,id)>(%s::timestamptz,%s::uuid)) ORDER BY created_at,id LIMIT %s",
                    (
                        company,
                        ids["manifest_id"],
                        position[0] if position else None,
                        position[0] if position else None,
                        position[1] if position else None,
                        limit + 1,
                    ),
                ).fetchall()
                return response(
                    {
                        "items": [run_view(conn, company, r) for r in rows[:limit]],
                        "next_cursor": self.intake.security.cursor(
                            resource, str(actor["id"]), company, rows[limit - 1]
                        )
                        if len(rows) > limit
                        else None,
                    }
                )
            if op == "decideReconciliation":

                def action():
                    row = conn.execute(
                        "SELECT c.*,r.manifest_id FROM app.reconciliation_candidates c JOIN app.reconciliation_runs r ON r.company_id=c.company_id AND r.id=c.run_id WHERE c.company_id=%s AND c.id=%s",
                        (company, ids["candidate_id"]),
                    ).fetchone()
                    if not row:
                        raise missing()
                    lock_manifest_session(conn, company, row["manifest_id"])
                    conn.execute(
                        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                        (str(company) + ":comparison-capacity:" + str(row["run_id"]),),
                    )
                    row = conn.execute(
                        "SELECT * FROM app.reconciliation_candidates WHERE company_id=%s AND id=%s FOR UPDATE",
                        (company, row["id"]),
                    ).fetchone()
                    self.intake._version(
                        {"session_version": row["row_version"]}, expected
                    )
                    decision = record_decision(
                        conn,
                        company,
                        row["id"],
                        body["action"],
                        actor["id"],
                        body["reason"].strip(),
                    )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "reconciliation.decided",
                        "reconciliation_candidate",
                        str(row["id"]),
                        request_id,
                    )
                    return response(
                        decision_view(decision), 201, etag=row["row_version"] + 1
                    )

                return self.intake.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route=op + ":" + ids["candidate_id"],
                    key=key,
                    payload={"body": body, "version": expected},
                    action=action,
                )
            run = conn.execute(
                "SELECT * FROM app.reconciliation_runs WHERE company_id=%s AND id=%s",
                (company, ids["run_id"]),
            ).fetchone()
            if not run:
                raise missing()
            if op == "getReconciliation":
                return response(run_view(conn, company, run))
            resource = "comparison-candidates:" + ids["run_id"]
            position = self.intake.security.read_cursor(
                cursor, resource, str(actor["id"]), company
            )
            rows = conn.execute(
                "SELECT * FROM app.reconciliation_candidates WHERE company_id=%s AND run_id=%s AND (%s::timestamptz IS NULL OR (created_at,id)>(%s::timestamptz,%s::uuid)) ORDER BY created_at,id LIMIT %s",
                (
                    company,
                    run["id"],
                    position[0] if position else None,
                    position[0] if position else None,
                    position[1] if position else None,
                    limit + 1,
                ),
            ).fetchall()
            return response(
                {
                    "items": [candidate_view(conn, company, r) for r in rows[:limit]],
                    "next_cursor": self.intake.security.cursor(
                        resource, str(actor["id"]), company, rows[limit - 1]
                    )
                    if len(rows) > limit
                    else None,
                }
            )
