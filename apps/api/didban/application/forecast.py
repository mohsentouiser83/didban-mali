"""Pinned forecast runs and required session-wide clarifications."""

from __future__ import annotations
from datetime import date, timedelta
from decimal import Decimal
from psycopg.types.json import Jsonb
from ..domain.forecast import forecast, forecast_summary
from ..infrastructure import settlements as store
from ..infrastructure.financial import digest
from ..infrastructure.policies import configured_policy
from ..infrastructure.intake import IntakeRepository
from ..infrastructure.company_modules import require_module
from ..errors import conflict, missing
from .auth import response


def run_view(row):
    return {
        k: str(row[k])
        if k in ("id", "manifest_id", "snapshot_id", "session_id")
        else row[k]
        for k in (
            "id",
            "manifest_id",
            "snapshot_id",
            "session_id",
            "status",
            "created_at",
        )
    } | {"forecast": row["content"]}


def new_run(conn, company, session, manifest, parameters=None):
    work = store.workspace(conn, company, manifest)
    p = store.projection(conn, company, manifest)
    if not work or not p:
        raise conflict("projection_not_ready")
    cash = conn.execute(
        "SELECT value,status FROM app.metric_observations WHERE company_id=%s AND manifest_id=%s AND metric_key='cash'",
        (company, manifest),
    ).fetchone()
    configured = configured_policy(conn, company, "forecast")
    config = (
        {
            "minimum_events": 3,
            "lookback_days": 180,
            "delay_method": "amount_weighted_median",
        }
        | (configured["parameters"] if configured else {})
        | (parameters or {})
    )
    conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        (str(company) + ":forecast-policy",),
    )
    policy = conn.execute(
        "INSERT INTO app.policy_versions(company_id,kind,version,effective_from,parameters,validation_status,actor_id) SELECT %s,'forecast',coalesce(max(version),0)+1,%s,%s,'proposed',%s FROM app.policy_versions WHERE company_id=%s AND kind='forecast' RETURNING id",
        (company, work["as_of_date"], Jsonb(config), session["requested_by"], company),
    ).fetchone()["id"]
    payment_plans = store.plans(conn, company, date.fromisoformat(work["as_of_date"]))
    history = list(p["history"])
    event_map = {e["id"]: e for e in work["events"]}
    for invoice in work["invoices"]:
        if (
            invoice["direction"] != "sales"
            or invoice["remaining_as_of"] != "0"
            or not invoice["due_on"]
        ):
            continue
        paid_dates = [
            event_map[a["settlement_event_id"]]["settled_on"]
            for a in work["allocations"]
            if not a["reversed"]
            and a["invoice_id"] == invoice["invoice_id"]
            and a["settlement_event_id"] in event_map
            and event_map[a["settlement_event_id"]]["settled_on"] <= work["as_of_date"]
        ]
        if paid_dates:
            history.append(
                {
                    "event_id": "closed:" + invoice["invoice_id"],
                    "party_id": invoice["party_id"],
                    "invoice_id": invoice["source_invoice_id"],
                    "due_on": invoice["due_on"],
                    "paid_on": max(paid_dates),
                    "amount": invoice["gross"],
                }
            )
    inputs = {
        "workspace": work,
        "plans": payment_plans,
        "cash": str(cash["value"]) if cash and cash["value"] is not None else None,
        "history": history,
        "policy": config,
        "has_payment_source": p["has_payment_source"],
        "source_reason_codes": p.get("forecast_source_reason_codes", []),
    }
    answers = (
        {"policy": True}
        if parameters
        and "minimum_events" in parameters
        and "lookback_days" in parameters
        else {}
    )
    row = conn.execute(
        "INSERT INTO app.forecast_runs(company_id,manifest_id,session_id,snapshot_id,policy_id,input_fingerprint,inputs,answers,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,'waiting_input') RETURNING *",
        (
            company,
            manifest,
            session["id"],
            work["id"],
            policy,
            digest(inputs),
            Jsonb(inputs),
            Jsonb(answers),
        ),
    ).fetchone()
    return row


def prepare_forecast(conn, company, session, actor):
    actor_id = str(actor["id"]) if isinstance(actor, dict) else str(actor)
    manifest = session["manifest_id"]
    row = conn.execute(
        "SELECT * FROM app.forecast_runs WHERE company_id=%s AND manifest_id=%s AND session_id=%s ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE",
        (company, manifest, session["id"]),
    ).fetchone()
    if not row:
        row = new_run(conn, company, session, manifest)
    if row["status"] == "published":
        return {"run_id": str(row["id"]), "waiting_input": False, "published": True}
    inputs, answers = row["inputs"], row["answers"]
    work = inputs["workspace"]
    as_of = date.fromisoformat(work["as_of_date"])
    pending = conn.execute(
        "SELECT i.id FROM app.forecast_question_links l JOIN app.processing_issues i ON i.company_id=l.company_id AND i.id=l.issue_id WHERE l.company_id=%s AND l.run_id=%s AND i.resolved_at IS NULL AND i.superseded_at IS NULL",
        (company, row["id"]),
    ).fetchone()
    if pending:
        return {"run_id": str(row["id"]), "waiting_input": True, "published": False}
    policy = inputs["policy"]
    minimum = policy["minimum_events"] if answers.get("policy") else 10000
    days, questions, reasons = forecast(
        inputs["cash"],
        as_of,
        work["invoices"],
        inputs["plans"],
        inputs["history"],
        answers,
        minimum,
        policy["lookback_days"],
    )
    reasons += inputs.get("source_reason_codes", [])
    future_invoices = [
        i
        for i in work["invoices"]
        if i["remaining_as_of"] is not None and Decimal(i["remaining_as_of"]) > 0
    ]
    future_plans = [
        p
        for p in inputs["plans"]
        if p["state"] == "confirmed"
        and p["remaining_amount"] is not None
        and Decimal(p["remaining_amount"]) > 0
    ]
    has_future = bool(future_invoices or future_plans)
    has_receipts = any(i["direction"] == "sales" for i in future_invoices)
    if not has_future:
        reasons.append("forecast_sources_missing")
        for d in days:
            d.update(
                opening=None,
                expected_in=None,
                expected_out=None,
                closing=None,
                status="unavailable",
            )
    if has_receipts and inputs["history"] and "policy" not in answers:
        questions.insert(
            0,
            {
                "key": "policy",
                "text": f"برای برآورد تأخیر، حداقل {policy['minimum_events']} سابقه در {policy['lookback_days']} روز مبنا باشد؟",
                "kind": "choice",
                "choices": ["affirmed", "unknown"],
            },
        )
    elif has_future and "payments_complete" not in answers:
        questions.insert(
            0,
            {
                "key": "payments_complete",
                "text": "فاکتورهای خرید و برنامه‌ها، تمام پرداخت‌های مورد انتظار این ۳۰ روز را پوشش می‌دهند؟",
                "kind": "choice",
                "choices": ["affirmed", "unknown"],
            },
        )
    if questions and has_future:
        q = questions[0]
        constraints = {
            "setting_key": "forecast",
            "forecast_run_id": str(row["id"]),
            "forecast_key": q["key"],
            "allow_unknown": True,
        }
        if q["kind"] == "choice":
            constraints["choices"] = q["choices"]
        else:
            constraints |= {
                "min_date": str(as_of + timedelta(days=1)),
                "max_date": str(as_of + timedelta(days=3650)),
            }
        issue = conn.execute(
            "INSERT INTO app.processing_issues(company_id,session_id,code,root_key,question_fa,answer_kind,answer_constraints,opened_session_version) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (
                company,
                session["id"],
                "forecast_" + q["kind"],
                "forecast:" + str(row["id"]) + ":" + q["key"],
                q["text"],
                q["kind"],
                Jsonb(constraints),
                session["session_version"],
            ),
        ).fetchone()["id"]
        conn.execute(
            "INSERT INTO app.forecast_question_links(company_id,issue_id,run_id,answer_key) VALUES(%s,%s,%s,%s)",
            (company, issue, row["id"], q["key"]),
        )
        IntakeRepository(conn).notify(
            company,
            actor_id,
            str(session["id"]),
            "برای ادامه پیش‌بینی، پاسخ شما لازم است.",
            str(issue),
        )
        return {"run_id": str(row["id"]), "waiting_input": True, "published": False}
    if has_future and answers.get("payments_complete") is not True:
        reasons.append("future_payment_coverage_unknown")
    if has_receipts and answers.get("policy") is not True:
        reasons.append("forecast_policy_unconfirmed")
    if not any(i["direction"] == "sales" for i in work["invoices"]):
        reasons.append("receivable_source_missing")
    assumptions = [
        "این پیش‌بینی بر پایه مانده و تعهدهای معلوم در نسخه مشخص است؛ برآورد، تضمین وصول نیست.",
        "حد کفایت سابقه، فرض اجرایی اعلام‌شده کاربر است و ارزیابی مستقل آماری محسوب نمی‌شود.",
    ]
    labels = {
        "forecast_invalid_payment_rows": "بعضی ردیف‌های برنامه پرداخت نامعتبرند؛ فقط تعهدهای معتبر در پیش‌بینی آمده‌اند.",
        "forecast_invalid_history_rows": "بعضی سوابق وصول نامعتبرند؛ برآورد وصول فقط بر سابقه معتبر تکیه دارد.",
        "forecast_invalid_invoice_rows": "بعضی فاکتورها نامعتبرند؛ دریافت و پرداخت آینده کامل نیست.",
        "forecast_invalid_settlement_rows": "بعضی تسویه‌ها نامعتبرند؛ مانده تعهدهای وابسته قابل اتکا نیست.",
        "future_payment_coverage_unknown": "کامل‌بودن برنامه پرداخت تأیید نشده؛ فقط تعهدهای معلوم لحاظ شده‌اند.",
        "forecast_policy_unconfirmed": "زمان وصول‌ها با پاسخ موردی کاربر تعیین شده است.",
        "expected_date_unknown": "موارد با زمان نامشخص در جریان برآوردی نیامده‌اند.",
        "receivable_source_missing": "فاکتور فروش موجود نیست؛ دریافت‌های آینده کامل نیستند.",
        "payment_history_unknown": "سابقه پرداخت بعضی تعهدها کامل نیست.",
        "obligation_overlap": "تعهدهای هم‌پوشان نیازمند بررسی‌اند.",
        "balance_anchor_missing": "مانده مبنای معتبر موجود نیست.",
        "forecast_sources_missing": "فاکتور باز یا برنامه پرداخت معتبر برای پیش‌بینی موجود نیست.",
    }
    assumptions += [
        labels.get(reason, "داده برخی تعهدها برای پیش‌بینی کافی نیست.")
        for reason in dict.fromkeys(reasons)
    ]
    for d in days:
        d["reason_codes"] = list(dict.fromkeys(d["reason_codes"] + reasons))
        if reasons and d["status"] == "estimated":
            d["status"] = "limited"
    excluded_invoices = {
        i["invoice_id"]
        for i in work["invoices"]
        if answers.get(
            ("receipt|" if i["direction"] == "sales" else "payment|invoice|")
            + i["invoice_id"],
            "not_answered",
        )
        is None
    }
    excluded_invoices.update(
        p["invoice_id"]
        for p in inputs["plans"]
        if p["invoice_id"]
        and answers.get("payment|" + p["obligation_id"], "not_answered") is None
    )
    content = {
        "manifest_id": str(manifest),
        "run_id": str(row["id"]),
        "snapshot_id": str(row["snapshot_id"]),
        "policy_id": str(row["policy_id"]),
        "as_of_date": str(as_of),
        "status": "unavailable"
        if inputs["cash"] is None or not has_future
        else "limited"
        if reasons
        else "estimated",
        "days": days,
        "assumptions": list(dict.fromkeys(assumptions)),
        "excluded_evidence_refs": list(
            dict.fromkeys(
                e
                for i in work["invoices"]
                if i["invoice_id"] in excluded_invoices
                for e in i["evidence_refs"]
            )
        ),
        "summary": forecast_summary(days),
    }
    conn.execute(
        "UPDATE app.forecast_runs SET status='published',content=%s WHERE company_id=%s AND id=%s",
        (Jsonb(content), company, row["id"]),
    )
    IntakeRepository(conn).notify(
        company, actor_id, str(session["id"]), "نسخه پیش‌بینی نقدینگی آماده است."
    )
    return {"run_id": str(row["id"]), "waiting_input": False, "published": True}


class ForecastService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(conn, actor, company, op == "createForecast")
            if op == "createForecast":
                require_module(conn, company, "forecast")
            if op == "listForecastRuns":
                if not store.active_manifest(conn, company, ids["manifest_id"]):
                    raise missing()
                resource = op + ":" + ids["manifest_id"]
                pos = self.intake.security.read_cursor(
                    cursor, resource, str(actor["id"]), company
                )
                rows = conn.execute(
                    "SELECT * FROM app.forecast_runs WHERE company_id=%s AND manifest_id=%s AND (%s::timestamptz IS NULL OR (created_at,id)>(%s::timestamptz,%s::uuid)) ORDER BY created_at,id LIMIT %s",
                    (
                        company,
                        ids["manifest_id"],
                        pos[0] if pos else None,
                        pos[0] if pos else None,
                        pos[1] if pos else None,
                        limit + 1,
                    ),
                ).fetchall()
                return response(
                    {
                        "items": [run_view(r) for r in rows[:limit]],
                        "next_cursor": self.intake.security.cursor(
                            resource, str(actor["id"]), company, rows[limit - 1]
                        )
                        if len(rows) > limit
                        else None,
                    }
                )
            if op == "getForecastRun":
                row = conn.execute(
                    "SELECT * FROM app.forecast_runs WHERE company_id=%s AND id=%s",
                    (company, ids["forecast_id"]),
                ).fetchone()
                if not row:
                    raise missing()
                return response(run_view(row))
            if op == "getForecast":
                row = conn.execute(
                    "SELECT * FROM app.forecast_runs WHERE company_id=%s AND manifest_id=%s AND status='published' ORDER BY created_at DESC,id DESC LIMIT 1",
                    (company, ids["manifest_id"]),
                ).fetchone()
                if not row:
                    raise missing()
                return response(row["content"])

            def action():
                from .forecast_start import start_forecast_revision

                row = start_forecast_revision(
                    conn, company, actor, ids["manifest_id"], body
                )
                access.audit(
                    company,
                    str(actor["id"]),
                    "forecast.started",
                    "forecast_run",
                    str(row["id"]),
                    request_id,
                )
                return response(run_view(row), 201)

            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + ids["manifest_id"],
                key=key,
                payload={"body": body},
                action=action,
            )
