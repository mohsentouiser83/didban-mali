"""Module settings preserve company isolation, versions and source readiness."""
from test_api_delivery import scenario


def test_company_module_preferences_are_versioned_audited_and_owner_only(tmp_path):
    scenario(tmp_path, r'''
owner=client_for("owner"); viewer=client_for("viewer"); outsider=client_for("outsider")
path=base+"/modules"
response=owner.get(path)
assert response.status_code==200, response.text
states={i["key"]:i for i in response.json()["items"]}
assert states["cashflow"]["status"]=="waiting_sources"
assert states["employees"]["status"]=="disabled"
assert not {"payroll", "tax", "insurance", "employee_reports"}.intersection(states)
assert viewer.get(path).json()["can_manage"] is False
assert outsider.get(path).status_code==404
assert command(viewer,"PATCH",path+"/cashflow",{"enabled":False}).status_code==403
response=command(owner,"PATCH",path+"/cashflow",{"enabled":False})
assert response.status_code==200,response.text
assert response.json()["status"]=="disabled" and response.json()["version"]==2
assert owner.get(base+"/planned-payments").status_code==403
assert owner.get(base+"/forecasts/latest").status_code==403
assert owner.get(base+f"/results/{manifest_ids[0]}").status_code==200
assert owner.get(base+f"/reports/{report_ids[0]}").status_code==200
assert command(owner,"PATCH",path+"/cashflow",{"enabled":True}).status_code==409
response=command(owner,"PATCH",path+"/cashflow",{"enabled":True},version=2)
assert response.status_code==200 and response.json()["status"]=="waiting_sources"
assert command(owner,"PATCH",path+"/unknown",{"enabled":False}).status_code==404
assert command(owner,"PATCH",path+"/payroll",{"enabled":"false"}).status_code==422
with transaction("company-a") as db:
    events=list(db.scalars(select(m.AuditEvent).where(m.AuditEvent.action=="module.updated")))
    assert len(events)==2 and events[0].details["before"] is True
    assert db.get(m.ResultManifest,manifest_ids[0]).metrics[0]["value"] is None
assert all(i["enabled"] for i in outsider.get("/api/v1/companies/company-b/modules").json()["items"] if i["key"]=="cashflow")
''')


def test_readiness_uses_accepted_manifest_evidence_and_preserves_partial_results(tmp_path):
    scenario(tmp_path, r'''
from didban.module_service import module_state
with transaction("company-a") as db:
    state=module_state(db,"company-a","receivables",{"ledger"})
    assert state["available"] is True  # invoice absence must not block ledger results
    assert module_state(db,"company-a","reconciliation",{"bank"})["available"] is False
    assert module_state(db,"company-a","cashflow",{"bank"})["available"] is True
    session=m.ProcessingSession(company_id="company-a",actor_id=users["owner"],state="completed_limited")
    db.add(session);db.flush()
    source=m.SourceFile(company_id="company-a",session_id=session.id,name="synthetic.csv",sha256="b"*64,size=1,storage_key=str(uuid4()),scan_status="clean",row_count=1)
    db.add(source);db.flush()
    interpretation=m.Interpretation(company_id="company-a",file_id=source.id,sheet="Sheet1",family="bank",mapping={},unit="IRR",calendar="gregorian",provenance="validated",evidence={})
    db.add(interpretation);db.flush()
    assert module_state(db,"company-a","cashflow")["available"] is False
    manifest=m.ResultManifest(company_id="company-a",session_id=session.id,period_id=period_id,digest="c"*64,selection={"interpretation_ids":[interpretation.id]},metrics=[],details={})
    db.add(manifest);db.flush()
    assert module_state(db,"company-a","cashflow")["available"] is True
    assert module_state(db,"company-b","cashflow")["available"] is False
''')


def test_personnel_uses_one_versioned_switch_for_all_legacy_endpoints(tmp_path):
    scenario(tmp_path, r'''
from didban.module_service import module_state
owner=client_for("owner")
response=command(owner,"PATCH",base+"/modules/employees",{"enabled":True})
assert response.status_code==200,response.text
assert response.json()["version"]==2
with transaction("company-a") as db:
    for key in ("employees", "payroll", "tax", "insurance", "employee_reports"):
        state=module_state(db,"company-a",key,{"payroll"})
        assert state["key"]=="employees" and state["available"] and state["version"]==2
    assert module_state(db,"company-a","employees",{"employees"})["available"]
response=command(owner,"PATCH",base+"/modules/payroll",{"enabled":False},version=2)
assert response.status_code==200,response.text
assert response.json()["key"]=="employees" and response.json()["version"]==3
for area in ("employees", "payroll", "tax", "insurance", "employee-reports"):
    assert owner.get(base+"/"+area).status_code==403
assert command(owner,"PATCH",base+"/modules/insurance",{"enabled":True},version=2).status_code==409
''')
