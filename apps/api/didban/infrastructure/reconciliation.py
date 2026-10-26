"""Pinned comparison inputs and bank projection; no live totals mutate old manifests."""

from __future__ import annotations
from psycopg.types.json import Jsonb
from uuid import uuid4
from .reconciliation_projection import project_bank_rows, chunks
from .reconciliation_automatic import accept_fresh_unique
from ..domain.reconciliation import (
    ComparisonRow,
    CandidateSpec,
    bank_ledger,
    moadian,
    source_view,
)
from ..errors import missing, conflict


def pinned_rows(conn, company, manifest):
    return conn.execute(
        "WITH selected AS MATERIALIZED (SELECT r.id AS record_revision_id,r.logical_record_id,r.normalized_row_id FROM app.result_manifests m JOIN app.revision_records rr ON rr.company_id=m.company_id AND rr.dataset_revision_id=m.dataset_revision_id JOIN app.record_revisions r ON r.company_id=rr.company_id AND r.id=rr.record_revision_id WHERE m.company_id=%s AND m.id=%s AND m.status='published') SELECT r.record_revision_id,r.logical_record_id,n.id AS normalized_id,n.source_row_id,n.source_kind AS kind,n.canonical_values AS values,n.state,n.error_codes,i.source_file_id AS file_id,i.id AS interpretation_id,i.sheet_name AS sheet,s.row_number FROM selected r JOIN app.normalized_source_rows n ON n.company_id=%s AND n.id=r.normalized_row_id JOIN app.source_rows s ON s.company_id=n.company_id AND s.id=n.source_row_id JOIN app.interpretation_versions i ON i.company_id=s.company_id AND i.id=s.interpretation_id ORDER BY n.id",
        (company, manifest, company),
    ).fetchall()


def bank_bindings(conn, company, manifest, raw=None):
    # The core publication pinned these immutable answers; mutable session state is not consulted.
    rows = conn.execute(
        "SELECT i.answer_constraints,a.answer FROM app.manifest_dependencies d JOIN app.issue_answers a ON a.company_id=d.company_id AND a.id=d.answer_id JOIN app.processing_issues i ON i.company_id=a.company_id AND i.id=a.issue_id WHERE d.company_id=%s AND d.manifest_id=%s AND i.code='financial_declaration' ORDER BY a.created_at,a.id",
        (company, manifest),
    ).fetchall()
    answers = {
        r["answer_constraints"].get("financial_key"): r["answer"].get("value")
        for r in rows
    }
    from .financial import digest

    pinned = pinned_rows(conn, company, manifest) if raw is None else raw
    groups = {
        str(r["file_id"]) + ":" + r["sheet"] for r in pinned if r["kind"] == "bank"
    }
    ambiguous = {
        g
        for g in groups
        if len(
            {
                str(r["values"]["bank_account"])
                for r in pinned
                if r["kind"] == "bank"
                and str(r["file_id"]) + ":" + r["sheet"] == g
                and r["values"].get("bank_account")
            }
        )
        > 1
    }
    return {
        g: answers["binding|" + digest(g)[:20]]
        for g in groups
        if g not in ambiguous
        and answers.get("binding|" + digest(g)[:20]) not in (None, "unknown")
    }


def project_banks(conn, company, manifest, raw=None, bindings=None):
    pinned = pinned_rows(conn, company, manifest) if raw is None else raw
    declared = (
        bank_bindings(conn, company, manifest, pinned) if bindings is None else bindings
    )
    return project_bank_rows(conn, company, pinned, declared)


def lock_manifest_session(conn, company, manifest):
    row = conn.execute(
        "SELECT m.*,p.starts_on,s.id AS source_session_id,s.status AS session_status FROM app.result_manifests m JOIN app.financial_periods p ON p.company_id=m.company_id AND p.id=m.period_id JOIN app.dataset_revisions d ON d.company_id=m.company_id AND d.id=m.dataset_revision_id JOIN app.processing_sessions s ON s.company_id=d.company_id AND s.id=d.session_id WHERE m.company_id=%s AND m.id=%s AND m.status='published' FOR UPDATE OF s",
        (company, manifest),
    ).fetchone()
    if not row:
        raise missing()
    blocked = conn.execute(
        "SELECT 1 FROM app.processing_issues WHERE company_id=%s AND session_id=%s AND required AND resolved_at IS NULL AND superseded_at IS NULL",
        (company, row["source_session_id"]),
    ).fetchone()
    if blocked or row["session_status"] in ("cancelled", "failed"):
        raise conflict("session_barrier_or_version")
    return row


def comparison_proof(value):
    return {
        key: value.get(key)
        for key in ("rule_key", "source_refs", "difference", "reference_chain")
    } | {
        "control_reason_codes": value.get("control_reason_codes", value["reason_codes"])
    }


def ensure_runs(conn, company, manifest, actor, kind, raw=None):
    current = lock_manifest_session(conn, company, manifest)
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":comparison:" + str(manifest) + ":" + kind,),
    )
    existing = conn.execute(
        "SELECT * FROM app.reconciliation_runs WHERE company_id=%s AND manifest_id=%s AND kind=%s",
        (company, manifest, kind),
    ).fetchone()
    if existing:
        return existing
    raw = pinned_rows(conn, company, manifest) if raw is None else raw
    logical_ids = [r["logical_record_id"] for r in raw]
    prior_reviews = conn.execute(
        "SELECT c.evidence,d.id,d.action,d.reason,d.created_at,ARRAY(SELECT DISTINCT rr.logical_record_id FROM jsonb_array_elements(c.evidence->'source_refs') item JOIN app.record_revisions rr ON rr.company_id=c.company_id AND rr.normalized_row_id=(item->>'normalized_row_id')::uuid) AS logical_ids FROM app.reconciliation_runs run JOIN app.reconciliation_candidates c ON c.company_id=run.company_id AND c.run_id=run.id JOIN app.decisions d ON d.company_id=c.company_id AND d.id=c.latest_decision_id WHERE run.company_id=%s AND run.kind=%s AND run.manifest_id<>%s AND d.provenance IN ('human','preserved_human') AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.evidence->'source_refs') item JOIN app.record_revisions rr ON rr.company_id=c.company_id AND rr.normalized_row_id=(item->>'normalized_row_id')::uuid WHERE rr.logical_record_id=ANY(%s::uuid[])) ORDER BY d.created_at DESC,d.id DESC",
        (company, kind, manifest, logical_ids),
    ).fetchall()
    prior_by_logical = {}
    for review in prior_reviews:
        for identity in review["logical_ids"]:
            prior_by_logical.setdefault(str(identity), []).append(review)
    row_logical = {str(r["normalized_id"]): str(r["logical_record_id"]) for r in raw}
    all_rows = [
        ComparisonRow(
            str(r["normalized_id"]),
            str(r["source_row_id"]),
            str(r["file_id"]),
            r["sheet"],
            r["row_number"],
            r["kind"],
            r["values"],
            str(r["record_revision_id"]),
        )
        for r in raw
        if r["state"] == "valid"
        and not r["error_codes"]
        and r["values"].get("unit") == "IRR"
    ]
    rows = [
        r
        for r in all_rows
        if current["starts_on"].isoformat()
        <= r.values.get("date", r.values.get("issued_on", ""))
        <= current["as_of_date"].isoformat()
    ]
    required = (
        {"bank", "ledger"}
        if kind == "bank_ledger"
        else {"sales_invoices", "moadian_sales"}
        if kind == "moadian_sales"
        else {"purchase_invoices", "moadian_purchases"}
    )
    missing_kinds = sorted(required - {r.kind for r in rows})
    bindings = (
        bank_bindings(conn, company, manifest, raw) if kind == "bank_ledger" else {}
    )
    specs = (
        bank_ledger(rows, bindings)
        if kind == "bank_ledger"
        else moadian(rows, "sales" if kind == "moadian_sales" else "purchase", all_rows)
    )
    moves = (
        project_banks(conn, company, manifest, raw, bindings)
        if kind == "bank_ledger"
        else {}
    )
    adjusted = []
    for spec in specs:
        bank = next((r for side, r in spec.rows if side == "bank"), None)
        if (
            bank
            and bindings.get(bank.file_id + ":" + bank.sheet)
            and bank.record_revision_id not in moves
        ):
            spec = CandidateSpec(
                "needs_review",
                spec.rows,
                ("bank_source_changed",),
                spec.difference,
                spec.chain,
            )
        adjusted.append(spec)
    specs = adjusted
    run = conn.execute(
        "INSERT INTO app.reconciliation_runs(company_id,manifest_id,kind,policy_id,missing_source_kinds,status) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *",
        (
            company,
            manifest,
            kind,
            current["financial_policy_id"],
            missing_kinds,
            "limited"
            if missing_kinds
            or any(s.classification not in ("exact_unique", "unmatched") for s in specs)
            else "ready",
        ),
    ).fetchone()
    candidate_rows = []
    decisions = []
    for spec in specs:
        bank = next((r for side, r in spec.rows if side == "bank"), None)
        evidence = {
            "rule_key": "comparison-v1.0",
            "source_refs": [source_view(side, r) for side, r in spec.rows],
            "reason_codes": list(spec.reasons),
            "control_reason_codes": list(spec.reasons),
            "difference": spec.difference,
            "reference_chain": list(spec.chain),
        }
        related = {
            review["id"]: review
            for _, source in spec.rows
            for review in prior_by_logical.get(row_logical[source.normalized_id], [])
        }
        prior = (
            max(related.values(), key=lambda r: (r["created_at"], str(r["id"])))
            if related
            else None
        )

        unchanged = prior is not None and comparison_proof(
            prior["evidence"]
        ) == comparison_proof(evidence)
        if prior and not unchanged:
            spec = CandidateSpec(
                "needs_review",
                spec.rows,
                ("prior_decision_requires_review",),
                spec.difference,
                spec.chain,
            )
            evidence["reason_codes"] = list(spec.reasons)
            evidence["prior_decision_id"] = str(prior["id"])
        candidate = str(uuid4())
        candidate_rows.append(
            {
                "id": candidate,
                "bank_movement_id": moves.get(bank.record_revision_id)
                if bank
                else None,
                "classification": spec.classification,
                "evidence": evidence,
            }
        )
        decisions.append((candidate, spec, prior, unchanged))
    for batch in chunks(candidate_rows):
        conn.execute(
            "INSERT INTO app.reconciliation_candidates(id,company_id,run_id,bank_movement_id,classification,evidence) SELECT v.id,%s,%s,v.bank_movement_id,v.classification,v.evidence FROM jsonb_to_recordset(%s) AS v(id uuid,bank_movement_id uuid,classification text,evidence jsonb)",
            (company, run["id"], Jsonb(batch)),
        )
    automatic = [
        (candidate, spec)
        for candidate, spec, prior, unchanged in decisions
        if not unchanged and spec.classification == "exact_unique"
    ]
    # Accept unique automatic pairs before preserving valid human decisions, so the
    # same capacity rules reject any collision; the whole unpublished run rolls back.
    accept_fresh_unique(conn, company, run["id"], actor, automatic)
    for candidate, spec, prior, unchanged in decisions:
        if unchanged:
            record_decision(
                conn,
                company,
                candidate,
                prior["action"],
                actor,
                "حفظ تصمیم معتبر نسخه پیشین",
                "preserved_human",
                prior["id"],
            )
    return run


def record_decision(
    conn,
    company,
    candidate,
    action,
    actor,
    reason,
    provenance="human",
    source_decision=None,
):
    row = conn.execute(
        "SELECT * FROM app.reconciliation_candidates WHERE company_id=%s AND id=%s FOR UPDATE",
        (company, candidate),
    ).fetchone()
    if not row:
        raise missing()
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":comparison-capacity:" + str(row["run_id"]),),
    )
    refs = row["evidence"]["source_refs"]
    if action == "accept":
        if (
            len(refs) < 2
            or row["classification"] in ("unmatched", "amount_mismatch", "needs_review")
            or row["evidence"]["reason_codes"]
            not in (
                [],
                ["competing_candidates"],
                ["date_mismatch"],
                ["group_sum_equal"],
            )
        ):
            raise conflict("comparison_requires_valid_controls")
        ids = sorted(r["normalized_row_id"] for r in refs)
        occupied = conn.execute(
            "SELECT 1 FROM app.reconciliation_claims WHERE company_id=%s AND run_id=%s AND normalized_row_id=ANY(%s::uuid[]) AND candidate_id<>%s",
            (company, row["run_id"], ids, candidate),
        ).fetchone()
        if occupied:
            raise conflict("comparison_capacity_conflict")
        for identity in ids:
            conn.execute(
                "INSERT INTO app.reconciliation_claims(company_id,run_id,normalized_row_id,candidate_id) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (company, row["run_id"], identity, candidate),
            )
    else:
        conn.execute(
            "DELETE FROM app.reconciliation_claims WHERE company_id=%s AND candidate_id=%s",
            (company, candidate),
        )
    decision = conn.execute(
        "INSERT INTO app.decisions(company_id,candidate_id,action,actor_id,reason,provenance,source_decision_id) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (company, candidate, action, actor, reason, provenance, source_decision),
    ).fetchone()
    conn.execute(
        "UPDATE app.reconciliation_candidates SET accepted=%s,latest_decision_id=%s WHERE company_id=%s AND id=%s",
        (action == "accept", decision["id"], company, candidate),
    )
    return decision
