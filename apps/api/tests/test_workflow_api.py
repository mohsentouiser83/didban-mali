"""Execute the real fresh workflow in an isolated database/storage process."""

import os
import subprocess
import sys
from pathlib import Path

from test_api_delivery import scenario

ROOT = Path(__file__).resolve().parents[3]


def test_full_processing_barrier_revision_and_company_isolation(tmp_path):
    code = r"""
from pathlib import Path
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import select
from didban.api import app
from didban.config import settings
from didban.db import initialize,transaction
from didban.models import User,ProcessingSession,SourceFile,ResultManifest
from didban.security import hasher
from didban.worker import run_once
from scripts.processing_fixture import seed_processing_fixture
initialize()
with transaction() as db:
    admin=User(name="مدیر آزمون",email="test@example.test",password_hash=hasher.hash("test-password-123"),installation_admin=True)
    db.add(admin)
client=TestClient(app)
response=client.post('/api/v1/auth/login',json={'email':'test@example.test','password':'test-password-123'})
assert response.status_code==200,response.text
csrf=response.json()['csrf']
def headers(version=None,key=None):
    h={'X-CSRF-Token':csrf,'Idempotency-Key':key or str(uuid4()),'Origin':settings.web_origin}
    if version is not None:h['If-Match']=str(version)
    return h
def post(path,body=None,version=None,key=None):
    response=client.post(path,json=body,headers=headers(version,key))
    assert response.status_code in (200,201,202),(path,response.status_code,response.text)
    return response.json()
company=post('/api/v1/companies',{'name':'شرکت آزمون'})
base='/api/v1/companies/'+company['id']
period=post(base+'/financial-periods',{'name':'شهریور آزمون','start':'2026-09-01','end':'2026-09-30'})
assert client.get(base+'/processing-sessions').status_code==404
assert client.post(base+'/processing-sessions',json={'period_id':period['id']},headers=headers()).status_code==404
fixtures=Path('docs/validation/rebuild-v1/inputs/baseline')
names=('ledger.xlsx','bank.xlsx','invoices.xlsx','settlements.csv','moadian-sales.csv','moadian-purchases.csv','planned-payments.csv','receipt-history.csv')
sid=seed_processing_fixture(company['id'],period['id'],'test@example.test',((name,(fixtures/name).read_bytes()) for name in names))
path=base+'/processing-sessions/'+sid
assert client.post(path+'/files',files={'file':('file.csv', b'ignored')},headers=headers()).status_code==404
assert client.post(path+'/seal',json={'file_ids':[]},headers=headers()).status_code==404
run_once()
session=client.get(path).json()
assert session['state']=='waiting_input',session
assert session['issues'][0]['code']=='coverage',session['issues']
assert client.get(base+'/reports').json()['items']==[]
assert client.get(path).json()['state']=='waiting_input'
question=session['issues'][0]
value={f['key']:True for f in question['evidence']['fields']}
post(base+'/processing-issues/'+question['id']+'/answers',{'value':value,'expected_version':question['version']},session['version'])
stale=client.post(base+'/processing-issues/'+question['id']+'/answers',json={'value':value,'expected_version':question['version']},headers=headers(session['version']))
assert stale.status_code==409
run_once()
session=client.get(path).json()
for _ in range(5):
    if session['state'] != 'waiting_input':
        break
    forecast_question=session['issues'][0]
    assert forecast_question['code'].split(':')[0] in ('receipt_date','payment_date'),forecast_question
    date_value='2026-10-05' if forecast_question['code'].startswith('receipt_date') else '2026-10-12'
    post(base+'/processing-issues/'+forecast_question['id']+'/answers',{'value':date_value,'expected_version':forecast_question['version']},session['version'])
    run_once()
    session=client.get(path).json()
assert session['state'] in ('completed','completed_limited'),session
result=client.get(base+'/results/latest').json()
metrics={m['metric_key']:m for m in result['metrics']}
for name,value in {'revenue':'1200','expense':'752','net_profit':'448','cash':'2798','ar_ledger':'600','ar_invoice':'600','ap_trade_ledger':'500','ap_invoice':'500','debt_total_ledger':'1150'}.items():
    assert metrics[name]['value']==value,(name,metrics[name])
assert result['details']['forecast']['closing']=='2628',result['details']['forecast']
reports=client.get(base+'/reports').json()['items'];assert len(reports)==1
# A completed job replay cannot duplicate facts or snapshots.
for _ in range(3):run_once()
assert len(client.get(base+'/reports').json()['items'])==1
# Owners have no implicit report approval permission.
response=client.post(base+'/reports/'+reports[0]['id']+'/approvals',json={'expected_version':1},headers=headers())
assert response.status_code==403,response.text
source=client.get(base+'/source-files').json()['items'][0]
post(base+'/source-files/'+source['id']+'/archive',{'expected_version':source['version']})
assert client.get(base+'/results/latest').json()['id']==result['id']
response=client.delete(base+'/source-files/'+source['id']+'?confirmed=true',headers=headers(source['version']+1))
assert response.status_code==409,response.text
original=client.get(base+'/source-files/'+source['id']+'/download')
assert original.status_code==200 and original.content
export=client.get(base+'/reports/'+reports[0]['id']+'/export?format=xlsx')
assert export.status_code==200 and export.content[:2]==b'PK',export.text[:200]
# Another company cannot read any of this company's sessions, rows, reports or source files.
other=post('/api/v1/companies',{'name':'شرکت دوم'})
otherbase='/api/v1/companies/'+other['id']
for suffix in ('/processing-sessions/'+sid,'/reports/'+reports[0]['id'],'/results/'+result['id'],'/source-files/'+source['id']+'/download'):
    assert client.get(otherbase+suffix).status_code==404,suffix
assert client.get(otherbase+'/invoices').json()['items']==[]
# A missing source family gives an honest limited report rather than blocking on missing file.
period2=post(otherbase+'/financial-periods',{'name':'دوره بانک','start':'2026-09-01','end':'2026-09-30'})
content='account,date,amount,reference,balance,row_type,currency\nA,2026-09-01,0,OPEN,1000,opening,IRR\nA,2026-09-03,123,REF,,movement,IRR\n'
session2=seed_processing_fixture(other['id'],period2['id'],'test@example.test',[('bank.csv',content.encode())])
p2=otherbase+'/processing-sessions/'+session2
run_once()
state=client.get(p2).json();question=state['issues'][0]
post(otherbase+'/processing-issues/'+question['id']+'/answers',{'value':{'bank_complete':True},'expected_version':question['version']},state['version']);run_once()
state=client.get(p2).json();assert state['state']=='completed_limited',state
result2=client.get(otherbase+'/results/latest').json();metrics2={m['metric_key']:m for m in result2['metrics']}
assert metrics2['cash']['value']=='1123',metrics2['cash']
assert metrics2['revenue']['value'] is None and 'ledger_source_missing' in metrics2['revenue']['reason_codes']
print('workflow-baseline/barrier/idempotency/archive/isolation/limited: passed')
"""
    env = os.environ | {
        "PYTHONPATH": str(ROOT / "apps/api"),
        "DIDBAN_DATABASE_URL": "sqlite:///" + str(tmp_path / "test.db"),
        "DIDBAN_STORAGE": str(tmp_path / "files"),
    }
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stdout + result.stderr



def test_moadian_import_queues_only_valid_workpaper_and_replays(tmp_path):
    scenario(
        tmp_path,
        r"""
owner = client_for("owner")
url = base + "/moadian/import/sales"
workpaper = b"tax_id,invoice_id,issued_on,gross,vat,currency,kind\nA,B,2026-09-05,10,1,IRR,original\n"
bank = b"account,date,amount,reference,balance,row_type,currency\nA,2026-09-01,0,OPEN,1000,opening,IRR\n"

def submit(client, data, key, period=period_id):
    return client.post(
        url, params={"period_id": period}, files={"file": ("export.csv", data)},
        headers={"Idempotency-Key": key},
    )

invalid = submit(owner, bank, "bank")
assert invalid.status_code == 422 and invalid.json()["code"] == "invalid_moadian_file", invalid.text
assert submit(client_for("viewer"), workpaper, "viewer").status_code == 403
assert submit(owner, workpaper, "wrong-period", period="company-b").status_code == 404
response = submit(owner, workpaper, "workpaper")
assert response.status_code == 202, response.text
record = response.json()
assert record["state"] == "sealed" and record["period_id"] == period_id
assert submit(owner, workpaper, "workpaper").json() == record
assert submit(owner, bank, "workpaper").status_code == 409
detail = owner.get(base + "/processing-sessions/" + record["id"]).json()
assert len(detail["files"]) == 1 and detail["files"][0]["name"] == "export.csv", detail
with transaction("company-a") as db:
    assert len(list(db.scalars(select(m.Job).where(m.Job.session_id == record["id"])))) == 1
""",
    )
