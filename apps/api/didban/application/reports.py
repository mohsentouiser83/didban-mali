"""Current company authorization, immutable report approval, and private downloads."""

from __future__ import annotations
import hashlib
from psycopg.types.json import Jsonb
from ..errors import ApiError, missing, forbidden, conflict
from ..infrastructure import reports as store
from ..adapters.report_rendering import MIME
from .auth import response


def export_view(row):
    return {
        k: row[k]
        for k in (
            "id",
            "manifest_id",
            "report_id",
            "format",
            "status",
            "sha256",
            "created_at",
            "error_code",
            "byte_size",
        )
    }


def report_view(conn, company, row):
    content = row["content"]
    manifest = content.get("manifest", {})
    exports = conn.execute(
        "SELECT * FROM app.export_jobs WHERE company_id=%s AND report_id=%s ORDER BY format",
        (company, row["id"]),
    ).fetchall()
    approvals = conn.execute(
        "SELECT id FROM app.report_approvals WHERE company_id=%s AND report_id=%s ORDER BY created_at,id",
        (company, row["id"]),
    ).fetchall()
    forecast = (content.get("forecast") or {}).get("content") or {}
    days = forecast.get("days") or []
    return {
        k: row[k]
        for k in (
            "id",
            "manifest_id",
            "label",
            "content_hash",
            "created_at",
            "revision_number",
            "scope_status",
        )
    } | {
        "version": row["row_version"],
        "approval_ids": [r["id"] for r in approvals],
        "exports": [export_view(r) for r in exports],
        "company_name": manifest.get("company_name"),
        "period_name": manifest.get("period_name"),
        "as_of_date": manifest.get("as_of_date"),
        "metrics": [
            {
                k: m[k]
                for k in ("metric_key", "basis", "status", "value", "reason_codes")
            }
            for m in content.get("metrics", [])
        ],
        "source_count": len(content.get("sources", [])),
        "candidate_count": len(content.get("candidates", [])),
        "forecast_closing": days[-1]["closing"] if days else None,
        "pinned_versions": {
            "dataset_revision_id": manifest.get("dataset_revision_id"),
            "forecast_run_id": (content.get("forecast") or {}).get("id"),
            "settlement_snapshot_id": (content.get("settlement") or {}).get("id"),
            "cashflow_snapshot_id": (content.get("cashflow") or {}).get("id"),
            "reconciliation_run_ids": [
                r["id"] for r in content.get("reconciliation_runs", [])
            ],
            "decision_ids": [r["id"] for r in content.get("decisions", [])],
        },
    }


class ReportService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(
                conn, actor, company, op in ("generateReport", "retryExport")
            )
            if op == "listReports":
                position = self.intake.security.read_cursor(
                    cursor, "reports", str(actor["id"]), company
                )
                rows = conn.execute(
                    "SELECT r.* FROM app.report_snapshots r JOIN app.result_manifests m ON m.company_id=r.company_id AND m.id=r.manifest_id WHERE r.company_id=%s AND m.status='published' AND (%s::timestamptz IS NULL OR (r.created_at,r.id)>(%s::timestamptz,%s::uuid)) ORDER BY r.created_at,r.id LIMIT %s",
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
                        "items": [report_view(conn, company, r) for r in rows[:limit]],
                        "next_cursor": self.intake.security.cursor(
                            "reports", str(actor["id"]), company, rows[limit - 1]
                        )
                        if len(rows) > limit
                        else None,
                    }
                )
            if op == "generateReport":
                session = conn.execute(
                    "SELECT s.* FROM app.processing_sessions s WHERE s.company_id=%s AND s.manifest_id=%s AND s.analysis_finished_at IS NOT NULL ORDER BY s.analysis_finished_at DESC,s.id DESC LIMIT 1 FOR UPDATE",
                    (company, ids["manifest_id"]),
                ).fetchone()
                if not session:
                    raise conflict("analysis_not_ready")
                if (
                    session["status"] in ("cancelled", "failed")
                    or conn.execute(
                        "SELECT 1 FROM app.processing_issues WHERE company_id=%s AND session_id=%s AND required AND resolved_at IS NULL AND superseded_at IS NULL",
                        (company, session["id"]),
                    ).fetchone()
                ):
                    raise conflict("processing_question_pending")

                def generate():
                    report = store.ensure_report(
                        conn,
                        company,
                        ids["manifest_id"],
                        str(actor["id"]),
                        session["analysis_context"].get("forecast_run_id"),
                        processing_session_id=session["id"],
                    )
                    if (
                        session["status"]
                        not in ("completed", "completed_limited", "cancelled", "failed")
                        and str(report["generation_session_id"]) == str(session["id"])
                        and session["analysis_context"].get("report_id")
                        != str(report["id"])
                    ):
                        conn.execute(
                            "UPDATE app.processing_sessions SET analysis_context=%s,session_version=session_version+1 WHERE company_id=%s AND id=%s",
                            (
                                Jsonb(
                                    session["analysis_context"]
                                    | {"report_id": str(report["id"])}
                                ),
                                company,
                                session["id"],
                            ),
                        )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "report.generated",
                        "report",
                        str(report["id"]),
                        request_id,
                        {"content_hash": report["content_hash"]},
                    )
                    return response(
                        report_view(conn, company, report),
                        201,
                        etag=report["row_version"],
                    )

                return self.intake.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route=op + ":" + ids["manifest_id"],
                    key=key,
                    payload=body,
                    action=generate,
                )
            if op in ("getReport", "approveReport"):
                row = conn.execute(
                    "SELECT r.* FROM app.report_snapshots r JOIN app.result_manifests m ON m.company_id=r.company_id AND m.id=r.manifest_id WHERE r.company_id=%s AND r.id=%s AND m.status='published'",
                    (company, ids["report_id"]),
                ).fetchone()
                if not row:
                    raise missing()
                if op == "getReport":
                    return response(
                        report_view(conn, company, row), etag=row["row_version"]
                    )
                if not conn.execute(
                    "SELECT app.can_approve(%s) AS allowed", (company,)
                ).fetchone()["allowed"]:
                    raise forbidden()

                def approve():
                    self.intake._version(
                        {"session_version": row["row_version"]}, expected
                    )
                    previous = conn.execute(
                        "SELECT * FROM app.report_approvals WHERE company_id=%s AND report_id=%s AND actor_id=%s",
                        (company, row["id"], actor["id"]),
                    ).fetchone()
                    approved = previous or access.approve(
                        company, str(row["id"]), str(actor["id"])
                    )
                    if not previous:
                        access.audit(
                            company,
                            str(actor["id"]),
                            "report.approved",
                            "report",
                            str(row["id"]),
                            request_id,
                            {
                                "content_hash": row["content_hash"],
                                "report_version": row["row_version"],
                            },
                        )
                    return response(
                        {
                            k: approved[k]
                            for k in (
                                "id",
                                "report_id",
                                "actor_id",
                                "created_at",
                                "authority",
                            )
                        },
                        201,
                    )

                return self.intake.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route=op + ":" + ids["report_id"],
                    key=key,
                    payload={"body": body, "version": expected},
                    action=approve,
                )
            if op == "createExport":
                row = conn.execute(
                    "SELECT e.* FROM app.export_jobs e JOIN app.report_snapshots r ON r.company_id=e.company_id AND r.id=e.report_id JOIN app.result_manifests m ON m.company_id=r.company_id AND m.id=r.manifest_id WHERE m.status='published' AND e.company_id=%s AND e.manifest_id=%s AND e.format=%s AND (%s::uuid IS NULL OR e.report_id=%s::uuid) ORDER BY r.created_at DESC,r.id DESC LIMIT 1",
                    (
                        company,
                        body["manifest_id"],
                        body["format"],
                        body.get("report_id"),
                        body.get("report_id"),
                    ),
                ).fetchone()
                if not row:
                    raise ApiError(
                        503, "report_pending", "گزارش هنوز آماده تولید خروجی نیست."
                    )
                return response(export_view(row), 202)
            row = conn.execute(
                "SELECT e.* FROM app.export_jobs e JOIN app.result_manifests m ON m.company_id=e.company_id AND m.id=e.manifest_id JOIN app.report_snapshots r ON r.company_id=e.company_id AND r.id=e.report_id WHERE e.company_id=%s AND e.id=%s AND m.status='published'",
                (company, ids["export_id"]),
            ).fetchone()
            if not row:
                raise missing()
            if op == "getExport":
                return response(export_view(row))
            if op == "retryExport":

                def retry():
                    current = conn.execute(
                        "SELECT * FROM app.export_jobs WHERE company_id=%s AND id=%s FOR UPDATE",
                        (company, row["id"]),
                    ).fetchone()
                    if not current:
                        raise missing()
                    if current["status"] == "ready":
                        raise conflict("export_already_ready")
                    if (
                        current["status"] == "running"
                        and conn.execute(
                            "SELECT %s::timestamptz>clock_timestamp() AS active",
                            (current["lease_expires_at"],),
                        ).fetchone()["active"]
                    ):
                        raise conflict("export_lease_active")
                    updated = conn.execute(
                        "UPDATE app.export_jobs SET status='pending',generation_actor_id=%s,error_code=NULL,lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE company_id=%s AND id=%s RETURNING *",
                        (actor["id"], company, row["id"]),
                    ).fetchone()
                    access.audit(
                        company,
                        str(actor["id"]),
                        "export.retried",
                        "export",
                        str(row["id"]),
                        request_id,
                        {
                            "before_actor": str(
                                current["generation_actor_id"]
                                or current["requested_by"]
                            ),
                            "after_actor": str(actor["id"]),
                        },
                    )
                    return response(export_view(updated), 202)

                return self.intake.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route=op + ":" + ids["export_id"],
                    key=key,
                    payload={},
                    action=retry,
                )
            if op != "downloadExport":
                raise missing()
            if row["status"] != "ready":
                raise ApiError(409, "export_not_ready", "خروجی هنوز آماده نیست.")
            try:
                path = self.intake.storage.path(row["object_key"])
                if (
                    path.stat().st_size != row["byte_size"]
                    or path.stat().st_size > 100_000_000
                ):
                    raise OSError()
                data = path.read_bytes()
                if hashlib.sha256(data).hexdigest() != row["sha256"]:
                    raise OSError()
            except (OSError, ValueError):
                raise ApiError(
                    503, "export_storage_unavailable", "فایل خروجی در دسترس نیست."
                ) from None
            extension = "csv" if row["format"] == "error_csv" else row["format"]
            return response({}) | {
                "content_bytes": data,
                "media_type": MIME[row["format"]],
                "filename": f"didban-{row['id']}.{extension}",
            }
