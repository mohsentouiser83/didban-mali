"""Durable continuation of a pinned core snapshot into business analysis."""

from __future__ import annotations
import hashlib
from psycopg.types.json import Jsonb


def enqueue(conn, company, session, step):
    conn.execute(
        "INSERT INTO app.outbox_events(company_id,session_id,event_kind,dedupe_key,payload) VALUES(%s,%s,'analysis.expand',%s,%s) ON CONFLICT(company_id,dedupe_key) DO UPDATE SET published_at=NULL,lease_token=NULL,lease_expires_at=NULL,available_at=clock_timestamp()",
        (company, session, "analysis:" + str(step), Jsonb({"step_id": str(step)})),
    )


def schedule(conn, company, session, manifest):
    policy = conn.execute(
        "SELECT policy_id FROM app.processing_steps WHERE company_id=%s AND session_id=%s AND step_kind='financial:core'",
        (company, session),
    ).fetchone()
    step = conn.execute(
        "INSERT INTO app.processing_steps(company_id,session_id,step_kind,input_fingerprint,policy_id,status,total_items) VALUES(%s,%s,'analysis:domains',%s,%s,'pending',1) ON CONFLICT DO NOTHING RETURNING id",
        (
            company,
            session,
            hashlib.sha256(str(manifest).encode()).hexdigest(),
            policy["policy_id"],
        ),
    ).fetchone()
    if not step:
        step = conn.execute(
            "SELECT id FROM app.processing_steps WHERE company_id=%s AND session_id=%s AND step_kind='analysis:domains'",
            (company, session),
        ).fetchone()
    enqueue(conn, company, session, step["id"])
    return step["id"]
