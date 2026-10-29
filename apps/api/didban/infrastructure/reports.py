"""Capture report editions without mutating any financial or historical snapshot."""

from __future__ import annotations
from psycopg.types.json import Jsonb
from ..domain.reports import digest, is_limited, EXPORT_LAYOUT_VERSION
from ..security import json_value
from ..errors import missing, conflict
from .company_modules import module_settings

FORMATS = ("pdf", "xlsx", "error_csv")


def capture(conn, company, manifest_id, forecast_run_id=None):
    manifest = conn.execute(
        "SELECT m.*,c.name AS company_name,c.display_unit,p.name AS period_name,p.starts_on,p.ends_on,d.session_id FROM app.result_manifests m JOIN app.companies c ON c.id=m.company_id JOIN app.financial_periods p ON p.company_id=m.company_id AND p.id=m.period_id JOIN app.dataset_revisions d ON d.company_id=m.company_id AND d.id=m.dataset_revision_id WHERE m.company_id=%s AND m.id=%s AND m.status='published'",
        (company, manifest_id),
    ).fetchone()
    if not manifest:
        raise missing()
    metrics = conn.execute(
        "SELECT * FROM app.metric_observations WHERE company_id=%s AND manifest_id=%s ORDER BY metric_key,basis,scope_key",
        (company, manifest_id),
    ).fetchall()
    runs = conn.execute(
        "SELECT * FROM app.reconciliation_runs WHERE company_id=%s AND manifest_id=%s ORDER BY kind,id FOR SHARE",
        (company, manifest_id),
    ).fetchall()
    candidates = conn.execute(
        "SELECT c.*,r.kind FROM app.reconciliation_candidates c JOIN app.reconciliation_runs r ON r.company_id=c.company_id AND r.id=c.run_id WHERE r.company_id=%s AND r.manifest_id=%s ORDER BY r.kind,c.id FOR SHARE OF c",
        (company, manifest_id),
    ).fetchall()
    decisions = conn.execute(
        "SELECT d.* FROM app.decisions d JOIN app.reconciliation_candidates c ON c.company_id=d.company_id AND c.latest_decision_id=d.id JOIN app.reconciliation_runs r ON r.company_id=c.company_id AND r.id=c.run_id WHERE r.company_id=%s AND r.manifest_id=%s ORDER BY d.id",
        (company, manifest_id),
    ).fetchall()
    cashflow = conn.execute(
        "SELECT * FROM app.cashflow_period_snapshots WHERE company_id=%s AND manifest_id=%s",
        (company, manifest_id),
    ).fetchone()
    settlement = conn.execute(
        "SELECT s.* FROM app.settlement_balance_snapshots s JOIN app.settlement_workspace_heads h ON h.company_id=s.company_id AND h.snapshot_id=s.id WHERE h.company_id=%s AND h.manifest_id=%s",
        (company, manifest_id),
    ).fetchone()
    forecast = conn.execute(
        "SELECT * FROM app.forecast_runs WHERE company_id=%s AND manifest_id=%s AND status='published' AND (%s::uuid IS NULL OR id=%s::uuid) ORDER BY created_at DESC,id DESC LIMIT 1",
        (company, manifest_id, forecast_run_id, forecast_run_id),
    ).fetchone()
    if forecast_run_id and not forecast:
        raise conflict("forecast_not_ready")
    sources = conn.execute(
        "SELECT f.id,f.original_name,f.sha256 FROM app.manifest_dependencies md JOIN app.source_files f ON f.company_id=md.company_id AND f.id=md.source_file_id WHERE md.company_id=%s AND md.manifest_id=%s ORDER BY f.id",
        (company, manifest_id),
    ).fetchall()
    rows = conn.execute(
        "SELECT n.id,n.source_row_id,r.interpretation_id,n.source_kind,n.canonical_values,n.state,n.error_codes,r.row_number,r.raw_values,i.source_file_id,i.sheet_name FROM app.dataset_file_selections ds JOIN app.normalized_source_rows n ON n.company_id=ds.company_id AND n.run_id=ds.interpretation_run_id JOIN app.source_rows r ON r.company_id=n.company_id AND r.id=n.source_row_id JOIN app.interpretation_versions i ON i.company_id=r.company_id AND i.id=r.interpretation_id WHERE ds.company_id=%s AND ds.dataset_revision_id=%s ORDER BY i.source_file_id,i.sheet_name,r.row_number,n.id",
        (company, manifest["dataset_revision_id"]),
    ).fetchall()
    evidence = conn.execute(
        "SELECT * FROM app.evidence WHERE company_id=%s AND manifest_id=%s ORDER BY id",
        (company, manifest_id),
    ).fetchall()
    record_ids = conn.execute(
        "SELECT rr.record_revision_id FROM app.revision_records rr WHERE rr.company_id=%s AND rr.dataset_revision_id=%s ORDER BY rr.record_revision_id",
        (company, manifest["dataset_revision_id"]),
    ).fetchall()
    content = json_value(
        {
            "schema_version": 3,
            "module_configuration": module_settings(conn, company),
            "label": "تولیدشده سامانه",
            "manifest": manifest,
            "metrics": metrics,
            "reconciliation_runs": runs,
            "candidates": candidates,
            "decisions": decisions,
            "cashflow": cashflow,
            "settlement": settlement,
            "forecast": forecast,
            "sources": sources,
            "source_file_ids": [r["id"] for r in sources],
            "record_revision_ids": [r["record_revision_id"] for r in record_ids],
            "rows": rows,
            "evidence": evidence,
        }
    )
    return content


def ensure_report(
    conn,
    company,
    manifest_id,
    actor_id,
    forecast_run_id=None,
    *,
    processing_session_id=None,
    management_options=None,
    management_builder=None,
):
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":report:" + str(manifest_id),),
    )
    content = capture(conn, company, manifest_id, forecast_run_id)
    content["export_layout_version"] = EXPORT_LAYOUT_VERSION
    if management_builder is not None:
        content["management"] = management_builder(
            conn, company, content, management_options
        )
    from .actionable_analysis import prepare_summary, persist_proposals

    content["actionable_summary"] = prepare_summary(conn, company, content)
    fingerprint = digest(content)
    row = conn.execute(
        "SELECT * FROM app.report_snapshots WHERE company_id=%s AND manifest_id=%s AND input_fingerprint=%s",
        (company, manifest_id, fingerprint),
    ).fetchone()
    if not row:
        row = conn.execute(
            "INSERT INTO app.report_snapshots(company_id,manifest_id,content_hash,input_fingerprint,content,revision_number,scope_status,generation_session_id) SELECT %s,%s,%s,%s,%s,coalesce(max(revision_number),0)+1,%s,%s FROM app.report_snapshots WHERE company_id=%s AND manifest_id=%s RETURNING *",
            (
                company,
                manifest_id,
                fingerprint,
                fingerprint,
                Jsonb(content),
                "limited" if is_limited(content) else "ready",
                processing_session_id or content["manifest"]["session_id"],
                company,
                manifest_id,
            ),
        ).fetchone()
    persist_proposals(
        conn,
        company,
        row,
        actor_id,
        row["content"]["actionable_summary"]["items"],
        row["content"]["actionable_summary"]["settings"],
    )
    for format in FORMATS:
        conn.execute(
            "INSERT INTO app.export_jobs(company_id,manifest_id,report_id,requested_by,format,status) VALUES(%s,%s,%s,%s,%s,'pending') ON CONFLICT DO NOTHING",
            (company, manifest_id, row["id"], actor_id, format),
        )
    return row


def complete_report_session(conn, company, report_id):
    report = conn.execute(
        "SELECT * FROM app.report_snapshots WHERE company_id=%s AND id=%s",
        (company, report_id),
    ).fetchone()
    if not report or not report["generation_session_id"]:
        return
    if conn.execute(
        "SELECT array_agg(format ORDER BY format) AS formats FROM app.export_jobs WHERE company_id=%s AND report_id=%s AND status='ready'",
        (company, report_id),
    ).fetchone()["formats"] != ["error_csv", "pdf", "xlsx"]:
        return
    updated = conn.execute(
        "UPDATE app.processing_sessions s SET status=%s,session_version=session_version+1 WHERE s.company_id=%s AND s.id=%s AND s.status NOT IN ('completed','completed_limited','cancelled','failed','expired') AND s.analysis_finished_at IS NOT NULL AND s.analysis_context->>'report_id'=%s AND NOT EXISTS(SELECT 1 FROM app.processing_issues i WHERE i.company_id=s.company_id AND i.session_id=s.id AND i.required AND i.resolved_at IS NULL AND i.superseded_at IS NULL)",
        (
            "completed_limited" if report["scope_status"] == "limited" else "completed",
            company,
            report["generation_session_id"],
            str(report_id),
        ),
    )

    if updated.rowcount:
        from .intake import IntakeRepository

        IntakeRepository(conn).notify(
            company,
            conn.execute("SELECT app.current_actor() AS actor").fetchone()["actor"],
            report["generation_session_id"],
            "گزارش و خروجی‌ها آماده‌اند.",
        )
