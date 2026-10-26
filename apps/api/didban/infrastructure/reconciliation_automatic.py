"""Equivalent acceptance controls for a fresh, private, uncontested comparison run."""

from uuid import uuid4
from psycopg.types.json import Jsonb
from ..errors import conflict
from .reconciliation_projection import chunks


def accept_fresh_unique(conn, company, run, actor, candidates):
    if not candidates:
        return
    # The run is newly inserted under the manifest/kind lock and is not externally
    # visible until commit. Human/preserved decisions continue through record_decision.
    seen = set()
    claims = []
    decisions = []
    for candidate, spec in candidates:
        if spec.classification != "exact_unique" or len(spec.rows) < 2 or spec.reasons:
            raise conflict("comparison_requires_valid_controls")
        for _, row in spec.rows:
            if row.normalized_id in seen:
                raise conflict("comparison_capacity_conflict")
            seen.add(row.normalized_id)
            claims.append(
                {"normalized_row_id": row.normalized_id, "candidate_id": candidate}
            )
        decisions.append({"id": str(uuid4()), "candidate_id": candidate})
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":comparison-capacity:" + str(run),),
    )
    if conn.execute(
        "SELECT 1 FROM app.reconciliation_claims WHERE company_id=%s AND run_id=%s LIMIT 1",
        (company, run),
    ).fetchone():
        raise conflict("comparison_capacity_conflict")
    for batch in chunks(claims):
        conn.execute(
            "INSERT INTO app.reconciliation_claims(company_id,run_id,normalized_row_id,candidate_id) SELECT %s,%s,v.normalized_row_id,v.candidate_id FROM jsonb_to_recordset(%s) AS v(normalized_row_id uuid,candidate_id uuid)",
            (company, run, Jsonb(batch)),
        )
    for batch in chunks(decisions):
        conn.execute(
            "INSERT INTO app.decisions(id,company_id,candidate_id,action,actor_id,reason,provenance) SELECT v.id,%s,v.candidate_id,'accept',%s,'تطبیق یکتای دارای شواهد و کنترل مستقل','validated_automatic' FROM jsonb_to_recordset(%s) AS v(id uuid,candidate_id uuid)",
            (company, actor, Jsonb(batch)),
        )
        conn.execute(
            "UPDATE app.reconciliation_candidates c SET accepted=true,latest_decision_id=v.id FROM jsonb_to_recordset(%s) AS v(id uuid,candidate_id uuid) WHERE c.company_id=%s AND c.run_id=%s AND c.id=v.candidate_id",
            (Jsonb(batch), company, run),
        )
