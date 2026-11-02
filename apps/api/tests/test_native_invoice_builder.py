"""Native invoice builder pins the scoped immutable invoice snapshot, never live facts."""

import io
from datetime import date

import pytest
from openpyxl import load_workbook
from test_posting import book as book

from didban import models as m
from didban.errors import DomainError
from didban.native_invoice_models import NativeInvoiceSnapshot
from didban.report_builder_exports import cell_value, pdf_run, xlsx_run
from didban.report_builder_schemas import ReportSpec, SaveReportInput
from didban.report_builder_service import interpret, preview, rerun, save


def source_row(identifier, direction, amount, remaining, due):
    return {
        "id": identifier,
        "reference": "INV-" + identifier,
        "party_id": "customer" if direction == "sale" else "vendor",
        "direction": direction,
        "date": "2026-10-01",
        "amount": amount,
        "remaining": remaining,
        "unit": "IRR",
        "status": "available" if remaining is not None else "unavailable",
        "reason": None if remaining is not None else "native_invoice_source_reversed",
        "terms": {"due_date": due},
        "source": {
            "unit": "TOMAN",
            "journal_id": "journal-" + identifier,
            "journal_digest": "digest",
            "operation_id": "operation-" + identifier,
            "approved_draft_version": 1,
        },
    }


def test_native_invoice_builder_filters_exact_frozen_nulls_and_source_scope(book):
    db = book
    user = db.get(m.User, "finance_manager")
    first = NativeInvoiceSnapshot(
        company_id="c",
        as_of=date(2026, 11, 1),
        actor_id=user.id,
        digest="fixed1",
        payload={
            "as_of": "2026-11-01",
            "direction": None,
            "items": [
                source_row("A", "sale", "90071992547409930001", None, None),
                source_row("B", "sale", "50", "20", "2026-10-20"),
                source_row("C", "purchase", "100", "0", "2026-11-15"),
            ],
        },
    )
    db.add(first)
    db.flush()
    spec = ReportSpec(
        period_id="p",
        source="native_invoice",
        kind="invoices",
        basis="invoice",
        metric_keys=[],
        columns=["reference", "amount", "paid", "remaining"],
        filters={"direction": "sales", "party_id": "customer"},
    )
    seen = preview(db, "c", spec)
    assert seen["native_invoice_snapshot_id"] == first.id and seen["manifest_id"] is None
    assert [row["paid"] for row in seen["rows"]] == [None, "30"]
    assert seen["rows"][0]["amount"] == "90071992547409930001"
    filtered = preview(
        db, "c", spec.model_copy(update={"filters": spec.filters.model_copy(update={"overdue_only": True})})
    )
    assert len(filtered["rows"]) == 1 and filtered["rows"][0]["reference"] == "INV-B"
    assert filtered["limitations"]
    saved = save(
        db,
        "c",
        user,
        SaveReportInput(name="فاکتور بومی", spec=spec, preview_native_invoice_snapshot_id=first.id),
    )
    assert saved["run"]["native_invoice_snapshot_id"] == first.id
    second = NativeInvoiceSnapshot(
        company_id="c",
        as_of=date(2026, 11, 2),
        actor_id=user.id,
        digest="fixed2",
        payload={
            "as_of": "2026-11-02",
            "direction": "sale",
            "items": [source_row("B", "sale", "50", "0", "2026-10-20")],
        },
    )
    db.add(second)
    db.flush()
    fresh = rerun(db, "c", user, saved["definition"]["id"], 1)
    assert fresh["native_invoice_snapshot_id"] == second.id and fresh["snapshot"]["rows"][0]["paid"] == "50"
    assert saved["run"]["snapshot"]["rows"][1]["remaining"] == "20"
    with pytest.raises(DomainError):
        preview(
            db,
            "c",
            spec.model_copy(update={"filters": spec.filters.model_copy(update={"direction": "all"})}),
            native_invoice_snapshot_id=second.id,
        )
    with pytest.raises(DomainError):
        preview(db, "other", spec, native_invoice_snapshot_id=first.id)
    workbook = load_workbook(io.BytesIO(xlsx_run(saved["run"])))
    assert any(cell.value == "90071992547409930001" for sheet in workbook for row in sheet for cell in row)
    assert cell_value({"reference": "NATIVE-HISTORY-123"}, "reference") == "NATIVE-HISTORY-123"
    assert pdf_run(saved["run"]).startswith(b"%PDF")
    assert (
        interpret("فاکتورهای فروش سررسیدگذشته", "p", "native_invoice")["spec"]["source"] == "native_invoice"
    )
    assert interpret("درآمد", "p", "native_invoice")["status"] == "needs_selection"


def test_native_invoice_builder_http_scope_frozen_exports_and_immutability(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.native_invoice_models import NativeInvoiceSnapshot
from didban.report_builder_models import NativeInvoiceBuilderRun
owner=client_for('owner'); viewer=client_for('viewer');path=base+'/report-builder'
with transaction('company-a') as db:
    invoice={'id':'native-test','direction':'sale','reference':'=SUM(1,2)','party_id':'p','date':'2026-09-01','amount':'90071992547409930001','remaining':None,'status':'unavailable','reason':'native_invoice_source_reversed','source':{'unit':'TOMAN','journal_id':'j','journal_digest':'d','operation_id':'o','approved_draft_version':1},'terms':{'due_date':None}}
    row=NativeInvoiceSnapshot(company_id='company-a',as_of=date(2026,9,30),actor_id=users['owner'],digest='native-fixed',payload={'as_of':'2026-09-30','direction':None,'items':[invoice]})
    db.add(row);db.flush();source_id=row.id
spec={'period_id':period_id,'source':'native_invoice','kind':'invoices','basis':'invoice','metric_keys':[],'columns':['reference','amount','remaining']}
seen=command(viewer,'POST',path+'/preview',{'spec':spec});assert seen.status_code==200,seen.text
assert seen.json()['native_invoice_snapshot_id']==source_id and seen.json()['rows'][0]['remaining'] is None
payload={'name':'فاکتور بومی ثابت','spec':spec,'preview_native_invoice_snapshot_id':source_id}
assert command(viewer,'POST',path+'/definitions',payload).status_code==403
response=command(owner,'POST',path+'/definitions',payload);assert response.status_code==201,response.text
run=response.json()['run']
assert owner.get(path+'/runs?source=native_invoice').json()['items'][0]['id']==run['id']
assert owner.get(path+'/runs?source=native_statement').json()['items']==[]
assert viewer.get(path+'/runs/'+run['id']+'/export?format=pdf').content.startswith(b'%PDF')
assert viewer.get(path+'/runs/'+run['id']+'/export?format=xlsx').status_code==200
assert owner.get('/api/v1/companies/company-b/report-builder/runs/'+run['id']).status_code==404
try:
    with transaction('company-a') as db: db.get(NativeInvoiceBuilderRun,run['id']).digest='tampered'
    raise AssertionError('Native invoice builder run mutated')
except IntegrityError: pass
""",
    )


def test_overdue_filter_preserves_invalid_source_reason_without_claiming_missing_due_date(book):
    db = book
    user = db.get(m.User, "finance_manager")
    row = source_row("invalid-known-due", "sale", "100", None, "2026-10-20")
    snapshot = NativeInvoiceSnapshot(
        company_id="c",
        as_of=date(2026, 11, 1),
        actor_id=user.id,
        digest="known-due",
        payload={"as_of": "2026-11-01", "direction": "sale", "items": [row]},
    )
    db.add(snapshot)
    db.flush()
    spec = ReportSpec(
        period_id="p",
        source="native_invoice",
        kind="invoices",
        basis="invoice",
        metric_keys=[],
        columns=["reference", "remaining"],
        filters={"direction": "sales", "overdue_only": True},
    )
    seen = preview(db, "c", spec)
    assert seen["rows"] == []
    assert "فاکتور با ماندهٔ نامعتبر در فیلتر سررسیدگذشته وارد نشده است." in seen["limitations"]
    assert "سند مرجع برگشت شده؛ مانده قابل محاسبه نیست." in seen["limitations"]
    assert not any("بدون سررسید" in limitation for limitation in seen["limitations"])
