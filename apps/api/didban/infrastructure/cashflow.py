"""Immutable period cashflow snapshots over pinned financial inputs and comparison evidence."""

from __future__ import annotations
from collections import defaultdict
from decimal import localcontext
from psycopg.types.json import Jsonb
from ..application.financial_questions import declarations
from ..domain.cashflow import period_cashflow
from ..domain.financial.common import amount, coverage_reason
from ..domain.financial.types import FinancialRow, PeriodSpec
from .reconciliation import pinned_rows, lock_manifest_session, project_banks


def pinned_context(conn, company, manifest, raw=None):
    current = conn.execute(
        "SELECT m.*,p.starts_on,p.ends_on,p.previous_period_id FROM app.result_manifests m JOIN app.financial_periods p ON p.company_id=m.company_id AND p.id=m.period_id WHERE m.company_id=%s AND m.id=%s",
        (company, manifest),
    ).fetchone()
    raw = pinned_rows(conn, company, manifest) if raw is None else raw
    rows = [
        FinancialRow(
            str(r["normalized_id"]),
            str(r["source_row_id"]),
            str(r["file_id"]),
            str(r["interpretation_id"]),
            r["sheet"],
            r["row_number"],
            r["kind"],
            r["values"],
            r["state"],
            tuple(r["error_codes"]),
        )
        for r in raw
    ]
    answers = conn.execute(
        "SELECT i.answer_constraints,a.answer,a.actor_id FROM app.manifest_dependencies d JOIN app.issue_answers a ON a.company_id=d.company_id AND a.id=d.answer_id JOIN app.processing_issues i ON i.company_id=a.company_id AND i.id=a.issue_id WHERE d.company_id=%s AND d.manifest_id=%s AND i.code='financial_declaration' ORDER BY a.created_at,a.id",
        (company, manifest),
    ).fetchall()
    values = {
        r["answer_constraints"]["financial_key"]: r["answer"].get("value")
        for r in answers
    }
    actors = {
        r["answer_constraints"]["financial_key"]: str(r["actor_id"]) for r in answers
    }
    period = PeriodSpec(
        str(current["period_id"]),
        current["starts_on"],
        current["ends_on"],
        current["as_of_date"],
    )
    previous = None
    if current["previous_period_id"]:
        p = conn.execute(
            "SELECT * FROM app.financial_periods WHERE company_id=%s AND id=%s",
            (company, current["previous_period_id"]),
        ).fetchone()
        previous = PeriodSpec(str(p["id"]), p["starts_on"], p["ends_on"])
    return rows, period, declarations(rows, period, previous, values, actors)


def classify_movements(conn, company, manifest, rows, period, declared):
    if coverage_reason("ledger", period.starts_on, period.cutoff, declared):
        return {}
    groups = defaultdict(list)
    row_by_id = {r.normalized_id: r for r in rows}
    for r in rows:
        if r.kind == "ledger" and r.state == "valid" and not r.error_codes:
            groups[(r.file_id, r.values["entry_id"])].append(r)
    accepted = conn.execute(
        "SELECT c.evidence FROM app.reconciliation_candidates c JOIN app.reconciliation_runs run ON run.company_id=c.company_id AND run.id=c.run_id WHERE c.company_id=%s AND run.manifest_id=%s AND run.kind='bank_ledger' AND c.accepted",
        (company, manifest),
    ).fetchall()
    links = {}
    for candidate in accepted:
        refs = candidate["evidence"]["source_refs"]
        if len(refs) != 2:
            continue
        bank = next((r for r in refs if r["side"] == "bank"), None)
        ledger = next((r for r in refs if r["side"] == "ledger"), None)
        if bank and ledger:
            links[ledger["normalized_row_id"]] = bank["normalized_row_id"]
    result = {}
    with localcontext() as ctx:
        ctx.prec = 96
        for group in groups.values():
            if any(
                r.values.get("entry_type") in ("opening", "closing_transfer")
                for r in group
            ):
                continue
            if (
                sum(
                    amount(r.values["debit"]) - amount(r.values["credit"])
                    for r in group
                )
                != 0
            ):
                continue
            banks = [r for r in group if r.values.get("role") == "bank"]
            others = [r for r in group if r.values.get("role") != "bank"]
            if (
                len(banks) == 1
                and others
                and all(
                    r.values.get("role") not in ("cash", "unknown", None)
                    for r in others
                )
            ):
                if banks[0].normalized_id in links:
                    result[links[banks[0].normalized_id]] = "external"
            elif (
                len(banks) == 2
                and not others
                and all(r.normalized_id in links for r in banks)
            ):
                a, b = [row_by_id[links[r.normalized_id]] for r in banks]
                va = amount(a.values["amount"])
                vb = amount(b.values["amount"])
                account_a = declared["bank_bindings"].get(a.file_id + ":" + a.sheet)
                account_b = declared["bank_bindings"].get(b.file_id + ":" + b.sheet)
                if (
                    account_a
                    and account_b
                    and account_a != account_b
                    and a.values["date"] == b.values["date"]
                    and va + vb == 0
                ):
                    result[a.normalized_id] = "internal"
                    result[b.normalized_id] = "internal"
    return result


def ensure_cashflow_snapshot(conn, company, manifest, raw=None):
    lock_manifest_session(conn, company, manifest)
    existing = conn.execute(
        "SELECT * FROM app.cashflow_period_snapshots WHERE company_id=%s AND manifest_id=%s",
        (company, manifest),
    ).fetchone()
    if existing:
        return existing
    raw = pinned_rows(conn, company, manifest) if raw is None else raw
    project_banks(conn, company, manifest, raw)
    rows, period, declared = pinned_context(conn, company, manifest, raw)
    ids = {
        r["source_identity"].removeprefix("declared:"): str(r["id"])
        for r in conn.execute(
            "SELECT id,source_identity FROM app.bank_accounts WHERE company_id=%s AND source_identity LIKE 'declared:%%'",
            (company,),
        )
    }
    classification = classify_movements(conn, company, manifest, rows, period, declared)
    payload = period_cashflow(rows, period, declared, ids, classification)
    payload["comparison_decision_ids"] = [
        str(r["latest_decision_id"])
        for r in conn.execute(
            "SELECT c.latest_decision_id FROM app.reconciliation_candidates c JOIN app.reconciliation_runs run ON run.company_id=c.company_id AND run.id=c.run_id WHERE c.company_id=%s AND run.manifest_id=%s AND run.kind='bank_ledger' AND c.accepted",
            (company, manifest),
        )
    ]
    evidence = [
        str(r["evidence_id"])
        for r in conn.execute(
            "SELECT me.evidence_id FROM app.metric_evidence me JOIN app.metric_observations m ON m.company_id=me.company_id AND m.id=me.metric_id WHERE m.company_id=%s AND m.manifest_id=%s AND m.metric_key='cash' ORDER BY me.id LIMIT 100",
            (company, manifest),
        )
    ]
    for account in payload["accounts"]:
        account["evidence_refs"] = evidence
    for date in payload["days"]:
        date["evidence_refs"] = evidence
    return (
        conn.execute(
            "INSERT INTO app.cashflow_period_snapshots(company_id,manifest_id,payload) VALUES(%s,%s,%s) ON CONFLICT(company_id,manifest_id) DO NOTHING RETURNING *",
            (company, manifest, Jsonb(payload)),
        ).fetchone()
        or conn.execute(
            "SELECT * FROM app.cashflow_period_snapshots WHERE company_id=%s AND manifest_id=%s",
            (company, manifest),
        ).fetchone()
    )
