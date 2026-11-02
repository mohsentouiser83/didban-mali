import io
from copy import deepcopy

from openpyxl import load_workbook

from didban.native_invoice_exports import invoice_rows, pdf_snapshot, xlsx_snapshot


def saved():
    source = {
        "operation_id": "operation",
        "journal_id": "journal",
        "journal_digest": "a" * 64,
        "approved_draft_version": 2,
        "unit": "TOMAN",
    }
    terms = {
        "id": "term",
        "version": 1,
        "effective_date": "2026-10-01",
        "due_date": "2026-10-10",
        "due_unknown": False,
        "expected_date": None,
        "expected_unknown": True,
        "reason": "شرایط اولیه",
    }
    item = {
        "id": "invoice",
        "reference": "=SUM(1,2)",
        "party_id": "مشتری آزمایشی",
        "date": "2026-10-01",
        "amount": "90071992547409930001.000003",
        "remaining": "90071992547409930001.000001",
        "status": "available",
        "reason": None,
        "direction": "sale",
        "unit": "IRR",
        "original_unit": "TOMAN",
        "source": source,
        "terms": terms,
        "terms_history": [terms],
        "source_history": [],
        "allocations": [],
    }
    unknown = deepcopy(item) | {
        "id": "unknown",
        "reference": "نامعتبر",
        "amount": "100",
        "remaining": None,
        "status": "unavailable",
        "reason": "native_invoice_source_reversed",
        "direction": "purchase",
        "terms": dict(terms, due_date=None, due_unknown=True),
    }
    return {
        "id": "snapshot",
        "digest": "b" * 64,
        "payload": {"as_of": "2026-11-02", "direction": None, "items": [item, unknown]},
    }


def test_exact_projection_null_formula_safe_workbook_and_persian_pdf():
    snapshot = saved()
    before = deepcopy(snapshot)
    rows = invoice_rows(snapshot["payload"])
    assert rows[0]["paid"] == "0.000002" and rows[0]["amount"] == "90071992547409930001.000003"
    assert rows[0]["unit"] == "IRR" and rows[0]["original_unit"] == "TOMAN"
    assert rows[0]["direction"] == "sales" and rows[0]["overdue"] is True
    assert rows[1]["remaining"] is rows[1]["paid"] is rows[1]["overdue"] is None
    assert rows[1]["reason_codes"] == ["native_invoice_source_reversed"]
    assert rows[1]["direction"] == "purchases"
    workbook = load_workbook(io.BytesIO(xlsx_snapshot(snapshot, "شرکت آزمایشی")), data_only=False)
    invoices = workbook["فاکتورها"]
    headers = {cell.value: cell.column for cell in invoices[1]}
    assert invoices.cell(3, headers["remaining"]).value is None
    assert invoices.cell(3, headers["paid"]).value is None
    assert invoices.cell(3, headers["status"]).value == "unavailable"
    cells = [cell for sheet in workbook for row in sheet for cell in row]
    assert any(cell.value == "90071992547409930001.000003" for cell in cells)
    assert any(cell.value == "0.000002" for cell in cells)
    assert any(cell.value == "=SUM(1,2)" and cell.data_type == "s" for cell in cells)
    assert not any(cell.data_type == "f" for cell in cells)
    assert pdf_snapshot(snapshot, "شرکت آزمایشی").startswith(b"%PDF")
    assert snapshot == before


def test_export_http_reads_frozen_snapshot_with_mode_and_modules_off_current_company_membership(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.native_invoice_models import NativeInvoiceSnapshot
from didban.accounting_setup_models import CompanyAccountingSetup
manager=client_for('finance_manager');viewer=client_for('viewer');outsider=client_for('outsider')
with transaction('company-a') as db:
    source={'operation_id':'operation','journal_id':'journal','journal_digest':'a'*64,'approved_draft_version':1,'unit':'IRR'}
    item={'id':'invoice','reference':'=SUM(1,2)','party_id':'مشتری','date':'2026-09-01','amount':'9007199254740993','remaining':None,'status':'unavailable','reason':'native_invoice_source_reversed','direction':'sale','source':source,'terms':None,'terms_history':[],'source_history':[],'allocations':[]}
    row=NativeInvoiceSnapshot(company_id='company-a',as_of=date(2026,9,20),actor_id=users['finance_manager'],digest='b'*64,payload={'as_of':'2026-09-20','direction':'sale','items':[item]})
    db.add(row);db.flush();snapshot_id=row.id
    db.add(CompanyAccountingSetup(company_id='company-a',mode='analysis'))
    db.add_all([m.CompanyModule(company_id='company-a',key=key,enabled=False) for key in ('receivables','payables','settlements')])
path=base+'/accounting/native-invoices/snapshots/'+snapshot_id+'/export'
for format in ('pdf','xlsx'):
    response=viewer.get(path,params={'format':format});assert response.status_code==200,response.text
    assert response.content.startswith(b'%PDF' if format=='pdf' else b'PK')
    assert 'attachment' in response.headers['content-disposition']
assert outsider.get(path).status_code==404
with transaction('company-a') as db:
    assert len(list(db.scalars(select(m.AuditEvent).where(m.AuditEvent.action=='native_invoice.snapshot_downloaded'))))==2
    assert db.get(NativeInvoiceSnapshot,snapshot_id).payload['items'][0]['remaining'] is None
    db.get(m.Membership,members['viewer']).active=False
assert viewer.get(path).status_code==404
""",
    )
