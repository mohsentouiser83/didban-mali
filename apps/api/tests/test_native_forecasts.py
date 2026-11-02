"""D09 native timing, persistent exact-source questions and financially inert publication."""

from copy import deepcopy
from datetime import date

import pytest
from sqlalchemy import select
from test_posting import book as book

from didban import models as m
from didban.accounting_models import Account
from didban.errors import DomainError
from didban.native_forecast_models import NativeForecastPlan, NativeForecastRun
from didban.native_forecast_service import answer, create, evaluate, public
from didban.native_reporting_models import NativeStatementRun
from didban.native_scenario_service import save as scenario
from didban.posting_models import NativeJournal


def invoice(**patch):
    return {
        "id": "i",
        "version": 1,
        "direction": "sale",
        "reference": "INV",
        "party_id": "customer",
        "date": "2026-08-01",
        "amount": "100",
        "remaining": "100",
        "status": "available",
        "source": {"journal_id": "invoice-journal", "journal_digest": "proof"},
        "terms": {
            "id": "terms1",
            "version": 1,
            "due_date": "2026-09-05",
            "expected_date": None,
            "expected_unknown": False,
        },
        "allocations": [],
        "terms_history": [],
        **patch,
    }


@pytest.fixture
def native(book, monkeypatch):
    import didban.native_invoice_service as service

    monkeypatch.setattr("didban.native_forecast_service._require_cash_current", lambda *args: None)

    state = {"items": [invoice()], "history": []}
    monkeypatch.setattr(
        service, "current", lambda *args, **kwargs: {"items": deepcopy(state["items"])}, raising=False
    )
    monkeypatch.setattr(
        service, "receipt_history", lambda *args, **kwargs: deepcopy(state["history"]), raising=False
    )
    book.add(
        NativeStatementRun(
            id="cash",
            company_id="c",
            actor_id="finance_manager",
            digest="a" * 64,
            snapshot={
                "basis": "native_book",
                "period_id": "p",
                "period": {"start": "2026-01-01", "end": "2026-12-31"},
                "as_of": "2026-08-31",
                "opening_evidence": {"status": "available"},
                "metrics": [{"metric_key": "bank_balance", "value": "1000", "status": "available"}],
                "role_assignments": [
                    {
                        "account_id": book.scalar(
                            select(Account.id).where(Account.company_id == "c").order_by(Account.code)
                        ),
                        "role": "bank",
                        "assignment_version": 1,
                    }
                ],
                "journal_ids": [],
            },
        )
    )
    book.flush()
    return book, book.get(m.User, "finance_manager"), state


def history():
    return [
        {
            "allocation_id": str(n),
            "journal_id": "receipt" + str(n),
            "due_date": "2026-07-31",
            "date": f"2026-08-0{n}",
            "amount": "8" if n == 3 else "1",
            "journal_digest": "proof",
            "terms_id": "t",
            "terms_version": 1,
        }
        for n in (1, 2, 3)
    ]


def test_d09_exact_weighted_history_and_frozen_scenario_no_financial_writes(native):
    db, user, state = native
    state["history"] = history()
    result = create(db, "c", user, "cash", True)
    assert result["state"] == "completed" and result["questions"] == []
    frozen = result["forecast"]["snapshot"]
    assert frozen["events"][0]["date"] == "2026-09-08" and frozen["closing"] == "1100"
    assert (
        frozen["assumptions"][0]["delay_days"] == 3 and frozen["assumptions"][0]["history_event_count"] == 3
    )
    state["items"][0]["remaining"] = "50"
    assert db.get(NativeForecastRun, result["forecast"]["id"]).snapshot == frozen
    simulated = scenario(
        db,
        "c",
        user,
        {
            "name": "فرض از پیش‌بینی",
            "native_statement_id": "cash",
            "forecast_run_id": result["forecast"]["id"],
            "horizon_days": 30,
            "hypothetical": [],
        },
    )
    assert simulated["baseline"]["forecast_digest"] == result["forecast"]["digest"]
    assert simulated["comparison"]["baseline"]["closing"] == "1100"
    assert db.scalar(select(NativeJournal.id)) is None


def test_questions_survive_read_close_and_require_exact_source_version_current_authority(native):
    db, user, state = native
    result = create(db, "c", user, "cash", True)
    assert result["state"] == "waiting_input" and result["forecast"] is None
    plan = db.get(NativeForecastPlan, result["id"])
    assert public(db, "c", user, plan)["questions"] == result["questions"]
    question = result["questions"][0]
    with pytest.raises(DomainError):
        answer(db, "c", user, plan.id, 2, {"question_id": question["id"], "unknown": True})
    state["items"][0]["terms"]["version"] = 2
    with pytest.raises(DomainError) as error:
        answer(db, "c", user, plan.id, 1, {"question_id": question["id"], "unknown": True})
    assert error.value.code == "native_forecast_source_changed"
    assert db.scalar(select(NativeForecastRun.id)) is None
    state["items"][0]["terms"]["version"] = 1
    db.get(m.Membership, "finance_manager").role = "viewer"
    with pytest.raises(DomainError):
        answer(db, "c", user, plan.id, 1, {"question_id": question["id"], "unknown": True})
    with pytest.raises(DomainError):
        public(db, "other", user, plan)
    db.get(m.Membership, "finance_manager").role = "finance_manager"
    final = answer(db, "c", user, plan.id, 1, {"question_id": question["id"], "unknown": True})
    assert final["state"] == "completed_limited" and final["forecast"]["snapshot"]["reason_codes"] == [
        "receipt_date_unknown"
    ]
    assert final["forecast"]["snapshot"]["closing"] is None
    assert final["forecast"]["snapshot"]["known_dated_closing"] == "1000"
    assert final["answers"]["native-invoice:i"]["actor_id"] == user.id


def test_future_split_history_due_missing_and_past_estimates_ask(native):
    db, user, state = native
    state["history"] = history()[:2] + [history()[2] | {"date": "2026-09-01"}]
    result = create(db, "c", user, "cash", True)
    assert result["questions"][0]["reason_code"] == "receipt_history_insufficient"
    state["history"] = [row | {"journal_id": "one-receipt"} for row in history()]
    result = create(db, "c", user, "cash", True)
    assert result["forecast"] is None
    state["history"] = history()
    state["items"][0]["terms"]["due_date"] = None
    assert create(db, "c", user, "cash", True)["questions"][0]["reason_code"] == "invoice_due_date_missing"
    state["items"][0]["terms"]["due_date"] = "2026-08-01"
    assert create(db, "c", user, "cash", True)["questions"][0]["reason_code"] == "receipt_estimate_in_past"


def test_expected_unknown_respected_and_manual_overlap_needs_explicit_choice(native):
    db, user, state = native
    state["items"] = [
        invoice(
            direction="purchase",
            terms={"id": "t", "version": 1, "due_date": "2026-09-05", "expected_unknown": False},
        )
    ]
    db.add(
        m.PlannedPayment(
            company_id="c",
            label="تسویه فاکتور",
            amount="100",
            due_date=date(2026, 9, 5),
            obligation_id="INV",
            invoice_reference="INV",
            state="confirmed",
        )
    )
    db.flush()
    result = create(db, "c", user, "cash", True)
    question = result["questions"][0]
    assert question["kind"] == "choice" and result["forecast"] is None
    final = answer(
        db,
        "c",
        user,
        result["id"],
        1,
        {"question_id": question["id"], "unknown": False, "choice": "covered_by_invoice"},
    )
    assert final["forecast"]["snapshot"]["closing"] == "900"
    state["items"][0]["terms"]["expected_unknown"] = True
    limited = create(db, "c", user, "cash", False)
    assert limited["forecast"] is None  # separate overlap question is still necessary


def test_future_cash_or_actual_cutoff_and_incomplete_forecast_not_scored(native):
    db, user, state = native
    state["items"][0]["terms"]["expected_unknown"] = True
    result = create(db, "c", user, "cash", True)
    assert evaluate(db, "c", user, result["forecast"]["id"], "cash")["reason_code"] == "limited_forecast"
    db.get(NativeStatementRun, "cash").snapshot = {
        **db.get(NativeStatementRun, "cash").snapshot,
        "as_of": "2099-01-01",
    }
    with pytest.raises(DomainError) as error:
        create(db, "c", user, "cash", True)
    assert error.value.code == "native_forecast_future_as_of"


def test_elapsed_forecast_daily_cash_comparison_requires_reconciling_exact_scope(native):
    from test_native_reporting import post

    db, user, state = native
    state["history"] = history()
    result = create(db, "c", user, "cash", True)
    received = post(db, "100", date(2026, 9, 8))
    source = db.get(NativeStatementRun, "cash").snapshot
    actual = NativeStatementRun(
        id="actual",
        company_id="c",
        actor_id=user.id,
        digest="b" * 64,
        snapshot={
            **deepcopy(source),
            "as_of": "2026-09-30",
            "journal_ids": [received["id"]],
            "metrics": [{"metric_key": "bank_balance", "status": "available", "value": "1100"}],
        },
    )
    db.add(actual)
    db.flush()
    score = evaluate(db, "c", user, result["forecast"]["id"], actual.id)
    assert score["status"] == "available" and score["closing_error"] == "0" and len(score["days"]) == 30
    assert score["timing_basis"] == "retrospective" and score["out_of_sample"] is False
    assert score["mean_absolute_balance_error"] == {"numerator": "0", "denominator": 30}
    assert score["actual_journal_refs"][0]["journal_digest"] == received["digest"]
    actual.snapshot = {
        **actual.snapshot,
        "metrics": [{"metric_key": "bank_balance", "status": "available", "value": "1101"}],
    }
    assert (
        evaluate(db, "c", user, result["forecast"]["id"], actual.id)["reason_code"]
        == "actual_opening_or_source_mismatch"
    )


def test_real_native_invoice_history_generates_d09_forecast_without_imported_facts(book):
    from test_native_invoices import alloc

    from didban import native_invoice_service as invoices
    from didban.native_reporting_service import declare_zero_opening, save_role, save_statement
    from didban.operation_service import create as create_operation
    from didban.posting_service import post_batch, preview

    db = book
    user = db.get(m.User, "finance_manager")
    existing = list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))
    bank = Account(company_id="c", code="003", name="بانک")
    db.add(bank)
    db.flush()
    for account, role in ((existing[0], "trade_receivable"), (existing[1], "revenue"), (bank, "bank")):
        save_role(db, "c", user, account.id, role, 1)
    declare_zero_opening(db, "c", user, "p", "آغاز بدون مانده")

    def posted(db, kind="sale_service", ref="INV", day=date(2026, 8, 1)):
        accounts = (
            {"trade_receivable": existing[0].id, "service_revenue": existing[1].id}
            if kind == "sale_service"
            else {"bank_a": bank.id, "trade_receivable": existing[0].id}
        )
        operation = create_operation(
            db,
            "c",
            user,
            {
                "kind": kind,
                "period_id": "p",
                "date": day,
                "description": ref,
                "source_reference": ref,
                "unit": "IRR",
                "party_id": "customer",
                "accounts": accounts,
                "amounts": {"amount": "100"},
            },
        )
        checked = preview(db, "c", user, operation["draft"]["id"])
        post_batch(db, "c", user, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}])
        return invoices._proof(db, "c", operation["operation_id"], invoices._today(db, "c"))

    for n in (1, 2, 3):
        source = posted(db, ref=f"H{n}", day=date(2026, 8, 1))
        item = invoices.create(
            db,
            "c",
            user,
            {
                "operation_id": source["operation_id"],
                "journal_digest": source["journal_digest"],
                "reference": source["reference"],
                "due_date": date(2026, 8, 5),
                "due_unknown": False,
                "expected_date": None,
                "expected_unknown": True,
            },
        )
        receipt = posted(db, "receipt", ref=f"R{n}", day=date(2026, 8, 5 + n))
        alloc(db, item, receipt, "100")
    source = posted(db, ref="OPEN", day=date(2026, 8, 20))
    invoices.create(
        db,
        "c",
        user,
        {
            "operation_id": source["operation_id"],
            "journal_digest": source["journal_digest"],
            "reference": "OPEN",
            "due_date": date(2026, 9, 5),
            "due_unknown": False,
            "expected_date": None,
            "expected_unknown": False,
        },
    )
    cash = save_statement(db, "c", user, "p", date(2026, 8, 31))
    result = create(db, "c", user, cash["id"], True)
    assert result["state"] == "completed"
    forecast = result["forecast"]["snapshot"]
    assert forecast["events"][0]["date"] == "2026-09-07" and forecast["closing"] == "400"
    assert forecast["assumptions"][0]["history_event_count"] == 3
    assert len(forecast["receipt_history"]["customer"]) == 3
    assert db.scalar(select(m.ResultManifest.id)) is None
    posted(db, "receipt", ref="LATE", day=date(2026, 8, 30))
    with pytest.raises(DomainError) as error:
        create(db, "c", user, cash["id"], True)
    assert error.value.code == "native_forecast_cash_stale"
    assert db.get(NativeForecastRun, result["forecast"]["id"]).snapshot["closing"] == "400"


def test_native_forecast_exports_preserve_fixed_amounts_and_limitations(native):
    import io

    from openpyxl import load_workbook

    from didban.native_forecast_exports import export_run

    db, user, state = native
    state["items"][0]["terms"]["expected_unknown"] = True
    result = create(db, "c", user, "cash", False)
    run = result["forecast"]
    assert export_run(run, "شرکت مصنوعی", "pdf").startswith(b"%PDF")
    workbook = load_workbook(io.BytesIO(export_run(run, "شرکت مصنوعی", "xlsx")))
    values = [cell.value for sheet in workbook for row in sheet for cell in row]
    assert "1000" in values and "native_forecast" in values


def test_pending_forecast_invalidates_after_explicit_invoice_source_adoption_without_new_posting(
    book, monkeypatch
):
    from test_native_invoice_revisions import adopt, replace
    from test_native_invoices import invoice as make_invoice
    from test_native_invoices import posted, reverse_journal

    from didban import native_invoice_service as invoices
    from didban.native_forecast_service import today

    db = book
    user = db.get(m.User, "finance_manager")
    # Isolate invoice-signature invalidation; this plan's cash report is assumed
    # independently refreshed after the financial correction and before adoption.
    monkeypatch.setattr("didban.native_forecast_service._require_cash_current", lambda *args: None)
    original = posted(db, ref="CORRECTED-INV")
    item = make_invoice(db, original)
    reverse_journal(db, original, date(2026, 10, 15))
    replacement = replace(db, original)
    other = posted(db, ref="PENDING-INV", party="another-customer")
    invoices.create(
        db,
        "c",
        user,
        {
            "operation_id": other["operation_id"],
            "journal_digest": other["journal_digest"],
            "reference": other["reference"],
            "due_date": date(2026, 11, 5),
            "due_unknown": False,
            "expected_date": None,
            "expected_unknown": False,
        },
    )
    db.add(
        NativeStatementRun(
            id="recovery-cash",
            company_id="c",
            actor_id=user.id,
            digest="d" * 64,
            snapshot={
                "basis": "native_book",
                "period_id": "p",
                "as_of": today().isoformat(),
                "opening_evidence": {"status": "available"},
                "metrics": [{"metric_key": "bank_balance", "value": "0", "status": "available"}],
                "role_assignments": [],
            },
        )
    )
    db.flush()
    plan = create(db, "c", user, "recovery-cash", True)
    assert plan["state"] == "waiting_input"
    before = deepcopy(db.get(NativeForecastPlan, plan["id"]).snapshot)
    posted_ids = set(db.scalars(select(NativeJournal.id)))
    recovered = adopt(db, item, replacement)
    assert recovered["source"]["journal_id"] == replacement["id"]
    assert set(db.scalars(select(NativeJournal.id))) == posted_ids
    with pytest.raises(DomainError) as error:
        answer(
            db,
            "c",
            user,
            plan["id"],
            plan["version"],
            {"question_id": plan["questions"][0]["id"], "unknown": True},
        )
    assert error.value.code == "native_forecast_source_changed"
    assert db.get(NativeForecastPlan, plan["id"]).snapshot == before
    assert db.get(NativeForecastPlan, plan["id"]).answers == {}
    assert db.scalar(select(NativeForecastRun.id)) is None


def test_limited_forecast_and_derived_scenario_expose_only_known_dated_projection(native):
    import io

    from openpyxl import load_workbook

    from didban.native_forecast_exports import export_run

    db, user, state = native
    state["items"] = [
        invoice(terms={"expected_unknown": True}),
        invoice(
            id="purchase",
            direction="purchase",
            reference="BILL",
            remaining="50",
            terms={"due_date": "2026-09-10", "expected_unknown": False},
        ),
    ]
    published = create(db, "c", user, "cash", True)["forecast"]
    snapshot = published["snapshot"]
    assert snapshot["status"] == "limited" and snapshot["projection_scope"] == "known_dated_flows"
    assert snapshot["closing"] is None and snapshot["minimum"] is None and snapshot["first_deficit"] is None
    assert snapshot["known_dated_closing"] == snapshot["known_dated_minimum"] == "950"
    simulated = scenario(
        db,
        "c",
        user,
        {
            "name": "سناریوی محدود",
            "native_statement_id": "cash",
            "forecast_run_id": published["id"],
            "horizon_days": 30,
            "hypothetical": [
                {
                    "label": "پرداخت فرضی",
                    "amount": "10",
                    "unit": "IRR",
                    "direction": "payment",
                    "date": "2026-09-11",
                }
            ],
        },
    )
    comparison = simulated["comparison"]
    assert comparison["scenario"]["closing"] is None and comparison["scenario"]["minimum"] is None
    assert comparison["closing_difference"] is None
    assert comparison["scenario"]["known_dated_closing"] == "940"
    assert comparison["known_dated_closing_difference"] == "-10"
    book = load_workbook(io.BytesIO(export_run(published, "شرکت آزمایشی", "xlsx")))
    rows = {
        row[0]: row
        for sheet in book
        if sheet.cell(1, 1).value == "metric_key" and sheet.cell(1, 5).value == "value"
        for row in sheet.values
        if row and isinstance(row[0], str) and row[0].startswith("native_forecast_")
    }
    assert rows["native_forecast_closing"][4] is None and rows["native_forecast_closing"][6] == "unavailable"
    assert rows["native_forecast_known_dated_closing"][4] == "950"
    assert rows["native_forecast_known_dated_closing"][3] == "known_dated_flows"
