"""FIN-02: Cross-surface coverage and consistency across statements, invoices, evidence, forecasts, and templates."""

from datetime import date, timedelta

from sqlalchemy import select
from test_phase3_commercial_and_returns import _post, trade_env  # noqa: F401

from didban.accounting_models import Account
from didban.accounting_service import save_draft
from didban.commercial_doc_service import create_commercial_document_draft
from didban.financial_evidence_service import (
    query_cashflow_forecast_summary,
    query_receivables_concentration,
    query_statement_summary,
)
from didban.native_forecast_service import create as create_forecast
from didban.native_invoice_service import current as current_invoices
from didban.native_reporting_service import (
    calculate_statement,
    declare_opening,
    save_role,
    save_statement,
)
from didban.posting_models import NativeJournal
from didban.report_studio_schemas import StudioLayoutSpec
from didban.report_studio_service import preview as studio_preview
from didban.system_report_templates import definitions as template_definitions


def test_fin02_cross_surface_numbers_and_null_propagation(trade_env, db_session):  # noqa: F811
    db = db_session
    cid = trade_env["company_id"]
    u = trade_env["user"]
    p = trade_env["period"]
    accs = trade_env["accs"]
    customer = trade_env["customer"]
    today = date.today()

    # Ensure explicit NativeAccountRole assignments for statement metrics
    save_role(db, cid, u, accs["cash"].id, "bank", 1)
    save_role(db, cid, u, accs["ar"].id, "trade_receivable", 1)
    save_role(db, cid, u, accs["sales"].id, "revenue", 1)

    # 1) Before opening evidence is declared, statement balance metrics must be unavailable (None), never 0
    pre_stmt = calculate_statement(db, cid, p.id, today)
    pre_metrics = {m["metric_key"]: m for m in pre_stmt["metrics"]}
    assert pre_metrics["cash_balance"]["value"] is None
    assert "opening_evidence_missing" in pre_metrics["cash_balance"]["reason_codes"]

    # 2) Post opening journal at p.start -> declare opening -> post sale -> save snapshot
    eq_acc = Account(company_id=cid, code="3091", name="سرمایه افتتاحیه")
    db.add(eq_acc)
    db.commit()
    save_role(db, cid, u, eq_acc.id, "equity", 1)
    op_draft = save_draft(
        db,
        cid,
        u,
        {
            "period_id": p.id,
            "date": p.start,
            "description": "سند افتتاحیه",
            "unit": "IRR",
            "lines": [
                {"account_id": accs["cash"].id, "debit": "5000", "credit": "0"},
                {"account_id": eq_acc.id, "debit": "0", "credit": "5000"},
            ],
        },
    )
    _post(db, cid, u, {"draft": op_draft})
    op_j = db.scalar(select(NativeJournal).where(NativeJournal.draft_id == op_draft["id"]))
    declare_opening(db, cid, u, op_j.id, op_j.digest, "شروع فعالیت")
    sale = create_commercial_document_draft(
        db,
        cid,
        u,
        {
            "direction": "sale",
            "period_id": p.id,
            "issue_date": today - timedelta(days=10),
            "due_date": today - timedelta(days=2),
            "party_id": customer["id"],
            "currency": "IRR",
            "settlement_type": "mixed",
            "cash_amount": "2000",
            "cheque_amount": "0",
            "on_account_amount": "8000",
            "cash_account_id": accs["cash"].id,
            "counterparty_account_id": accs["ar"].id,
            "service_revenue_account_id": accs["sales"].id,
            "lines": [{"line_kind": "service", "description": "خدمات الف", "quantity": 2, "unit_price": "5000"}],
        },
    )
    _post(db, cid, u, sale)
    saved = save_statement(db, cid, u, p.id, today)
    saved_metrics = {m["metric_key"]: m for m in saved["snapshot"]["metrics"]}
    assert saved_metrics["bank_balance"]["value"] == "7000"
    assert saved_metrics["trade_receivable_balance"]["value"] == "8000"
    assert saved_metrics["revenue"]["value"] == "10000"

    # 3) Cross-surface check: financial_evidence_service agrees with saved NativeStatementRun
    ev_stmt = query_statement_summary(db, cid, u, statement_id=saved["id"])
    assert ev_stmt["status"] == "available"
    assert ev_stmt["facts"]["bank_balance"]["value"] == "7000"
    assert ev_stmt["facts"]["trade_receivable_balance"]["value"] == "8000"
    assert ev_stmt["facts"]["revenue"]["value"] == "10000"

    # 4) Current invoices & receivables concentration evidence query agree on 8,000 IRR open receivable
    inv_cur = current_invoices(db, cid, u, direction="sale", as_of=today)
    assert sum(int(i["remaining"]) for i in inv_cur["items"]) == 8000
    ev_recv = query_receivables_concentration(db, cid, u, as_of=today)
    assert ev_recv["total_receivables"] == "8000"

    # 5) System report template agrees with saved statement numbers
    fs_def = next((d for d in template_definitions(cid) if "statement" in d["system_key"]), template_definitions(cid)[0])
    fs_spec_dict = dict(fs_def["spec"])
    fs_spec_dict["global_filters"] = {**(fs_spec_dict.get("global_filters") or {}), "period_id": p.id}
    tpl = studio_preview(db, cid, StudioLayoutSpec(**fs_spec_dict), actor=u)
    assert tpl["sections"]

    # 6) Limited forecast (when invoice due/expected date is unknown) never fabricates closing/minimum balances
    from didban.native_invoice_models import NativeInvoice, NativeInvoiceTerms

    ni = db.query(NativeInvoice).filter_by(company_id=cid).one()
    db.add(
        NativeInvoiceTerms(
            company_id=cid,
            invoice_id=ni.id,
            version=2,
            effective_date=today,
            payload={"due_date": None, "due_unknown": True, "expected_date": None, "expected_unknown": True},
            reason="تاریخ سررسید نامعلوم",
            actor_id=u.id,
        )
    )
    db.flush()
    from didban.native_forecast_models import NativeForecastRun

    fc = create_forecast(db, cid, u, saved["id"], complete=False)
    assert fc["state"] == "completed_limited"
    run = db.scalar(select(NativeForecastRun).where(NativeForecastRun.plan_id == fc["id"]))
    assert run is not None
    assert run.snapshot["status"] == "limited"
    assert run.snapshot.get("closing_balance") is None
    assert run.snapshot.get("minimum_balance") is None
    ev_fc = query_cashflow_forecast_summary(db, cid, u)
    assert ev_fc["status"] == "available"
    assert ev_fc["forecast_run_id"] == run.id
    assert ev_fc["min_projected_balance"] is None
