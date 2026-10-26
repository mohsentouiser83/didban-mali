from __future__ import annotations
from uuid import uuid4
from psycopg.types.json import Jsonb
from ..domain.interpretation import Analysis, fingerprint


def schedule(conn, company, session, file):
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":interpret-policy",),
    )
    policy = conn.execute(
        "SELECT id FROM app.policy_versions WHERE company_id=%s AND kind='interpretation' AND effective_from<=current_date AND validation_status IN ('evaluated','approved') ORDER BY version DESC LIMIT 1",
        (company,),
    ).fetchone()
    if not policy:
        policy = conn.execute(
            "INSERT INTO app.policy_versions(company_id,kind,version,effective_from,parameters,validation_status,actor_id) VALUES(%s,'interpretation',1,current_date,%s,'evaluated',(SELECT requested_by FROM app.processing_sessions WHERE company_id=%s AND id=%s)) RETURNING id",
            (
                company,
                Jsonb(
                    {
                        "control_profile": "deterministic-v1",
                        "allow_validated_automatic_roles": True,
                    }
                ),
                company,
                session,
            ),
        ).fetchone()
    step = conn.execute(
        "INSERT INTO app.processing_steps(company_id,session_id,step_kind,input_fingerprint,policy_id,status,total_items) VALUES(%s,%s,%s,%s,%s,'pending',1) ON CONFLICT DO NOTHING RETURNING id",
        (
            company,
            session,
            "interpret:" + str(file),
            fingerprint([str(file), "v1"]),
            policy["id"],
        ),
    ).fetchone()
    if not step:
        step = conn.execute(
            "SELECT id FROM app.processing_steps WHERE company_id=%s AND session_id=%s AND step_kind=%s",
            (company, session, "interpret:" + str(file)),
        ).fetchone()
        conn.execute(
            "UPDATE app.processing_steps SET status='pending',completed_items=0,fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND id=%s",
            (company, step["id"]),
        )
    enqueue(conn, company, session, file, step["id"])


def enqueue(conn, company, session, file, step):
    conn.execute(
        "INSERT INTO app.outbox_events(company_id,session_id,event_kind,dedupe_key,payload) VALUES(%s,%s,'intake.interpret',%s,%s) ON CONFLICT(company_id,dedupe_key) DO UPDATE SET published_at=NULL,lease_token=NULL,lease_expires_at=NULL,available_at=clock_timestamp()",
        (
            company,
            session,
            "interpret:" + str(step),
            Jsonb({"file_id": str(file), "step_id": str(step)}),
        ),
    )


def overlap_candidates(conn, company, file, analysis: Analysis) -> list[dict]:
    hashes = [
        r.fingerprint for s in analysis.sheets for r in s.rows if r.state == "valid"
    ]
    keys = [
        r.logical_key
        for s in analysis.sheets
        for r in s.rows
        if r.state == "valid" and r.logical_key
    ]
    if not hashes:
        return []
    return conn.execute(
        """SELECT n.id,n.content_fingerprint,n.logical_key,sf.source_file_id FROM app.normalized_source_rows n
      JOIN app.session_files sf ON sf.company_id=n.company_id AND sf.interpretation_run_id=n.run_id
      JOIN app.processing_sessions ps ON ps.company_id=sf.company_id AND ps.id=sf.session_id
      WHERE n.company_id=%s AND sf.source_file_id<>%s AND ps.status NOT IN ('failed','cancelled') AND n.state='valid'
      AND (n.content_fingerprint=ANY(%s) OR n.logical_key=ANY(%s)) LIMIT 20001""",
        (company, file, hashes, keys),
    ).fetchall()


def persist(
    conn, job, analysis: Analysis, settings: dict, policy, overlaps: list[dict]
) -> dict:
    run = uuid4()
    company = job["company_id"]
    sources = []
    normalized = []
    errors = []
    by_hash = {r["content_fingerprint"]: r for r in overlaps}
    by_key = {r["logical_key"]: r for r in overlaps if r["logical_key"]}
    summary = {
        "valid_rows": 0,
        "rejected_rows": 0,
        "excluded_rows": 0,
        "skipped_rows": 0,
        "sheets": [],
        "coverage": "unknown",
        "financial_effects_committed": False,
    }
    sheet_records = []
    for sheet in analysis.sheets:
        if sheet.skipped:
            summary["skipped_rows"] += sheet.skipped_count
            summary["sheets"].append(
                {
                    "sheet_name": sheet.name,
                    "source_kind": "ignore",
                    "header_row": sheet.header_row,
                    "provenance": "human",
                    "controls": sheet.controls,
                    "mapping": [],
                }
            )
            continue
        interpretation = uuid4()
        sheet_records.append((interpretation, sheet))
        for row in sheet.rows:
            evidence = by_hash.get(row.fingerprint) or by_key.get(row.logical_key)
            excluded = evidence and settings.get("overlap") != "distinct_records"
            state = (
                "excluded_overlap" if excluded and row.state == "valid" else row.state
            )
            summary[
                {
                    "valid": "valid_rows",
                    "rejected": "rejected_rows",
                    "excluded_overlap": "excluded_rows",
                }[state]
            ] += 1
            source_row = uuid4()
            sources.append(
                (
                    source_row,
                    company,
                    interpretation,
                    row.number,
                    Jsonb(row.raw),
                    fingerprint(row.raw),
                )
            )
            normalized.append(
                (
                    company,
                    run,
                    source_row,
                    sheet.kind,
                    Jsonb(row.values),
                    row.fingerprint,
                    row.logical_key,
                    state,
                    Jsonb(row.errors),
                    Jsonb(
                        [
                            {
                                "normalized_row_id": str(evidence["id"]),
                                "source_file_id": str(evidence["source_file_id"]),
                            }
                        ]
                        if evidence
                        else []
                    ),
                )
            )
            errors.extend(
                (
                    company,
                    source_row,
                    code,
                    "ردیف برای محاسبات قابل پذیرش نیست: " + code,
                    "unknown",
                    None,
                )
                for code in row.errors
            )
        summary["sheets"].append(
            {
                "sheet_name": sheet.name,
                "source_kind": sheet.kind,
                "header_row": sheet.header_row,
                "provenance": sheet.provenance,
                "controls": sheet.controls,
                "mapping": [
                    {"target_field": k, "source_column": str(v)}
                    for k, v in sheet.mapping.items()
                ],
            }
        )
    conn.execute(
        "INSERT INTO app.interpretation_runs(id,company_id,session_id,source_file_id,policy_id,settings,summary) VALUES(%s,%s,%s,%s,%s,%s,%s)",
        (
            run,
            company,
            job["session_id"],
            job["file_id"],
            policy,
            Jsonb(settings),
            Jsonb(summary),
        ),
    )
    for interpretation, sheet in sheet_records:
        old = conn.execute(
            "SELECT id FROM app.interpretation_versions WHERE company_id=%s AND source_file_id=%s AND sheet_name=%s ORDER BY created_at DESC,id DESC LIMIT 1",
            (company, job["file_id"], sheet.name),
        ).fetchone()
        conn.execute(
            """INSERT INTO app.interpretation_versions(id,company_id,run_id,source_file_id,sheet_name,cell_range,source_kind,unit,calendar,mapping,provenance,policy_id,supersedes_id,actor_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                interpretation,
                company,
                run,
                job["file_id"],
                sheet.name,
                f"A{sheet.header_row}:SR{max((r.number for r in sheet.rows), default=sheet.header_row)}",
                sheet.kind,
                sheet.unit,
                sheet.calendar,
                Jsonb(sheet.mapping),
                sheet.provenance,
                policy,
                old["id"] if old else None,
                settings["sheets"][sheet.name]["actor_id"]
                if sheet.provenance == "human"
                else None,
            ),
        )
        with conn.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO app.interpretation_controls(company_id,interpretation_id,control_key,outcome,evidence) VALUES(%s,%s,%s,%s,%s)",
                [
                    (
                        company,
                        interpretation,
                        c["key"],
                        c["outcome"],
                        Jsonb(c["evidence"]),
                    )
                    for c in sheet.controls
                ],
            )
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO app.source_rows(id,company_id,interpretation_id,row_number,raw_values,raw_fingerprint) VALUES(%s,%s,%s,%s,%s,%s)",
            sources,
        )
        cursor.executemany(
            "INSERT INTO app.normalized_source_rows(company_id,run_id,source_row_id,source_kind,canonical_values,content_fingerprint,logical_key,state,error_codes,overlap_evidence) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            normalized,
        )
        cursor.executemany(
            "INSERT INTO app.validation_issues(company_id,source_row_id,code,message_fa,impact_state,known_impact) VALUES(%s,%s,%s,%s,%s,%s)",
            errors,
        )
    conn.execute(
        "UPDATE app.session_files SET interpretation_run_id=%s,interpretation_summary=%s,status=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
        (
            run,
            Jsonb(summary),
            "excluded_overlap" if summary["excluded_rows"] else "ready",
            company,
            job["session_id"],
            job["file_id"],
        ),
    )
    return summary


def summary_view(summary):
    if summary is None:
        return None
    return {
        k: summary[k]
        for k in (
            "valid_rows",
            "rejected_rows",
            "excluded_rows",
            "skipped_rows",
            "coverage",
            "financial_effects_committed",
        )
    } | {
        "sheets": [
            {
                k: s[k]
                for k in (
                    "sheet_name",
                    "source_kind",
                    "header_row",
                    "provenance",
                    "mapping",
                )
            }
            | {
                "controls": [
                    {"key": c["key"], "outcome": c["outcome"]} for c in s["controls"]
                ]
            }
            for s in summary["sheets"]
        ]
    }


def preview_view(file: dict) -> list[dict]:
    sheets = file["interpretation_settings"].get("sheets", {})
    summarized = {
        s["sheet_name"]: s
        for s in (file["interpretation_summary"] or {}).get("sheets", [])
    }
    result = []
    for preview in file["interpretation_preview"]:
        saved = sheets.get(preview["sheet_name"], {})
        result.append(
            preview
            | {
                "header_row": saved.get("header_row", preview["header_row"]),
                "mapping": [
                    {"target_field": k, "source_column": str(v)}
                    for k, v in saved["mapping"].items()
                ]
                if "mapping" in saved
                else preview["mapping"],
                "unit": saved.get("unit"),
                "calendar": saved.get("calendar"),
                "selected_kind": saved.get(
                    "source_kind",
                    summarized.get(preview["sheet_name"], {}).get("source_kind"),
                ),
                "reason": saved.get("reason", ""),
            }
        )
    return result
