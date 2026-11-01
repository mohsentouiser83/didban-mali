#!/usr/bin/env python3
"""Exercise PostgreSQL tenant policies on the explicitly disposable test database.

No server is provisioned or removed here. Set DIDBAN_POSTGRES_TEST_URL to the
non-superuser validation role at 127.0.0.1:55435/didban_validation, or pass the
0600 validation environment file. Every inserted row is synthetic and UUID-scoped.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
import os
from pathlib import Path
import sys
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))


def environment(path: Path | None) -> None:
    if path:
        if path.stat().st_mode & 0o077:
            raise RuntimeError("Validation credentials require mode 0600")
        for line in path.read_text().splitlines():
            if line and not line.startswith("#"):
                key, value = line.split("=", 1)
                if key.startswith("DIDBAN_"):
                    os.environ[key] = value
    from sqlalchemy.engine import make_url
    target = os.environ.get("DIDBAN_POSTGRES_TEST_URL", "")
    if not target:
        raise RuntimeError("DIDBAN_POSTGRES_TEST_URL is required")
    parsed = make_url(target)
    if (parsed.host, parsed.port, parsed.database, parsed.username) != ("127.0.0.1", 55435, "didban_validation", "didban_validation_app"):
        raise RuntimeError("Refusing a database outside the disposable validation target")
    os.environ["DIDBAN_DATABASE_URL"] = target
    os.environ["DIDBAN_PRODUCTION"] = "true"
    os.environ["DIDBAN_WEB_ORIGIN"] = "https://didban.test"


def validate() -> dict:
    from sqlalchemy import select, text
    from sqlalchemy.exc import DBAPIError, StatementError
    from didban import models as m
    from didban.db import engine, initialize, transaction, IMMUTABLE

    started = perf_counter()
    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(lambda _: initialize(), range(2)))
    initialization_seconds = perf_counter() - started
    with engine.connect() as connection:
        role = connection.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).one()
        assert role == (False, False), "Validation role is privileged"
        version = connection.execute(text("SELECT current_setting('server_version')")).scalar_one()

    with transaction() as db:
        actor = m.User(email=f"{m.uid()}@validation.test", name="کاربر مصنوعی", password_hash="not-a-login")
        outsider = m.User(email=f"{m.uid()}@validation.test", name="عضو دوم مصنوعی", password_hash="not-a-login")
        companies = [m.Company(name="شرکت مصنوعی الف"), m.Company(name="شرکت مصنوعی ب")]
        db.add_all([actor, outsider, *companies])
        db.flush()
        actor_id, outsider_id = actor.id, outsider.id
        global_audit = m.InstallationAudit(actor_id=actor.id, action="synthetic.validation", entity_id=actor.id, details={})
        db.add(global_audit)
        global_budget = db.scalar(select(m.InstallationModelBudget).where(m.InstallationModelBudget.period == "2999-01"))
        if global_budget is None:
            global_budget = m.InstallationModelBudget(period="2999-01", cap="0", actor_id=actor.id)
            db.add(global_budget)
        db.flush()
        global_audit_id, global_budget_id = global_audit.id, global_budget.id
        company_ids = [company.id for company in companies]

    def seed(company_id: str) -> dict:
        with transaction(company_id) as db:
            db.add(m.Membership(company_id=company_id, user_id=actor_id, role="owner"))
            if company_id == company_ids[1]:
                db.add(m.Membership(company_id=company_id, user_id=outsider_id, role="viewer"))
            period = m.Period(company_id=company_id, name="دوره مصنوعی", start=date(2026, 9, 1), end=date(2026, 9, 30))
            db.add(period)
            db.flush()
            session = m.ProcessingSession(company_id=company_id, actor_id=actor_id, period_id=period.id)
            db.add(session)
            db.flush()
            source = m.SourceFile(company_id=company_id, session_id=session.id, name="synthetic.csv", sha256="0" * 64, size=1, storage_key=m.uid(), scan_status="clean", row_count=1)
            db.add(source)
            db.flush()
            row = m.SourceRow(company_id=company_id, file_id=source.id, sheet="مصنوعی", row_number=2, values={"amount": "100"})
            interpretation = m.Interpretation(company_id=company_id, file_id=source.id, sheet="مصنوعی", family="bank", mapping={}, unit="IRR", calendar="gregorian", provenance="synthetic_test", evidence={})
            db.add_all([row, interpretation])
            db.flush()
            common = {"company_id": company_id, "session_id": session.id, "source_row_id": row.id, "original_unit": "IRR", "original_amount": "100"}
            bank = m.BankMovement(**common, account="synthetic-bank", date=date(2026, 9, 1), amount="100", reference="B", kind="movement")
            invoice = m.Invoice(**common, reference="I", party_id="P", date=date(2026, 9, 1), amount="100", direction="sales")
            journal = m.JournalLine(**common, entry_id="J", date=date(2026, 9, 1), account="A", role="capital", debit="100", credit="0", entry_type="regular")
            settlement = m.Settlement(**common, reference="S", invoice_reference="I", date=date(2026, 9, 1), amount="1", direction="receipt")
            snapshot = m.InvoiceSnapshot(**common, reference="I", tax_id="T", date=date(2026, 9, 1), amount="100", direction="sales", state="original")
            manifest = m.ResultManifest(company_id=company_id, session_id=session.id, period_id=period.id, digest="0" * 64, selection={"row_ids": [row.id]}, metrics=[], details={})
            db.add_all([bank, invoice, journal, settlement, snapshot, manifest])
            db.flush()
            report = m.Report(company_id=company_id, manifest_id=manifest.id, title="گزارش مصنوعی")
            audit = m.AuditEvent(company_id=company_id, actor_id=actor_id, action="synthetic.validation", entity_id=row.id, details={})
            tariff = m.ModelTariff(company_id=company_id, model="validation-only", price_version=m.uid(), input_per_million="1", cached_input_per_million="1", cache_write_per_million="1", output_per_million="1", max_input_tokens=1, max_output_tokens=1, effective_from=m.now())
            db.add_all([report, audit, tariff])
            db.flush()
            approval = m.ReportApproval(company_id=company_id, report_id=report.id, report_version=1, actor_id=actor_id, permission_provenance="synthetic_test")
            db.add(approval)
            run = m.ReconciliationRun(company_id=company_id, manifest_id=manifest.id, actor_id=actor_id, bank_to_ledger={}, candidates=[])
            job = m.Job(company_id=company_id, session_id=session.id, generation=1)
            db.add_all([run, job])
            db.flush()
            decision = m.ReconciliationDecision(company_id=company_id, run_id=run.id, proposal_id=m.uid(), bank_id=bank.id, ledger_ids=[journal.id], decision="accepted", version=1, reason="synthetic", actor_id=actor_id, provenance="synthetic_test", controls={})
            request = m.ModelRequest(company_id=company_id, actor_id=actor_id, session_id=session.id, job_id=job.id, session_version=1, fence=1, request_key=m.uid(), input_hash="0"*64, purpose="classify_document", model="validation-only", prompt_version="synthetic")
            db.add_all([decision, request])
            db.flush()
            reservation = m.BudgetReservation(company_id=company_id, request_id=request.id, tariff_id=tariff.id, installation_budget_id=global_budget_id, period="2999-01", attempt=1, amount="0")
            db.add(reservation)
            db.flush()
            spare_session = m.ProcessingSession(company_id=company_id, actor_id=actor_id, period_id=period.id)
            db.add(spare_session)
            db.flush()
            spare_manifest = m.ResultManifest(company_id=company_id, session_id=spare_session.id, period_id=period.id, digest="3" * 64, selection={}, metrics=[], details={})
            db.add(spare_manifest)
            spare_session2 = m.ProcessingSession(company_id=company_id, actor_id=actor_id, period_id=period.id)
            db.add(spare_session2)
            db.flush()
            return {"run": run.id, "job": job.id, "request": request.id, "tariff": tariff.id, "spare_manifest": spare_manifest.id, "unused_session": spare_session2.id, "company": company_id, "period": period.id, "session": session.id, "file": source.id, "row": row.id, "bank": bank.id, "invoice": invoice.id, "manifest": manifest.id, "report": report.id, "immutable": {"source_rows": row.id, "interpretations": interpretation.id, "journal_lines": journal.id, "bank_movements": bank.id, "invoices": invoice.id, "settlements": settlement.id, "invoice_snapshots": snapshot.id, "result_manifests": manifest.id, "reports": report.id, "report_approvals": approval.id, "audit_events": audit.id, "model_tariffs": tariff.id, "reconciliation_runs": run.id, "reconciliation_decisions": decision.id}}

    a, b = [seed(company_id) for company_id in company_ids]
    from didban.money_type import Money
    numeric_fields = [(table.name, column.name) for table in m.Base.metadata.sorted_tables for column in table.c if isinstance(column.type, Money)]
    with engine.connect() as connection:
        for table_name, column_name in numeric_fields:
            physical = connection.execute(text("SELECT data_type,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=:table AND column_name=:column"), {"table": table_name, "column": column_name}).one()
            assert physical == ("numeric", 38, 6), f"Wrong canonical money storage {table_name}.{column_name}"
    exact_amount = "99999999999999999999999999999999.123456"
    with transaction(a["company"]) as db:
        exact_plan = m.PlannedPayment(company_id=a["company"], label="exact synthetic", amount=exact_amount, due_date=date(2026, 10, 1), obligation_id=m.uid())
        db.add(exact_plan)
        db.flush()
        db.expire(exact_plan, ["amount"])
        assert exact_plan.amount == exact_amount, "PostgreSQL altered an exact canonical amount"
    invalid_money = ["NaN", "Infinity", "-Infinity", "100000000000000000000000000000000", "0.0000001", 0.1, True]
    for invalid in invalid_money:
        try:
            with transaction(a["company"]) as db:
                db.add(m.PlannedPayment(company_id=a["company"], label="must reject", amount=invalid, due_date=date(2026, 10, 1), obligation_id=m.uid()))
                db.flush()
        except StatementError:
            pass
        else:
            raise AssertionError("Canonical money accepted an invalid bind")
    try:
        with transaction(a["company"]) as db:
            db.execute(text("INSERT INTO planned_payments (id,company_id,created_at,version,label,amount,due_date,obligation_id,state) VALUES (:id,:company,:created,1,'must reject',CAST('NaN' AS numeric),:due,:obligation,'confirmed')"), {"id": m.uid(), "company": a["company"], "created": m.now(), "due": date(2026, 10, 1), "obligation": m.uid()})
    except DBAPIError as error:
        assert getattr(error.orig, "sqlstate", None) == "23514", "PostgreSQL finite money check did not reject NaN"
    else:
        raise AssertionError("Raw SQL inserted nonfinite financial money")
    tables = [table.name for table in m.Base.metadata.sorted_tables if "company_id" in table.c]
    with engine.connect() as connection:
        for table in tables:
            enabled, forced = connection.execute(text("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid=CAST(:table AS regclass)"), {"table": table}).one()
            assert enabled and forced, f"RLS is not forced on {table}"
    with transaction() as db:
        for table in tables:
            assert db.execute(text(f'SELECT count(*) FROM "{table}"')).scalar_one() == 0, f"Unscoped read leaked {table}"
        db.execute(text("SELECT set_config('didban.user_id', :actor, true)"), {"actor": actor_id})
        own = list(db.scalars(select(m.Membership).where(m.Membership.user_id == actor_id)))
        assert len(own) == 2, "Authenticated own-membership discovery failed"
        assert not list(db.scalars(select(m.Membership).where(m.Membership.user_id == outsider_id))), "Own-membership policy leaked another actor"
    with transaction(a["company"]) as db:
        for table in tables:
            assert db.execute(text(f'SELECT count(*) FROM "{table}" WHERE company_id=:other'), {"other": b["company"]}).scalar_one() == 0, f"Cross-company read leaked {table}"
            assert db.execute(text(f'UPDATE "{table}" SET id=id WHERE company_id=:other'), {"other": b["company"]}).rowcount == 0, f"Cross-company update changed {table}"
            assert db.execute(text(f'DELETE FROM "{table}" WHERE company_id=:other'), {"other": b["company"]}).rowcount == 0, f"Cross-company delete changed {table}"

    denied = []
    def rejects(label: str, factory, state: str = "23503") -> None:
        try:
            with transaction(a["company"]) as db:
                db.add(factory())
                db.flush()
        except DBAPIError as error:
            actual = getattr(error.orig, "sqlstate", None)
            assert actual == state, f"Wrong denial for {label}: {actual}"
            denied.append(label)
        else:
            raise AssertionError(f"Cross-company reference accepted: {label}")

    fact = {"company_id": a["company"], "session_id": a["session"], "source_row_id": a["row"], "original_unit": "IRR", "original_amount": "1"}
    rejects("source.file", lambda: m.SourceRow(company_id=a["company"], file_id=b["file"], sheet="T", row_number=2, values={}))
    rejects("file.session", lambda: m.SourceFile(company_id=a["company"], session_id=b["session"], name="t.csv", sha256="1"*64, size=1, storage_key=m.uid(), scan_status="clean", row_count=0))
    rejects("period.previous", lambda: m.Period(company_id=a["company"], name="must reject", start=date(2026, 11, 1), end=date(2026, 11, 30), previous_period_id=b["period"]))
    rejects("session.period", lambda: m.ProcessingSession(company_id=a["company"], actor_id=actor_id, period_id=b["period"]))
    rejects("bank.row", lambda: m.BankMovement(**(fact | {"source_row_id": b["row"]}), account="A", date=date(2026, 9, 1), amount="1", reference="R"))
    rejects("bank.session", lambda: m.BankMovement(**(fact | {"session_id": b["session"]}), account="A", date=date(2026, 9, 1), amount="1", reference="R"))
    rejects("manifest.period", lambda: m.ResultManifest(company_id=a["company"], session_id=a["unused_session"], period_id=b["period"], digest="2"*64, selection={}, metrics=[], details={}))
    rejects("manifest.session", lambda: m.ResultManifest(company_id=a["company"], session_id=b["session"], period_id=a["period"], digest="2"*64, selection={}, metrics=[], details={}))
    rejects("report.manifest", lambda: m.Report(company_id=a["company"], manifest_id=b["spare_manifest"], title="T"))
    rejects("approval.report", lambda: m.ReportApproval(company_id=a["company"], report_id=b["report"], report_version=1, actor_id=outsider_id, permission_provenance="test"))
    rejects("finding.manifest", lambda: m.Finding(company_id=a["company"], manifest_id=b["manifest"], code="test", title="T", evidence=[]))
    rejects("job.session", lambda: m.Job(company_id=a["company"], session_id=b["session"], generation=10))
    rejects("plan.row", lambda: m.PlannedPayment(company_id=a["company"], source_row_id=b["row"], session_id=a["session"], label="T", obligation_id="T", amount="1", due_date=date(2026, 10, 1)))
    rejects("issue.file", lambda: m.ProcessingIssue(company_id=a["company"], session_id=a["session"], file_id=b["file"], code="test", question="T", choices=[], evidence={}))
    rejects("allocation.bank", lambda: m.Allocation(company_id=a["company"], bank_id=b["bank"], invoice_id=a["invoice"], amount="1", actor_id=actor_id))
    rejects("allocation.invoice", lambda: m.Allocation(company_id=a["company"], bank_id=a["bank"], invoice_id=b["invoice"], amount="1", actor_id=actor_id))

    rejects("model_request.session", lambda: m.ModelRequest(company_id=a["company"], actor_id=actor_id, session_id=b["session"], request_key=m.uid(), input_hash="0"*64, purpose="test", model="validation-only", prompt_version="synthetic"))
    rejects("model_request.job", lambda: m.ModelRequest(company_id=a["company"], actor_id=actor_id, job_id=b["job"], request_key=m.uid(), input_hash="0"*64, purpose="test", model="validation-only", prompt_version="synthetic"))
    rejects("reservation.request", lambda: m.BudgetReservation(company_id=a["company"], request_id=b["request"], tariff_id=a["tariff"], installation_budget_id=global_budget_id, period="2999-01", attempt=2, amount="0"))
    rejects("reservation.tariff", lambda: m.BudgetReservation(company_id=a["company"], request_id=a["request"], tariff_id=b["tariff"], installation_budget_id=global_budget_id, period="2999-01", attempt=2, amount="0"))
    rejects("reconciliation.manifest", lambda: m.ReconciliationRun(company_id=a["company"], manifest_id=b["manifest"], actor_id=actor_id, bank_to_ledger={}, candidates=[]))
    rejects("reconciliation_decision.run", lambda: m.ReconciliationDecision(company_id=a["company"], run_id=b["run"], proposal_id=m.uid(), bank_id=a["bank"], ledger_ids=[], decision="accepted", version=1, reason="synthetic", actor_id=actor_id, provenance="synthetic_test", controls={}))
    rejects("reconciliation_decision.bank", lambda: m.ReconciliationDecision(company_id=a["company"], run_id=a["run"], proposal_id=m.uid(), bank_id=b["bank"], ledger_ids=[], decision="accepted", version=1, reason="synthetic", actor_id=actor_id, provenance="synthetic_test", controls={}))
    rejects("rls.insert_other_company", lambda: m.Period(company_id=b["company"], name="must_be_denied", start=date(2026, 1, 1), end=date(2026, 1, 2)), "42501")
    a["immutable"]["installation_audit_events"] = global_audit_id
    immutable_checks = 0
    for table, identifier in a["immutable"].items():
        assert table in IMMUTABLE
        for operation in ("UPDATE", "DELETE"):
            try:
                with transaction(a["company"]) as db:
                    clause = "SET id=id " if operation == "UPDATE" else ""
                    verb = "UPDATE" if operation == "UPDATE" else "DELETE FROM"
                    db.execute(text(f'{verb} "{table}" {clause}WHERE id=:identifier'), {"identifier": identifier})
            except DBAPIError as error:
                assert getattr(error.orig, "sqlstate", None) == "P0001", f"Immutable guard did not deny {table} {operation}"
                immutable_checks += 1
            else:
                raise AssertionError(f"Immutable fact changed: {table} {operation}")
    return {"status": "passed", "postgres_version": version, "role_superuser": False, "role_bypass_rls": False, "parallel_initialize_workers": 2, "parallel_initialize_seconds": round(initialization_seconds, 3), "rls_tables_checked": len(tables), "membership_discovery": "own_actor_only", "cross_company_read_update_delete_checks": len(tables)*3, "cross_company_fk_checks": len([label for label in denied if not label.startswith("rls.")]), "rls_cross_company_insert_checks": 1, "canonical_numeric_columns": len(numeric_fields), "canonical_money_invalid_binds_rejected": len(invalid_money), "canonical_money_large_exact_roundtrip": True, "canonical_money_raw_nan_rejected": True, "immutable_update_delete_checks": immutable_checks, "elapsed_seconds": round(perf_counter()-started, 3), "synthetic": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    environment(arguments.env_file)
    outcome = validate()
    rendered = json.dumps(outcome, indent=2, ensure_ascii=False)
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(rendered+"\n")
    print(rendered)
