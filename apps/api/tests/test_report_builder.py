"""Report definitions cannot compute unsupported figures or mutate financial snapshots."""

import io

import pytest
from openpyxl import load_workbook
from pydantic import ValidationError
from test_api_delivery import scenario

from didban import models as m
from didban.errors import DomainError
from didban.report_builder_exports import pdf_run, xlsx_run
from didban.report_builder_schemas import ReportSpec
from didban.report_builder_service import evaluate, interpret


def manifest():
    return m.ResultManifest(
        id="manifest",
        company_id="company",
        period_id="period",
        session_id="session",
        digest="d",
        selection={"period": {"start": "2026-09-01", "end": "2026-09-30"}},
        metrics=[
            {
                "metric_key": "revenue",
                "label": "درآمد",
                "basis": "ledger",
                "value": "90071992547409930001",
                "unit": "IRR",
                "status": "available",
                "evidence_refs": ["row-a"],
            },
            {
                "metric_key": "net_profit",
                "label": "سود خالص",
                "basis": "ledger",
                "value": None,
                "unit": "IRR",
                "status": "unavailable",
                "reason_codes": ["income_tax_unknown"],
            },
        ],
        details={
            "invoices": [
                {
                    "id": "a",
                    "reference": "=SUM(1,2)",
                    "party_id": "p",
                    "direction": "sales",
                    "amount": "90071992547409930001",
                    "remaining": None,
                    "overdue": None,
                    "status": "unavailable",
                    "reason_codes": ["payment_dates_missing"],
                    "evidence_refs": ["row-a"],
                },
                {
                    "id": "b",
                    "reference": "B",
                    "party_id": "p",
                    "direction": "sales",
                    "amount": "0",
                    "remaining": "0",
                    "overdue": False,
                    "status": "available",
                },
                {
                    "id": "c",
                    "reference": "C",
                    "party_id": "other",
                    "direction": "purchases",
                    "amount": "15",
                    "remaining": "15",
                    "overdue": True,
                    "status": "available",
                },
            ]
        },
    )


def test_metrics_preserve_exact_null_and_limitations_without_mutation():
    original = manifest()
    result = evaluate(
        original, ReportSpec(period_id="period", metric_keys=["revenue", "net_profit"]), company_name="شرکت"
    )
    assert result["rows"][0]["value"] == "90071992547409930001"
    assert result["rows"][1]["value"] is None
    assert "اطلاعات مالیات عملکرد کامل نیست." in result["limitations"]
    result["rows"][0]["value"] = "0"
    assert original.metrics[0]["value"] != "0"
    with pytest.raises(DomainError):
        evaluate(
            original,
            ReportSpec(period_id="period", basis="bank", metric_keys=["revenue"]),
            company_name="شرکت",
        )


def test_invoice_exact_filter_and_unknown_overdue_not_zero():
    spec = ReportSpec(
        period_id="period",
        kind="invoices",
        basis="invoice",
        metric_keys=[],
        columns=["reference", "remaining"],
        filters={"direction": "sales", "party_id": "p"},
    )
    result = evaluate(manifest(), spec, company_name="شرکت")
    assert [row["remaining"] for row in result["rows"]] == [None, "0"]
    spec.filters.overdue_only = True
    result = evaluate(manifest(), spec, company_name="شرکت")
    assert result["rows"] == []
    assert any("سررسیدگذشتگی" in text for text in result["limitations"])


def test_schema_rejects_expression_unknown_columns_and_invalid_metric_filters():
    for data in (
        {"metric_keys": ["sum(value)"]},
        {"columns": ["sql"]},
        {"filters": {"party_id": "p"}},
        {"kind": "invoices", "basis": "ledger", "metric_keys": []},
    ):
        with pytest.raises(ValidationError):
            ReportSpec(period_id="period", **data)


def test_interpret_is_narrow_and_never_guesses_party_or_unsupported_period():
    assert interpret("فاکتورهای فروش سررسیدگذشته", "p")["spec"]["filters"]["overdue_only"] is True
    for question in (
        "فاکتورهای مشتری الف",
        "درآمد سال قبل",
        "درآمد بیشتر از 100",
        "ثبت فاکتور خرید",
        "درآمد هفته آینده",
        "بدهی",
        "مطالبات سررسیدگذشته",
        "فاکتورهای فروش و خرید",
    ):
        assert interpret(question, "p")["status"] == "needs_selection"


def test_interpret_never_silently_drops_a_second_basis_or_unsupported_filter():
    for question in (
        "گزارش درآمد و نقد",
        "درآمد و فاکتورهای فروش",
        "مانده بانک و فاکتورهای خرید",
        "هزینه و سود",
        "درآمد سررسیدگذشته",
    ):
        assert interpret(question, "p")["status"] == "needs_selection"
    assert interpret("درآمد و هزینه و سود خالص", "p")["spec"]["metric_keys"] == [
        "revenue",
        "expense",
        "net_profit",
    ]


def test_exports_frozen_rows_exact_and_formula_safe():
    spec = ReportSpec(
        period_id="period",
        kind="invoices",
        basis="invoice",
        metric_keys=[],
        columns=["reference", "amount", "remaining"],
    )
    snapshot = evaluate(manifest(), spec, company_name="شرکت") | {"title": "گزارش مصنوعی"}
    run = {"id": "run", "definition_version": 1, "snapshot": snapshot, "digest": "digest"}
    workbook = load_workbook(io.BytesIO(xlsx_run(run)), data_only=False)
    cells = [cell for sheet in workbook for row in sheet for cell in row]
    assert any(cell.value == "90071992547409930001" for cell in cells)
    assert not any(cell.data_type == "f" for cell in cells)
    assert pdf_run(run).startswith(b"%PDF")


def test_api_permissions_versions_reruns_immutable_and_tenant_isolation(tmp_path):
    scenario(
        tmp_path,
        r"""
from didban.report_builder_models import SavedReportDefinition, SavedReportRun
owner=client_for("owner"); viewer=client_for("viewer"); outsider=client_for("outsider")
path=base+"/report-builder"
spec={"period_id":period_id,"kind":"metrics","basis":"bank","metric_keys":["cash"],"columns":["label","value","status"]}
# Seed manifests already contain unavailable cash; add a truthful basis via a new immutable snapshot.
with transaction("company-a") as db:
    session=m.ProcessingSession(company_id="company-a",period_id=period_id,actor_id=users["owner"],state="completed_limited")
    db.add(session);db.flush()
    manifest=m.ResultManifest(company_id="company-a",period_id=period_id,session_id=session.id,digest="b"*64,selection={"period":{"start":"2026-09-01","end":"2026-09-30"}},metrics=[{"metric_key":"cash","label":"نقد","basis":"bank","value":None,"status":"unavailable","unit":"IRR","reason_codes":["bank_source_missing"]}],details={})
    db.add(manifest);db.flush(); first_manifest=manifest.id
response=command(viewer,"POST",path+"/preview",{"spec":spec})
assert response.status_code==200,response.text
preview=response.json();assert preview["rows"][0]["value"] is None
payload={"name":"گزارش نقد","spec":spec,"preview_manifest_id":first_manifest}
assert command(viewer,"POST",path+"/definitions",payload).status_code==403
key=str(uuid4());response=command(owner,"POST",path+"/definitions",payload,key=key)
assert response.status_code==201,response.text
saved=response.json();definition=saved["definition"];run=saved["run"]
assert command(owner,"POST",path+"/definitions",payload,key=key).json()==saved
assert owner.get(path+"/runs/"+run["id"]).json()["snapshot"]["spec"]["basis"]=="bank"
assert outsider.get(path+"/runs/"+run["id"]).status_code==404
assert owner.get("/api/v1/companies/company-b/report-builder/runs/"+run["id"]).status_code==404
assert command(owner,"PATCH",path+"/definitions/"+definition["id"],payload,version=9).status_code==409
with transaction("company-a") as db:
    session=m.ProcessingSession(company_id="company-a",period_id=period_id,actor_id=users["owner"],state="completed")
    db.add(session);db.flush()
    newer=m.ResultManifest(company_id="company-a",period_id=period_id,session_id=session.id,digest="c"*64,selection={"period":{"start":"2026-09-01","end":"2026-09-30"}},metrics=[{"metric_key":"cash","label":"نقد","basis":"bank","value":"0","status":"available","unit":"IRR"}],details={})
    db.add(newer);db.flush();second_manifest=newer.id
response=command(owner,"POST",path+"/definitions/"+definition["id"]+"/runs",{"expected_version":1})
assert response.status_code==201,response.text
new_run=response.json();assert new_run["id"]!=run["id"] and new_run["manifest_id"]==second_manifest
assert new_run["snapshot"]["rows"][0]["value"]=="0"
assert owner.get(path+"/runs/"+run["id"]).json()["snapshot"]["rows"][0]["value"] is None
assert owner.get(path+"/runs/"+run["id"]+"/export?format=xlsx").status_code==200
assert owner.get(path+"/runs/"+run["id"]+"/export?format=pdf").content.startswith(b"%PDF")
try:
    with transaction("company-a") as db:
        db.get(SavedReportRun,run["id"]).digest="tampered"
    raise AssertionError("run mutated")
except IntegrityError:
    pass
assert len(owner.get(base+"/reports/"+report_ids[0]).json()["approvals"])==0
""",
    )
