"""Security/retention checks use an isolated subprocess and database per test."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
COMMON = r'''
from datetime import date
from hashlib import sha256
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from didban.api import app
from didban.config import settings
from didban.db import initialize, transaction
from didban import models as m
from didban.security import hasher
initialize()
password = "Synthetic-test-only-123!"
with transaction() as db:
    users = {}
    password_hash = hasher.hash(password)
    for role in ("owner", "finance_manager", "advisor", "viewer", "outsider"):
        user = m.User(email=role+"@example.test", name=role, password_hash=password_hash, installation_admin=role=="owner")
        db.add(user); db.flush(); users[role] = user.id
    db.add_all([m.Company(id="company-a", name="شرکت الف"), m.Company(id="company-b", name="شرکت ب")]); db.flush()
    members = {}
    for role in ("owner", "finance_manager", "advisor", "viewer"):
        member = m.Membership(company_id="company-a",user_id=users[role],role=role,approve_financial_report=False)
        db.add(member);db.flush();members[role]=member.id
    db.add(m.Membership(company_id="company-b",user_id=users["outsider"],role="owner"))
    period = m.Period(company_id="company-a",name="شهریور",start=date(2026,9,1),end=date(2026,9,30));db.add(period);db.flush();period_id=period.id
    report_ids=[];manifest_ids=[]
    for index in range(2):
        session=m.ProcessingSession(company_id="company-a",period_id=period.id,actor_id=users["owner"],state="completed_limited")
        db.add(session);db.flush()
        manifest=m.ResultManifest(company_id="company-a",session_id=session.id,period_id=period.id,digest="a"*64,selection={"row_ids":[],"coverage":{}},metrics=[{"metric_key":"cash","label":"نقد","value":None,"status":"unavailable","reason_codes":["bank_source_missing"]}],details={})
        db.add(manifest);db.flush();manifest_ids.append(manifest.id)
        report=m.Report(company_id="company-a",manifest_id=manifest.id,title="گزارش آزمون",version=1);db.add(report);db.flush();report_ids.append(report.id)
    source_session=session.id

def client_for(role):
    client=TestClient(app,base_url="http://testserver")
    response=client.post("/api/v1/auth/login",json={"email":role+"@example.test","password":password},headers={"origin":"http://testserver"})
    assert response.status_code==200,response.text
    client.headers.update({"x-csrf-token":response.json()["csrf"],"origin":"http://testserver"})
    return client

def command(client, method, path, data=None, version=1, key=None):
    headers={"idempotency-key":key or str(uuid4()),"if-match":str(version)}
    return client.request(method,path,json=data,headers=headers)

def approve(client, index=0):
    return command(client,"POST",f"/api/v1/companies/company-a/reports/{report_ids[index]}/approvals",{"expected_version":1})

base="/api/v1/companies/company-a"
'''


def scenario(tmp_path: Path, source: str) -> None:
    env = os.environ | {
        "PYTHONPATH": str(ROOT / "apps/api"),
        "DIDBAN_DATABASE_URL": f"sqlite:///{tmp_path / 'isolated.db'}",
        "DIDBAN_STORAGE": str(tmp_path / "private"),
        "DIDBAN_WEB_ORIGIN": "http://testserver",
        "DIDBAN_PRODUCTION": "false",
        "DIDBAN_MODEL_ENABLED": "false",
        "DIDBAN_MODEL_BUDGET_UNLIMITED": "false",
        "DIDBAN_OPENAI_API_KEY": "",
    }
    result = subprocess.run([sys.executable, "-c", COMMON + "\n" + source], cwd=ROOT, env=env,
                            capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr


def test_report_approval_requires_current_d05_authority_and_d08_audit(tmp_path):
    scenario(tmp_path, r'''
owner=client_for("owner"); manager=client_for("finance_manager"); advisor=client_for("advisor"); viewer=client_for("viewer")
assert approve(owner).status_code==403
assert approve(advisor).status_code==403
assert approve(viewer).status_code==403
response=approve(manager)
assert response.status_code==201,response.text
assert response.json()["permission_provenance"]=="role:finance_manager"
member=members["owner"]
response=command(owner,"PATCH",base+"/members/"+member,{"approve_financial_report":True})
assert response.status_code==200,response.text
assert response.json()["approve_financial_report"] is True
assert approve(owner).status_code==201
with transaction("company-a") as db:
    events=list(db.scalars(select(m.AuditEvent).where(m.AuditEvent.action=="membership.changed")))
    assert len(events)==1
    assert events[0].details["before"]["approve_financial_report"] is False
    assert events[0].details["after"]["approve_financial_report"] is True
    assert events[0].actor_id==users["owner"]
''')


def test_only_owner_grants_and_revocation_preserves_historical_approval(tmp_path):
    scenario(tmp_path, r'''
owner=client_for("owner"); manager=client_for("finance_manager"); advisor=client_for("advisor")
path=base+"/members/"+members["advisor"]
assert command(manager,"PATCH",path,{"approve_financial_report":True}).status_code==403
assert command(advisor,"PATCH",path,{"approve_financial_report":True}).status_code==403
assert command(owner,"PATCH",path,{"approve_financial_report":True}).status_code==200
assert approve(advisor).status_code==201
assert command(owner,"PATCH",path,{"approve_financial_report":False},version=2).status_code==200
assert approve(advisor,1).status_code==403
historical=advisor.get(base+"/reports/"+report_ids[0]).json()["approvals"]
assert len(historical)==1 and historical[0]["actor_id"]==users["advisor"]
assert advisor.get(base+"/reports/"+report_ids[1]).json()["approvals"]==[]
''')


def test_company_isolation_and_last_owner_guard(tmp_path):
    scenario(tmp_path, r'''
owner=client_for("owner"); outsider=client_for("outsider")
assert outsider.get(base+"/reports/"+report_ids[0]).status_code==404
assert outsider.get("/api/v1/companies/company-b/results/"+manifest_ids[0]).status_code==404
assert owner.get("/api/v1/companies/company-b").status_code==404
response=command(owner,"PATCH",base+"/members/"+members["owner"],{"active":False})
assert response.status_code==409 and response.json()["code"]=="last_owner",response.text
response=command(owner,"PATCH",base+"/members/"+members["owner"],{"role":"advisor"})
assert response.status_code==409 and response.json()["code"]=="last_owner",response.text
''')


def test_archive_keeps_evidence_and_dependent_source_cannot_be_deleted(tmp_path):
    scenario(tmp_path, r'''
owner=client_for("owner")
content=b"date,amount\n2026-09-01,100\n"
with transaction("company-a") as db:
    source=m.SourceFile(company_id="company-a",session_id=source_session,name="test.csv",sha256=sha256(content).hexdigest(),size=len(content),storage_key="retained-original",row_count=1,scan_status="development_unscanned",state="ready")
    db.add(source);db.flush();source_id=source.id
    db.add(m.SourceRow(company_id="company-a",file_id=source.id,sheet="CSV",row_number=2,values={"date":"2026-09-01","amount":"100"}))
(settings.storage/"retained-original").write_bytes(content)
before=owner.get(base+"/reports/"+report_ids[0]).json()["manifest"]
response=command(owner,"POST",base+"/source-files/"+source_id+"/archive",{"expected_version":1})
assert response.status_code==200,response.text
assert owner.get(base+"/source-files/"+source_id+"/download").content==content
response=command(owner,"DELETE",base+"/source-files/"+source_id+"?confirmed=true",version=2)
assert response.status_code==409 and response.json()["code"]=="source_has_dependencies",response.text
assert (settings.storage/"retained-original").read_bytes()==content
assert owner.get(base+"/reports/"+report_ids[0]).json()["manifest"]==before
''')


def test_origin_csrf_and_idempotency_guards(tmp_path):
    scenario(tmp_path, r'''
owner=client_for("owner")
body={"name":"مهر","start":"2026-10-01","end":"2026-10-31"}
csrf=owner.headers.pop("x-csrf-token")
assert command(owner,"POST",base+"/financial-periods",body).status_code==403
owner.headers["x-csrf-token"]=csrf
owner.headers["origin"]="https://untrusted.example"
assert command(owner,"POST",base+"/financial-periods",body).status_code==403
assert owner.post("/api/v1/auth/login",json={"email":"owner@example.test","password":password}).status_code==403
owner.headers["origin"]="http://testserver"
key=str(uuid4())
first=command(owner,"POST",base+"/financial-periods",body,key=key)
second=command(owner,"POST",base+"/financial-periods",body,key=key)
assert first.status_code==201 and second.status_code==201,(first.text,second.text)
assert first.json()["id"]==second.json()["id"]
conflict=command(owner,"POST",base+"/financial-periods",body|{"name":"دیگر"},key=key)
assert conflict.status_code==409 and conflict.json()["code"]=="idempotency_conflict"
''')


def test_manifest_and_installation_audit_are_immutable_at_database_layer(tmp_path):
    scenario(tmp_path, r'''
with transaction() as db:
    audit=m.InstallationAudit(actor_id=users["owner"],actor_label="test",action="test.audit",entity_id=users["owner"],details={"original":True})
    db.add(audit);db.flush();audit_id=audit.id
for cls,identifier,field,value in [(m.ResultManifest,manifest_ids[0],"metrics",[]),(m.InstallationAudit,audit_id,"details",{})]:
    blocked=False
    try:
        with transaction("company-a") as db:
            db.execute(update(cls).where(cls.id==identifier).values(**{field:value}))
    except IntegrityError:
        blocked=True
    assert blocked,cls.__tablename__
with transaction("company-a") as db:
    assert db.get(m.ResultManifest,manifest_ids[0]).metrics[0]["value"] is None
    assert db.get(m.InstallationAudit,audit_id).details=={"original":True}
''')
