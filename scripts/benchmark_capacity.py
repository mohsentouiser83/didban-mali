#!/usr/bin/env python3
"""Synthetic, isolated local capacity smoke benchmark; never a production SLA."""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODE = r"""
from datetime import datetime
from pathlib import Path
from time import perf_counter
from uuid import uuid4
from fastapi.testclient import TestClient
from didban.api import app
from didban.db import initialize,transaction
from didban.models import User
from didban.security import hasher
from didban.worker import run_once
from scripts.processing_fixture import seed_processing_fixture
import json,resource
initialize()
with transaction() as db:db.add(User(name='Capacity test',email='capacity@example.test',password_hash=hasher.hash('synthetic-capacity-123'),installation_admin=True))
client=TestClient(app)
csrf=client.post('/api/v1/auth/login',json={'email':'capacity@example.test','password':'synthetic-capacity-123'}).json()['csrf']
def h(version=None):
 result={'X-CSRF-Token':csrf,'Idempotency-Key':str(uuid4())}
 if version:result['If-Match']=str(version)
 return result
company=client.post('/api/v1/companies',json={'name':'Synthetic capacity only'},headers=h()).json();base='/api/v1/companies/'+company['id']
period=client.post(base+'/financial-periods',json={'name':'Capacity','start':'2026-09-01','end':'2026-09-30'},headers=h()).json()
def files():
 for account in range(10):
  lines=['account,date,amount,reference,balance,row_type,currency',f'A{account},2026-09-01,0,OPEN-{account},1000,opening,IRR']
  lines.extend(f'A{account},2026-09-05,1,R-{account}-{i},,movement,IRR' for i in range(1999))
  yield f'bank-{account}.csv', ('\n'.join(lines)+'\n').encode()
started=perf_counter()
session_id=seed_processing_fixture(company['id'],period['id'],'capacity@example.test',files())
path=base+'/processing-sessions/'+session_id
intake_seconds=perf_counter()-started
run_once();state=client.get(path).json();assert state['issues'][0]['code']=='coverage',state
question=state['issues'][0];response=client.post(base+'/processing-issues/'+question['id']+'/answers',json={'value':{'bank_complete':True},'expected_version':question['version']},headers=h(state['version']));assert response.is_success,response.text
started=perf_counter();run_once();processing_seconds=perf_counter()-started
state=client.get(path).json();assert state['state']=='completed_limited',state
started=perf_counter();result=client.get(base+'/results/latest?view=summary');read_seconds=perf_counter()-started
metrics={item['metric_key']:item for item in result.json()['metrics']};assert metrics['cash']['value']=='29990',metrics['cash']
# Parallel readers exercise five authenticated consumers of this exact report.
from concurrent.futures import ThreadPoolExecutor
cookies=dict(client.cookies)
def read(_):
 with TestClient(app,cookies=cookies) as reader:
  t=perf_counter();r=reader.get(base+'/results/latest?view=summary');assert r.status_code==200;return perf_counter()-t
started=perf_counter()
# Do not enter TestClient lifespan: real embedded worker startup is tested separately.
def read_without_lifespan(_):
 reader=TestClient(app,cookies=cookies)
 t=perf_counter();r=reader.get(base+'/results/latest?view=summary');assert r.status_code==200;return perf_counter()-t
with ThreadPoolExecutor(max_workers=5) as pool:latencies=list(pool.map(read_without_lifespan,range(5)))
parallel_seconds=perf_counter()-started
rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
print(json.dumps({'synthetic':True,'files':10,'total_data_rows':20000,'active_readers':5,'intake_seconds':round(intake_seconds,3),'processing_seconds':round(processing_seconds,3),'report_read_seconds':round(read_seconds,3),'five_reads_wall_seconds':round(parallel_seconds,3),'read_latencies_seconds':[round(x,3) for x in latencies],'process_peak_rss_native_units':rss,'platform':__import__('sys').platform,'response_bytes':len(result.content),'cash_irr':metrics['cash']['value'],'database':'SQLite development','scanner':'not configured; development unscanned','is_production_benchmark':False},indent=2))
"""
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=ROOT / "docs/validation/capacity-smoke-2026-11-01.json")
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="didban-capacity-") as tmp:
    env = os.environ | {
        "PYTHONPATH": str(ROOT / "apps/api"),
        "DIDBAN_DATABASE_URL": "sqlite:///" + tmp + "/capacity.db",
        "DIDBAN_STORAGE": tmp + "/files",
        "DIDBAN_MODEL_ENABLED": "false",
        "DIDBAN_BOTS_ENABLED": "false",
        "DIDBAN_VOICE_ENABLED": "false",
        "DIDBAN_MEDIA_EXTRACTION_ENABLED": "false",
    }
    result = subprocess.run(
        [sys.executable, "-c", CODE],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode:
        raise SystemExit(result.stderr[-4000:])
    data = json.loads(result.stdout)
    target = args.output
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(data, ensure_ascii=False, indent=2))
