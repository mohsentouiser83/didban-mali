"""Explicit aggregate payroll commitment links; no inferred payout dates or posting."""

from __future__ import annotations
from decimal import Decimal
from psycopg.types.json import Jsonb
from ..errors import ApiError, missing, conflict
from ..domain.payroll.calculation import PayrollValidation
from ..infrastructure.company_modules import require_module


def link_financial(conn, company, actor, run, body):
    require_module(conn, company, "settlements")
    if conn.execute(
        "SELECT 1 FROM app.payroll_financial_links WHERE company_id=%s AND run_id=%s",
        (company, run["id"]),
    ).fetchone():
        raise conflict("payroll_already_linked")
    parent = (
        conn.execute(
            "SELECT * FROM app.payroll_financial_links WHERE company_id=%s AND run_id=%s",
            (company, run["supersedes_id"]),
        ).fetchone()
        if run["supersedes_id"]
        else None
    )
    net = Decimal(run["content"].get("delta_totals", run["content"]["totals"])["net"])
    if net <= 0:
        raise PayrollValidation("payroll_nonpositive_commitment")
    old = None
    if body["existing_plan_id"]:
        old = conn.execute(
            "SELECT p.*,o.invoice_id FROM app.planned_payment_versions p JOIN app.obligations o ON o.company_id=p.company_id AND o.id=p.obligation_id WHERE p.company_id=%s AND p.id=%s",
            (company, body["existing_plan_id"]),
        ).fetchone()
        if not old:
            raise missing()
        conn.execute(
            "SELECT id FROM app.obligations WHERE company_id=%s AND id=%s FOR UPDATE",
            (company, old["obligation_id"]),
        )
        latest = conn.execute(
            "SELECT id FROM app.planned_payment_versions WHERE company_id=%s AND obligation_id=%s ORDER BY created_at DESC,id DESC LIMIT 1",
            (company, old["obligation_id"]),
        ).fetchone()
        if (
            str(latest["id"]) != str(old["id"])
            or old["row_version"] != body["existing_plan_version"]
            or old["state"] != "confirmed"
            or old["invoice_id"]
        ):
            raise conflict("payroll_plan_scope_or_version")
        if parent and parent["obligation_id"] != old["obligation_id"]:
            raise conflict("payroll_correction_obligation_mismatch")
        if old["scheduled_on"].isoformat() != body["scheduled_on"] and not parent:
            raise conflict("payroll_plan_date_mismatch")
        if not parent and old["total_amount"] != net:
            raise conflict("payroll_plan_amount_mismatch")
        if (
            not parent
            and conn.execute(
                "SELECT 1 FROM app.payroll_financial_links WHERE company_id=%s AND obligation_id=%s",
                (company, old["obligation_id"]),
            ).fetchone()
        ):
            raise conflict("payroll_plan_already_linked")
        obligation = old["obligation_id"]
    else:
        if parent:
            raise conflict("payroll_correction_requires_existing_plan")
        from ..infrastructure.settlement_records import plans

        if (
            sum(
                1
                for p in plans(conn, company, run["period_end"])
                if not p["invoice_id"] and p["state"] == "confirmed"
            )
            > 1000
        ):
            raise ApiError(
                409,
                "payroll_plan_options_incomplete",
                "فهرست برنامه‌ها کامل نیست؛ برنامه موجود را انتخاب کنید.",
            )
        obligation = conn.execute(
            "INSERT INTO app.obligations(company_id,title) VALUES(%s,'حقوق دوره') RETURNING id",
            (company,),
        ).fetchone()["id"]
    if old and not parent:
        plan = old
    else:
        plan = conn.execute(
            "INSERT INTO app.planned_payment_versions(company_id,obligation_id,supersedes_id,scheduled_on,total_amount,state,actor_id,title_snapshot,row_version) VALUES(%s,%s,%s,%s,%s,'confirmed',%s,'حقوق دوره',%s) RETURNING *",
            (
                company,
                obligation,
                old["id"] if old else None,
                body["scheduled_on"],
                old["total_amount"] + net if old else net,
                actor,
                old["row_version"] + 1 if old else 1,
            ),
        ).fetchone()
    ids = body["ledger_line_ids"]
    comparison = {
        "status": "unavailable",
        "reason": "ledger_lines_not_selected",
        "payroll_net": str(net),
        "ledger_credit": None,
        "difference": None,
        "line_ids": [],
    }
    if ids:
        if not body["source_manifest_id"]:
            raise PayrollValidation("payroll_ledger_manifest_required")
        rows = conn.execute(
            """SELECT DISTINCT l.id,l.credit FROM app.journal_lines l JOIN app.journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id
        JOIN app.revision_records rr ON rr.company_id=e.company_id AND rr.record_revision_id=e.record_revision_id
        JOIN app.result_manifests m ON m.company_id=rr.company_id AND m.dataset_revision_id=rr.dataset_revision_id
        WHERE l.company_id=%s AND l.id=ANY(%s::uuid[]) AND m.id=%s AND m.status='published' AND e.entry_on BETWEEN %s AND %s AND e.entry_type IN('regular','real_adjustment') AND l.credit>0""",
            (
                company,
                ids,
                body["source_manifest_id"],
                run["period_start"],
                run["period_end"],
            ),
        ).fetchall()
        if len(rows) != len(ids):
            raise PayrollValidation("payroll_ledger_lines_not_in_scope")
        credit = sum((r["credit"] for r in rows), Decimal(0))
        comparison = {
            "status": "compared_selected_lines",
            "reason": None,
            "payroll_net": str(net),
            "ledger_credit": str(credit),
            "difference": str(net - credit),
            "line_ids": ids,
        }
    elif body["source_manifest_id"]:
        raise PayrollValidation("payroll_ledger_lines_required")
    content = {
        "scheduled_on": body["scheduled_on"],
        "reason": body["reason"],
        "ledger_comparison": comparison,
        "aggregate_only": True,
        "existing_plan": bool(old),
    }
    row = conn.execute(
        "INSERT INTO app.payroll_financial_links(company_id,run_id,obligation_id,plan_id,source_manifest_id,actor_id,content) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (
            company,
            run["id"],
            obligation,
            plan["id"],
            body["source_manifest_id"],
            actor,
            Jsonb(content),
        ),
    ).fetchone()
    return {
        "id": str(row["id"]),
        "obligation_id": str(obligation),
        "plan_id": str(plan["id"]),
        "plan_version": plan["row_version"],
        **content,
    }


def financial_options(conn, company, run):
    from ..infrastructure.settlement_records import plans

    current = plans(conn, company, run["period_end"])
    choices = [p for p in current if not p["invoice_id"] and p["state"] == "confirmed"]
    manifest = conn.execute(
        "SELECT id FROM app.result_manifests WHERE company_id=%s AND status='published' AND as_of_date>=%s ORDER BY as_of_date,created_at DESC LIMIT 1",
        (company, run["period_end"]),
    ).fetchone()
    lines = []
    if manifest:
        rows = conn.execute(
            """SELECT DISTINCT l.id,l.credit,e.source_entry_id,e.entry_on,a.code,a.name FROM app.journal_lines l
        JOIN app.accounts a ON a.company_id=l.company_id AND a.id=l.account_id
        JOIN app.journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id
        JOIN app.revision_records rr ON rr.company_id=e.company_id AND rr.record_revision_id=e.record_revision_id
        JOIN app.result_manifests m ON m.company_id=rr.company_id AND m.dataset_revision_id=rr.dataset_revision_id
        WHERE l.company_id=%s AND m.id=%s AND l.credit>0 AND e.entry_type IN('regular','real_adjustment') AND e.entry_on BETWEEN %s AND %s ORDER BY e.entry_on,l.id LIMIT 1001""",
            (company, manifest["id"], run["period_start"], run["period_end"]),
        ).fetchall()
        lines = [
            {
                "id": str(r["id"]),
                "entry": r["source_entry_id"],
                "date": str(r["entry_on"]),
                "account_code": r["code"],
                "account_name": r["name"],
                "credit": str(r["credit"]),
            }
            for r in rows[:1000]
        ]
    return {
        "plans": [
            {
                "id": p["id"],
                "title": p["title"],
                "scheduled_on": p["scheduled_on"],
                "total_amount": p["total_amount"],
                "version": p["version"],
            }
            for p in choices[:1000]
        ],
        "source_manifest_id": str(manifest["id"]) if manifest else None,
        "ledger_lines": lines,
        "plans_truncated": len(choices) > 1000,
        "ledger_truncated": bool(manifest is not None and len(rows) > 1000),
        "truncated": len(choices) > 1000 or (manifest is not None and len(rows) > 1000),
    }
