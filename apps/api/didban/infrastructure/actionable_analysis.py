"""Deterministic generic report summary and private proposal persistence."""

from psycopg.types.json import Jsonb
from datetime import date
from ..domain.actionable_analysis import analyze, DEFAULT_SETTINGS


def prepare_summary(conn, company, content):
    configuration = conn.execute(
        "SELECT parameters,row_version FROM app.actionable_settings WHERE company_id=%s",
        (company,),
    ).fetchone()
    settings = {
        **DEFAULT_SETTINGS,
        **(configuration["parameters"] if configuration else {}),
    }
    source = {**content, "metrics": [dict(m) for m in content.get("metrics", [])]}
    source.pop("payroll_analysis", None)
    scope = (
        content.get("report_scope") or content.get("management") or content["manifest"]
    )
    actual_date = str(scope.get("as_of_date") or content["manifest"]["as_of_date"])
    source["report_scope"] = {
        "starts_on": str(
            scope.get("starts_on") or content["manifest"].get("starts_on")
        ),
        "as_of_date": actual_date,
        "metric_basis": scope.get("metric_basis", "ledger"),
    }
    if actual_date != str(content["manifest"]["as_of_date"]):
        source["settlement"] = None
        source["forecast"] = None
    source_names = {
        str(row["id"]): row["original_name"] for row in content.get("sources", [])
    }
    pinned_rows = {
        str(row["source_row_id"]): row
        for row in content.get("rows", [])
        if row.get("source_row_id")
    }
    for metric in source["metrics"]:
        metric["source_refs"] = []
        for evidence in metric.get("evidence", []):
            for row_id in evidence.get("source_row_ids", []):
                row = pinned_rows.get(str(row_id))
                if row:
                    metric["source_refs"].append(
                        {
                            "file_name": source_names.get(
                                str(row.get("source_file_id")), "منبع گزارش"
                            ),
                            "sheet_name": row.get("sheet_name"),
                            "row_number": row.get("row_number"),
                            "description": evidence.get("description_fa", ""),
                            "rule_key": evidence.get("rule_key"),
                            "fact_values": list(evidence.get("fact_values", [])),
                            "source_row_id": str(row_id),
                            "input_values": {
                                k: v
                                for k, v in row.get("canonical_values", {}).items()
                                if k
                                in (
                                    "date",
                                    "issued_on",
                                    "due_on",
                                    "account",
                                    "bank_account",
                                    "entry_id",
                                    "debit",
                                    "credit",
                                    "amount",
                                    "gross",
                                    "unit",
                                    "original_unit",
                                    "row_type",
                                    "role",
                                )
                            },
                            "calculated_value": metric.get("value"),
                            "metric_key": metric["metric_key"],
                        }
                    )

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
    evidence_records = {str(row["id"]): row for row in content.get("evidence", [])}
    for metric in source["metrics"]:
        for identifier in metric["evidence_ids"]:
            evidence = evidence_records.get(identifier)
            if not evidence:
                continue
            row = pinned_rows.get(str(evidence.get("source_row_id")))
            if row:
                calculation = evidence.get("calculation") or {}
                metric["source_refs"].append(
                    {
                        "file_name": source_names.get(
                            str(row.get("source_file_id")), "منبع گزارش"
                        ),
                        "sheet_name": row.get("sheet_name"),
                        "row_number": row.get("row_number"),
                        "description": calculation.get("description_fa", ""),
                        "rule_key": evidence.get("rule_key"),
                        "fact_values": calculation.get("fact_values", []),
                        "source_row_id": str(evidence["source_row_id"]),
                        "input_values": {
                            k: v
                            for k, v in row.get("canonical_values", {}).items()
                            if k
                            in (
                                "date",
                                "issued_on",
                                "due_on",
                                "account",
                                "bank_account",
                                "entry_id",
                                "debit",
                                "credit",
                                "amount",
                                "gross",
                                "unit",
                                "original_unit",
                                "row_type",
                                "role",
                            )
                        },
                        "calculated_value": metric.get("value"),
                        "metric_key": metric["metric_key"],
                    }
                )
    source["analysis_history"] = [
        r["content"]
        for r in conn.execute(
            """SELECT content FROM (
             SELECT p.content,r.created_at,row_number() OVER(PARTITION BY p.axis,coalesce(r.content->'report_scope'->>'as_of_date',r.content->'management'->>'as_of_date',r.content->'manifest'->>'as_of_date') ORDER BY r.created_at DESC) AS observation_rank
             FROM app.actionable_proposals p JOIN app.report_snapshots r ON r.company_id=p.company_id AND r.id=p.report_id
             WHERE p.company_id=%s AND r.manifest_id<>%s AND coalesce(r.content->'report_scope'->>'as_of_date',r.content->'management'->>'as_of_date',r.content->'manifest'->>'as_of_date')<%s
             AND p.axis<>'payroll' AND p.content->'scope'->>'metric_basis'=%s
            ) history WHERE observation_rank=1 ORDER BY created_at DESC LIMIT 60""",
            (
                company,
                content["manifest"]["id"],
                actual_date,
                source["report_scope"]["metric_basis"],
            ),
        ).fetchall()
    ]
    return {
        "formula_version": "actionable-v2",
        "settings": settings,
        "settings_version": configuration["row_version"] if configuration else 1,
        "items": [
            item for item in analyze(source, settings) if item["axis"] != "payroll"
        ],
    }


def persist_proposals(conn, company, report, actor, items, settings):
    for item in items:
        row = conn.execute(
            "INSERT INTO app.actionable_proposals(company_id,report_id,axis,content,settings_snapshot) VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id",
            (company, report["id"], item["axis"], Jsonb(item), Jsonb(settings)),
        ).fetchone()
        if not row:
            continue
        prior = conn.execute(
            "SELECT p.* FROM app.actionable_proposals p JOIN app.report_snapshots r ON r.company_id=p.company_id AND r.id=p.report_id WHERE p.company_id=%s AND p.axis=%s AND p.report_id<>%s AND r.created_at<=%s AND r.content->'manifest'->>'period_id'=%s ORDER BY r.created_at DESC LIMIT 1",
            (
                company,
                item["axis"],
                report["id"],
                report["created_at"],
                str(report["content"]["manifest"]["period_id"]),
            ),
        ).fetchone()
        if prior:
            old = {
                e["metric_key"]: e["value"]
                for e in prior["content"].get("evidence", [])
            }
            new = {e["metric_key"]: e["value"] for e in item.get("evidence", [])}
            old_scope = prior["content"].get("scope") or {}
            new_scope = item.get("scope") or {}
            comparable = bool(
                old_scope.get("metric_basis") == new_scope.get("metric_basis")
                and old
                and new
                and old.keys() == new.keys()
            )
            if item["axis"] in ("profit", "payroll"):
                try:
                    comparable = (
                        comparable
                        and (
                            date.fromisoformat(old_scope["as_of_date"])
                            - date.fromisoformat(old_scope["starts_on"])
                        ).days
                        == (
                            date.fromisoformat(new_scope["as_of_date"])
                            - date.fromisoformat(new_scope["starts_on"])
                        ).days
                    )
                except (ValueError, KeyError, TypeError):
                    comparable = False
            assessment = {
                "report_id": str(report["id"]),
                "observation": "unchanged"
                if comparable and old == new
                else "changed"
                if comparable
                else "insufficient_data",
                "scope_reason": None if comparable else "report_scope_not_comparable",
                "resolution": "not_proven",
                "previous_values": old,
                "current_values": new,
            }
            conn.execute(
                "INSERT INTO app.actionable_evaluations(company_id,proposal_id,report_id,assessment) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (company, prior["id"], report["id"], Jsonb(assessment)),
            )
        if item["axis"] != "payroll":
            conn.execute("SELECT app.notify_actionable(%s)", (row["id"],))
