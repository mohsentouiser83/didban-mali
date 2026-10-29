"""Immutable source selection, pinned dataset rows and publication persistence."""

from __future__ import annotations
from dataclasses import asdict
import hashlib
import json
from psycopg.types.json import Jsonb
from ..domain.financial import FinancialRow, PeriodSpec


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, default=str).encode()
    ).hexdigest()


def enqueue(conn, company, session, step):
    conn.execute(
        "INSERT INTO app.outbox_events(company_id,session_id,event_kind,dedupe_key,payload) VALUES(%s,%s,'financial.calculate',%s,%s) ON CONFLICT(company_id,dedupe_key) DO UPDATE SET published_at=NULL,lease_token=NULL,lease_expires_at=NULL,available_at=clock_timestamp()",
        (company, session, "financial:" + str(step), Jsonb({"step_id": str(step)})),
    )


def schedule(conn, company, session):
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":financial-policy",),
    )
    policy = conn.execute(
        "SELECT id FROM app.policy_versions WHERE company_id=%s AND kind='financial' AND effective_from<=current_date AND validation_status IN ('evaluated','approved') ORDER BY version DESC LIMIT 1",
        (company,),
    ).fetchone()
    if not policy:
        policy = conn.execute(
            "INSERT INTO app.policy_versions(company_id,kind,version,effective_from,parameters,validation_status,actor_id) VALUES(%s,'financial',1,current_date,%s,'evaluated',(SELECT requested_by FROM app.processing_sessions WHERE company_id=%s AND id=%s)) RETURNING id",
            (
                company,
                Jsonb({"engine": "financial-v1.1", "scope": "core_financial_v1"}),
                company,
                session,
            ),
        ).fetchone()
    step = conn.execute(
        "INSERT INTO app.processing_steps(company_id,session_id,step_kind,input_fingerprint,policy_id,status,total_items) VALUES(%s,%s,'financial:core',%s,%s,'pending',1) ON CONFLICT DO NOTHING RETURNING id",
        (company, session, digest([str(session), "core-v1"]), policy["id"]),
    ).fetchone()
    if not step:
        step = conn.execute(
            "SELECT id FROM app.processing_steps WHERE company_id=%s AND session_id=%s AND step_kind='financial:core'",
            (company, session),
        ).fetchone()
        conn.execute(
            "UPDATE app.processing_steps SET status='pending',fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND id=%s",
            (company, step["id"]),
        )
    enqueue(conn, company, session, step["id"])


def inputs(conn, company, session):
    head = conn.execute(
        "SELECT dataset_revision_id FROM app.company_dataset_heads WHERE company_id=%s",
        (company,),
    ).fetchone()
    parent = head["dataset_revision_id"] if head else None
    selections = {}
    if parent:
        selections = {
            str(r["source_file_id"]): r["interpretation_run_id"]
            for r in conn.execute(
                "SELECT source_file_id,interpretation_run_id FROM app.dataset_file_selections WHERE company_id=%s AND dataset_revision_id=%s",
                (company, parent),
            )
        }
    for r in conn.execute(
        "SELECT source_file_id,interpretation_run_id FROM app.session_files WHERE company_id=%s AND session_id=%s AND interpretation_run_id IS NOT NULL",
        (company, session["id"]),
    ):
        selections[str(r["source_file_id"])] = r["interpretation_run_id"]
    raw = conn.execute(
        "SELECT n.*,r.row_number,r.interpretation_id,i.source_file_id,i.sheet_name,f.original_name FROM app.normalized_source_rows n JOIN app.source_rows r ON r.company_id=n.company_id AND r.id=n.source_row_id JOIN app.interpretation_versions i ON i.company_id=r.company_id AND i.id=r.interpretation_id JOIN app.source_files f ON f.company_id=i.company_id AND f.id=i.source_file_id WHERE n.company_id=%s AND n.run_id=ANY(%s::uuid[]) ORDER BY n.id",
        (company, list(selections.values())),
    ).fetchall()
    rows = [
        FinancialRow(
            str(r["id"]),
            str(r["source_row_id"]),
            str(r["source_file_id"]),
            str(r["interpretation_id"]),
            r["sheet_name"],
            r["row_number"],
            r["source_kind"],
            r["canonical_values"],
            r["state"],
            tuple(r["error_codes"]),
            r["original_name"],
        )
        for r in raw
        if r["state"] != "excluded_overlap"
    ]
    p = conn.execute(
        "SELECT * FROM app.financial_periods WHERE company_id=%s AND id=%s",
        (company, session["period_id"]),
    ).fetchone()
    current = PeriodSpec(
        str(p["id"]),
        p["starts_on"],
        p["ends_on"],
        session["as_of_date"] or p["ends_on"],
    )
    p = conn.execute(
        "SELECT * FROM app.financial_periods WHERE company_id=%s AND id=%s",
        (company, p["previous_period_id"]),
    ).fetchone()
    previous = PeriodSpec(str(p["id"]), p["starts_on"], p["ends_on"]) if p else None
    return parent, selections, raw, rows, current, previous


def publish(
    conn, company, session, step, parent, selections, raw, metrics, declarations
):
    # Head CAS is checked under a company lock after computation, before any effects.
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":dataset-head",),
    )
    head = conn.execute(
        "SELECT dataset_revision_id FROM app.company_dataset_heads WHERE company_id=%s FOR UPDATE",
        (company,),
    ).fetchone()
    if (head["dataset_revision_id"] if head else None) != parent:
        from ..application.preparation_worker import StaleJob

        raise StaleJob()
    dataset = conn.execute(
        "INSERT INTO app.dataset_revisions(company_id,session_id,parent_revision_id,state) VALUES(%s,%s,%s,'building') RETURNING id",
        (company, session["id"], parent),
    ).fetchone()["id"]
    for file, run in selections.items():
        conn.execute(
            "INSERT INTO app.dataset_file_selections(company_id,dataset_revision_id,source_file_id,interpretation_run_id) VALUES(%s,%s,%s,%s)",
            (company, dataset, file, run),
        )
    # A re-interpretation of identical bytes must not create a fresh payment capacity.
    # Identity here is a physical source record within one immutable file, not a
    # claim that similarly numbered rows in different files are the same transaction.
    historical = conn.execute(
        "SELECT r.id,r.logical_record_id,r.revision_number,r.content_hash,n.state,n.error_codes,i.source_file_id,i.sheet_name,s.row_number,n.source_kind FROM app.record_revisions r JOIN app.normalized_source_rows n ON n.company_id=r.company_id AND n.id=r.normalized_row_id JOIN app.source_rows s ON s.company_id=n.company_id AND s.id=n.source_row_id JOIN app.interpretation_versions i ON i.company_id=s.company_id AND i.id=s.interpretation_id WHERE r.company_id=%s AND i.source_file_id=ANY(%s::uuid[]) ORDER BY r.created_at DESC,r.id DESC",
        (company, list(selections)),
    ).fetchall()
    history = {}
    for previous in historical:
        source_key = (
            str(previous["source_file_id"]),
            previous["sheet_name"],
            previous["row_number"],
            previous["source_kind"],
        )
        history.setdefault(source_key, []).append(previous)
    for row in raw:
        source_key = (
            str(row["source_file_id"]),
            row["sheet_name"],
            row["row_number"],
            row["source_kind"],
        )
        versions = history.get(source_key, [])
        if versions:
            logical = versions[0]["logical_record_id"]
        else:
            logical = conn.execute(
                "INSERT INTO app.logical_records(company_id,source_namespace,source_identity,record_kind) VALUES(%s,%s,%s,%s) ON CONFLICT(company_id,source_namespace,source_identity,record_kind) DO UPDATE SET source_identity=excluded.source_identity RETURNING id",
                (
                    company,
                    str(row["source_file_id"]),
                    json.dumps(
                        [row["sheet_name"], row["row_number"]], ensure_ascii=False
                    ),
                    row["source_kind"],
                ),
            ).fetchone()["id"]
        record = next(
            (
                v
                for v in versions
                if v["logical_record_id"] == logical
                and v["content_hash"] == row["content_fingerprint"]
                and v["state"] == row["state"]
                and v["error_codes"] == row["error_codes"]
            ),
            None,
        )
        if not record:
            number = (
                max(
                    (
                        v["revision_number"]
                        for v in versions
                        if v["logical_record_id"] == logical
                    ),
                    default=0,
                )
                + 1
            )
            record = conn.execute(
                "INSERT INTO app.record_revisions(company_id,logical_record_id,source_row_id,normalized_row_id,revision_number,content_hash) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
                (
                    company,
                    logical,
                    row["source_row_id"],
                    row["id"],
                    number,
                    row["content_fingerprint"],
                ),
            ).fetchone()
        conn.execute(
            "INSERT INTO app.revision_records(company_id,dataset_revision_id,record_revision_id,logical_record_id) VALUES(%s,%s,%s,%s)",
            (company, dataset, record["id"], logical),
        )
    for kind, scopes in declarations.get("coverage", {}).items():
        for scope in scopes if isinstance(scopes, list) else [scopes]:
            conn.execute(
                "INSERT INTO app.source_coverage(company_id,dataset_revision_id,source_kind,scope_key,starts_on,ends_on,state,provenance,actor_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    company,
                    dataset,
                    kind,
                    str(scope.get("starts_on")),
                    scope.get("starts_on"),
                    scope.get("ends_on"),
                    "declared_complete"
                    if scope["state"] == "complete"
                    else scope["state"],
                    scope.get("provenance", "unknown"),
                    scope.get("actor_id"),
                ),
            )
    conn.execute(
        "UPDATE app.dataset_revisions SET state='sealed',sealed_at=clock_timestamp() WHERE company_id=%s AND id=%s",
        (company, dataset),
    )
    manifest = conn.execute(
        "INSERT INTO app.result_manifests(company_id,dataset_revision_id,period_id,as_of_date,manifest_hash,financial_policy_id,forecast_policy_id,status) VALUES(%s,%s,%s,%s,%s,%s,NULL,'building') RETURNING id",
        (
            company,
            dataset,
            session["period_id"],
            session["as_of_date"]
            or conn.execute(
                "SELECT ends_on FROM app.financial_periods WHERE company_id=%s AND id=%s",
                (company, session["period_id"]),
            ).fetchone()["ends_on"],
            digest([str(dataset), declarations]),
            step["policy_id"],
        ),
    ).fetchone()["id"]
    for file in selections:
        conn.execute(
            "INSERT INTO app.manifest_dependencies(company_id,manifest_id,source_file_id) VALUES(%s,%s,%s)",
            (company, manifest, file),
        )
    for interpretation in {r["interpretation_id"] for r in raw}:
        conn.execute(
            "INSERT INTO app.manifest_dependencies(company_id,manifest_id,interpretation_id) VALUES(%s,%s,%s)",
            (company, manifest, interpretation),
        )
    # Retain all inherited answers: each new snapshot carries its complete lineage.
    if parent:
        conn.execute(
            "INSERT INTO app.manifest_dependencies(company_id,manifest_id,answer_id) SELECT DISTINCT %s::uuid,%s::uuid,d.answer_id FROM app.manifest_dependencies d JOIN app.result_manifests m ON m.company_id=d.company_id AND m.id=d.manifest_id WHERE m.company_id=%s AND m.dataset_revision_id=%s AND d.answer_id IS NOT NULL",
            (company, manifest, company, parent),
        )
    conn.execute(
        "INSERT INTO app.manifest_dependencies(company_id,manifest_id,answer_id) SELECT %s,%s,a.id FROM app.issue_answers a JOIN app.processing_issues i ON i.company_id=a.company_id AND i.id=a.issue_id WHERE i.company_id=%s AND i.session_id=%s",
        (company, manifest, company, session["id"]),
    )
    for metric in metrics:
        mid = conn.execute(
            "INSERT INTO app.metric_observations(company_id,manifest_id,metric_key,basis,scope_key,status,value,reason_codes,coverage,comparison,formula_version) VALUES(%s,%s,%s,%s,'company',%s,%s,%s,%s,%s,%s) RETURNING id",
            (
                company,
                manifest,
                metric.metric_key,
                metric.basis,
                metric.status,
                metric.value,
                list(metric.reason_codes),
                Jsonb(list(metric.coverage)),
                Jsonb(asdict(metric.comparison)) if metric.comparison else None,
                metric.formula_version,
            ),
        ).fetchone()["id"]
        for spec in metric.evidence:
            for source in (None,) + spec.source_row_ids:
                eid = conn.execute(
                    "INSERT INTO app.evidence(company_id,manifest_id,source_row_id,rule_key,calculation) VALUES(%s,%s,%s,%s,%s) RETURNING id",
                    (
                        company,
                        manifest,
                        source,
                        spec.rule_key,
                        Jsonb(
                            {
                                "description_fa": spec.description_fa,
                                "fact_values": list(spec.fact_values)
                                if source is None
                                else [],
                                "facts": spec.facts if source is None else {},
                                "details": metric.details if source is None else {},
                            }
                        ),
                    ),
                ).fetchone()["id"]
                conn.execute(
                    "INSERT INTO app.metric_evidence(company_id,metric_id,evidence_id) VALUES(%s,%s,%s)",
                    (company, mid, eid),
                )
    conn.execute(
        "INSERT INTO app.calculation_runs(company_id,manifest_id,kind,formula_version,status) VALUES(%s,%s,'core_financial_v1','financial-v1.1','limited')",
        (company, manifest),
    )
    conn.execute(
        "UPDATE app.result_manifests SET status='published',published_at=clock_timestamp() WHERE company_id=%s AND id=%s",
        (company, manifest),
    )
    if parent:
        changed = conn.execute(
            "UPDATE app.company_dataset_heads SET dataset_revision_id=%s,row_version=row_version+1 WHERE company_id=%s AND dataset_revision_id=%s",
            (dataset, company, parent),
        ).rowcount
        assert changed == 1
    else:
        conn.execute(
            "INSERT INTO app.company_dataset_heads(company_id,dataset_revision_id) VALUES(%s,%s)",
            (company, dataset),
        )
    conn.execute(
        "UPDATE app.processing_sessions SET financial_context=%s,manifest_id=%s,financial_finished_at=clock_timestamp(),status='waiting_dependency',session_version=session_version+1 WHERE company_id=%s AND id=%s",
        (Jsonb(session["financial_context"]), manifest, company, session["id"]),
    )
    return manifest
