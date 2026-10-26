"""Company-scoped financial commands and immutable result presenters."""

from ..errors import missing, conflict
from ..infrastructure.financial import schedule
from ..infrastructure.intake import IntakeRepository
from .auth import response

MISSING_MODULES = ["reconciliation", "settlements", "moadian", "forecast", "reports"]


def manifest_view(conn, company, row):
    kinds = {
        r["source_kind"]
        for r in conn.execute(
            "SELECT DISTINCT n.source_kind FROM app.revision_records rr JOIN app.record_revisions r ON r.company_id=rr.company_id AND r.id=rr.record_revision_id JOIN app.normalized_source_rows n ON n.company_id=r.company_id AND n.id=r.normalized_row_id WHERE rr.company_id=%s AND rr.dataset_revision_id=%s",
            (company, row["dataset_revision_id"]),
        )
    }
    return {
        k: row[k]
        for k in (
            "id",
            "company_id",
            "dataset_revision_id",
            "manifest_hash",
            "period_id",
            "as_of_date",
            "financial_policy_id",
            "forecast_policy_id",
            "published_at",
        )
    } | {
        "report_scope": "limited",
        "scope_key": "core_financial_v1",
        "missing_modules": MISSING_MODULES,
        "missing_source_kinds": sorted(
            set(
                ("ledger", "bank", "sales_invoices", "purchase_invoices", "settlements")
            )
            - kinds
        ),
    }


class FinancialService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(
                conn, actor, company, op == "startFinancialCalculation"
            )
            if op == "startFinancialCalculation":
                repo = IntakeRepository(conn)
                session = repo.session(company, ids["session_id"], True)
                if not session:
                    raise missing()

                def action():
                    self.intake._version(session, expected)
                    if (
                        not session["period_id"]
                        or not session["interpretation_finished_at"]
                        or session["status"] != "waiting_dependency"
                        or session["manifest_id"]
                    ):
                        raise conflict("financial_not_ready")
                    schedule(conn, company, session["id"])
                    updated = conn.execute(
                        "UPDATE app.processing_sessions SET status='sealed',session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING session_version",
                        (company, session["id"]),
                    ).fetchone()
                    result = self.intake._operation(
                        conn,
                        actor,
                        company,
                        session["id"],
                        "start_financial",
                        request_id,
                        access,
                    )
                    result["etag"] = updated["session_version"]
                    return result

                return self.intake.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route=op + ":" + ids["session_id"],
                    key=key,
                    payload={"version": expected},
                    action=action,
                )
            if op == "getEvidence":
                row = conn.execute(
                    "SELECT e.*,r.row_number,i.source_file_id,i.sheet_name FROM app.evidence e JOIN app.result_manifests m ON m.company_id=e.company_id AND m.id=e.manifest_id LEFT JOIN app.source_rows r ON r.company_id=e.company_id AND r.id=e.source_row_id LEFT JOIN app.interpretation_versions i ON i.company_id=r.company_id AND i.id=r.interpretation_id WHERE e.company_id=%s AND e.id=%s AND m.status='published'",
                    (company, ids["evidence_id"]),
                ).fetchone()
                if not row:
                    raise missing()
                return response(
                    {
                        k: row[k]
                        for k in (
                            "id",
                            "manifest_id",
                            "source_file_id",
                            "sheet_name",
                            "row_number",
                            "rule_key",
                        )
                    }
                    | {
                        "description_fa": row["calculation"]["description_fa"],
                        "fact_values": row["calculation"]["fact_values"],
                    }
                )
            if op == "listResultManifests":
                resource = "results"
                position = self.intake.security.read_cursor(
                    cursor, resource, str(actor["id"]), company
                )
                rows = conn.execute(
                    "SELECT * FROM app.result_manifests WHERE company_id=%s AND status='published' AND (%s::timestamptz IS NULL OR (created_at,id)>(%s::timestamptz,%s::uuid)) ORDER BY created_at,id LIMIT %s",
                    (
                        company,
                        position[0] if position else None,
                        position[0] if position else None,
                        position[1] if position else None,
                        limit + 1,
                    ),
                ).fetchall()
                return response(
                    {
                        "items": [
                            manifest_view(conn, company, r) for r in rows[:limit]
                        ],
                        "next_cursor": self.intake.security.cursor(
                            resource, str(actor["id"]), company, rows[limit - 1]
                        )
                        if len(rows) > limit
                        else None,
                    }
                )
            manifest = conn.execute(
                "SELECT * FROM app.result_manifests WHERE company_id=%s AND id=%s AND status='published'",
                (company, ids["manifest_id"]),
            ).fetchone()
            if not manifest:
                raise missing()
            if op == "getResultManifest":
                return response(manifest_view(conn, company, manifest))
            resource = "metrics:" + ids["manifest_id"]
            position = self.intake.security.read_cursor(
                cursor, resource, str(actor["id"]), company
            )
            rows = conn.execute(
                "SELECT * FROM app.metric_observations WHERE company_id=%s AND manifest_id=%s AND (%s::timestamptz IS NULL OR (created_at,id)>(%s::timestamptz,%s::uuid)) ORDER BY created_at,id LIMIT %s",
                (
                    company,
                    ids["manifest_id"],
                    position[0] if position else None,
                    position[0] if position else None,
                    position[1] if position else None,
                    limit + 1,
                ),
            ).fetchall()
            items = []
            for row in rows[:limit]:
                coverage = [
                    {
                        **{
                            k: c.get(k)
                            for k in ("provenance", "scope_key", "starts_on", "ends_on")
                        },
                        "state": "declared_complete"
                        if c["state"] == "complete"
                        else c["state"],
                    }
                    for c in row["coverage"]
                ]
                items.append(
                    {
                        k: row[k]
                        for k in (
                            "id",
                            "manifest_id",
                            "metric_key",
                            "basis",
                            "status",
                            "reason_codes",
                            "comparison",
                            "formula_version",
                        )
                    }
                    | {
                        "value": str(row["value"])
                        if row["value"] is not None
                        else None,
                        "unit": "IRR",
                        "period_id": manifest["period_id"],
                        "as_of_date": manifest["as_of_date"],
                        "scope": {
                            "company_id": company,
                            "scope_key": row["scope_key"],
                            "party_ids": [],
                            "account_ids": [],
                        },
                        "coverage": coverage,
                        "evidence_refs": [
                            r["evidence_id"]
                            for r in conn.execute(
                                "SELECT evidence_id FROM app.metric_evidence WHERE company_id=%s AND metric_id=%s ORDER BY created_at,id",
                                (company, row["id"]),
                            )
                        ],
                    }
                )
            return response(
                {
                    "items": items,
                    "next_cursor": self.intake.security.cursor(
                        resource, str(actor["id"]), company, rows[limit - 1]
                    )
                    if len(rows) > limit
                    else None,
                }
            )
