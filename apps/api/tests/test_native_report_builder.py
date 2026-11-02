"""A native builder run pins real native statements without inventing imported manifests."""

import io
from datetime import date

import pytest
from openpyxl import load_workbook
from pydantic import ValidationError
from test_native_reporting import accounts, post
from test_posting import book as book

from didban import models as m
from didban.errors import DomainError
from didban.native_reporting_service import save_role, save_statement
from didban.report_builder_exports import pdf_run, xlsx_run
from didban.report_builder_schemas import ReportSpec, SaveReportInput
from didban.report_builder_service import interpret, preview, rerun, save


def test_native_builder_pins_exact_snapshot_and_rerun_selects_same_period_only(book):
    db = book
    user = db.get(m.User, "finance_manager")
    post(db, "90071992547409930001")
    receivable, revenue = accounts(db)
    save_role(db, "c", user, receivable.id, "trade_receivable", 1)
    save_role(db, "c", user, revenue.id, "revenue", 1)
    first = save_statement(db, "c", user, "p", date(2026, 11, 1))
    spec = ReportSpec(period_id="p", source="native_statement", metric_keys=["revenue", "ar_ledger"])
    seen = preview(db, "c", spec)
    assert seen["native_statement_id"] == first["id"] and seen["manifest_id"] is None
    assert seen["rows"][0]["value"] == "90071992547409930001"
    assert seen["rows"][1]["value"] is None
    assert seen["as_of"] == "2026-11-01" and seen["limitations"]
    second = save_statement(db, "c", user, "p", date(2026, 12, 1))
    saved = save(
        db, "c", user, SaveReportInput(name="دفتر اصلی", spec=spec, preview_native_statement_id=first["id"])
    )
    assert saved["run"]["native_statement_id"] == first["id"]
    assert saved["run"]["snapshot"]["as_of"] == "2026-11-01"
    fresh = rerun(db, "c", user, saved["definition"]["id"], 1)
    assert fresh["native_statement_id"] == second["id"]
    assert saved["run"]["snapshot"]["as_of"] == "2026-11-01"
    workbook = load_workbook(io.BytesIO(xlsx_run(saved["run"])))
    assert any(cell.value == "90071992547409930001" for sheet in workbook for row in sheet for cell in row)
    assert pdf_run(saved["run"]).startswith(b"%PDF")
    with pytest.raises(DomainError):
        preview(db, "other", spec, native_statement_id=first["id"])
    with pytest.raises(DomainError):
        preview(db, "c", ReportSpec(period_id="missing", source="native_statement", metric_keys=["cash"]))
    with pytest.raises(DomainError):
        preview(db, "c", spec, manifest_id="fake")


def test_native_builder_rejects_unsupported_bases_and_keeps_native_interpretation_explicit():
    for override in (
        {"metric_keys": ["net_profit"]},
        {"basis": "bank", "metric_keys": ["cash"]},
        {"kind": "invoices", "basis": "invoice", "metric_keys": []},
    ):
        with pytest.raises(ValidationError):
            ReportSpec(period_id="p", source="native_statement", **override)
    spec = ReportSpec(period_id="p", source="native_statement", metric_keys=["revenue"])
    with pytest.raises(ValidationError):
        SaveReportInput(name="آزمون", spec=spec, preview_manifest_id="wrong")
    with pytest.raises(ValidationError):
        SaveReportInput(
            name="آزمون", spec=spec, preview_manifest_id="wrong", preview_native_statement_id="right"
        )
    assert interpret("گزارش سود پیش از مالیات", "p", "native_statement")["spec"]["metric_keys"] == [
        "pre_tax_profit"
    ]
    assert interpret("مطالبات", "p", "native_statement")["spec"]["source"] == "native_statement"
    assert interpret("فاکتورهای فروش", "p", "native_statement")["status"] == "needs_selection"
    assert interpret("سود خالص", "p", "native_statement")["status"] == "needs_selection"


def test_native_builder_http_scoping_history_exports_and_immutable_table(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.native_reporting_models import NativeStatementRun
from didban.report_builder_models import NativeBuilderRun
owner=client_for("owner"); viewer=client_for("viewer"); path=base+"/report-builder"
with transaction("company-a") as db:
    item=NativeStatementRun(company_id="company-a",actor_id=users["owner"],digest="native-fixed",snapshot={"basis":"native_book","period_id":period_id,"period":{"start":"2026-09-01","end":"2026-09-30"},"as_of":"2026-09-20","metrics":[{"metric_key":"revenue","value":"90071992547409930001","unit":"IRR","status":"available"}]})
    db.add(item);db.flush();native_id=item.id
spec={"period_id":period_id,"source":"native_statement","kind":"metrics","basis":"ledger","metric_keys":["revenue"],"columns":["label","value","reason"]}
seen=command(viewer,"POST",path+"/preview",{"spec":spec}); assert seen.status_code==200,seen.text
assert seen.json()["native_statement_id"]==native_id and seen.json()["manifest_id"] is None
payload={"name":"دفتر اصلی","spec":spec,"preview_native_statement_id":native_id}
assert command(viewer,"POST",path+"/definitions",payload).status_code==403
saved=command(owner,"POST",path+"/definitions",payload);assert saved.status_code==201,saved.text
run=saved.json()["run"]
assert owner.get(path+"/runs?source=native_statement").json()["items"][0]["id"]==run["id"]
assert owner.get(path+"/runs").json()["items"]==[]
assert viewer.get(path+"/runs/"+run["id"]).status_code==200
summary=viewer.get(base+"/accounting/statements/summary/latest?period_id="+period_id)
assert summary.status_code==200,summary.text
assert summary.json()["id"]==native_id and summary.json()["source"]=="native_statement"
assert summary.json()["as_of"]=="2026-09-20" and "items" not in summary.json()
assert next(row for row in summary.json()["metrics"] if row["metric_key"]=="revenue")["value"]=="90071992547409930001"
assert next(row for row in summary.json()["metrics"] if row["metric_key"]=="cash")["value"] is None
assert owner.get("/api/v1/companies/company-b/accounting/statements/summary/latest").status_code==404

assert owner.get("/api/v1/companies/company-b/report-builder/runs/"+run["id"]).status_code==404
assert owner.get(path+"/runs/"+run["id"]+"/export?format=pdf").content.startswith(b"%PDF")
try:
    with transaction("company-a") as db: db.get(NativeBuilderRun,run["id"]).digest="bad"
    raise AssertionError("native report run changed")
except IntegrityError: pass
""",
    )
