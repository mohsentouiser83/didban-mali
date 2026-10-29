"""Immutable report-bound proposals and append-only user follow-up."""

from decimal import Decimal
from psycopg.types.json import Jsonb
from ..domain.actionable_analysis import analyze, DEFAULT_SETTINGS
from ..errors import ApiError, missing, forbidden, conflict
from .auth import response


class ActionableAnalysisService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(
                conn,
                actor,
                company,
                op
                not in (
                    "getActionableAnalysis",
                    "getAnalysisSettings",
                    "getLatestActionableSummary",
                ),
            )
            # Serialize settings creation and versioned report proposal generation.
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (company + ":actionable",),
            )
            settings_row = conn.execute(
                "SELECT * FROM app.actionable_settings WHERE company_id=%s", (company,)
            ).fetchone()
            settings = settings_row["parameters"] if settings_row else DEFAULT_SETTINGS
            version = settings_row["row_version"] if settings_row else 1

            def present(row):
                follow = conn.execute(
                    "SELECT status,version FROM app.actionable_followups WHERE company_id=%s AND proposal_id=%s ORDER BY version DESC LIMIT 1",
                    (company, row["id"]),
                ).fetchone()
                return {
                    "id": row["id"],
                    "report_id": row["report_id"],
                    "axis": row["axis"],
                    "content": row["content"],
                    "evaluations": [
                        r["assessment"]
                        for r in conn.execute(
                            "SELECT assessment FROM app.actionable_evaluations WHERE company_id=%s AND proposal_id=%s ORDER BY created_at,id",
                            (company, row["id"]),
                        ).fetchall()
                    ],
                    "followup": follow["status"] if follow else "unreviewed",
                    "version": follow["version"] if follow else 1,
                }

            def listing(report):
                return {
                    "items": [
                        present(r)
                        for r in conn.execute(
                            "SELECT * FROM app.actionable_proposals WHERE company_id=%s AND report_id=%s ORDER BY created_at,id",
                            (company, report),
                        ).fetchall()
                    ]
                }

            def action():
                if op == "getLatestActionableSummary":
                    latest = conn.execute(
                        "SELECT r.* FROM app.report_snapshots r JOIN app.result_manifests m ON m.company_id=r.company_id AND m.id=r.manifest_id WHERE r.company_id=%s AND m.status='published' ORDER BY r.created_at DESC,r.id DESC LIMIT 1",
                        (company,),
                    ).fetchone()
                    if not latest:
                        return response(
                            {
                                "report_id": None,
                                "as_of_date": None,
                                "created_at": None,
                                "items": [],
                            }
                        )
                    scoped = (
                        latest["content"].get("report_scope")
                        or latest["content"].get("management")
                        or latest["content"]["manifest"]
                    )
                    return response(
                        {
                            "report_id": latest["id"],
                            "as_of_date": scoped.get("as_of_date"),
                            "created_at": latest["created_at"],
                            "items": [
                                p
                                for p in listing(latest["id"])["items"]
                                if p["axis"] != "payroll"
                            ],
                        }
                    )
                if op == "getAnalysisSettings":
                    return response({**settings, "version": version}, etag=version)
                if op == "putAnalysisSettings":
                    if access.role(company) != "finance_manager":
                        raise forbidden()
                    if version != expected:
                        raise conflict()
                    value = Decimal(body["materiality_ratio"])
                    if not 0 < value <= 1:
                        raise ApiError(
                            422,
                            "invalid_materiality_ratio",
                            "نسبت اهمیت باید بیشتر از صفر و حداکثر یک باشد.",
                        )
                    parameters = {
                        **settings,
                        "materiality_ratio": body["materiality_ratio"],
                        **{
                            k: body[k]
                            for k in ("urgency_days", "recurrence_count")
                            if k in body
                        },
                    }
                    if settings_row:
                        row = conn.execute(
                            "UPDATE app.actionable_settings SET parameters=%s,actor_id=%s WHERE company_id=%s RETURNING row_version",
                            (Jsonb(parameters), actor["id"], company),
                        ).fetchone()
                    else:
                        row = conn.execute(
                            "INSERT INTO app.actionable_settings(company_id,parameters,actor_id,row_version) VALUES(%s,%s,%s,2) RETURNING row_version",
                            (company, Jsonb(parameters), actor["id"]),
                        ).fetchone()
                    conn.execute(
                        "INSERT INTO app.actionable_settings_events(company_id,actor_id,before_value,after_value,version,reason) VALUES(%s,%s,%s,%s,%s,%s)",
                        (
                            company,
                            actor["id"],
                            Jsonb(settings),
                            Jsonb(parameters),
                            row["row_version"],
                            body["reason"].strip(),
                        ),
                    )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "analysis.settings_changed",
                        "company",
                        company,
                        request_id,
                        {
                            "before": settings,
                            "after": parameters,
                            "reason": body["reason"],
                        },
                    )
                    return response(
                        {**parameters, "version": row["row_version"]},
                        etag=row["row_version"],
                    )
                if op == "updateAnalysisFollowup":
                    row = conn.execute(
                        "SELECT * FROM app.actionable_proposals WHERE company_id=%s AND id=%s",
                        (company, ids["proposal_id"]),
                    ).fetchone()
                    if not row:
                        raise missing()
                    if (
                        row["axis"] == "payroll"
                        and not conn.execute(
                            "SELECT app.payroll_allowed(%s,'manage') AS allowed",
                            (company,),
                        ).fetchone()["allowed"]
                    ):
                        raise forbidden()
                    current = present(row)
                    if current["version"] != expected:
                        raise conflict()
                    if body["status"] == "rejected" and not body["reason"].strip():
                        raise ApiError(
                            422, "rejection_reason_required", "دلیل رد را وارد کنید."
                        )
                    conn.execute(
                        "INSERT INTO app.actionable_followups(company_id,proposal_id,actor_id,status,reason,version) VALUES(%s,%s,%s,%s,%s,%s)",
                        (
                            company,
                            row["id"],
                            actor["id"],
                            body["status"],
                            body["reason"].strip(),
                            current["version"] + 1,
                        ),
                    )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "analysis.followup_changed",
                        "analysis_proposal",
                        str(row["id"]),
                        request_id,
                        {
                            "before": current["followup"],
                            "after": body["status"],
                            "reason": body["reason"],
                        },
                    )
                    return response(present(row), etag=current["version"] + 1)
                report = conn.execute(
                    "SELECT r.* FROM app.report_snapshots r JOIN app.result_manifests m ON m.company_id=r.company_id AND m.id=r.manifest_id WHERE r.company_id=%s AND r.id=%s AND m.status='published'",
                    (company, ids["report_id"]),
                ).fetchone()
                if not report:
                    raise missing()
                if op == "generateActionableAnalysis":
                    content = dict(report["content"])
                    content["metrics"] = [
                        dict(metric) for metric in content.get("metrics", [])
                    ]
                    for metric in content["metrics"]:
                        metric["evidence_ids"] = (
                            [
                                str(r["evidence_id"])
                                for r in conn.execute(
                                    "SELECT evidence_id FROM app.metric_evidence WHERE company_id=%s AND metric_id=%s ORDER BY evidence_id",
                                    (company, metric["id"]),
                                ).fetchall()
                            ]
                            if metric.get("id")
                            else []
                        )
                    content["analysis_history"] = [
                        r["content"]
                        for r in conn.execute(
                            "SELECT p.content FROM app.actionable_proposals p JOIN app.report_snapshots r ON r.company_id=p.company_id AND r.id=p.report_id WHERE p.company_id=%s AND (r.content->'manifest'->>'as_of_date') < %s ORDER BY r.created_at DESC LIMIT 60",
                            (
                                company,
                                str(content.get("manifest", {}).get("as_of_date", "")),
                            ),
                        ).fetchall()
                    ]
                    if conn.execute(
                        "SELECT app.payroll_allowed(%s,'view') AS allowed", (company,)
                    ).fetchone()["allowed"]:
                        from ..infrastructure.payroll import payroll_analysis_snapshot

                        actual_scope = (
                            content.get("report_scope")
                            or content.get("management")
                            or content["manifest"]
                        )
                        actual_date = (
                            actual_scope.get("as_of_date")
                            or content["manifest"]["as_of_date"]
                        )
                        content["payroll_analysis"] = payroll_analysis_snapshot(
                            conn, company, actual_date
                        )
                        payroll_snapshot = content["payroll_analysis"]
                        periods = payroll_snapshot.get("periods", [])
                        report_start = actual_scope.get("starts_on") or content[
                            "manifest"
                        ].get("starts_on")
                        if periods and (
                            periods[0]["period_end"] != str(actual_date)
                            or (
                                report_start
                                and periods[0]["period_start"] != str(report_start)
                            )
                        ):
                            content["payroll_analysis"] = {
                                "status": "unavailable",
                                "reason": "payroll_report_period_mismatch",
                                "periods": [],
                            }

                    from ..infrastructure.actionable_analysis import (
                        persist_proposals,
                        prepare_summary,
                    )

                    summary = report["content"].get("actionable_summary")
                    if summary is None:
                        summary = prepare_summary(conn, company, report["content"])
                    items = list(summary["items"])
                    if conn.execute(
                        "SELECT app.payroll_allowed(%s,'view') AS allowed", (company,)
                    ).fetchone()["allowed"]:
                        items += [
                            p
                            for p in analyze(content, summary["settings"])
                            if p["axis"] == "payroll"
                        ]
                    persist_proposals(
                        conn,
                        company,
                        report,
                        actor["id"],
                        items,
                        summary["settings"] if summary else settings,
                    )
                    access.audit(
                        company,
                        str(actor["id"]),
                        "analysis.generated",
                        "report",
                        str(report["id"]),
                        request_id,
                    )
                return response(listing(report["id"]))

            if op in (
                "getActionableAnalysis",
                "getAnalysisSettings",
                "getLatestActionableSummary",
            ):
                return action()
            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + str(ids),
                key=key,
                payload={"body": body, "version": expected},
                action=action,
            )
