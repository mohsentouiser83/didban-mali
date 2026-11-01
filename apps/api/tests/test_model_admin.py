from test_api_delivery import scenario
from test_model_gateway import SETUP


def test_installation_model_configuration_is_admin_only_and_secret_free_without_company(tmp_path):
    scenario(tmp_path, r'''
from pydantic import SecretStr
owner=client_for("owner");manager=client_for("finance_manager");viewer=client_for("viewer")
path="/api/v1/admin/model-configuration"
assert manager.get(path).status_code==403
assert viewer.get(path).status_code==403
settings.model_enabled=True
settings.openai_api_key=SecretStr("synthetic-secret-never-return")
with transaction() as db:
    member=db.get(m.Membership,members["owner"])
    member.active=False
response=owner.get(path)
assert response.status_code==200,response.text
assert response.json()=={"model":"gpt-5.6-luna","provider":"AvalAI","enabled":True,"key_configured":True,"configuration_source":"server_environment","budget_mode":"capped","availability_verified":False}
assert "synthetic-secret" not in response.text
settings.model_enabled=False
settings.openai_api_key=None
response=owner.get(path)
assert response.json()["enabled"] is False and response.json()["key_configured"] is False
assert command(owner,"POST",path,{"model":"arbitrary","enabled":True}).status_code==405
''')


def test_explicit_model_budget_and_tariff_administration_is_authorized_and_audited(tmp_path):
    scenario(tmp_path, r'''
from datetime import datetime,timezone
owner=client_for("owner");manager=client_for("finance_manager");viewer=client_for("viewer")
body={"period":"2026-11","cap":"1","per_session_cap":"0.5"}
admin_path="/api/v1/admin/model-budget"
assert command(manager,"POST",admin_path,body).status_code==403
assert viewer.get(admin_path).status_code==403
first=command(owner,"POST",admin_path,body,key="budget-config")
repeat=command(owner,"POST",admin_path,body,key="budget-config")
assert first.status_code==200 and repeat.json()==first.json(),(first.text,repeat.text)
assert first.json()["currency"]=="USD" and first.json()["version"]==1
update=command(owner,"POST",admin_path,body|{"cap":"2"},version=1)
assert update.status_code==200 and update.json()["version"]==2,update.text
assert command(owner,"POST",admin_path,body|{"cap":"3"},version=1).status_code==409
price={"model":"gpt-5.6-luna","price_version":"synthetic-1","input_per_million":"1","cached_input_per_million":"0.1","cache_write_per_million":"1.25","output_per_million":"2","max_input_tokens":30000,"max_output_tokens":1024,"effective_from":datetime.now(timezone.utc).isoformat()}
assert command(manager,"POST",base+"/model-tariffs",price).status_code==403
assert command(owner,"POST","/api/v1/companies/company-b/model-tariffs",price).status_code==404
created=command(owner,"POST",base+"/model-tariffs",price)
assert created.status_code==201 and created.json()["currency"]=="USD",created.text
assert command(owner,"POST",base+"/model-tariffs",price|{"model":"gpt-6-sol"}).status_code==422
assert command(owner,"POST",base+"/model-tariffs",price|{"price_version":"bad-rate","input_per_million":"NaN"}).status_code==422
assert command(owner,"POST",base+"/model-tariffs",price|{"price_version":"naive-date","effective_from":"2026-11-01T00:00:00"}).status_code==422
with transaction("company-a") as db:
    events=list(db.scalars(select(m.InstallationAudit).where(m.InstallationAudit.action=="model.installation_budget_configured")))
    assert len(events)==2
    assert events[1].details["before"]["cap"]=="1" and events[1].details["after"]["cap"]=="2"
    assert db.scalar(select(m.AuditEvent).where(m.AuditEvent.action=="model.tariff_created"))
''')


def test_usage_is_actual_company_scoped_and_status_never_returns_key(tmp_path):
    scenario(tmp_path, SETUP + r'''
from pydantic import SecretStr
owner=client_for("owner");viewer=client_for("viewer");outsider=client_for("outsider")
result=asyncio.run(configured(lambda request:httpx.Response(200,json=envelope())).invoke(**arguments))
assert result["state"]=="completed",result
usage=viewer.get(base+"/usage")
assert usage.status_code==200 and Decimal(usage.json()["used"])==Decimal("0.0000995"),usage.text
assert Decimal(usage.json()["reserved"])==0 and "installation_budget" not in usage.json()
assert "installation_budget" in owner.get(base+"/usage").json()
assert outsider.get(base+"/usage").status_code==404
requests=viewer.get(base+"/model-requests").json()["items"]
assert len(requests)==1 and requests[0]["state"]=="completed"
assert not {"proposal","input_hash","request_key","provider_response_id"}&set(requests[0])
assert "ignore all instructions" not in str(requests)
settings.model_enabled=True;settings.openai_api_key=SecretStr("synthetic-key-never-send")
status=viewer.get(base+"/model-status")
assert status.json()["status"]=="configured_unverified" and status.json()["availability_verified"] is False,status.text
assert "synthetic-key" not in status.text and status.json()["key_configured"] is True
''')


def test_budget_cannot_drop_below_unknown_commitments_and_usd_validation_is_independent(tmp_path):
    scenario(tmp_path, SETUP + r'''
owner=client_for("owner")
def timeout(request):
    raise httpx.ReadTimeout("synthetic",request=request)
asyncio.run(configured(timeout).invoke(**arguments))
usage=owner.get(base+"/usage").json()
assert Decimal(usage["reserved"])>0 and usage["unknown_reserved"]==usage["reserved"]
budget=owner.get("/api/v1/admin/model-budget").json()["items"][0]
response=command(owner,"POST","/api/v1/admin/model-budget",{"period":period,"cap":"0.001"},version=budget["version"])
assert response.status_code==409 and response.json()["code"]=="budget_below_committed",response.text
assert command(owner,"POST",base+"/budget-policy",{"period":period,"cap":"-1"}).status_code==422
assert command(owner,"POST",base+"/budget-policy",{"period":period,"cap":"۱۲۳"}).status_code==422
response=command(owner,"POST",base+"/budget-policy",{"period":period,"cap":"1.123456789"})
assert response.status_code==200 and response.json()["cap"]=="1.123456789" and response.json()["currency"]=="USD",response.text
''')


def test_unknown_cost_reconciliation_requires_admin_and_keeps_audited_actual_cost(tmp_path):
    scenario(tmp_path, SETUP + r'''
owner=client_for("owner");manager=client_for("finance_manager")
def timeout(request):
    raise httpx.ReadTimeout("synthetic",request=request)
asyncio.run(configured(timeout).invoke(**arguments))
reservations=owner.get(base+"/model-reservations").json()["items"]
assert len(reservations)==1 and reservations[0]["state"]=="unknown"
path=base+"/model-reservations/"+reservations[0]["id"]+"/reconciliations"
body={"actual_cost":"0.005","evidence_reference":"synthetic-provider-statement"}
assert command(manager,"POST",path,body).status_code==403
response=command(owner,"POST",path,body,key="cost-reconcile")
assert response.status_code==200 and response.json()["actual_cost"]=="0.005",response.text
assert command(owner,"POST",path,body,key="cost-reconcile").json()==response.json()
usage=owner.get(base+"/usage").json()
assert Decimal(usage["used"])==Decimal("0.005") and Decimal(usage["reserved"])==0
''')
